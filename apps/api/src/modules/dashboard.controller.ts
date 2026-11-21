import { Controller, Get, Header, Query } from '@nestjs/common';
import {
  hasAnyRole,
  isBindingActive,
  PROJECT_WORKFLOW,
  PROPOSAL_WORKFLOW,
  PUBLICATION_WORKFLOW,
  stateLabel,
  type Principal,
  type Project,
  type Proposal,
  type Publication,
} from '@aisrm/shared';
import { CurrentPrincipal, RequestId } from '../common/auth';
import { badRequest, forbidden } from '../common/errors';
import { nowIso, tcol } from '../common/firebase';
import { audit, isTenantReader, listVisible } from '../common/records';
import { toCsv, todayIso } from '../common/util';

const METRICS_VERSION = 'metrics.v1';

function countBy<T>(items: T[], key: (x: T) => string) {
  const m: Record<string, number> = {};
  for (const x of items) m[key(x)] = (m[key(x)] ?? 0) + 1;
  return m;
}

/**
 * Chỉ số xác định, tính trực tiếp từ dữ liệu trong phạm vi người dùng được xem (không dùng AI).
 * Công thức có phiên bản (METRICS_VERSION); mỗi chỉ số ghi rõ định nghĩa.
 */
@Controller('dashboard')
export class DashboardController {
  @Get('metrics')
  async metrics(@CurrentPrincipal() p: Principal) {
    const [proposals, projects, publications] = await Promise.all([
      listVisible<Proposal>(p, 'proposals', { memberField: 'memberUids', limit: 1000 }),
      listVisible<Project>(p, 'projects', { memberField: 'memberUids', limit: 1000 }),
      listVisible<Publication>(p, 'publications', { memberField: 'authorUids', limit: 1000 }),
    ]);
    const today = todayIso();
    const inReview = ['UNIT_REVIEW', 'SCIENCE_REVIEW', 'EXPERT_REVIEW', 'APPROVAL_PENDING'];
    const overdueProjects = projects.filter((x) => x.status === 'ACTIVE' && x.milestoneStats?.nextDue && x.milestoneStats.nextDue < today);
    const confirmed = publications.filter((x) => ['CONFIRMED', 'EXPORTED'].includes(x.status));
    const approvedBudget = projects.filter((x) => x.status !== 'CANCELLED').reduce((s, x) => s + (x.budgetVnd ?? 0), 0);

    const units = new Map<string, { unitName: string; proposals: number; activeProjects: number; confirmedPublications: number; overdue: number }>();
    const row = (name: string) => {
      if (!units.has(name)) units.set(name, { unitName: name, proposals: 0, activeProjects: 0, confirmedPublications: 0, overdue: 0 });
      return units.get(name)!;
    };
    proposals.forEach((x) => row(x.unitName).proposals++);
    projects.filter((x) => x.status === 'ACTIVE').forEach((x) => row(x.unitName).activeProjects++);
    confirmed.forEach((x) => row(x.unitName).confirmedPublications++);
    overdueProjects.forEach((x) => row(x.unitName).overdue++);

    const label = (wf: 'proposal' | 'project' | 'publication', m: Record<string, number>) =>
      Object.entries(m).map(([status, count]) => ({ status, label: stateLabel(wf, status), count }));

    return {
      metricsVersion: METRICS_VERSION,
      generatedAt: nowIso(),
      scope: isTenantReader(p) ? 'Toàn trường' : 'Trong phạm vi được phân quyền (cá nhân / đơn vị)',
      dataNote: 'Số liệu tính trực tiếp từ dữ liệu AI-SRM tại thời điểm xem; chưa chốt kỳ. Kinh phí là kinh phí đề xuất của đề tài đã phê duyệt, không phải số đã giải ngân.',
      tiles: [
        { key: 'proposals_in_review', label: 'Hồ sơ đang xét duyệt', value: proposals.filter((x) => inReview.includes(x.status)).length, definition: 'Đề xuất ở các bước Đơn vị / Phòng KH / Thẩm định / Chờ phê duyệt' },
        { key: 'proposals_needs_revision', label: 'Hồ sơ chờ bổ sung', value: proposals.filter((x) => x.status === 'NEEDS_REVISION').length, definition: 'Đề xuất bị trả bổ sung, chờ người nộp' },
        { key: 'projects_active', label: 'Đề tài đang thực hiện', value: projects.filter((x) => x.status === 'ACTIVE').length, definition: 'Đề tài trạng thái Đang thực hiện' },
        { key: 'projects_overdue', label: 'Đề tài có mốc quá hạn', value: overdueProjects.length, definition: 'Đề tài đang thực hiện có mốc chưa được chấp nhận đã quá hạn' },
        { key: 'publications_pending', label: 'Công bố chờ xác nhận', value: publications.filter((x) => ['SUBMITTED', 'VERIFIED'].includes(x.status)).length, definition: 'Công bố Đã nộp hoặc Đã xác minh' },
        { key: 'publications_confirmed', label: 'Công bố đã xác nhận', value: confirmed.length, definition: 'Công bố trạng thái Đã xác nhận / Đã xuất' },
        { key: 'approved_budget_vnd', label: 'Kinh phí đề tài đã duyệt (VND)', value: approvedBudget, definition: 'Tổng kinh phí đề xuất của đề tài đã phê duyệt (trừ đề tài hủy)' },
      ],
      proposalsByStatus: label('proposal', countBy(proposals, (x) => x.status)),
      projectsByStatus: label('project', countBy(projects, (x) => x.status)),
      publicationsByStatus: label('publication', countBy(publications, (x) => x.status)),
      byUnit: [...units.values()].sort((a, b) => a.unitName.localeCompare(b.unitName, 'vi')),
      overdueProjects: overdueProjects.map((x) => ({ id: x.id, code: x.code, title: x.title, ownerName: x.ownerName, unitName: x.unitName, nextDue: x.milestoneStats.nextDue })),
    };
  }

  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async export(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Query('dataset') dataset: string) {
    let csv: string;
    if (dataset === 'proposals') {
      const items = await listVisible<Proposal>(p, 'proposals', { memberField: 'memberUids', limit: 1000 });
      csv = toCsv(
        ['Mã', 'Tên đề tài', 'Đợt', 'Chủ nhiệm', 'Đơn vị', 'Kinh phí (VND)', 'Thời gian (tháng)', 'Trạng thái', 'Ngày nộp', 'Cập nhật'],
        items.map((x) => [x.code, x.title, x.callCode, x.ownerName, x.unitName, x.budgetVnd, x.durationMonths, PROPOSAL_WORKFLOW.states[x.status]?.label, x.submittedAt, x.updatedAt]),
      );
    } else if (dataset === 'projects') {
      const items = await listVisible<Project>(p, 'projects', { memberField: 'memberUids', limit: 1000 });
      csv = toCsv(
        ['Mã', 'Tên đề tài', 'Chủ nhiệm', 'Đơn vị', 'Kinh phí (VND)', 'Bắt đầu', 'Kết thúc', 'Mốc đã chấp nhận', 'Tổng mốc', 'Mốc tiếp theo', 'Trạng thái'],
        items.map((x) => [x.code, x.title, x.ownerName, x.unitName, x.budgetVnd, x.startDate, x.endDate, x.milestoneStats?.accepted, x.milestoneStats?.total, x.milestoneStats?.nextDue, PROJECT_WORKFLOW.states[x.status]?.label]),
      );
    } else if (dataset === 'publications') {
      const items = await listVisible<Publication>(p, 'publications', { memberField: 'authorUids', limit: 1000 });
      csv = toCsv(
        ['Mã', 'Tiêu đề', 'Năm', 'Nơi công bố', 'DOI', 'Tác giả', 'Đơn vị', 'Trạng thái'],
        items.map((x) => [x.code, x.title, x.year, x.venue, x.doi, x.authors.map((a) => a.name).join('; '), x.unitName, PUBLICATION_WORKFLOW.states[x.status]?.label]),
      );
    } else {
      throw badRequest('dataset phải là proposals | projects | publications');
    }
    await audit({ actor: p, action: 'report.export', resourceType: 'report', resourceId: dataset, requestId: rid });
    return csv;
  }
}

@Controller('audit-events')
export class AuditController {
  @Get()
  async list(@CurrentPrincipal() p: Principal, @Query('resourceId') resourceId?: string) {
    if (!hasAnyRole(p, ['SYS_ADMIN', 'SCIENCE_HEAD', 'RECTOR'])) throw forbidden();
    let q = tcol(p.tenantId, 'auditEvents').orderBy('at', 'desc').limit(200);
    if (resourceId) q = tcol(p.tenantId, 'auditEvents').where('resourceId', '==', resourceId).limit(200);
    const snap = await q.get();
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as { id: string; at: string });
    items.sort((a, b) => (a.at < b.at ? 1 : -1));
    return { items, note: p.bindings.some((b) => !isBindingActive(b)) ? 'Một số vai trò đã hết hiệu lực.' : null };
  }
}
