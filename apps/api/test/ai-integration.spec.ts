/**
 * Kiểm thử AI Center (khóa API, model, giá, chi phí, hạn mức) và UNI-DATA360 giả lập — trên Firebase Emulator.
 * Không gọi nhà cung cấp AI thật: dùng chế độ mock, và các trường hợp "live" dừng trước khi gửi mạng (thiếu khóa, vượt ngân sách, tắt khẩn cấp).
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
import { db } from '../src/infra';
import { createApp } from '../src/main';

let app: INestApplication;
let base = '';
const tokens = new Map<string, string>();
const ADMIN = 'admin@demo.aisrm.test';
const OFFICER = 'cv.linh@demo.aisrm.test';
const HEAD = 'tp.hung@demo.aisrm.test';
const FAKE_ANTHROPIC_KEY = 'sk-ant-test-0000000000000000000000000000XYZ9';

async function token(email: string) {
  if (tokens.has(email)) return tokens.get(email)!;
  const r = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: DEMO_PASSWORD, returnSecureToken: true }),
  });
  const t = ((await r.json()) as { idToken: string }).idToken;
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
  return { status: r.status, body: json, raw: text };
}

const settings = (over: Record<string, unknown> = {}) => ({
  mode: 'mock',
  usdToVnd: 26000,
  usdToVndDate: null,
  monthlyBudgetVnd: 500000,
  hardStop: true,
  killSwitch: false,
  defaultModelId: 'anthropic__claude-opus-5-5',
  maxOutputTokens: 2000,
  ...over,
});

beforeAll(async () => {
  await seed({ log: false });
  app = await createApp();
  await app.listen(0);
  base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
});
afterAll(async () => app?.close());

describe('AI Center — quản trị khóa API, model, giá', () => {
  it('chỉ quản trị AI/hệ thống truy cập', async () => {
    expect((await api(OFFICER, 'GET', '/ai/admin/overview')).status).toBe(403);
    const r = await api(ADMIN, 'GET', '/ai/admin/overview');
    expect(r.status).toBe(200);
    expect(r.body.providers.map((p: { provider: string }) => p.provider)).toEqual(['openai', 'anthropic', 'gemini']);
    expect(r.body.models.length).toBe(3);
  });

  it('nạp khóa: kiểm tra định dạng, chỉ trả về bản che, không lộ khóa qua API', async () => {
    expect((await api(ADMIN, 'PUT', '/ai/admin/providers/anthropic/key', { apiKey: 'sk-openai-sai-nha-cung-cap-123456' })).status).toBe(400);
    const r = await api(ADMIN, 'PUT', '/ai/admin/providers/anthropic/key', { apiKey: FAKE_ANTHROPIC_KEY });
    expect(r.status).toBe(200);
    expect(r.body.keyHint).toBe('••••XYZ9');
    const ov = await api(ADMIN, 'GET', '/ai/admin/overview');
    expect(ov.raw).not.toContain(FAKE_ANTHROPIC_KEY);
    expect(ov.body.providers.find((p: { provider: string }) => p.provider === 'anthropic').keyStatus).toBe('SET');
    // Audit không chứa khóa
    const audit = await api(ADMIN, 'GET', '/audit-events');
    expect(audit.raw).not.toContain(FAKE_ANTHROPIC_KEY);
  });

  it('thêm model OpenAI/Gemini với giá; model chưa có giá báo "chưa xác định"', async () => {
    const r = await api(ADMIN, 'POST', '/ai/admin/models', { provider: 'openai', modelId: 'gpt-test-model', inputPricePerMTokUsd: '1,25', outputPricePerMTokUsd: '10', priceEffectiveDate: '2026-11-21' });
    expect(r.status).toBe(201);
    expect(r.body.inputPriceMicrosPerMTok).toBe(1_250_000);
    expect((await api(ADMIN, 'POST', '/ai/admin/models', { provider: 'gemini', modelId: 'gemini-test' })).status).toBe(201);
    expect((await api(ADMIN, 'POST', '/ai/admin/models', { provider: 'gemini', modelId: 'x', inputPricePerMTokUsd: 'abc' })).status).toBe(400);
    const est = await api(ADMIN, 'POST', '/ai/estimate', { modelConfigId: 'gemini__gemini-test', inputTokens: 1000, outputTokens: 1000 });
    expect(est.body.perCall.priceKnown).toBe(false);
    expect(est.body.total).toBeNull();
  });

  it('máy tính chi phí: 10.000 vào + 2.000 ra × 100 lượt trên Claude Opus 5.5', async () => {
    const r = await api(ADMIN, 'POST', '/ai/estimate', { modelConfigId: 'anthropic__claude-opus-5-5', inputTokens: 10000, outputTokens: 2000, calls: 100 });
    // (10.000×4 + 2.000×20)/1M USD = 0,08 USD = 80.000 micro → 2.080 ₫/lượt
    expect(r.body.perCall).toEqual({ priceKnown: true, costUsdMicros: 80000, costVnd: 2080 });
    expect(r.body.total.costVnd).toBe(208000);
  });

  it('chạy thử ở chế độ mock: không gọi nhà cung cấp, ghi usage, có chi phí ước tính nếu chạy thật', async () => {
    const r = await api(ADMIN, 'POST', '/ai/admin/playground', { modelConfigId: 'anthropic__claude-opus-5-5', prompt: 'Tóm tắt quy trình xét duyệt đề tài.' });
    expect(r.status).toBe(201);
    expect(r.body.text).toContain('GIẢ LẬP');
    expect(r.body.usage.mock).toBe(true);
    expect(r.body.usage.costVnd).toBeNull();
    expect(r.body.estimatedIfLive.priceKnown).toBe(true);
    const usage = await api(ADMIN, 'GET', '/ai/admin/usage');
    expect(usage.body.recent[0].feature).toBe('playground');
    expect(usage.raw).not.toContain('Tóm tắt quy trình xét duyệt');
  });

  it('chế độ live: thiếu khóa → báo lỗi, không gọi mạng', async () => {
    expect((await api(ADMIN, 'PUT', '/ai/admin/settings', settings({ mode: 'live' }))).status).toBe(200);
    const r = await api(ADMIN, 'POST', '/ai/admin/playground', { modelConfigId: 'gemini__gemini-test', prompt: 'xin chào' });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('AI_KEY_MISSING');
  });

  it('chế độ live: vượt ngân sách tháng → chặn trước khi gọi nhà cung cấp', async () => {
    await api(ADMIN, 'PUT', '/ai/admin/settings', settings({ mode: 'live', monthlyBudgetVnd: 1000 }));
    const month = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 7);
    await db().collection('tenants').doc('ftu').collection('aiUsageMonthly').doc(month).set({ costVnd: 999 }, { merge: true });
    const r = await api(ADMIN, 'POST', '/ai/admin/playground', { modelConfigId: 'anthropic__claude-opus-5-5', prompt: 'xin chào' });
    expect(r.status).toBe(429);
    expect(r.body.code).toBe('AI_BUDGET_EXCEEDED');
    const usage = await api(ADMIN, 'GET', `/ai/admin/usage?month=${month}`);
    expect(usage.body.blocked).toBeGreaterThan(0);
  });

  it('tắt AI khẩn cấp → mọi tác vụ AI bị chặn', async () => {
    await api(ADMIN, 'PUT', '/ai/admin/settings', settings({ killSwitch: true }));
    const r = await api(ADMIN, 'POST', '/ai/admin/playground', { modelConfigId: 'anthropic__claude-opus-5-5', prompt: 'xin chào' });
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('AI_DISABLED');
    await api(ADMIN, 'PUT', '/ai/admin/settings', settings());
  });

  it('xóa khóa', async () => {
    const r = await api(ADMIN, 'DELETE', '/ai/admin/providers/anthropic/key');
    expect(r.body.keyStatus).toBe('MISSING');
  });
});

describe('UNI-DATA360 giả lập', () => {
  it('gửi outbox: chỉ xuất dữ liệu đã duyệt; gửi lại không tạo trùng', async () => {
    // Tạo sự kiện: trưởng phòng xác nhận công bố cb3 (đã xác minh trong dữ liệu mẫu)
    const cur = await api(HEAD, 'GET', '/publications/cb3');
    expect((await api(HEAD, 'POST', '/publications/cb3/transitions', { action: 'confirm', expectedVersion: cur.body.item.version })).status).toBe(201);
    expect((await api(OFFICER, 'GET', '/integrations/uni-data360/status')).status).toBe(403);

    const job = await api(ADMIN, 'POST', '/integrations/uni-data360/sync-jobs', { type: 'outbound' });
    expect(job.status).toBe(201);
    expect(job.body.counts.ACCEPTED).toBeGreaterThanOrEqual(1);

    // Đưa sự kiện đã gửi về hàng chờ và gửi lại → UNI nhận diện trùng (idempotent theo eventId)
    const sent = await db().collection('tenants').doc('ftu').collection('outboxEvents').where('status', '==', 'SENT').get();
    await Promise.all(sent.docs.map((d) => d.ref.update({ status: 'PENDING' })));
    const again = await api(ADMIN, 'POST', '/integrations/uni-data360/sync-jobs', { type: 'outbound' });
    expect(again.body.counts.ACCEPTED).toBe(0);
    expect(again.body.counts.DUPLICATE).toBe(sent.size);
  });

  it('lỗi kết nối giả lập → FAILED; phát lại sau khi phục hồi → thành công, không trùng', async () => {
    // Tạo thêm sự kiện mới: xác minh + xác nhận cb2
    let cur = await api(OFFICER, 'GET', '/publications/cb2');
    await api(OFFICER, 'POST', '/publications/cb2/transitions', { action: 'verify', expectedVersion: cur.body.item.version });
    cur = await api(HEAD, 'GET', '/publications/cb2');
    await api(HEAD, 'POST', '/publications/cb2/transitions', { action: 'confirm', expectedVersion: cur.body.item.version });

    await api(ADMIN, 'PUT', '/integrations/uni-data360/settings', { mode: 'mock', failureRatePct: 90 });
    let failedJob;
    for (let i = 0; i < 5; i++) {
      failedJob = await api(ADMIN, 'POST', '/integrations/uni-data360/sync-jobs', { type: 'outbound' });
      if (failedJob.body.counts.FAILED > 0) break;
    }
    expect(failedJob!.body.counts.FAILED).toBeGreaterThan(0);
    expect(['PARTIAL', 'FAILED']).toContain(failedJob!.body.status);

    await api(ADMIN, 'PUT', '/integrations/uni-data360/settings', { mode: 'mock', failureRatePct: 0 });
    const replay = await api(ADMIN, 'POST', `/integrations/uni-data360/sync-jobs/${failedJob!.body.id}/replay`);
    expect(replay.status).toBe(201);
    expect(replay.body.counts.FAILED).toBe(0);
    expect(replay.body.counts.ACCEPTED + replay.body.counts.DUPLICATE + replay.body.counts.STALE_IGNORED).toBeGreaterThan(0);
  });

  it('nhận danh mục đơn vị/cán bộ: báo khác biệt, không tự ghi đè', async () => {
    const before = await db().collection('tenants').doc('ftu').collection('units').get();
    const r = await api(ADMIN, 'POST', '/integrations/uni-data360/sync-jobs', { type: 'import_org' });
    expect(r.body.counts.CHANGED).toBe(1);
    expect(r.body.counts.NEW_IN_UNI).toBe(2);
    const after = await db().collection('tenants').doc('ftu').collection('units').get();
    expect(after.size).toBe(before.size);
  });

  it('đối soát: phát hiện đề tài chưa gửi sang UNI dù tổng số không phải tiêu chí duy nhất', async () => {
    const r = await api(ADMIN, 'POST', '/integrations/uni-data360/sync-jobs', { type: 'reconcile' });
    expect(r.body.counts.MATCHED).toBeGreaterThanOrEqual(2);
    // dt1/dt2 trong dữ liệu mẫu chưa từng phát sự kiện → thiếu trên UNI
    expect(r.body.counts.MISSING_IN_UNI).toBeGreaterThanOrEqual(2);
  });

  it('backfill đưa bản ghi còn thiếu vào hàng chờ; gửi xong thì đối soát khớp; chạy lại không tạo trùng', async () => {
    const bf = await api(ADMIN, 'POST', '/integrations/uni-data360/sync-jobs', { type: 'backfill' });
    expect(bf.body.counts.QUEUED).toBeGreaterThanOrEqual(2);
    const again = await api(ADMIN, 'POST', '/integrations/uni-data360/sync-jobs', { type: 'backfill' });
    // Sự kiện cùng (loại, id, version) dùng cùng mã → không nhân bản trong outbox
    const pending = await db().collection('tenants').doc('ftu').collection('outboxEvents').where('status', '==', 'PENDING').get();
    expect(pending.size).toBe(again.body.counts.QUEUED);
    await api(ADMIN, 'POST', '/integrations/uni-data360/sync-jobs', { type: 'outbound' });
    const rec = await api(ADMIN, 'POST', '/integrations/uni-data360/sync-jobs', { type: 'reconcile' });
    expect(rec.body.counts.MISSING_IN_UNI).toBe(0);
    expect(rec.body.counts.VERSION_MISMATCH).toBe(0);
  });

  it('không cho bật chế độ live khi chưa có hợp đồng API', async () => {
    const r = await api(ADMIN, 'PUT', '/integrations/uni-data360/settings', { mode: 'live', failureRatePct: 0 });
    expect(r.status).toBe(400);
  });

  it('xem trước chuẩn HEMIS: đánh dấu trường bắt buộc còn thiếu', async () => {
    const r = await api(ADMIN, 'GET', '/integrations/uni-data360/hemis-preview?entity=publications');
    expect(r.status).toBe(200);
    const rec = r.body.records[0];
    expect(rec.table).toBe('_KHCN_BAI_BAO_KHOA_HOC');
    expect(rec.record.Id).toMatch(/^[0-9a-f-]{36}$/);
    expect(rec.missingRequired).toEqual([]);
    const pr = await api(ADMIN, 'GET', '/integrations/uni-data360/hemis-preview?entity=projects');
    expect(pr.body.records.every((x: { table: string }) => x.table === '_KHCN_NHIEM_VU_KHCN')).toBe(true);
  });

  it('API xuất cho UNI: phân trang bằng cursor ổn định', async () => {
    const p1 = await api(ADMIN, 'GET', '/integrations/uni-data360/exports/projects?pageSize=1');
    expect(p1.body.items).toHaveLength(1);
    expect(p1.body.nextCursor).toBeTruthy();
    const p2 = await api(ADMIN, 'GET', `/integrations/uni-data360/exports/projects?pageSize=1&cursor=${p1.body.nextCursor}`);
    expect(p2.body.items[0].id).not.toBe(p1.body.items[0].id);
  });
});
