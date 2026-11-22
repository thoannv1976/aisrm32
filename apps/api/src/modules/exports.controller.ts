import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import {
  BUDGET_CATEGORIES,
  catLabel,
  COUNCIL_ROLE_LABELS,
  EVALUATION_RESULTS,
  EXPENSE_STATUS_LABELS,
  FUNDING_SOURCES,
  hasAnyRole,
  hasRoleFor,
  JOURNAL_SCOPES,
  PROJECT_CLASSIFICATIONS,
  PROJECT_LEVELS,
  PROJECT_WORKFLOW,
  PROPOSAL_WORKFLOW,
  PUBLICATION_TYPE_LABELS,
  PUBLICATION_WORKFLOW,
  REGISTRY,
  REGISTRY_KINDS,
  REGISTRY_STATUS_LABELS,
  registryDisplay,
  SCIENCE_FIELDS,
  SCIENCE_OFFICE,
  SETTLEMENT_LABELS,
  STUDENT_PRIZES,
  type Call,
  type ExpenseRequest,
  type Principal,
  type Project,
  type Proposal,
  type Publication,
  type RegistryItem,
  type RegistryKind,
} from '@aisrm/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentPrincipal, RequestId } from '../common/auth';
import { badRequest, forbidden, notFound } from '../common/errors';
import { audit, canRead, hasReviewAccess, listVisible } from '../common/records';
import { docData, parse } from '../common/util';
import { buildDocx, buildXlsx, DOCX, XLSX, type Block, type SheetSpec } from '../exports/builders';
import { db, tcol } from '../infra';
import { projectToHemis, publicationToHemis } from '../integrations/uni-mock';
import { load as loadCouncil } from './councils.controller';
import { computeMetrics } from './dashboard.controller';
import { REGISTRY_COLLECTION } from './registry.controller';

const REPORT_ROLES = ['UNIT_FOCAL', 'UNIT_HEAD', 'SCIENCE_OFFICER', 'SCIENCE_HEAD', 'VICE_RECTOR', 'RECTOR', 'BOARD'] as const;
const vnd = (n: number | null | undefined) => (n === null || n === undefined ? '—' : new Intl.NumberFormat('vi-VN').format(n) + ' đ');
const d10 = (s: string | null | undefined) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '—');
const today = () => {
  const d = new Date();
  return `ngày ${d.getDate()} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}`;
};

async function tenantName(tenantId: string) {
  const t = await db().collection('tenants').doc(tenantId).get();
  return (t.get('name') as string) ?? tenantId;
}

function send(res: Response, buf: Buffer, type: string, name: string) {
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(buf);
}

const header = (school: string, unit = 'PHÒNG QUẢN LÝ KHOA HỌC') => ({
  left: `${school.toUpperCase()}\n${unit}`,
  right: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập – Tự do – Hạnh phúc',
});

/** Bộ dữ liệu xuất Excel — cùng phạm vi quyền với màn hình danh sách. */
async function dataset(p: Principal, name: string): Promise<SheetSpec[]> {
  if (name === 'proposals') {
    const items = await listVisible<Proposal>(p, 'proposals', { memberField: 'memberUids', limit: 1000 });
    return [{ name: 'Đề xuất', title: 'DANH MỤC HỒ SƠ ĐỀ XUẤT ĐỀ TÀI', headers: ['Mã', 'Tên đề tài', 'Đợt', 'Chủ nhiệm', 'Đơn vị', 'Kinh phí đề xuất (VND)', 'Thời gian (tháng)', 'Trạng thái', 'Ngày nộp'], widths: [16, 50, 16, 24, 28, 18, 12, 20, 14], rows: items.map((x) => [x.code, x.title, x.callCode, x.ownerName, x.unitName, x.budgetVnd, x.durationMonths, PROPOSAL_WORKFLOW.states[x.status]?.label, d10(x.submittedAt)]) }];
  }
  if (name === 'projects') {
    const items = await listVisible<Project>(p, 'projects', { memberField: 'memberUids', limit: 1000 });
    return [
      {
        name: 'Đề tài',
        title: 'DANH MỤC ĐỀ TÀI KHOA HỌC VÀ CÔNG NGHỆ',
        headers: ['Mã', 'Tên đề tài', 'Chủ nhiệm', 'Đơn vị', 'Cấp', 'Phân loại', 'Lĩnh vực', 'Nguồn kinh phí', 'Kinh phí (VND)', 'Đã giải ngân (VND)', 'Bắt đầu', 'Kết thúc', 'Mốc đạt / tổng', 'Trạng thái', 'Kết quả nghiệm thu'],
        widths: [16, 50, 24, 28, 18, 20, 22, 18, 16, 16, 12, 12, 12, 20, 16],
        rows: items.map((x) => [x.code, x.title, x.ownerName, x.unitName, catLabel(PROJECT_LEVELS, x.hemis?.level), catLabel(PROJECT_CLASSIFICATIONS, x.hemis?.classification), catLabel(SCIENCE_FIELDS, x.hemis?.field), catLabel(FUNDING_SOURCES, x.hemis?.fundingSource), x.financeStats?.contractValueVnd || x.budgetVnd, x.financeStats?.disbursedVnd ?? null, d10(x.startDate), d10(x.endDate), `${x.milestoneStats?.accepted ?? 0}/${x.milestoneStats?.total ?? 0}`, PROJECT_WORKFLOW.states[x.status]?.label, catLabel(EVALUATION_RESULTS, x.hemis?.evaluationResult)]),
      },
    ];
  }
  if (name === 'publications') {
    const items = await listVisible<Publication>(p, 'publications', { memberField: 'authorUids', limit: 1000 });
    return [{ name: 'Công bố', title: 'DANH MỤC CÔNG BỐ KHOA HỌC', headers: ['Mã', 'Tiêu đề', 'Loại', 'Tác giả', 'Nơi công bố', 'Tập/Số', 'Trang', 'Năm', 'DOI', 'ISSN/ISBN', 'Phạm vi', 'Xếp hạng (nguồn)', 'Đơn vị', 'Trạng thái'], widths: [16, 50, 16, 36, 30, 10, 10, 8, 24, 16, 16, 18, 26, 18], rows: items.map((x) => [x.code, x.title, PUBLICATION_TYPE_LABELS[x.type], x.authors.map((a) => a.name).join('; '), x.venue, [x.volume, x.issue].filter(Boolean).join('/') || null, x.pages, x.year, x.doi, x.issn ?? x.isbn ?? null, catLabel(JOURNAL_SCOPES, x.journalScope), x.quartile ? `${x.quartile} (${x.quartileSource ?? ''})` : null, x.unitName, PUBLICATION_WORKFLOW.states[x.status]?.label]) }];
  }
  if ((REGISTRY_KINDS as readonly string[]).includes(name)) {
    const def = REGISTRY[name as RegistryKind];
    const visible = await listVisible<RegistryItem>(p, REGISTRY_COLLECTION, { memberField: 'personUids', limit: 1000 });
    const confirmed = (await tcol(p.tenantId, REGISTRY_COLLECTION).where('kind', '==', name).where('status', '==', 'CONFIRMED').get()).docs.map((d) => docData<RegistryItem>(d));
    const map = new Map([...visible, ...confirmed].filter((x) => x.kind === name).map((x) => [x.id, x]));
    return [{ name: def.plural, title: `DANH MỤC ${def.plural.toUpperCase()}`, headers: ['Mã', ...def.fields.map((f) => f.label), 'Đơn vị', 'Trạng thái'], widths: [14, ...def.fields.map((f) => (f.type === 'textarea' || f.key === def.titleField ? 40 : 18)), 26, 16], rows: [...map.values()].map((x) => [x.code, ...def.fields.map((f) => registryDisplay(f, x.data[f.key])), x.unitName, REGISTRY_STATUS_LABELS[x.status]]) }];
  }
  if (name === 'finance') {
    if (!hasRoleFor(p, SCIENCE_OFFICE, null) && !hasAnyRole(p, ['VICE_RECTOR', 'RECTOR'])) throw forbidden();
    const projects = (await listVisible<Project & { contract?: { contractNo: string; signedDate: string; valueVnd: number } | null; settlement?: { status: keyof typeof SETTLEMENT_LABELS } | null }>(p, 'projects', { limit: 1000 })).filter((x) => x.contract || x.financeStats);
    const expenses: (string | number | null)[][] = [];
    for (const x of projects) {
      const s = await tcol(p.tenantId, 'projects').doc(x.id).collection('expenses').get();
      for (const d of s.docs) {
        const e = d.data() as ExpenseRequest;
        expenses.push([x.code, BUDGET_CATEGORIES[e.category], e.content, e.amountVnd, EXPENSE_STATUS_LABELS[e.status], e.requestedByName, d10(e.requestedAt), e.disbursedVnd, d10(e.disbursedAt), e.voucherNo]);
      }
    }
    return [
      { name: 'Hợp đồng', title: 'TÌNH HÌNH KINH PHÍ ĐỀ TÀI', headers: ['Mã đề tài', 'Tên đề tài', 'Số hợp đồng', 'Ngày ký', 'Giá trị HĐ (VND)', 'Đã duyệt chi (VND)', 'Đã giải ngân (VND)', 'Quyết toán'], widths: [16, 50, 16, 12, 18, 18, 18, 18], rows: projects.map((x) => [x.code, x.title, x.contract?.contractNo ?? null, d10(x.contract?.signedDate), x.contract?.valueVnd ?? null, x.financeStats?.approvedVnd ?? 0, x.financeStats?.disbursedVnd ?? 0, SETTLEMENT_LABELS[x.settlement?.status ?? 'NOT_STARTED']]), note: 'Số giải ngân, quyết toán do Phòng KH nhập theo chứng từ của Phòng Tài chính.' },
      { name: 'Đề nghị chi', headers: ['Mã đề tài', 'Mục chi', 'Nội dung', 'Số tiền (VND)', 'Trạng thái', 'Người đề nghị', 'Ngày đề nghị', 'Đã giải ngân (VND)', 'Ngày giải ngân', 'Số chứng từ'], widths: [16, 26, 40, 16, 16, 22, 14, 16, 14, 14], rows: expenses },
    ];
  }
  if (name === 'student') {
    const calls = (await tcol(p.tenantId, 'calls').where('level', '==', 'STUDENT').get()).docs.map((d) => docData<Call>(d));
    const ids = new Set(calls.map((c) => c.id));
    const items = (await listVisible<Proposal>(p, 'proposals', { memberField: 'memberUids', limit: 1000 })).filter((x) => ids.has(x.callId));
    const awards = new Map((await tcol(p.tenantId, 'studentAwards').get()).docs.map((d) => [d.id, d.get('prize') as keyof typeof STUDENT_PRIZES]));
    return [{ name: 'NCKH sinh viên', title: 'DANH SÁCH ĐỀ TÀI NGHIÊN CỨU KHOA HỌC SINH VIÊN', headers: ['Mã', 'Tên đề tài', 'Sinh viên chủ nhiệm', 'Khoa / đơn vị', 'Ngành', 'Khóa', 'Người hướng dẫn', 'Đợt', 'Trạng thái', 'Giải'], widths: [16, 50, 24, 26, 20, 10, 24, 16, 18, 16], rows: items.map((x) => [x.code, x.title, x.ownerName, x.unitName, x.major ?? null, x.cohort ?? null, x.supervisor?.name ?? null, x.callCode, PROPOSAL_WORKFLOW.states[x.status]?.label, awards.get(x.id) ? STUDENT_PRIZES[awards.get(x.id)!] : null]) }];
  }
  throw badRequest('Bộ dữ liệu không hợp lệ.');
}

@Controller('exports')
export class ExportsController {
  @Get('datasets/:name')
  async xlsx(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('name') name: string, @Res() res: Response) {
    const sheets = await dataset(p, name);
    const buf = await buildXlsx(sheets);
    await audit({ actor: p, action: 'report.export_xlsx', resourceType: 'report', resourceId: name, requestId: rid });
    send(res, buf, XLSX, `AI-SRM_${name}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  /** Thuyết minh đề tài theo mẫu (bản hiện tại của hồ sơ). */
  @Get('proposals/:id/docx')
  async proposal(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('id') id: string, @Res() res: Response) {
    const s = await tcol(p.tenantId, 'proposals').doc(id).get();
    if (!s.exists) throw notFound();
    const x = docData<Proposal>(s);
    if (!canRead(p, x) && !(await hasReviewAccess(p, id))) throw notFound();
    const call = docData<Call>(await tcol(p.tenantId, 'calls').doc(x.callId).get());
    const school = await tenantName(p.tenantId);
    const blocks: Block[] = [
      { kind: 'title', text: call.level === 'STUDENT' ? 'Thuyết minh đề tài nghiên cứu khoa học sinh viên' : 'Thuyết minh đề tài khoa học và công nghệ' },
      { kind: 'subtitle', text: `${call.title} (${call.code}) · Mã hồ sơ ${x.code} · Lần nộp ${x.currentRevisionNo || 'chưa nộp'}` },
      { kind: 'h1', text: '1. Thông tin chung' },
      { kind: 'kv', items: [['Tên đề tài', x.title || '(chưa đặt tên)'], ['Chủ nhiệm', x.ownerName], ['Đơn vị chủ trì', x.unitName], ['Kinh phí đề xuất', vnd(x.budgetVnd)], ['Thời gian thực hiện', x.durationMonths ? `${x.durationMonths} tháng` : '—'], ...(x.supervisor ? ([['Người hướng dẫn', `${x.supervisor.name}${x.supervisor.confirmedAt ? ' (đã xác nhận)' : ' (chưa xác nhận)'}`], ['Ngành / khóa', [x.major, x.cohort].filter(Boolean).join(' / ') || '—']] as [string, string][]) : [])] },
      { kind: 'h1', text: '2. Thành viên tham gia' },
      { kind: 'table', headers: ['TT', 'Họ và tên', 'Vai trò', 'Đơn vị'], widths: [1, 5, 3, 5], rows: x.members.map((m, i) => [i + 1, m.name, m.role === 'PI' ? 'Chủ nhiệm' : m.role === 'SECRETARY' ? 'Thư ký' : 'Thành viên', m.unitName ?? '']) },
      ...call.form.fields.flatMap((f, i): Block[] => [{ kind: 'h1', text: `${i + 3}. ${f.label}` }, { kind: 'p', text: String(x.fields[f.key] ?? '').trim() || '(chưa có nội dung)' }]),
      { kind: 'p', text: `${school.split(' ').slice(-2).join(' ')}, ${today()}`, align: 'right', italic: true },
      { kind: 'signatures', items: [{ role: 'Lãnh đạo đơn vị', name: '' }, { role: call.level === 'STUDENT' ? 'Người hướng dẫn' : 'Chủ nhiệm đề tài', name: call.level === 'STUDENT' ? (x.supervisor?.name ?? '') : x.ownerName }] },
    ];
    const buf = await buildDocx({ title: `Thuyết minh ${x.code}`, header: header(school, x.unitName.toUpperCase()), blocks, footerNote: `AI-SRM · ${x.code}` });
    await audit({ actor: p, action: 'proposal.export_docx', resourceType: 'proposal', resourceId: id, resourceVersion: x.version, requestId: rid });
    send(res, buf, DOCX, `Thuyet_minh_${x.code}.docx`);
  }

  /** Biên bản họp hội đồng (nội dung đã lưu + bảng điểm tổng hợp). */
  @Get('councils/:id/minutes-docx')
  async minutes(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('id') id: string, @Res() res: Response) {
    const c = await loadCouncil(p, id);
    const school = await tenantName(p.tenantId);
    const decision = { APPROVE: 'Đề nghị thông qua', REVISE: 'Thông qua, cần chỉnh sửa', REJECT: 'Không thông qua' } as const;
    const blocks: Block[] = [
      { kind: 'title', text: 'Biên bản họp hội đồng' },
      { kind: 'subtitle', text: `${c.title} (${c.code})${c.confirmedAt ? ` · Chủ tịch xác nhận ${d10(c.confirmedAt)}` : ' · DỰ THẢO — chưa xác nhận'}` },
      { kind: 'h1', text: '1. Thành phần hội đồng' },
      { kind: 'table', headers: ['TT', 'Họ và tên', 'Đơn vị', 'Vai trò', 'Tham dự'], widths: [1, 5, 5, 3, 3], rows: c.members.map((m, i) => [i + 1, m.name, m.unitName ?? '', COUNCIL_ROLE_LABELS[m.role], m.status === 'ACCEPTED' ? 'Có' : m.status === 'DECLINED' ? 'Từ chối' : 'Chưa phản hồi']) },
      { kind: 'h1', text: '2. Kết quả chấm điểm (tổng hợp theo công thức)' },
      { kind: 'table', headers: ['Mã', 'Tên hồ sơ', 'Số phiếu', 'Điểm TB', 'Thấp nhất', 'Cao nhất', 'Kết luận'], widths: [3, 8, 2, 2, 2, 2, 4], rows: c.targets.map((t) => { const r = c.results?.find((x) => x.targetId === t.id); const k = c.conclusions?.[t.id]; return [t.code, t.title, r ? `${r.submitted}/${r.eligible}` : '—', r?.average ?? '—', r?.min ?? '—', r?.max ?? '—', k ? decision[k.decision] + (k.note ? ` — ${k.note}` : '') : '—']; }) },
      { kind: 'h1', text: '3. Nội dung biên bản' },
      { kind: 'p', text: c.minutes?.text ?? '(chưa có nội dung biên bản)' },
      { kind: 'signatures', items: [{ role: 'Thư ký hội đồng', name: c.members.find((m) => m.role === 'SECRETARY')?.name ?? '' }, { role: 'Chủ tịch hội đồng', name: c.members.find((m) => m.role === 'CHAIR')?.name ?? '' }] },
    ];
    const buf = await buildDocx({ title: `Biên bản ${c.code}`, header: header(school), blocks, footerNote: `AI-SRM · ${c.code}` });
    await audit({ actor: p, action: 'council.export_docx', resourceType: 'council', resourceId: id, requestId: rid });
    send(res, buf, DOCX, `Bien_ban_${c.code}.docx`);
  }

  /** Lý lịch khoa học (chỉ dữ liệu đã xác nhận). */
  @Get('researchers/:uid/docx')
  async cv(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Param('uid') uid: string, @Res() res: Response) {
    const [person, profile, pubs, projs] = await Promise.all([
      tcol(p.tenantId, 'people').doc(uid).get(),
      tcol(p.tenantId, 'researcherProfiles').doc(uid).get(),
      tcol(p.tenantId, 'publications').where('authorUids', 'array-contains', uid).get(),
      tcol(p.tenantId, 'projects').where('memberUids', 'array-contains', uid).get(),
    ]);
    if (!person.exists) throw notFound();
    const unit = person.get('unitId') ? await tcol(p.tenantId, 'units').doc(person.get('unitId')).get() : null;
    const pr = (profile.data() ?? {}) as Record<string, unknown>;
    const reg = (await tcol(p.tenantId, REGISTRY_COLLECTION).where('personUids', 'array-contains', uid).get()).docs.map((d) => docData<RegistryItem>(d)).filter((x) => x.status === 'CONFIRMED');
    const published = pubs.docs.map((d) => docData<Publication>(d)).filter((x) => ['CONFIRMED', 'EXPORTED'].includes(x.status)).sort((a, b) => b.year - a.year);
    const projects = projs.docs.map((d) => docData<Project>(d)).filter((x) => !['CANCELLED'].includes(x.status));
    const school = await tenantName(p.tenantId);
    const blocks: Block[] = [
      { kind: 'title', text: 'Lý lịch khoa học' },
      { kind: 'h1', text: 'I. Thông tin chung' },
      { kind: 'kv', items: [['Họ và tên', person.get('displayName')], ['Học hàm, học vị', [pr.academicTitle, pr.degree].filter(Boolean).join(', ') || '—'], ['Chức danh', person.get('title') ?? '—'], ['Đơn vị công tác', unit?.get('name') ?? '—'], ['ORCID', String(pr.orcid || '—')], ['Chuyên môn', ((pr.expertise as string[]) ?? []).join(', ') || '—']] },
      ...(pr.introVi ? ([{ kind: 'h2', text: 'Giới thiệu' }, { kind: 'p', text: String(pr.introVi) }, ...(pr.introEn ? [{ kind: 'p', text: String(pr.introEn), italic: true } as Block] : [])] as Block[]) : []),
      { kind: 'h2', text: 'Hướng nghiên cứu' },
      { kind: 'p', text: String(pr.researchInterests || '—') },
      { kind: 'h1', text: 'II. Đề tài, nhiệm vụ KH&CN' },
      { kind: 'table', headers: ['TT', 'Mã', 'Tên đề tài', 'Vai trò', 'Thời gian', 'Tình trạng'], widths: [1, 3, 8, 2, 4, 3], rows: projects.map((x, i) => [i + 1, x.code, x.title, x.ownerUid === uid ? 'Chủ nhiệm' : 'Thành viên', `${d10(x.startDate)} – ${d10(x.endDate)}`, PROJECT_WORKFLOW.states[x.status]?.label ?? x.status]) },
      { kind: 'h1', text: 'III. Công bố khoa học (đã được Trường xác nhận)' },
      { kind: 'table', headers: ['TT', 'Công bố', 'Năm', 'DOI'], widths: [1, 10, 2, 4], rows: published.map((x, i) => [i + 1, `${x.authors.map((a) => a.name).join(', ')}. ${x.title}. ${x.venue}${x.volume ? `, ${x.volume}` : ''}${x.issue ? `(${x.issue})` : ''}${x.pages ? `, ${x.pages}` : ''}.`, x.year, x.doi ?? '']) },
      ...REGISTRY_KINDS.filter((k) => reg.some((x) => x.kind === k)).flatMap((k, i): Block[] => [{ kind: 'h1', text: `${['IV', 'V', 'VI', 'VII', 'VIII'][i]}. ${REGISTRY[k].plural}` }, { kind: 'table', headers: ['TT', 'Mã', 'Nội dung'], widths: [1, 3, 12], rows: reg.filter((x) => x.kind === k).map((x, j) => [j + 1, x.code, REGISTRY[k].fields.filter((f) => f.list).map((f) => registryDisplay(f, x.data[f.key])).join(' · ')]) }]),
      { kind: 'p', text: `${today()}`, align: 'right', italic: true },
      { kind: 'signatures', items: [{ role: 'Xác nhận của đơn vị', name: '' }, { role: 'Người khai', name: person.get('displayName') }] },
    ];
    const buf = await buildDocx({ title: `Lý lịch khoa học ${person.get('displayName')}`, header: header(school, (unit?.get('name') ?? '').toUpperCase()), blocks, footerNote: 'AI-SRM · Lý lịch khoa học' });
    await audit({ actor: p, action: 'researcher.export_docx', resourceType: 'researcherProfile', resourceId: uid, requestId: rid });
    send(res, buf, DOCX, `Ly_lich_khoa_hoc_${String(person.get('displayName')).replace(/[^\p{L}\p{N}]+/gu, '_')}.docx`);
  }

  /** Báo cáo điều hành (Word) từ dự thảo đã duyệt + bảng chỉ số tính sẵn. */
  @Post('report-docx')
  async report(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Body() body: unknown, @Res() res: Response) {
    if (!hasAnyRole(p, REPORT_ROLES as unknown as Parameters<typeof hasAnyRole>[1])) throw forbidden();
    const b = parse(z.object({ title: z.string().min(3).max(300), text: z.string().max(50000), recipient: z.string().max(300).optional() }), body);
    const m = await computeMetrics(p);
    const school = await tenantName(p.tenantId);
    const blocks: Block[] = [
      { kind: 'title', text: b.title },
      { kind: 'subtitle', text: `Phạm vi: ${m.scope} · Số liệu tại ${d10(m.generatedAt)} (công thức ${m.metricsVersion})` },
      ...(b.recipient ? ([{ kind: 'p', text: `Kính gửi: ${b.recipient}`, bold: true, align: 'center' }] as Block[]) : []),
      { kind: 'p', text: b.text || '(chưa có nội dung)' },
      { kind: 'h1', text: 'Phụ lục: Bảng chỉ số' },
      { kind: 'table', headers: ['Mã chỉ số', 'Chỉ số', 'Giá trị', 'Định nghĩa'], widths: [3, 5, 2, 7], rows: m.tiles.map((t) => [t.key, t.label, t.key.endsWith('_vnd') ? vnd(t.value) : t.value, t.definition]) },
      { kind: 'table', headers: ['Đơn vị', 'Đề xuất', 'Đề tài đang thực hiện', 'Công bố đã xác nhận', 'Đề tài quá hạn'], widths: [6, 2, 3, 3, 2], rows: m.byUnit.map((u) => [u.unitName, u.proposals, u.activeProjects, u.confirmedPublications, u.overdue]) },
      { kind: 'p', text: m.dataNote, italic: true },
      { kind: 'signatures', items: [{ role: 'Người lập', name: p.displayName }, { role: 'Lãnh đạo duyệt', name: '' }] },
    ];
    const buf = await buildDocx({ title: b.title, header: header(school), blocks, footerNote: 'AI-SRM · Báo cáo điều hành' });
    await audit({ actor: p, action: 'report.export_docx', resourceType: 'report', resourceId: 'executive', requestId: rid });
    send(res, buf, DOCX, `Bao_cao_${new Date().toISOString().slice(0, 10)}.docx`);
  }

  /** Báo cáo cấp trên theo cấu trúc HEMIS (mục 12) — nhiều trang tính, chỉ hồ sơ đã duyệt / xác nhận. */
  @Get('hemis-xlsx')
  async hemis(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Res() res: Response) {
    if (!hasRoleFor(p, SCIENCE_OFFICE, null) && !hasAnyRole(p, ['VICE_RECTOR', 'RECTOR', 'INTEGRATION_ADMIN'])) throw forbidden();
    const school = await tenantName(p.tenantId);
    const [projects, pubs, reg] = await Promise.all([
      tcol(p.tenantId, 'projects').limit(5000).get(),
      tcol(p.tenantId, 'publications').where('status', 'in', ['CONFIRMED', 'EXPORTED']).limit(5000).get(),
      tcol(p.tenantId, REGISTRY_COLLECTION).where('status', '==', 'CONFIRMED').limit(5000).get(),
    ]);
    const codes = new Map(projects.docs.map((d) => [d.id, d.get('code') as string]));
    const pj = projects.docs.map((d) => projectToHemis(p.tenantId, docData<Project>(d), school)).filter((r) => r.record.TINH_TRANG_NV !== 'CANCELLED');
    const pb = pubs.docs.map((d) => { const x = docData<Publication>(d); return publicationToHemis(p.tenantId, x, x.projectId ? (codes.get(x.projectId) ?? null) : null); });
    const toSheet = (name: string, recs: { record: Record<string, unknown>; missingRequired: string[] }[]): SheetSpec => {
      const keys = [...new Set(recs.flatMap((r) => Object.keys(r.record)))];
      return { name, headers: [...keys, 'THIẾU_BẮT_BUỘC'], rows: recs.map((r) => [...keys.map((k) => (r.record[k] === null || r.record[k] === undefined ? null : typeof r.record[k] === 'number' ? (r.record[k] as number) : String(r.record[k]))), r.missingRequired.join(', ') || null]), widths: keys.map(() => 20) };
    };
    const sheets: SheetSpec[] = [toSheet('_KHCN_NHIEM_VU_KHCN', pj), toSheet('_KHCN_BAI_BAO_KHOA_HOC', pb.filter((r) => r.table === '_KHCN_BAI_BAO_KHOA_HOC')), toSheet('_KHCH_SACH_XUAT_BAN', pb.filter((r) => r.table === '_KHCH_SACH_XUAT_BAN'))];
    const items = reg.docs.map((d) => docData<RegistryItem>(d));
    for (const k of REGISTRY_KINDS) {
      const def = REGISTRY[k];
      const rows = items.filter((x) => x.kind === k);
      const fields = def.fields.filter((f) => f.hemis);
      sheets.push({ name: def.hemisTable ?? def.plural, headers: ['MA', ...fields.map((f) => f.hemis!), 'DON_VI'], rows: rows.map((x) => [x.code, ...fields.map((f) => registryDisplay(f, x.data[f.key])), x.unitName]), widths: [14, ...fields.map(() => 22), 26] });
    }
    sheets.unshift({ name: 'Hướng dẫn', headers: ['Nội dung'], widths: [120], rows: [[`Báo cáo dữ liệu KH&CN của ${school} theo cấu trúc bảng HEMIS (mục 12).`], ['Chỉ gồm đề tài chưa hủy, công bố và danh mục đã được Phòng KH xác nhận.'], ['Giá trị danh mục đang là mã nội bộ AI-SRM; khi gửi HEMIS, UNI-DATA360 ánh xạ sang mã chính thức và ký số (t_k).'], ['Cột THIẾU_BẮT_BUỘC liệt kê trường bắt buộc còn trống cần bổ sung trước khi gửi.']] });
    const buf = await buildXlsx(sheets);
    await audit({ actor: p, action: 'report.export_hemis', resourceType: 'report', resourceId: 'hemis', requestId: rid });
    send(res, buf, XLSX, `HEMIS_KHCN_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }
}
