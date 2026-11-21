/**
 * Kiểm thử tích hợp trên Firebase Emulator Suite: chạy bằng `pnpm test:integration` ở thư mục gốc
 * (firebase emulators:exec tự bật/tắt emulator), hoặc `pnpm --filter @aisrm/api test:integration` khi emulator đang chạy.
 * Bao phủ các kịch bản bắt buộc trong AI_SRM_BUILD_SPEC §12.1–12.2 (phần không phụ thuộc AI/UNI-DATA360).
 */
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8180';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= '127.0.0.1:9199';
process.env.FIREBASE_PROJECT_ID ??= 'demo-aisrm';
process.env.APP_ENV ??= 'test';

import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_PASSWORD } from '../scripts/seed-data';
import { seed } from '../scripts/seed';
import { createApp } from '../src/main';

let app: INestApplication;
let base = '';
const tokens = new Map<string, string>();

async function token(email: string): Promise<string> {
  if (tokens.has(email)) return tokens.get(email)!;
  const r = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: DEMO_PASSWORD, returnSecureToken: true }) },
  );
  const j = (await r.json()) as { idToken: string };
  tokens.set(email, j.idToken);
  return j.idToken;
}

const U = {
  pi: 'gv.binh@demo.aisrm.test',
  r2: 'gv.chi@demo.aisrm.test',
  student: 'sv.an@demo.aisrm.test',
  focal: 'dm.ktqt@demo.aisrm.test',
  focal2: 'dm.qtkd@demo.aisrm.test',
  officer: 'cv.linh@demo.aisrm.test',
  officer2: 'cv.minh@demo.aisrm.test',
  head: 'tp.hung@demo.aisrm.test',
  vr: 'pht.nam@demo.aisrm.test',
  rector: 'ht.quang@demo.aisrm.test',
  t2: 'gv.xuan@demo2.aisrm.test',
};

interface Res<T = any> {
  status: number;
  body: T;
}

async function api<T = any>(who: string | null, method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Res<T>> {
  const h: Record<string, string> = { ...headers };
  if (who) h.Authorization = `Bearer ${await token(who)}`;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    h['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const r = await fetch(`${base}/api/v1${path}`, { method, headers: h, body: payload });
  const text = await r.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* CSV / text */
  }
  return { status: r.status, body: parsed as T };
}

async function upload(who: string, parentType: string, parentId: string, extra: Record<string, string> = {}, name = 'thuyet-minh.pdf') {
  const fd = new FormData();
  fd.set('parentType', parentType);
  fd.set('parentId', parentId);
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  fd.set('file', new Blob([Buffer.from('%PDF-1.4\n% tai lieu thu nghiem\n')], { type: 'application/pdf' }), name);
  return api(who, 'POST', '/documents', fd);
}

async function act(who: string, kind: string, id: string, action: string, comment?: string, headers?: Record<string, string>) {
  const cur = await api(who, 'GET', `/${kind}/${id}`);
  expect(cur.status, `GET ${kind}/${id} as ${who}`).toBe(200);
  return api(who, 'POST', `/${kind}/${id}/transitions`, { action, expectedVersion: cur.body.item.version, comment }, headers);
}

beforeAll(async () => {
  await seed({ log: false });
  app = await createApp();
  await app.listen(0);
  base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
});

afterAll(async () => {
  await app?.close();
});

describe('nền tảng', () => {
  it('health công khai; API khác yêu cầu đăng nhập', async () => {
    expect((await api(null, 'GET', '/health')).status).toBe(200);
    const r = await api(null, 'GET', '/me');
    expect(r.status).toBe(401);
    expect(r.body).toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(r.body.requestId).toBeTruthy();
  });

  it('/me trả vai trò từ dữ liệu quyền ở backend', async () => {
    const r = await api(U.focal, 'GET', '/me');
    expect(r.status).toBe(200);
    expect(r.body.roles).toEqual(expect.arrayContaining(['RESEARCHER', 'UNIT_FOCAL']));
    expect(r.body.tenantId).toBe('ftu');
  });
});

describe('Kịch bản 1 — đề xuất đi xuyên suốt đến lưu trữ đề tài', () => {
  it('nộp → đơn vị → phòng KH → phê duyệt → giao nhiệm vụ → nghiệm thu → hoàn thành → lưu trữ', async () => {
    const created = await api(U.pi, 'POST', '/proposals', { callId: 'call-truong', title: 'Kinh tế tuần hoàn trong doanh nghiệp dệt may' });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    expect(created.body.code).toMatch(/^DX-\d{4}-\d{4}$/);

    // Thiếu dữ liệu → không nộp được, có danh sách lỗi
    let r = await act(U.pi, 'proposals', id, 'submit');
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('SUBMISSION_INVALID');
    expect(r.body.details.map((i: { field: string }) => i.field)).toEqual(expect.arrayContaining(['objective', 'checklist.thuyet_minh', 'checklist.du_toan']));

    const cur = await api(U.pi, 'GET', `/proposals/${id}`);
    r = await api(U.pi, 'PATCH', `/proposals/${id}`, {
      expectedVersion: cur.body.item.version,
      fields: { field: 'Kinh tế', urgency: 'x', objective: 'y', methods: 'z', expectedOutputs: '01 bài báo' },
      budgetVnd: 120_000_000,
      durationMonths: 12,
    });
    expect(r.status).toBe(200);
    expect((await upload(U.pi, 'proposal', id, { checklistKey: 'thuyet_minh' })).status).toBe(201);
    expect((await upload(U.pi, 'proposal', id, { checklistKey: 'du_toan' }, 'du-toan.pdf')).status).toBe(201);

    r = await act(U.pi, 'proposals', id, 'submit');
    expect(r.status).toBe(201);
    expect(r.body.to).toBe('UNIT_REVIEW');

    // Chủ hồ sơ không còn sửa được sau khi nộp
    const after = await api(U.pi, 'GET', `/proposals/${id}`);
    expect(after.body.canEdit).toBe(false);
    expect((await api(U.pi, 'PATCH', `/proposals/${id}`, { expectedVersion: after.body.item.version, title: 'Đổi tên' })).status).toBe(403);

    expect((await act(U.focal, 'proposals', id, 'unit_confirm')).body.to).toBe('SCIENCE_REVIEW');
    expect((await act(U.officer, 'proposals', id, 'science_forward')).body.to).toBe('APPROVAL_PENDING');
    // Chuyên viên không có quyền phê duyệt
    expect((await act(U.officer, 'proposals', id, 'approve')).status).toBe(403);
    r = await act(U.vr, 'proposals', id, 'approve');
    expect(r.status).toBe(201);
    expect(r.body.to).toBe('APPROVED');

    const approved = await api(U.pi, 'GET', `/proposals/${id}`);
    const projectId = approved.body.item.projectId as string;
    expect(projectId).toBeTruthy();

    let pj = await api(U.officer, 'GET', `/projects/${projectId}`);
    expect(pj.body.item.status).toBe('CONTRACT_PENDING');
    // Chưa có lịch / mốc → không giao nhiệm vụ được
    expect((await act(U.officer, 'projects', projectId, 'activate')).status).toBe(422);
    expect((await api(U.officer, 'POST', `/projects/${projectId}/schedule`, { startDate: '2027-01-01', endDate: '2027-12-31', expectedVersion: pj.body.item.version })).status).toBe(201);
    const ms = await api(U.pi, 'POST', `/projects/${projectId}/milestones`, { title: 'Báo cáo khảo sát', dueDate: '2027-06-30', deliverable: 'Báo cáo' });
    expect(ms.status).toBe(201);
    expect((await act(U.officer, 'projects', projectId, 'activate')).body.to).toBe('ACTIVE');

    // Còn mốc chưa nộp → chưa đề nghị nghiệm thu được
    expect((await act(U.pi, 'projects', projectId, 'request_acceptance')).body.code).toBe('MILESTONES_INCOMPLETE');
    expect((await api(U.pi, 'POST', `/projects/${projectId}/milestones/${ms.body.id}/submit`, {})).status).toBe(422);
    expect((await upload(U.pi, 'project', projectId, { milestoneId: ms.body.id }, 'bao-cao.pdf')).status).toBe(201);
    expect((await api(U.pi, 'POST', `/projects/${projectId}/milestones/${ms.body.id}/submit`, { note: 'Nộp báo cáo' })).status).toBe(201);
    // Chủ nhiệm không tự chấp nhận sản phẩm của mình
    expect((await api(U.pi, 'POST', `/projects/${projectId}/milestones/${ms.body.id}/accept`, {})).status).toBe(403);
    expect((await api(U.officer, 'POST', `/projects/${projectId}/milestones/${ms.body.id}/accept`, {})).status).toBe(201);

    expect((await act(U.pi, 'projects', projectId, 'request_acceptance')).body.to).toBe('ACCEPTANCE_REQUESTED');
    expect((await act(U.officer, 'projects', projectId, 'start_acceptance')).body.to).toBe('ACCEPTANCE_REVIEW');
    expect((await act(U.head, 'projects', projectId, 'complete')).body.to).toBe('COMPLETED');
    expect((await act(U.officer, 'projects', projectId, 'archive')).body.to).toBe('ARCHIVED');

    const hist = await api(U.pi, 'GET', `/proposals/${id}/history`);
    expect(hist.body.items.map((h: { action: string }) => h.action)).toEqual(['submit', 'unit_confirm', 'science_forward', 'approve']);
    pj = await api(U.pi, 'GET', `/projects/${projectId}/history`);
    expect(pj.body.items.map((h: { to: string }) => h.to)).toEqual(['ACTIVE', 'ACCEPTANCE_REQUESTED', 'ACCEPTANCE_REVIEW', 'COMPLETED', 'ARCHIVED']);

    // Người nhận thông báo
    const notes = await api(U.pi, 'GET', '/me/notifications');
    expect(notes.body.items.length).toBeGreaterThan(0);
  });
});

describe('Kịch bản 2 — trả bổ sung giữ bản cũ và quay đúng bước', () => {
  it('trả bổ sung ở bước Phòng KH, nộp lại quay về Phòng KH, bản nộp 1 không đổi', async () => {
    // dx2 đang SCIENCE_REVIEW (dữ liệu mẫu)
    expect((await act(U.officer, 'proposals', 'dx2', 'request_revision', '')).body.code).toBe('COMMENT_REQUIRED');
    expect((await act(U.officer, 'proposals', 'dx2', 'request_revision', 'Bổ sung dự toán chi tiết')).body.to).toBe('NEEDS_REVISION');
    const owner = 'gv.dung@demo.aisrm.test';
    const cur = await api(owner, 'GET', '/proposals/dx2');
    expect(cur.body.canEdit).toBe(true);
    await api(owner, 'PATCH', '/proposals/dx2', { expectedVersion: cur.body.item.version, budgetVnd: 110_000_000 });
    await upload(owner, 'proposal', 'dx2', { checklistKey: 'thuyet_minh' });
    await upload(owner, 'proposal', 'dx2', { checklistKey: 'du_toan' });
    const r = await act(owner, 'proposals', 'dx2', 'resubmit');
    expect(r.status).toBe(201);
    expect(r.body.to).toBe('SCIENCE_REVIEW');
    const revs = await api(owner, 'GET', '/proposals/dx2/revisions');
    expect(revs.body.items.map((x: { revisionNo: number }) => x.revisionNo)).toEqual([2, 1]);
    expect(revs.body.items[1].snapshot.budgetVnd).toBe(120_000_000);
    expect(revs.body.items[0].snapshot.budgetVnd).toBe(110_000_000);
  });
});

describe('Kịch bản 3 — công bố trùng DOI, phân tách xác minh/xác nhận', () => {
  it('gợi ý trùng DOI, không tự gộp; công bố chưa xác nhận không được xuất', async () => {
    const r = await api(U.r2, 'POST', '/publications', {
      title: 'Một bài báo khác',
      type: 'JOURNAL',
      venue: 'Tạp chí X',
      year: 2026,
      doi: 'https://doi.org/10.5555/FTU.DEMO.2026.001',
      authors: [{ name: 'ThS. Lê Minh Chí', uid: null, isInternal: true, order: 1 }],
    });
    expect(r.status).toBe(201);
    expect(r.body.duplicates.map((d: { id: string }) => d.id)).toContain('cb1');
    // Không tự xóa / gộp — bản ghi mới vẫn tồn tại ở trạng thái Nháp
    expect((await api(U.r2, 'GET', `/publications/${r.body.id}`)).body.item.status).toBe('DRAFT');

    const csv = await api(U.officer, 'GET', '/publications/export.csv');
    expect(csv.status).toBe(200);
    expect(String(csv.body)).toContain('CB-');
    expect(String(csv.body)).not.toContain('Customer analytics adoption'); // cb2 mới ở trạng thái Đã nộp

    // cb3 đã được cv.linh xác minh → trưởng phòng xác nhận được
    expect((await act(U.head, 'publications', 'cb3', 'confirm')).body.to).toBe('CONFIRMED');
    // cb2: chuyên viên xác minh; chuyên viên không có quyền xác nhận
    expect((await act(U.officer2, 'publications', 'cb2', 'verify')).body.to).toBe('VERIFIED');
    expect((await act(U.officer2, 'publications', 'cb2', 'confirm')).status).toBe(403);
  });
});

describe('Kịch bản 5 — hai người duyệt cùng phiên bản', () => {
  it('một người thành công, người còn lại nhận VERSION_CONFLICT; chỉ một sự kiện nghiệp vụ', async () => {
    const cur = await api(U.vr, 'GET', '/proposals/dx4');
    const v = cur.body.item.version;
    const [a, b] = await Promise.all([
      api(U.vr, 'POST', '/proposals/dx4/transitions', { action: 'approve', expectedVersion: v }),
      api(U.rector, 'POST', '/proposals/dx4/transitions', { action: 'approve', expectedVersion: v }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    const hist = await api(U.vr, 'GET', '/proposals/dx4/history');
    expect(hist.body.items.filter((h: { action: string }) => h.action === 'approve')).toHaveLength(1);
    const projects = await api(U.officer, 'GET', '/projects');
    expect(projects.body.items.filter((p: { title: string }) => p.title === cur.body.item.title)).toHaveLength(1);
  });

  it('Idempotency-Key: gửi lại trả kết quả cũ; cùng key khác nội dung bị từ chối', async () => {
    const created = await api(U.r2, 'POST', '/proposals', { callId: 'call-truong', title: 'Đề xuất thử idempotency' });
    const id = created.body.id;
    const body = { action: 'withdraw', expectedVersion: 1, comment: 'Rút để chỉnh sửa' };
    const h = { 'Idempotency-Key': `idem-${id}` };
    const first = await api(U.r2, 'POST', `/proposals/${id}/transitions`, body, h);
    const second = await api(U.r2, 'POST', `/proposals/${id}/transitions`, body, h);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.replayed).toBe(true);
    const third = await api(U.r2, 'POST', `/proposals/${id}/transitions`, { ...body, comment: 'khác' }, h);
    expect(third.status).toBe(409);
    expect(third.body.code).toBe('IDEMPOTENCY_CONFLICT');
  });
});

describe('Phân quyền (§12.2)', () => {
  it('đầu mối khoa A không đọc được hồ sơ, tài liệu của khoa B', async () => {
    expect((await api(U.focal, 'GET', '/proposals/dx1')).status).toBe(404);
    const list = await api(U.focal, 'GET', '/proposals');
    expect(list.body.items.map((x: { id: string }) => x.id)).not.toContain('dx1');
    // Đầu mối khoa QTKD thấy hồ sơ dx1 thuộc khoa mình
    expect((await api(U.focal2, 'GET', '/proposals/dx1')).status).toBe(200);
  });

  it('tài liệu: người ngoài phạm vi không tải được qua ID', async () => {
    const created = await api(U.r2, 'POST', '/proposals', { callId: 'call-truong', title: 'Đề xuất có tài liệu' });
    const up = await upload(U.r2, 'proposal', created.body.id, { checklistKey: 'thuyet_minh' });
    expect(up.status).toBe(201);
    expect((await api(U.r2, 'GET', `/documents/${up.body.id}/download`)).status).toBe(200);
    expect((await api(U.focal, 'GET', `/documents/${up.body.id}/download`)).status).toBe(404);
    expect((await api(U.student, 'GET', `/documents/${up.body.id}/download`)).status).toBe(404);
  });

  it('không tự xét duyệt hồ sơ của mình', async () => {
    const created = await api(U.focal, 'POST', '/proposals', { callId: 'call-truong', title: 'Đề xuất của đầu mối' });
    const id = created.body.id;
    const cur = await api(U.focal, 'GET', `/proposals/${id}`);
    await api(U.focal, 'PATCH', `/proposals/${id}`, {
      expectedVersion: cur.body.item.version,
      fields: { field: 'Luật', urgency: 'a', objective: 'b', methods: 'c', expectedOutputs: 'd' },
      budgetVnd: 50_000_000,
      durationMonths: 12,
    });
    await upload(U.focal, 'proposal', id, { checklistKey: 'thuyet_minh' });
    await upload(U.focal, 'proposal', id, { checklistKey: 'du_toan' });
    expect((await act(U.focal, 'proposals', id, 'submit')).status).toBe(201);
    const r = await act(U.focal, 'proposals', id, 'unit_confirm');
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('SELF_APPROVAL');
    // Trưởng khoa (người khác cùng đơn vị) xác nhận được
    expect((await act('tk.ktqt@demo.aisrm.test', 'proposals', id, 'unit_confirm')).status).toBe(201);
  });

  it('cách ly tenant: người trường 2 không truy cập được trường 1', async () => {
    const r = await api(U.t2, 'GET', '/proposals', undefined, { 'X-Tenant-Id': 'ftu' });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('TENANT_FORBIDDEN');
    const own = await api(U.t2, 'GET', '/proposals');
    expect(own.status).toBe(200);
    expect(own.body.items).toHaveLength(0);
  });

  it('sinh viên không thấy hồ sơ của người khác; không mở được đợt', async () => {
    const list = await api(U.student, 'GET', '/proposals');
    // Chỉ thấy hồ sơ của chính mình (dữ liệu mẫu NCKH sinh viên sv1, sv2)
    const me = await api(U.student, 'GET', '/me');
    expect(list.body.items.length).toBeGreaterThan(0);
    for (const x of list.body.items) expect((await api(U.student, 'GET', `/proposals/${x.id}`)).body.item.ownerUid).toBe(me.body.uid);
    expect((await api(U.student, 'GET', '/proposals/dx1')).status).toBe(404);
    const r = await api(U.student, 'POST', '/calls', {});
    expect(r.status).toBe(403);
  });

  it('tệp sai định dạng bị từ chối', async () => {
    const created = await api(U.r2, 'POST', '/proposals', { callId: 'call-truong', title: 'Kiểm tra tệp' });
    const fd = new FormData();
    fd.set('parentType', 'proposal');
    fd.set('parentId', created.body.id);
    fd.set('file', new Blob([Buffer.from('MZ\x90\x00 not a pdf')], { type: 'application/pdf' }), 'virus.pdf');
    const r = await api(U.r2, 'POST', '/documents', fd);
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('FILE_CONTENT_MISMATCH');
  });
});

describe('Dashboard và trang làm việc', () => {
  it('chỉ số theo phạm vi, có định nghĩa và phiên bản công thức', async () => {
    const all = await api(U.head, 'GET', '/dashboard/metrics');
    expect(all.status).toBe(200);
    expect(all.body.metricsVersion).toBe('metrics.v1');
    expect(all.body.scope).toBe('Toàn trường');
    const mine = await api(U.student, 'GET', '/dashboard/metrics');
    expect(mine.body.scope).not.toBe('Toàn trường');
    // Sinh viên chỉ thấy đề tài của mình (1 đề tài sinh viên mẫu), không thấy số toàn trường
    expect(mine.body.tiles.find((t: { key: string }) => t.key === 'projects_active').value).toBe(1);
  });

  it('trang làm việc liệt kê việc cần xử lý và mốc quá hạn', async () => {
    const vr = await api(U.vr, 'GET', '/me/workspace');
    expect(vr.status).toBe(200);
    const pi = await api(U.pi, 'GET', '/me/workspace');
    expect(pi.body.deadlines.some((d: { status: string }) => d.status === 'OVERDUE')).toBe(true);
    const focal2 = await api(U.focal2, 'GET', '/me/workspace');
    expect(focal2.body.tasks.some((t: { id: string }) => t.id === 'dx1')).toBe(true);
  });
});
