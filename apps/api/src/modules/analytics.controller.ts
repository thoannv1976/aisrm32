import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  hasAnyRole,
  PROJECT_LEVELS,
  PUBLICATION_TYPE_LABELS,
  REGISTRY,
  SCIENCE_FIELDS,
  STUDENT_PRIZES,
  type Call,
  type Principal,
  type Project,
  type Proposal,
  type Publication,
  type RegistryItem,
  type Role,
  type StudentPrize,
} from '@aisrm/shared';
import { z } from 'zod';
import { chooseQuery, type QueryCatalogItem } from '../ai/features-ext';
import { CurrentPrincipal, RequestId } from '../common/auth';
import { forbidden, notFound } from '../common/errors';
import { audit, isTenantReader, listVisible } from '../common/records';
import { docData, parse, todayIso } from '../common/util';
import { nowIso, tcol } from '../infra';
import { computeMetrics } from './dashboard.controller';
import { REGISTRY_COLLECTION } from './registry.controller';

const REPORT_ROLES: Role[] = ['UNIT_FOCAL', 'UNIT_HEAD', 'SCIENCE_OFFICER', 'SCIENCE_HEAD', 'VICE_RECTOR', 'RECTOR', 'BOARD'];
const LIVE_PROJECT = ['CONTRACT_PENDING', 'ACTIVE', 'ACCEPTANCE_PENDING', 'COMPLETION_REVISION', 'COMPLETED', 'ARCHIVED', 'SUSPENDED'];
const CONFIRMED_PUB = ['CONFIRMED', 'EXPORTED'];

export interface Table {
  key: string;
  title: string;
  definition: string;
  columns: { key: string; label: string; numeric?: boolean }[];
  rows: Record<string, string | number | null>[];
  chart: { type: 'bar'; label: string; value: string } | null;
}

/** Dữ liệu trong phạm vi được xem — dùng chung cho chỉ số mở rộng và hỏi đáp số liệu. */
async function loadScope(p: Principal) {
  const [proposals, projects, publications, calls] = await Promise.all([
    listVisible<Proposal>(p, 'proposals', { memberField: 'memberUids', limit: 1000 }),
    listVisible<Project>(p, 'projects', { memberField: 'memberUids', limit: 1000 }),
    listVisible<Publication>(p, 'publications', { memberField: 'authorUids', limit: 1000 }),
    tcol(p.tenantId, 'calls').get().then((s) => s.docs.map((d) => docData<Call>(d))),
  ]);
  const registry = (await tcol(p.tenantId, REGISTRY_COLLECTION).where('status', '==', 'CONFIRMED').limit(5000).get()).docs
    .map((d) => docData<RegistryItem>(d))
    .filter((x) => isTenantReader(p) || p.bindings.some((b) => b.scopeType === 'unit' && b.scopeId && x.unitPath.includes(b.scopeId)) || x.personUids.includes(p.uid));
  const awards = new Map((await tcol(p.tenantId, 'studentAwards').get()).docs.map((d) => [d.id, d.get('prize') as StudentPrize]));
  const studentCalls = new Set(calls.filter((c) => c.level === 'STUDENT').map((c) => c.id));
  const callYear = new Map(calls.map((c) => [c.id, c.year]));
  return { proposals, projects, publications, registry, awards, studentCalls, callYear };
}

type Scope = Awaited<ReturnType<typeof loadScope>>;

function grouped(items: { k: string; v: number }[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const x of items) m[x.k] = (m[x.k] ?? 0) + x.v;
  return m;
}
const toRows = (m: Record<string, number>, labelKey: string, valueKey: string, sort: 'value' | 'label' = 'value') =>
  Object.entries(m)
    .map(([k, v]) => ({ [labelKey]: k, [valueKey]: v }))
    .sort((a, b) => (sort === 'value' ? (b[valueKey] as number) - (a[valueKey] as number) : String(a[labelKey]).localeCompare(String(b[labelKey]), 'vi')));

const startYear = (x: Project) => Number((x.startDate ?? x.createdAt ?? '').slice(0, 4)) || null;

/** Danh mục truy vấn đã kiểm soát: mỗi truy vấn là công thức xác định, có định nghĩa. */
const QUERIES: (QueryCatalogItem & { run: (s: Scope, params: Record<string, string | number | null>) => Table })[] = [
  {
    key: 'projects_by_unit',
    label: 'Số đề tài theo đơn vị',
    params: ['year'],
    keywords: ['đề tài theo đơn vị', 'đề tài theo khoa', 'khoa nào nhiều đề tài', 'đề tài từng khoa', 'đề tài của các khoa'],
    run: (s, prm) => {
      const items = s.projects.filter((x) => LIVE_PROJECT.includes(x.status) && (!prm.year || startYear(x) === Number(prm.year)));
      return { key: 'projects_by_unit', title: `Số đề tài theo đơn vị${prm.year ? ` (bắt đầu năm ${prm.year})` : ''}`, definition: 'Đếm đề tài đã phê duyệt (trừ đã hủy) theo đơn vị chủ trì.', columns: [{ key: 'unit', label: 'Đơn vị' }, { key: 'count', label: 'Số đề tài', numeric: true }], rows: toRows(grouped(items.map((x) => ({ k: x.unitName, v: 1 }))), 'unit', 'count'), chart: { type: 'bar', label: 'unit', value: 'count' } };
    },
  },
  {
    key: 'projects_by_year',
    label: 'Số đề tài theo năm bắt đầu',
    params: [],
    keywords: ['đề tài theo năm', 'đề tài qua các năm', 'số đề tài mỗi năm', 'xu hướng đề tài'],
    run: (s) => ({ key: 'projects_by_year', title: 'Số đề tài theo năm bắt đầu', definition: 'Đếm đề tài đã phê duyệt (trừ đã hủy) theo năm của ngày bắt đầu (chưa có thì theo năm phê duyệt).', columns: [{ key: 'year', label: 'Năm' }, { key: 'count', label: 'Số đề tài', numeric: true }], rows: toRows(grouped(s.projects.filter((x) => LIVE_PROJECT.includes(x.status)).map((x) => ({ k: String(startYear(x) ?? '—'), v: 1 }))), 'year', 'count', 'label'), chart: { type: 'bar', label: 'year', value: 'count' } }),
  },
  {
    key: 'projects_by_field',
    label: 'Số đề tài theo lĩnh vực KH&CN',
    params: [],
    keywords: ['lĩnh vực', 'theo ngành khoa học', 'khoa học xã hội', 'đề tài theo lĩnh vực'],
    run: (s) => ({ key: 'projects_by_field', title: 'Số đề tài theo lĩnh vực KH&CN', definition: 'Đếm đề tài đã phê duyệt theo lĩnh vực Phòng KH đã cập nhật (Thông tin HEMIS).', columns: [{ key: 'field', label: 'Lĩnh vực' }, { key: 'count', label: 'Số đề tài', numeric: true }], rows: toRows(grouped(s.projects.filter((x) => LIVE_PROJECT.includes(x.status)).map((x) => ({ k: x.hemis?.field ? SCIENCE_FIELDS[x.hemis.field] : '(chưa phân loại)', v: 1 }))), 'field', 'count'), chart: { type: 'bar', label: 'field', value: 'count' } }),
  },
  {
    key: 'projects_by_level',
    label: 'Số đề tài theo cấp',
    params: [],
    keywords: ['cấp đề tài', 'cấp bộ', 'cấp nhà nước', 'cấp cơ sở', 'đề tài theo cấp'],
    run: (s) => ({ key: 'projects_by_level', title: 'Số đề tài theo cấp', definition: 'Đếm đề tài đã phê duyệt theo cấp quản lý (Thông tin HEMIS).', columns: [{ key: 'level', label: 'Cấp' }, { key: 'count', label: 'Số đề tài', numeric: true }], rows: toRows(grouped(s.projects.filter((x) => LIVE_PROJECT.includes(x.status)).map((x) => ({ k: x.hemis?.level ? PROJECT_LEVELS[x.hemis.level] : '(chưa phân loại)', v: 1 }))), 'level', 'count'), chart: { type: 'bar', label: 'level', value: 'count' } }),
  },
  {
    key: 'overdue_projects',
    label: 'Danh sách đề tài chậm tiến độ',
    params: [],
    keywords: ['chậm tiến độ', 'quá hạn', 'trễ hạn', 'chậm'],
    run: (s) => {
      const t = todayIso();
      const items = s.projects.filter((x) => x.status === 'ACTIVE' && x.milestoneStats?.nextDue && x.milestoneStats.nextDue < t);
      return { key: 'overdue_projects', title: 'Đề tài có mốc quá hạn', definition: 'Đề tài đang thực hiện có mốc chưa được chấp nhận đã quá hạn (tính đến hôm nay).', columns: [{ key: 'code', label: 'Mã' }, { key: 'title', label: 'Tên đề tài' }, { key: 'unit', label: 'Đơn vị' }, { key: 'due', label: 'Hạn mốc' }], rows: items.map((x) => ({ code: x.code, title: x.title, unit: x.unitName, due: x.milestoneStats.nextDue })), chart: null };
    },
  },
  {
    key: 'publications_by_year',
    label: 'Số công bố đã xác nhận theo năm',
    params: [],
    keywords: ['công bố theo năm', 'bài báo theo năm', 'bài báo mỗi năm', 'công bố qua các năm'],
    run: (s) => ({ key: 'publications_by_year', title: 'Công bố đã xác nhận theo năm', definition: 'Đếm công bố trạng thái Đã xác nhận / Đã xuất theo năm công bố.', columns: [{ key: 'year', label: 'Năm' }, { key: 'count', label: 'Số công bố', numeric: true }], rows: toRows(grouped(s.publications.filter((x) => CONFIRMED_PUB.includes(x.status)).map((x) => ({ k: String(x.year), v: 1 }))), 'year', 'count', 'label'), chart: { type: 'bar', label: 'year', value: 'count' } }),
  },
  {
    key: 'publications_by_unit',
    label: 'Số công bố đã xác nhận theo đơn vị',
    params: ['year'],
    keywords: ['công bố theo đơn vị', 'công bố theo khoa', 'bài báo theo khoa', 'khoa nào nhiều bài báo', 'công bố của các khoa'],
    run: (s, prm) => ({ key: 'publications_by_unit', title: `Công bố đã xác nhận theo đơn vị${prm.year ? ` (năm ${prm.year})` : ''}`, definition: 'Đếm công bố Đã xác nhận / Đã xuất theo đơn vị của người khai.', columns: [{ key: 'unit', label: 'Đơn vị' }, { key: 'count', label: 'Số công bố', numeric: true }], rows: toRows(grouped(s.publications.filter((x) => CONFIRMED_PUB.includes(x.status) && (!prm.year || x.year === Number(prm.year))).map((x) => ({ k: x.unitName, v: 1 }))), 'unit', 'count'), chart: { type: 'bar', label: 'unit', value: 'count' } }),
  },
  {
    key: 'publications_by_type',
    label: 'Công bố theo loại / xếp hạng',
    params: ['year'],
    keywords: ['loại công bố', 'tạp chí quốc tế', 'q1', 'xếp hạng', 'sách', 'hội thảo'],
    run: (s, prm) => {
      const items = s.publications.filter((x) => CONFIRMED_PUB.includes(x.status) && (!prm.year || x.year === Number(prm.year)));
      return { key: 'publications_by_type', title: `Công bố đã xác nhận theo loại và xếp hạng${prm.year ? ` (năm ${prm.year})` : ''}`, definition: 'Loại công bố; xếp hạng Q chỉ tính khi Phòng KH đã xác nhận theo nguồn.', columns: [{ key: 'type', label: 'Loại' }, { key: 'count', label: 'Số công bố', numeric: true }], rows: toRows(grouped(items.map((x) => ({ k: `${PUBLICATION_TYPE_LABELS[x.type]}${x.quartile ? ` (${x.quartile})` : ''}`, v: 1 }))), 'type', 'count'), chart: { type: 'bar', label: 'type', value: 'count' } };
    },
  },
  {
    key: 'budget_by_unit',
    label: 'Kinh phí đề tài theo đơn vị (hợp đồng, giải ngân)',
    params: [],
    keywords: ['kinh phí', 'giải ngân', 'ngân sách', 'tiền', 'tài chính'],
    run: (s) => {
      const m = new Map<string, { unit: string; approved: number; contract: number; disbursed: number }>();
      for (const x of s.projects.filter((y) => LIVE_PROJECT.includes(y.status))) {
        if (!m.has(x.unitName)) m.set(x.unitName, { unit: x.unitName, approved: 0, contract: 0, disbursed: 0 });
        const r = m.get(x.unitName)!;
        r.approved += x.budgetVnd ?? 0;
        r.contract += x.financeStats?.contractValueVnd ?? 0;
        r.disbursed += x.financeStats?.disbursedVnd ?? 0;
      }
      return { key: 'budget_by_unit', title: 'Kinh phí đề tài theo đơn vị (VND)', definition: 'Kinh phí đã duyệt = kinh phí đề xuất của đề tài đã phê duyệt; hợp đồng, giải ngân = số Phòng KH nhập theo chứng từ tài chính.', columns: [{ key: 'unit', label: 'Đơn vị' }, { key: 'approved', label: 'Đã duyệt', numeric: true }, { key: 'contract', label: 'Giá trị hợp đồng', numeric: true }, { key: 'disbursed', label: 'Đã giải ngân', numeric: true }], rows: [...m.values()].sort((a, b) => b.approved - a.approved), chart: { type: 'bar', label: 'unit', value: 'approved' } };
    },
  },
  {
    key: 'student_by_unit',
    label: 'NCKH sinh viên theo khoa',
    params: ['year'],
    keywords: ['sinh viên', 'nckh sinh viên', 'đề tài sinh viên'],
    run: (s, prm) => {
      const items = s.proposals.filter((x) => s.studentCalls.has(x.callId) && x.status !== 'WITHDRAWN' && (!prm.year || s.callYear.get(x.callId) === Number(prm.year)));
      const m = new Map<string, { unit: string; registered: number; approved: number; awarded: number }>();
      for (const x of items) {
        if (!m.has(x.unitName)) m.set(x.unitName, { unit: x.unitName, registered: 0, approved: 0, awarded: 0 });
        const r = m.get(x.unitName)!;
        r.registered++;
        if (x.status === 'APPROVED') r.approved++;
        const a = s.awards.get(x.id);
        if (a && a !== 'NONE') r.awarded++;
      }
      return { key: 'student_by_unit', title: `NCKH sinh viên theo khoa${prm.year ? ` (năm ${prm.year})` : ''}`, definition: 'Đề tài thuộc đợt NCKH sinh viên (trừ đã rút); đạt giải = Phòng KH đã ghi mức giải khác "Không đạt".', columns: [{ key: 'unit', label: 'Khoa / đơn vị' }, { key: 'registered', label: 'Đăng ký', numeric: true }, { key: 'approved', label: 'Được duyệt', numeric: true }, { key: 'awarded', label: 'Đạt giải', numeric: true }], rows: [...m.values()].sort((a, b) => b.registered - a.registered), chart: { type: 'bar', label: 'unit', value: 'registered' } };
    },
  },
  {
    key: 'student_prizes',
    label: 'Cơ cấu giải NCKH sinh viên',
    params: [],
    keywords: ['giải nhất', 'giải thưởng sinh viên', 'xếp giải', 'cơ cấu giải'],
    run: (s) => ({ key: 'student_prizes', title: 'Cơ cấu giải NCKH sinh viên', definition: 'Số đề tài theo mức giải Phòng KH đã ghi nhận.', columns: [{ key: 'prize', label: 'Mức giải' }, { key: 'count', label: 'Số đề tài', numeric: true }], rows: (Object.keys(STUDENT_PRIZES) as StudentPrize[]).map((k) => ({ prize: STUDENT_PRIZES[k], count: [...s.awards.values()].filter((v) => v === k).length })), chart: { type: 'bar', label: 'prize', value: 'count' } }),
  },
  {
    key: 'registry_counts',
    label: 'Nhóm nghiên cứu, sở hữu trí tuệ, chuyển giao, hội thảo, giải thưởng',
    params: [],
    keywords: ['sở hữu trí tuệ', 'sáng chế', 'chuyển giao', 'hội thảo', 'nhóm nghiên cứu', 'giải thưởng'],
    run: (s) => ({ key: 'registry_counts', title: 'Kết quả KH&CN khác đã xác nhận', definition: 'Đếm bản ghi danh mục đã được Phòng KH xác nhận.', columns: [{ key: 'kind', label: 'Danh mục' }, { key: 'count', label: 'Số lượng', numeric: true }], rows: Object.values(REGISTRY).map((d) => ({ kind: d.plural, count: s.registry.filter((x) => x.kind === d.kind).length })), chart: { type: 'bar', label: 'kind', value: 'count' } }),
  },
];

function answerText(t: Table): string {
  if (t.rows.length === 0) return `${t.title}: không có dữ liệu trong phạm vi bạn được xem.`;
  const num = t.columns.find((c) => c.numeric);
  if (!num) return `${t.title}: ${t.rows.length} dòng.`;
  const label = t.columns[0];
  const total = t.rows.reduce((s, r) => s + (Number(r[num.key]) || 0), 0);
  const top = [...t.rows].sort((a, b) => (Number(b[num.key]) || 0) - (Number(a[num.key]) || 0))[0];
  const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(n);
  return `${t.title}: tổng ${fmt(total)} (${num.label.toLowerCase()}). Cao nhất: ${top[label.key]} — ${fmt(Number(top[num.key]) || 0)}.`;
}

@Controller('dashboard')
export class AnalyticsController {
  /** Chỉ số mở rộng: theo năm, lĩnh vực, cấp, NCKH sinh viên, kinh phí, kết quả KH&CN khác. */
  @Get('extended')
  async extended(@CurrentPrincipal() p: Principal) {
    const s = await loadScope(p);
    const keys = ['projects_by_year', 'projects_by_field', 'projects_by_level', 'publications_by_year', 'publications_by_type', 'budget_by_unit', 'student_by_unit', 'student_prizes', 'registry_counts'];
    const tables = keys.map((k) => QUERIES.find((q) => q.key === k)!.run(s, {}));
    const studentProposals = s.proposals.filter((x) => s.studentCalls.has(x.callId) && x.status !== 'WITHDRAWN');
    const fin = s.projects.reduce((a, x) => ({ contract: a.contract + (x.financeStats?.contractValueVnd ?? 0), disbursed: a.disbursed + (x.financeStats?.disbursedVnd ?? 0) }), { contract: 0, disbursed: 0 });
    return {
      generatedAt: nowIso(),
      tiles: [
        { key: 'student_registered', label: 'Đề tài NCKH sinh viên', value: studentProposals.length, definition: 'Hồ sơ thuộc đợt NCKH sinh viên (trừ đã rút)' },
        { key: 'student_awarded', label: 'Đề tài sinh viên đạt giải', value: studentProposals.filter((x) => s.awards.get(x.id) && s.awards.get(x.id) !== 'NONE').length, definition: 'Đã được Phòng KH ghi mức giải' },
        { key: 'contract_value_vnd', label: 'Giá trị hợp đồng đề tài (VND)', value: fin.contract, definition: 'Tổng giá trị hợp đồng Phòng KH đã nhập' },
        { key: 'disbursed_vnd', label: 'Đã giải ngân (VND)', value: fin.disbursed, definition: 'Tổng giải ngân theo chứng từ tài chính' },
        { key: 'ip_confirmed', label: 'Tài sản trí tuệ', value: s.registry.filter((x) => x.kind === 'ip_asset').length, definition: 'Sở hữu trí tuệ đã xác nhận' },
        { key: 'strong_groups', label: 'Nhóm nghiên cứu mạnh', value: s.registry.filter((x) => x.kind === 'research_group' && x.data.isStrong).length, definition: 'Nhóm nghiên cứu đã xác nhận, được công nhận nhóm mạnh' },
      ],
      tables,
    };
  }

  @Get('ask/catalog')
  catalog() {
    return { items: QUERIES.map((q) => ({ key: q.key, label: q.label, params: q.params })), examples: ['Khoa nào có nhiều đề tài nhất năm 2026?', 'Số công bố đã xác nhận theo năm', 'Đề tài nào đang chậm tiến độ?', 'Kinh phí giải ngân theo đơn vị', 'NCKH sinh viên theo khoa'] };
  }

  /** Hỏi đáp số liệu: AI chỉ chọn truy vấn trong danh mục; số liệu do máy chủ tính bằng công thức xác định. */
  @Post('ask')
  async ask(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Body() body: unknown) {
    if (!hasAnyRole(p, REPORT_ROLES)) throw forbidden('Chỉ cán bộ quản lý dùng hỏi đáp số liệu.');
    const b = parse(z.object({ question: z.string().min(3).max(500), queryKey: z.string().max(60).optional() }), body);
    const { choice, draft } = b.queryKey ? { choice: { key: b.queryKey, params: {} as Record<string, string | number | null>, reason: 'Người dùng chọn truy vấn' }, draft: null } : await chooseQuery(p, b.question, QUERIES);
    if (!b.queryKey && /\b(20\d{2})\b/.test(b.question) && !choice.params.year) choice.params.year = Number(/\b(20\d{2})\b/.exec(b.question)![1]);
    const q = QUERIES.find((x) => x.key === choice.key);
    await audit({ actor: p, action: 'ai.data_qa', resourceType: 'report', resourceId: choice.key ?? 'none', requestId: rid, detail: draft ? `${draft.model.provider}/${draft.model.modelId}${draft.mock ? ' (mock)' : ''}` : 'manual' });
    if (!q) return { matched: false, answer: 'Chưa có truy vấn số liệu phù hợp với câu hỏi. Hãy chọn một truy vấn trong danh sách gợi ý.', choice, ai: draft && { model: draft.model, mock: draft.mock }, catalog: QUERIES.map((x) => ({ key: x.key, label: x.label })) };
    const params = Object.fromEntries(Object.entries(choice.params ?? {}).filter(([k, v]) => q.params.includes(k) && v !== null && v !== ''));
    const table = q.run(await loadScope(p), params);
    return { matched: true, answer: answerText(table), table, choice: { ...choice, params }, query: { key: q.key, label: q.label }, scope: isTenantReader(p) ? 'Toàn trường' : 'Trong phạm vi được phân quyền', ai: draft && { model: draft.model, mock: draft.mock }, note: 'AI chỉ chọn truy vấn; mọi con số do hệ thống tính từ dữ liệu, kèm định nghĩa.' };
  }

  // ------------------------------------------------------------ Chốt kỳ số liệu
  @Get('snapshots')
  async snapshots(@CurrentPrincipal() p: Principal) {
    if (!hasAnyRole(p, REPORT_ROLES)) throw forbidden();
    const s = await tcol(p.tenantId, 'metricSnapshots').get();
    return { items: s.docs.map((d) => ({ id: d.id, label: d.get('label'), period: d.get('period'), scope: d.get('scope'), createdAt: d.get('createdAt'), createdByName: d.get('createdByName') })).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)) };
  }

  /** Chốt kỳ: lưu bất biến bộ số liệu tại thời điểm chốt để báo cáo kỳ luôn khớp. Chỉ Phòng KH / lãnh đạo. */
  @Post('snapshots')
  async snapshot(@CurrentPrincipal() p: Principal, @RequestId() rid: string, @Body() body: unknown) {
    if (!hasAnyRole(p, ['SCIENCE_OFFICER', 'SCIENCE_HEAD', 'VICE_RECTOR', 'RECTOR'])) throw forbidden('Chỉ Phòng KH / lãnh đạo được chốt kỳ số liệu.');
    const b = parse(z.object({ label: z.string().min(3).max(200), period: z.string().max(50) }), body);
    const [metrics, extended] = await Promise.all([computeMetrics(p), this.extended(p)]);
    const ref = tcol(p.tenantId, 'metricSnapshots').doc();
    await ref.set({ label: b.label, period: b.period, scope: metrics.scope, metrics, extended, createdAt: nowIso(), createdBy: p.uid, createdByName: p.displayName });
    await audit({ actor: p, action: 'report.snapshot', resourceType: 'report', resourceId: ref.id, requestId: rid, detail: b.label });
    return { id: ref.id };
  }

  @Get('snapshots/:id')
  async getSnapshot(@CurrentPrincipal() p: Principal, @Param('id') id: string) {
    if (!hasAnyRole(p, REPORT_ROLES)) throw forbidden();
    const s = await tcol(p.tenantId, 'metricSnapshots').doc(id).get();
    if (!s.exists) throw notFound();
    return { id, ...s.data() };
  }
}
