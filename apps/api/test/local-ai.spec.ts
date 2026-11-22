/**
 * Máy chủ AI nội bộ (L4): kiểm thử với một máy chủ giả lập API tương thích OpenAI (không cần GPU, chạy được trên CI).
 * Kiểm: bỏ phần suy luận, tắt suy luận, hàng đợi một luồng theo GPU, báo bận, khóa truy cập,
 * chọn model theo chức năng (hỏi đáp quy chế → AI nội bộ, chức năng khác giữ model mặc định), chi phí 0 ₫ nhưng vẫn ghi lượt.
 */
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8180';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= '127.0.0.1:9199';
process.env.FIREBASE_PROJECT_ID ??= 'demo-aisrm';
process.env.APP_ENV ??= 'test';

import type { INestApplication } from '@nestjs/common';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLocalProvider, resetLocalAiQueueForTest, stripReasoning, type LocalAiConfig } from '../src/ai/local-provider';
import { DEMO_PASSWORD } from '../scripts/seed-data';
import { seed } from '../scripts/seed';
import { createApp } from '../src/main';
import { signIn } from './support/auth';

// ---------- máy chủ AI giả ----------
interface Seen {
  body: any;
  auth: string | undefined;
}
const seen: Seen[] = [];
let reply: (body: any) => { status?: number; json: unknown; delayMs?: number } = () => ({ json: {} });
let inFlight = 0;
let maxInFlight = 0;
let fake: Server;
let fakeUrl = '';

const readBody = (req: IncomingMessage) =>
  new Promise<string>((res) => {
    let s = '';
    req.on('data', (c) => (s += c));
    req.on('end', () => res(s));
  });

const chat = (content: string, extra: Record<string, unknown> = {}) => ({
  json: { choices: [{ message: { content, ...extra }, finish_reason: 'stop' }], usage: { prompt_tokens: 500, completion_tokens: 40 } },
});

beforeAll(async () => {
  fake = createServer(async (req, res) => {
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : null;
    if (req.url === '/v1/models') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ data: [{ id: 'granite-4.2-8b-q4' }, { id: 'ornith-1.5-9b-q4' }] }));
    }
    seen.push({ body, auth: req.headers.authorization });
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    const r = reply(body);
    if (r.delayMs) await new Promise((x) => setTimeout(x, r.delayMs));
    inFlight--;
    res.statusCode = r.status ?? 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(r.json));
  });
  await new Promise<void>((r) => fake.listen(0, '127.0.0.1', () => r()));
  fakeUrl = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => fake.close(() => r())));

const cfg = (over: Partial<LocalAiConfig> = {}): LocalAiConfig => ({ baseUrl: fakeUrl, apiKey: null, concurrency: 1, queueMax: 1, timeoutMs: 5000, reasoning: false, ...over });
const input = { apiKey: '', model: 'granite-4.2-8b-q4', system: 'S', prompt: 'P', maxOutputTokens: 300 };

describe('nhà cung cấp AI nội bộ', () => {
  it('bỏ phần suy luận, gửi cờ tắt suy luận, dùng khóa truy cập nếu có', async () => {
    expect(stripReasoning('<think>nghĩ…</think>\nTrả lời (khoản 1 Điều 15).')).toBe('Trả lời (khoản 1 Điều 15).');
    expect(stripReasoning('<think>bị cắt giữa chừng')).toBe('');
    const p = createLocalProvider(() => cfg({ apiKey: 'local-key-12345' }));
    reply = () => chat('<think>abc</think>Được gia hạn 01 lần (khoản 1 Điều 15).');
    const r = await p.complete(input);
    expect(r.text).toBe('Được gia hạn 01 lần (khoản 1 Điều 15).');
    expect(r).toMatchObject({ inputTokens: 500, outputTokens: 40 });
    const last = seen[seen.length - 1];
    expect(last.body).toMatchObject({ model: 'granite-4.2-8b-q4', max_tokens: 300, think: false, chat_template_kwargs: { enable_thinking: false } });
    expect(last.auth).toBe('Bearer local-key-12345');
    expect(await p.listModels('')).toEqual(['granite-4.2-8b-q4', 'ornith-1.5-9b-q4']);
  });

  it('mô hình chỉ trả phần suy luận → báo lỗi rõ, không trả câu rỗng', async () => {
    const p = createLocalProvider(() => cfg());
    reply = () => chat('', { reasoning: 'đang nghĩ rất dài…' });
    await expect(p.complete(input)).rejects.toMatchObject({ code: 'UPSTREAM', message: expect.stringMatching(/chỉ trả phần suy luận/) });
  });

  it('hàng đợi một luồng: xử lý tuần tự, quá hàng đợi thì báo bận', async () => {
    resetLocalAiQueueForTest();
    const p = createLocalProvider(() => cfg({ concurrency: 1, queueMax: 1 }));
    maxInFlight = 0;
    reply = () => ({ ...chat('ok (Điều 1)'), delayMs: 200 });
    const results = await Promise.allSettled([p.complete(input), p.complete(input), p.complete(input)]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled', 'rejected']);
    expect((results[2] as PromiseRejectedResult).reason).toMatchObject({ code: 'RATE_LIMIT', message: expect.stringMatching(/đang bận/) });
    expect(maxInFlight).toBe(1);
  });

  it('lỗi kết nối, quá thời gian, chưa cấu hình đều có thông báo tiếng Việt', async () => {
    resetLocalAiQueueForTest();
    await expect(createLocalProvider(() => cfg({ baseUrl: null })).complete(input)).rejects.toMatchObject({ message: expect.stringMatching(/LOCAL_AI_BASE_URL/) });
    await expect(createLocalProvider(() => cfg({ baseUrl: 'http://127.0.0.1:9' })).complete(input)).rejects.toMatchObject({ code: 'UPSTREAM' });
    reply = () => ({ ...chat('chậm'), delayMs: 400 });
    await expect(createLocalProvider(() => cfg({ timeoutMs: 100 })).complete({ ...input, timeoutMs: 100 })).rejects.toMatchObject({ code: 'TIMEOUT' });
    reply = () => ({ status: 404, json: { error: 'model not found' } });
    await expect(createLocalProvider(() => cfg()).complete(input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('AI Center + hỏi đáp quy chế dùng AI nội bộ', () => {
  let app: INestApplication;
  let base = '';
  const tokens = new Map<string, string>();
  const tok = async (e: string) => tokens.get(e) ?? (tokens.set(e, await signIn(base, e, DEMO_PASSWORD)), tokens.get(e)!);
  const api = async (who: string, method: string, path: string, body?: unknown) => {
    const r = await fetch(`${base}/api/v1${path}`, { method, headers: { Authorization: `Bearer ${await tok(who)}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: (await r.json().catch(() => null)) as any };
  };
  const ADMIN = 'admin@demo.aisrm.test';

  beforeAll(async () => {
    process.env.LOCAL_AI_BASE_URL = fakeUrl;
    resetLocalAiQueueForTest();
    await seed({ log: false });
    app = await createApp();
    await app.listen(0);
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    delete process.env.LOCAL_AI_BASE_URL;
    await app?.close();
  });

  it('kiểm tra kết nối không cần khóa; chọn AI nội bộ riêng cho hỏi đáp quy chế; chi phí 0 ₫; làm nóng model', async () => {
    const ov = await api(ADMIN, 'GET', '/ai/admin/overview');
    expect(ov.body.localAi).toMatchObject({ configured: true, concurrency: 1 });
    expect(JSON.stringify(ov.body.localAi)).not.toMatch(/key/i);

    const t = await api(ADMIN, 'POST', '/ai/admin/providers/local/test');
    expect(t.body).toMatchObject({ ok: true, modelCount: 2 });

    const m = await api(ADMIN, 'POST', '/ai/admin/models', { provider: 'local', modelId: 'granite-4.2-8b-q4', label: 'Granite 8B (nội bộ)', inputPricePerMTokUsd: '0', outputPricePerMTokUsd: '0' });
    expect(m.status).toBe(201);
    const localId = m.body.id as string;

    seen.length = 0;
    reply = () => chat('x');
    const w = await api(ADMIN, 'POST', '/ai/admin/providers/local/warmup', { modelConfigId: localId });
    expect(w.body.ok).toBe(true);
    expect(seen[0].body.max_tokens).toBe(1);

    const settings = { ...ov.body.settings, mode: 'live', featureModels: { regulation_qa: localId } };
    expect((await api(ADMIN, 'PUT', '/ai/admin/settings', settings)).status).toBe(200);

    seen.length = 0;
    reply = () => chat('<think>…</think>Đề tài được gia hạn tối đa 01 lần (Điều 15, khoản 1).');
    const r = await api('gv.binh@demo.aisrm.test', 'POST', '/regulations/ask', { question: 'Đề tài được gia hạn tối đa mấy lần?' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ found: true, mock: false, text: 'Đề tài được gia hạn tối đa 01 lần (Điều 15, khoản 1).', unverifiedCitations: [] });
    expect(r.body.model).toMatchObject({ provider: 'local', modelId: 'granite-4.2-8b-q4' });
    expect(seen[0].body.messages[1].content).toMatch(/<quy_che>[\s\S]*<cau_hoi>/);

    // Mô hình chỉ trả căn cứ, không diễn giải → bổ sung nguyên văn điều khoản
    reply = () => chat('(khoản 1 Điều 15 (Gia hạn))');
    const bare = await api('gv.binh@demo.aisrm.test', 'POST', '/regulations/ask', { question: 'Đề tài được gia hạn tối đa mấy lần?' });
    expect(bare.body.text).toMatch(/^\(khoản 1 Điều 15 \(Gia hạn\)\)\n\nNội dung điều khoản \(trích nguyên văn\):\n• khoản 1 Điều 15 \(Gia hạn\): Đề tài được gia hạn tối đa 01 lần/);

    const usage = await api(ADMIN, 'GET', '/ai/admin/usage');
    const rec = usage.body.recent.find((u: { feature: string }) => u.feature === 'regulation_qa');
    expect(rec).toMatchObject({ provider: 'local', costVnd: 0, priceKnown: true, inputTokens: 500, outputTokens: 40 });

    // Model không thuộc AI nội bộ thì không làm nóng được; model chọn theo chức năng phải tồn tại
    expect((await api(ADMIN, 'POST', '/ai/admin/providers/local/warmup', { modelConfigId: ov.body.settings.defaultModelId })).status).toBe(400);
    expect((await api(ADMIN, 'PUT', '/ai/admin/settings', { ...settings, featureModels: { regulation_qa: 'khong-co' } })).status).toBe(400);
    await api(ADMIN, 'PUT', '/ai/admin/settings', { ...settings, mode: 'mock' });
  });
});
