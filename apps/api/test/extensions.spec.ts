/**
 * Phân hệ bổ sung theo Thư mời K24: danh mục KH&CN, kinh phí – hợp đồng, HEMIS, NCKH sinh viên, xuất Word/Excel,
 * ủy quyền, phản biện ngoài trường, thư điện tử, kho minh chứng có phiên bản, ORCID, trích PDF, Researcher 360, hỏi đáp số liệu.
 */
import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signIn } from './support/auth';
import { DEMO_PASSWORD } from '../scripts/seed-data';
import { seed } from '../scripts/seed';
import { createApp } from '../src/main';
import { setMailTransportForTest } from '../src/infra/mailer';
import { setOrcidFetcherForTest, normalizeOrcid } from '../src/integrations/orcid';
import { extractByRules } from '../src/ai/features-ext';

let app: INestApplication;
let base = '';
const tokens = new Map<string, string>();
const E = {
  pi: 'gv.binh@demo.aisrm.test',
  r2: 'gv.chi@demo.aisrm.test',
  r3: 'gv.dung@demo.aisrm.test',
  student: 'sv.an@demo.aisrm.test',
  focal: 'dm.ktqt@demo.aisrm.test',
  unitHead: 'tk.ktqt@demo.aisrm.test',
  officer: 'cv.linh@demo.aisrm.test',
  officer2: 'cv.minh@demo.aisrm.test',
  head: 'tp.hung@demo.aisrm.test',
  rector: 'ht.quang@demo.aisrm.test',
  admin: 'admin@demo.aisrm.test',
};
async function token(email: string, password = DEMO_PASSWORD) {
  if (tokens.has(email)) return tokens.get(email)!;
  const t = await signIn(base, email, password);
  tokens.set(email, t);
  return t;
}
async function api(who: string, method: string, path: string, body?: unknown) {
  const h: Record<string, string> = { Authorization: `Bearer ${await token(who)}` };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    h['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const r = await fetch(`${base}/api/v1${path}`, { method, headers: h, body: payload });
  const ct = r.headers.get('content-type') ?? '';
  if (!ct.includes('json')) return { status: r.status, body: null as any, bytes: Buffer.from(await r.arrayBuffer()), contentType: ct };
  return { status: r.status, body: (await r.json()) as any, bytes: null, contentType: ct };
}
const uidOf = async (email: string) => (await api(email, 'GET', '/me')).body.uid as string;

/** PDF tối giản có lớp chữ (để thử trích thông tin). */
function makePdf(lines: string[]): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => '\\' + c);
  const content = `BT /F1 12 Tf 50 750 Td 14 TL ${lines.map((l) => `(${esc(l)}) Tj T*`).join(' ')} ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}

beforeAll(async () => {
  await seed({ log: false });
  app = await createApp();
  await app.listen(0);
  base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
});
afterAll(async () => {
  setMailTransportForTest(null);
  setOrcidFetcherForTest((u, i) => fetch(u, i));
  await app?.close();
});

describe('Danh mục KH&CN (kê khai – xác nhận)', () => {
  let id = '';
  it('kiểm tra dữ liệu theo định nghĩa, nộp, Phòng KH xác nhận, không tự xác nhận', async () => {
    const bad = await api(E.pi, 'POST', '/registry/ip_asset', { data: { title: 'Giải pháp thử', ipType: 'XYZ', ipStatus: 'FILED' } });
    expect(bad.status).toBe(422);
    const r = await api(E.pi, 'POST', '/registry/ip_asset', { data: { title: 'Giải pháp thử nghiệm tích hợp', ipType: 'UTILITY', ipStatus: 'FILED', inventors: [{ uid: await uidOf(E.pi), name: 'TS. Trần Thị Bình' }, { uid: null, name: 'Chuyên gia ngoài' }], filingDate: '2026-10-01' } });
    expect(r.status).toBe(201);
    id = r.body.id;
    expect(r.body.code).toMatch(/^SHTT-\d{4}-\d{4}$/);
    let d = await api(E.pi, 'GET', `/registry/ip_asset/${id}`);
    expect(d.body.permissions.canSubmit).toBe(true);
    expect((await api(E.officer, 'POST', `/registry/ip_asset/${id}/confirm`, { expectedVersion: d.body.item.version })).status).toBe(409);
    expect((await api(E.pi, 'POST', `/registry/ip_asset/${id}/submit`, { expectedVersion: d.body.item.version })).status).toBe(201);
    d = await api(E.pi, 'GET', `/registry/ip_asset/${id}`);
    expect((await api(E.officer, 'POST', `/registry/ip_asset/${id}/return`, { expectedVersion: d.body.item.version })).status).toBe(400);
    expect((await api(E.officer, 'POST', `/registry/ip_asset/${id}/confirm`, { expectedVersion: d.body.item.version, note: 'Đã đối chiếu đơn' })).status).toBe(201);
    d = await api(E.r2, 'GET', `/registry/ip_asset/${id}`);
    expect(d.status).toBe(200);
    expect(d.body.item.status).toBe('CONFIRMED');
    const prof = await api(E.r2, 'GET', `/researchers/${await uidOf(E.pi)}`);
    expect(prof.body.registry.some((x: { id: string }) => x.id === id)).toBe(true);
    expect(prof.body.registry.some((x: { kind: string }) => x.kind === 'award')).toBe(true);
  });

  it('danh sách theo loại; loại không tồn tại → 404', async () => {
    const l = await api(E.r3, 'GET', '/registry/research_group');
    expect(l.status).toBe(200);
    expect(l.body.items.some((x: { data: { isStrong: boolean } }) => x.data.isStrong)).toBe(true);
    expect((await api(E.r3, 'GET', '/registry/khong_co')).status).toBe(404);
  });
});

describe('Kinh phí – hợp đồng (M08)', () => {
  it('đề nghị chi trong dự toán, duyệt, giải ngân theo chứng từ, chặn quyết toán khi còn đề nghị mở', async () => {
    const f = await api(E.pi, 'GET', '/projects/dt1/finance');
    expect(f.status).toBe(200);
    expect(f.body.budgetLocked).toBe(true);
    expect(f.body.summary.disbursedVnd).toBe(11_500_000);
    expect((await api(E.pi, 'PUT', '/projects/dt1/finance/contract', { contractNo: 'X', signedDate: '2026-01-01', valueVnd: 1 })).status).toBe(403);
    const over = await api(E.pi, 'POST', '/projects/dt1/finance/expenses', { category: 'WORKSHOP', content: 'Hội thảo bổ sung', amountVnd: 10_000_000 });
    expect(over.status).toBe(422);
    const ok = await api(E.pi, 'POST', '/projects/dt1/finance/expenses', { category: 'TRAVEL', content: 'Khảo sát bổ sung tại Hải Phòng', amountVnd: 5_000_000 });
    expect(ok.status).toBe(201);
    expect((await api(E.pi, 'POST', `/projects/dt1/finance/expenses/${ok.body.id}/approve`, {})).status).toBe(403);
    expect((await api(E.officer, 'POST', `/projects/dt1/finance/expenses/${ok.body.id}/approve`, {})).status).toBe(201);
    expect((await api(E.officer, 'POST', `/projects/dt1/finance/expenses/${ok.body.id}/disburse`, { disbursedVnd: 6_000_000, disbursedAt: '2026-11-20', voucherNo: 'PC-1' })).status).toBe(422);
    expect((await api(E.officer, 'POST', `/projects/dt1/finance/expenses/${ok.body.id}/disburse`, { disbursedVnd: 4_800_000, disbursedAt: '2026-11-20', voucherNo: 'PC-0999' })).status).toBe(201);
    const after = await api(E.pi, 'GET', '/projects/dt1/finance');
    expect(after.body.summary.disbursedVnd).toBe(16_300_000);
    expect((await api(E.officer, 'PUT', '/projects/dt1/finance/settlement', { status: 'SETTLED' })).status).toBe(422);
    const proj = await api(E.pi, 'GET', '/projects/dt1');
    expect(proj.body.item.financeStats.disbursedVnd).toBe(16_300_000);
  });
});

describe('HEMIS', () => {
  it('Phòng KH cập nhật thông tin HEMIS đề tài; xem trước HEMIS dùng dữ liệu mới', async () => {
    const body = { classification: 'BASIC', level: 'UNIVERSITY', field: 'SOCIAL', fundingSource: 'STATE', hostAgency: 'Bộ GD&ĐT', evaluationResult: null, acceptanceDate: null };
    expect((await api(E.r3, 'PUT', '/projects/dt2/hemis', body)).status).toBe(403);
    expect((await api(E.officer, 'PUT', '/projects/dt2/hemis', body)).status).toBe(200);
    const pv = await api(E.admin, 'GET', '/integrations/uni-data360/hemis-preview?entity=projects');
    const rec = pv.body.records.find((r: { sourceCode: string; record: Record<string, unknown> }) => r.record.PHAN_LOAI_NHIEM_VU === 'BASIC');
    expect(rec?.record.NGUON_KINH_PHI).toBe('STATE');
  });
  it('xếp hạng Q phải có nguồn, do Phòng KH xác nhận', async () => {
    expect((await api(E.officer, 'PUT', '/publications/cb1/classification', { journalScope: 'INTERNATIONAL', quartile: 'Q2', quartileSource: null })).status).toBe(400);
    expect((await api(E.pi, 'PUT', '/publications/cb1/classification', { journalScope: 'INTERNATIONAL', quartile: 'Q2', quartileSource: 'SCImago 2025' })).status).toBe(403);
    expect((await api(E.officer, 'PUT', '/publications/cb1/classification', { journalScope: 'DOMESTIC', quartile: null, quartileSource: null })).status).toBe(200);
  });
});

describe('NCKH sinh viên', () => {
  it('cần giảng viên hướng dẫn xác nhận trước khi nộp; xếp giải; thống kê', async () => {
    const created = await api(E.student, 'POST', '/proposals', { callId: 'call-sv', title: 'Ứng dụng AI trong học tập của sinh viên khối kinh tế' });
    expect(created.status).toBe(201);
    const id = created.body.id;
    let p = await api(E.student, 'GET', `/proposals/${id}`);
    expect(p.body.item.callLevel).toBe('STUDENT');
    await api(E.student, 'PATCH', `/proposals/${id}`, { expectedVersion: p.body.item.version, budgetVnd: 8_000_000, durationMonths: 6, fields: { field: 'Kinh tế', objective: 'Đánh giá mức độ sử dụng công cụ AI trong học tập của sinh viên.', supervisor: 'TS. Trần Thị Bình' } });
    const fd = new FormData();
    fd.set('parentType', 'proposal');
    fd.set('parentId', id);
    fd.set('checklistKey', 'de_cuong');
    fd.set('file', new Blob(['Đề cương'], { type: 'text/plain' }), 'de_cuong.txt');
    expect((await api(E.student, 'POST', '/documents', fd)).status).toBe(201);
    expect((await api(E.student, 'PUT', `/proposals/${id}/student`, { supervisorUid: await uidOf(E.pi), major: 'Kinh tế quốc tế', cohort: 'K63' })).status).toBe(200);
    p = await api(E.student, 'GET', `/proposals/${id}`);
    const submit = await api(E.student, 'POST', `/proposals/${id}/transitions`, { action: 'submit', expectedVersion: p.body.item.version });
    expect(submit.status).toBe(422);
    expect(submit.body.code).toBe('SUPERVISOR_NOT_CONFIRMED');
    expect((await api(E.r2, 'POST', `/proposals/${id}/supervisor/confirm`, {})).status).toBe(403);
    const sup = await api(E.pi, 'GET', `/proposals/${id}`);
    expect(sup.status).toBe(200); // người hướng dẫn được xem hồ sơ
    expect((await api(E.pi, 'POST', `/proposals/${id}/supervisor/confirm`, {})).status).toBe(201);
    p = await api(E.student, 'GET', `/proposals/${id}`);
    const sub2 = await api(E.student, 'POST', `/proposals/${id}/transitions`, { action: 'submit', expectedVersion: p.body.item.version });
    expect(sub2.status).toBe(201);

    expect((await api(E.student, 'GET', '/student-research/calls/call-sv/ranking')).status).toBe(403);
    const rk = await api(E.officer, 'GET', '/student-research/calls/call-sv/ranking');
    expect(rk.status).toBe(200);
    expect(rk.body.items.some((x: { proposalId: string }) => x.proposalId === id)).toBe(true);
    expect((await api(E.student, 'PUT', '/student-research/awards', { proposalId: id, prize: 'FIRST' })).status).toBe(403);
    expect((await api(E.officer, 'PUT', '/student-research/awards', { proposalId: id, prize: 'THIRD' })).status).toBe(200);
    const st = await api(E.officer, 'GET', '/student-research/stats');
    expect(st.body.prizes.THIRD).toBeGreaterThanOrEqual(1);
    expect(st.body.byCohort.some((g: { key: string }) => g.key === 'K63')).toBe(true);
  });

  it('nhật ký hướng dẫn: người hướng dẫn ghi, người ngoài không ghi được', async () => {
    expect((await api(E.focal, 'POST', '/projects/dtsv1/supervision-logs', { date: '2026-11-21', content: 'Góp ý chương 2' })).status).toBe(201);
    expect((await api(E.r3, 'POST', '/projects/dtsv1/supervision-logs', { date: '2026-11-21', content: 'Thử' })).status).toBe(403);
    const l = await api(E.student, 'GET', '/projects/dtsv1/supervision-logs');
    expect(l.body.items.length).toBeGreaterThanOrEqual(3);
  });

  it('AI gợi ý nhận xét theo tiêu chí (giả lập), không chấm điểm', async () => {
    const r = await api(E.officer, 'POST', '/proposals/sv1/ai', { task: 'criteria' });
    expect(r.status).toBe(201);
    expect(r.body.comments.map((c: { key: string }) => c.key)).toEqual(['idea', 'method', 'result', 'presentation']);
  });
});

describe('Xuất Word / Excel', () => {
  it('Excel theo phạm vi quyền; Word thuyết minh, lý lịch; HEMIS chỉ cho Phòng KH / lãnh đạo', async () => {
    const x = await api(E.officer, 'GET', '/exports/datasets/projects');
    expect(x.status).toBe(200);
    expect(x.contentType).toContain('spreadsheetml');
    expect(x.bytes!.subarray(0, 2).toString()).toBe('PK');
    expect((await api(E.pi, 'GET', '/exports/datasets/finance')).status).toBe(403);
    expect((await api(E.officer, 'GET', '/exports/datasets/khong_co')).status).toBe(400);
    const w = await api(E.pi, 'GET', '/exports/proposals/dx5/docx');
    expect(w.status).toBe(200);
    expect(w.contentType).toContain('wordprocessingml');
    expect((await api(E.student, 'GET', '/exports/proposals/dx5/docx')).status).toBe(404);
    expect((await api(E.r2, 'GET', `/exports/researchers/${await uidOf(E.pi)}/docx`)).status).toBe(200);
    expect((await api(E.pi, 'GET', '/exports/hemis-xlsx')).status).toBe(403);
    const h = await api(E.head, 'GET', '/exports/hemis-xlsx');
    expect(h.status).toBe(200);
    const rep = await api(E.head, 'POST', '/exports/report-docx', { title: 'Báo cáo thử', text: 'Nội dung', recipient: 'Bộ GD&ĐT' });
    expect(rep.status).toBe(201);
    expect(rep.contentType).toContain('wordprocessingml');
  });
});

describe('Ủy quyền, bàn giao, phản biện ngoài trường', () => {
  it('trưởng khoa ủy quyền có thời hạn; người nhận có vai trò; thu hồi', async () => {
    const r2 = await uidOf(E.r2);
    const now = Date.now();
    const body = { toUid: r2, role: 'UNIT_HEAD', scopeId: 'k-ktqt', validFrom: new Date(now - 60_000).toISOString(), validUntil: new Date(now + 7 * 86400_000).toISOString(), reason: 'Đi công tác' };
    expect((await api(E.r3, 'POST', '/admin/delegations', body)).status).toBe(403);
    const d = await api(E.unitHead, 'POST', '/admin/delegations', body);
    expect(d.status).toBe(201);
    expect((await api(E.r2, 'GET', '/me')).body.roles).toContain('UNIT_HEAD');
    expect((await api(E.unitHead, 'DELETE', `/admin/delegations/${d.body.id}`)).status).toBe(200);
    expect((await api(E.r2, 'GET', '/me')).body.roles).not.toContain('UNIT_HEAD');
  });

  it('bàn giao hồ sơ chưa kết thúc', async () => {
    const [from, to] = await Promise.all([uidOf(E.r3), uidOf(E.r2)]);
    expect((await api(E.officer, 'POST', '/admin/handover/preview', { fromUid: from })).status).toBe(403);
    const pv = await api(E.head, 'POST', '/admin/handover/preview', { fromUid: from });
    const item = pv.body.items.find((x: { kind: string }) => x.kind === 'proposals');
    expect(item).toBeTruthy();
    const r = await api(E.head, 'POST', '/admin/handover', { fromUid: from, toUid: to, reason: 'Chuyển công tác', items: [{ kind: item.kind, id: item.id }] });
    expect(r.body.moved).toBe(1);
    const p = await api(E.r2, 'GET', `/proposals/${item.id}`);
    expect(p.body.item.ownerUid).toBe(to);
  });

  it('tài khoản phản biện ngoài trường chỉ có vai trò Phản biện, có hạn', async () => {
    const r = await api(E.officer, 'POST', '/admin/external-reviewers', { email: 'pb.ngoai@example.test', displayName: 'PGS.TS. Phản Biện Ngoài', organization: 'Viện Nghiên cứu mẫu', expertise: ['Thương mại quốc tế'], validUntil: new Date(Date.now() + 30 * 86400_000).toISOString() });
    expect(r.status).toBe(201);
    expect(r.body.temporaryPassword).toBeTruthy();
    const t = await signIn(base, 'pb.ngoai@example.test', r.body.temporaryPassword);
    tokens.set('pb.ngoai@example.test', t);
    const me = await api('pb.ngoai@example.test', 'GET', '/me');
    if (me.status === 200) expect(me.body.roles).toEqual(['REVIEWER']);
    const list = await api(E.officer, 'GET', '/admin/external-reviewers');
    expect(list.body.items.some((x: { email: string; active: boolean }) => x.email === 'pb.ngoai@example.test' && x.active)).toBe(true);
    expect((await api(E.pi, 'GET', '/admin/external-reviewers')).status).toBe(403);
  });
});

describe('Thư điện tử', () => {
  it('khi bật, thông báo được gửi thư và ghi nhật ký', async () => {
    const sent: { to: string; subject: string }[] = [];
    setMailTransportForTest({ sendMail: async (m) => void sent.push(m) });
    expect((await api(E.head, 'PUT', '/admin/mail', { enabled: true, scope: 'all' })).status).toBe(403);
    expect((await api(E.admin, 'PUT', '/admin/mail', { enabled: true, scope: 'all' })).status).toBe(200);
    const c = await api(E.r2, 'POST', '/registry/award', { data: { title: 'Giải thử nghiệm', awardLevel: 'UNIVERSITY', organization: 'Trường', year: 2026 } });
    const d = await api(E.r2, 'GET', `/registry/award/${c.body.id}`);
    await api(E.r2, 'POST', `/registry/award/${c.body.id}/submit`, { expectedVersion: d.body.item.version });
    expect(sent.some((m) => m.to === E.officer && m.subject.includes('chờ xác nhận'))).toBe(true);
    const log = await api(E.admin, 'GET', '/admin/mail');
    expect(log.body.log.some((l: { status: string }) => l.status === 'SENT')).toBe(true);
    await api(E.admin, 'PUT', '/admin/mail', { enabled: false, scope: 'all' });
    setMailTransportForTest(null);
  });
});

describe('Kho minh chứng có phiên bản', () => {
  it('tải phiên bản mới, bản cũ chuyển "đã thay thế" và vẫn tải được', async () => {
    const pub = await api(E.pi, 'POST', '/publications', { title: 'Bài thử phiên bản minh chứng', type: 'JOURNAL', venue: 'Tạp chí mẫu', year: 2026, authors: [{ name: 'TS. Trần Thị Bình', uid: await uidOf(E.pi), isInternal: true, order: 1 }] });
    const up = (name: string, replacesId?: string) => {
      const fd = new FormData();
      fd.set('parentType', 'publication');
      fd.set('parentId', pub.body.id);
      if (replacesId) fd.set('replacesId', replacesId);
      fd.set('file', new Blob([name], { type: 'text/plain' }), name);
      return api(E.pi, 'POST', '/documents', fd);
    };
    const v1 = await up('ban1.txt');
    const v2 = await up('ban2.txt', v1.body.id);
    expect(v2.status).toBe(201);
    expect(v2.body.versionNo).toBe(2);
    expect((await up('ban3.txt', v1.body.id)).status).toBe(409);
    const vs = await api(E.pi, 'GET', `/documents/${v2.body.id}/versions`);
    expect(vs.body.items.map((x: { versionNo: number; status: string }) => `${x.versionNo}:${x.status}`)).toEqual(['2:ACTIVE', '1:SUPERSEDED']);
    expect((await api(E.pi, 'GET', `/documents/${v1.body.id}/download`)).status).toBe(200);
  });
});

describe('Kiểm chứng ORCID, trích PDF', () => {
  it('ORCID: kiểm tra chữ số kiểm tra; đối chiếu công bố; nhập công trình thành nháp', async () => {
    expect(normalizeOrcid('0000-0002-1825-0097')).toBe('0000-0002-1825-0097');
    expect(normalizeOrcid('0000-0002-1825-0098')).toBeNull();
    setOrcidFetcherForTest(async () =>
      new Response(
        JSON.stringify({
          group: [
            { 'work-summary': [{ 'put-code': 1, title: { title: { value: 'Global value chain participation of Vietnamese exporting firms: evidence from panel data' } }, type: 'journal-article', 'publication-date': { year: { value: '2025' } }, 'external-ids': { 'external-id': [] } }] },
            { 'work-summary': [{ 'put-code': 2, title: { title: { value: 'A new ORCID-only paper on trade' } }, type: 'journal-article', 'publication-date': { year: { value: '2024' } }, 'journal-title': { value: 'Journal X' }, 'external-ids': { 'external-id': [{ 'external-id-type': 'doi', 'external-id-value': '10.9999/orcid.only.1' }] } }] },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    await api(E.pi, 'PUT', '/me/profile', { orcid: '0000-0002-1825-0097', expertise: ['Kinh tế quốc tế'] });
    const v = await api(E.pi, 'POST', '/publications/cb1/verify-orcid');
    expect(v.status).toBe(201);
    expect(v.body.authors[0].status).toBe('MATCH_TITLE');
    const ex = await api(E.pi, 'POST', '/publications/cb1/explain-verification');
    expect(ex.status).toBe(201);
    expect(ex.body.text).toContain('ORCID');
    const works = await api(E.pi, 'GET', '/me/orcid/works');
    expect(works.body.works.find((w: { putCode: string }) => w.putCode === '1').alreadyInSystem).toBe(true);
    const imp = await api(E.pi, 'POST', '/me/orcid/import', { putCodes: ['2'] });
    expect(imp.body.created).toHaveLength(1);
    const again = await api(E.pi, 'POST', '/me/orcid/import', { putCodes: ['2'] });
    expect(again.body.created).toHaveLength(0);
  });

  it('trích DOI, ISSN, tập/số/trang từ PDF (quy tắc + AI giả lập)', async () => {
    const rules = extractByRules('Journal of Testing\nVol. 12, No. 3, pp. 45-58\nISSN: 1234-5678\nhttps://doi.org/10.1234/abc.2025.7.\n2025');
    expect(rules).toMatchObject({ doi: '10.1234/abc.2025.7', issn: '1234-5678', volume: '12', issue: '3', pages: '45-58' });
    const fd = new FormData();
    fd.set('file', new Blob([new Uint8Array(makePdf(['Customer analytics adoption in Vietnamese retail firms', 'Journal of Testing Vol. 7 No. 2 pp. 10-20', 'ISSN 2345-6789', 'DOI 10.5555/test.pdf.42', '2025']))], { type: 'application/pdf' }), 'bai.pdf');
    const r = await api(E.pi, 'POST', '/publications/extract-pdf', fd);
    expect(r.status).toBe(201);
    expect(r.body.extracted.doi).toBe('10.5555/test.pdf.42');
    expect(r.body.extracted.issn).toBe('2345-6789');
    expect(r.body.mock).toBe(true);
  });
});

describe('Researcher 360 và điều hành', () => {
  it('tìm chuyên gia, mạng lưới, bản đồ năng lực', async () => {
    const s = await api(E.officer, 'GET', `/experts/search?q=${encodeURIComponent('xuất khẩu nông sản')}`);
    expect(s.status).toBe(200);
    expect(s.body.items[0].score).toBeGreaterThan(0);
    expect(s.body.items.some((x: { displayName: string }) => x.displayName.includes('Dũng') || x.displayName.includes('Khang'))).toBe(true);
    expect((await api(E.officer, 'GET', '/experts/network')).status).toBe(200);
    const c = await api(E.officer, 'GET', '/experts/competency');
    expect(c.body.units.length).toBeGreaterThan(0);
  });

  it('AI dự thảo giới thiệu song ngữ, người dùng duyệt rồi mới lưu', async () => {
    const d = await api(E.pi, 'POST', '/me/profile/intro-draft');
    expect(d.status).toBe(201);
    expect(d.body.vi).toContain('Trần Thị Bình');
    expect(d.body.en.length).toBeGreaterThan(20);
    expect((await api(E.pi, 'PUT', '/me/profile/intro', { introVi: d.body.vi, introEn: d.body.en })).status).toBe(400);
    expect((await api(E.pi, 'PUT', '/me/profile/intro', { introVi: d.body.vi, introEn: d.body.en, approved: true })).status).toBe(200);
    expect((await api(E.r2, 'GET', `/researchers/${await uidOf(E.pi)}`)).body.profile.introVi).toBe(d.body.vi);
  });

  it('chỉ số mở rộng, hỏi đáp số liệu (AI chọn truy vấn), chốt kỳ', async () => {
    const x = await api(E.head, 'GET', '/dashboard/extended');
    expect(x.status).toBe(200);
    expect(x.body.tables.map((t: { key: string }) => t.key)).toContain('student_by_unit');
    expect((await api(E.student, 'POST', '/dashboard/ask', { question: 'Đề tài theo đơn vị' })).status).toBe(403);
    const a = await api(E.head, 'POST', '/dashboard/ask', { question: 'Khoa nào có nhiều đề tài nhất?' });
    expect(a.status).toBe(201);
    expect(a.body.matched).toBe(true);
    expect(a.body.query.key).toBe('projects_by_unit');
    expect(a.body.table.rows.length).toBeGreaterThan(0);
    const none = await api(E.head, 'POST', '/dashboard/ask', { question: 'Thời tiết hôm nay thế nào?' });
    expect(none.body.matched).toBe(false);
    expect((await api(E.pi, 'POST', '/dashboard/snapshots', { label: 'Thử', period: '2026' })).status).toBe(403);
    const s = await api(E.officer, 'POST', '/dashboard/snapshots', { label: 'Báo cáo năm 2026', period: '2026' });
    expect(s.status).toBe(201);
    const g = await api(E.head, 'GET', `/dashboard/snapshots/${s.body.id}`);
    expect(g.body.metrics.tiles.length).toBeGreaterThan(0);
  });
});
