/** M07 — Hội đồng và phản biện: luồng đầy đủ trên Firebase Emulator. */
import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signIn } from './support/auth';
import { DEMO_PASSWORD } from '../scripts/seed-data';
import { seed } from '../scripts/seed';
import { createApp } from '../src/main';

let app: INestApplication;
let base = '';
const tokens = new Map<string, string>();
const E = {
  officer: 'cv.linh@demo.aisrm.test',
  head: 'tp.hung@demo.aisrm.test',
  unitHead: 'tk.ktqt@demo.aisrm.test',
  focal: 'dm.ktqt@demo.aisrm.test',
  r2: 'gv.chi@demo.aisrm.test',
  r3: 'gv.dung@demo.aisrm.test',
  campusHead: 'gd.cs2@demo.aisrm.test',
};
async function token(email: string) {
  if (tokens.has(email)) return tokens.get(email)!;
  const t = await signIn(base, email, DEMO_PASSWORD);
  tokens.set(email, t);
  return t;
}
async function api(who: string, method: string, path: string, body?: unknown) {
  const r = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${await token(who)}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json: any = text;
  try {
    json = JSON.parse(text);
  } catch {
    /* text */
  }
  return { status: r.status, body: json };
}
const uidOf = async (email: string) => (await api(email, 'GET', '/me')).body.uid as string;
const good = { urgency: 17, objective: 16, method: 20, output: 15, capacity: 12 };

let councilId = '';

beforeAll(async () => {
  await seed({ log: false });
  app = await createApp();
  await app.listen(0);
  base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
});
afterAll(async () => app?.close());

describe('Hội đồng xét duyệt thuyết minh', () => {
  it('gợi ý phản biện theo chuyên môn, gắn cờ xung đột lợi ích', async () => {
    expect((await api(E.focal, 'GET', '/councils/suggest-reviewers?type=proposal&id=dx2')).status).toBe(403);
    const r = await api(E.officer, 'GET', '/councils/suggest-reviewers?type=proposal&id=dx2');
    expect(r.status).toBe(200);
    const names = r.body.items.map((x: { name: string }) => x.name);
    expect(names.length).toBeGreaterThan(1);
    // Chủ nhiệm hồ sơ (TS. Phạm Quốc Dũng) bị chặn và xếp cuối
    const owner = r.body.items.find((x: { name: string }) => x.name.includes('Phạm Quốc Dũng'));
    expect(owner.conflicts.some((c: { level: string }) => c.level === 'BLOCK')).toBe(true);
    expect(r.body.items[0].conflicts.some((c: { level: string }) => c.level === 'BLOCK')).toBe(false);
    expect(r.body.items[0].matched.length).toBeGreaterThan(0);
    // Giám đốc cơ sở II cùng đơn vị cấp trên? — chuyên gia xuất khẩu nông sản được gợi ý
    expect(names.some((n: string) => n.includes('Vũ Đức Khang') || n.includes('Bùi Thanh Long'))).toBe(true);
  });

  it('thành lập hội đồng, mời thành viên, chưa đủ chủ tịch/thư ký thì chưa mở chấm', async () => {
    expect((await api(E.focal, 'POST', '/councils', {})).status).toBe(403);
    const c = await api(E.officer, 'POST', '/councils', {
      title: 'Hội đồng xét duyệt thuyết minh đợt 2027',
      type: 'PROPOSAL_REVIEW',
      rubricTemplateKey: 'proposal_review',
      targets: [
        { type: 'proposal', id: 'dx2' },
        { type: 'proposal', id: 'dx1' },
      ],
      scoringDeadline: '2099-12-31',
    });
    expect(c.status).toBe(201);
    expect(c.body.code).toMatch(/^HD-/);
    councilId = c.body.id;
    for (const [email, role] of [
      [E.unitHead, 'CHAIR'],
      [E.head, 'SECRETARY'],
      [E.focal, 'REVIEWER'],
      [E.r2, 'MEMBER'],
    ] as const) {
      expect((await api(E.officer, 'POST', `/councils/${councilId}/members`, { uid: await uidOf(email), role })).status).toBe(201);
    }
    expect((await api(E.officer, 'POST', `/councils/${councilId}/members`, { uid: await uidOf(E.campusHead), role: 'CHAIR' })).body.code).toBe('DUPLICATE_ROLE');
    expect((await api(E.officer, 'POST', `/councils/${councilId}/open`)).body.code).toBe('ROLES_MISSING');
    for (const e of [E.unitHead, E.head, E.focal, E.r2]) expect((await api(e, 'POST', `/councils/${councilId}/respond`, { accept: true })).status).toBe(201);
    expect((await api(E.officer, 'POST', `/councils/${councilId}/open`)).status).toBe(201);
    // Thành viên thấy hội đồng của mình; người ngoài không thấy
    expect((await api(E.focal, 'GET', '/councils')).body.items.map((x: { id: string }) => x.id)).toContain(councilId);
    expect((await api(E.r3, 'GET', `/councils/${councilId}`)).status).toBe(404);
  });

  it('khai báo không xung đột mới được xem hồ sơ; chủ nhiệm hồ sơ bị chặn tự động', async () => {
    expect((await api(E.focal, 'GET', '/proposals/dx2')).status).toBe(404);
    expect((await api(E.focal, 'PUT', `/councils/${councilId}/sheets/dx2`, { scores: good, submit: true })).body.code).toBe('COI_REQUIRED');
    expect((await api(E.focal, 'POST', `/councils/${councilId}/coi`, { targetId: 'dx2', hasConflict: false })).status).toBe(201);
    const view = await api(E.focal, 'GET', '/proposals/dx2');
    expect(view.status).toBe(200);
    expect(view.body.actions).toEqual([]);
    expect(view.body.canEdit).toBe(false);
    // Ủy viên là chủ nhiệm dx1 → hệ thống ghi nhận xung đột, không thể đổi
    expect((await api(E.r2, 'POST', `/councils/${councilId}/coi`, { targetId: 'dx1', hasConflict: false })).body.code).toBe('SYSTEM_CONFLICT');
    expect((await api(E.r2, 'PUT', `/councils/${councilId}/sheets/dx1`, { scores: good, submit: true })).body.code).toBe('CONFLICT_OF_INTEREST');
    // Khai báo có xung đột phải nêu lý do
    expect((await api(E.head, 'POST', `/councils/${councilId}/coi`, { targetId: 'dx1', hasConflict: true })).body.code).toBe('COMMENT_REQUIRED');
  });

  it('chấm độc lập: kiểm tra phiếu, phiếu nộp bị khóa, không xem phiếu người khác trước khi khóa', async () => {
    const bad = await api(E.focal, 'PUT', `/councils/${councilId}/sheets/dx2`, { scores: { ...good, method: 30 }, submit: true });
    expect(bad.body.code).toBe('INVALID_SCORES');
    const draft = await api(E.focal, 'PUT', `/councils/${councilId}/sheets/dx2`, { scores: { urgency: 10 }, comment: 'đang chấm' });
    expect(draft.body.status).toBe('DRAFT');
    const ok = await api(E.focal, 'PUT', `/councils/${councilId}/sheets/dx2`, { scores: good, comment: 'Phương pháp phù hợp; cần làm rõ cỡ mẫu.', submit: true });
    expect(ok.body.status).toBe('SUBMITTED');
    expect(ok.body.total).toBe(80);
    expect((await api(E.focal, 'PUT', `/councils/${councilId}/sheets/dx2`, { scores: good, submit: true })).body.code).toBe('ALREADY_SUBMITTED');

    for (const e of [E.unitHead, E.head]) {
      await api(e, 'POST', `/councils/${councilId}/coi`, { targetId: 'dx2', hasConflict: false });
      await api(e, 'PUT', `/councils/${councilId}/sheets/dx2`, { scores: { ...good, method: 15 }, comment: 'Sản phẩm cần cụ thể hơn.', submit: true });
    }
    const chairView = await api(E.unitHead, 'GET', `/councils/${councilId}`);
    expect(chairView.body.allSheets).toBeNull();
    expect(chairView.body.progress.find((x: { targetId: string }) => x.targetId === 'dx2').submitted).toBe(3);
  });

  it('khóa phiếu: chỉ chủ tịch/Phòng KH; tổng hợp theo công thức', async () => {
    expect((await api(E.focal, 'POST', `/councils/${councilId}/close`)).status).toBe(403);
    expect((await api(E.unitHead, 'POST', `/councils/${councilId}/close`)).status).toBe(201);
    const c = await api(E.unitHead, 'GET', `/councils/${councilId}`);
    const dx2 = c.body.item.results.find((x: { targetId: string }) => x.targetId === 'dx2');
    expect(dx2.submitted).toBe(3);
    expect(dx2.average).toBe(76.7); // (80 + 75 + 75) / 3
    expect(dx2.suggestion).toBe('PASS');
    expect(c.body.item.results.find((x: { targetId: string }) => x.targetId === 'dx1').suggestion).toBe('INSUFFICIENT');
    expect(c.body.allSheets.length).toBe(3);
    // Thành viên thường vẫn chỉ thấy phiếu của mình
    expect((await api(E.focal, 'GET', `/councils/${councilId}`)).body.allSheets).toBeNull();
    expect((await api(E.focal, 'PUT', `/councils/${councilId}/sheets/dx2`, { scores: good })).body.code).toBe('INVALID_STATE');
  });

  it('biên bản: AI dự thảo (mock), thư ký sửa, chủ tịch xác nhận; thu hồi quyền xem hồ sơ', async () => {
    const d = await api(E.head, 'POST', `/councils/${councilId}/minutes/draft`);
    expect(d.status).toBe(201);
    expect(d.body.text).toContain('GIẢ LẬP');
    expect(d.body.text).toContain('76,7');
    expect(d.body.text).toContain('KẾT LUẬN CỦA HỘI ĐỒNG');
    expect((await api(E.unitHead, 'POST', `/councils/${councilId}/minutes/confirm`)).body.code).toBe('CONCLUSIONS_REQUIRED');
    expect(
      (
        await api(E.head, 'PUT', `/councils/${councilId}/minutes`, {
          text: d.body.text + '\n- DX dx2: thông qua, chỉnh sửa theo góp ý.',
          conclusions: { dx2: { decision: 'APPROVE', note: 'Chỉnh sửa cỡ mẫu' }, dx1: { decision: 'REVISE', note: 'Chưa đủ phiếu, đánh giá lại' } },
        })
      ).status,
    ).toBe(200);
    expect((await api(E.head, 'POST', `/councils/${councilId}/minutes/confirm`)).status).toBe(403);
    expect((await api(E.unitHead, 'POST', `/councils/${councilId}/minutes/confirm`)).status).toBe(201);
    expect((await api(E.focal, 'GET', '/proposals/dx2')).status).toBe(404);
    expect((await api(E.head, 'PUT', `/councils/${councilId}/minutes`, { text: 'sửa sau xác nhận', conclusions: {} })).body.code).toBe('INVALID_STATE');
  });
});
