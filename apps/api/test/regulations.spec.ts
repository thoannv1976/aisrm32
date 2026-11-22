/** Hỏi đáp quy chế (RAG): nạp văn bản, truy xuất điều khoản, chống bịa, phân quyền, cô lập tenant. */
import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_PASSWORD } from '../scripts/seed-data';
import { seed } from '../scripts/seed';
import { createApp } from '../src/main';
import { PROVIDERS } from '../src/ai/providers';

let app: INestApplication;
let base = '';
const tokens = new Map<string, string>();
const E = { student: 'sv.an@demo.aisrm.test', officer: 'cv.linh@demo.aisrm.test', admin: 'admin@demo.aisrm.test', focal: 'dm.ktqt@demo.aisrm.test', t2: 'gv.xuan@demo2.aisrm.test' };
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
  const isForm = body instanceof FormData;
  const r = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${await token(who)}`, ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}) },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
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
const ask = (who: string, question: string) => api(who, 'POST', '/regulations/ask', { question });
const form = (fields: Record<string, string>, name: string, content: Buffer | string, type = 'text/plain') => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  f.append('file', new Blob([typeof content === 'string' ? content : new Uint8Array(content)], { type }), name);
  return f;
};

beforeAll(async () => {
  await seed({ log: false });
  app = await createApp();
  await app.listen(0);
  base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
});
afterAll(async () => app?.close());

describe('Hỏi đáp quy chế', () => {
  it('quy chế mẫu đã nạp; mọi thành viên xem được toàn văn theo điều khoản', async () => {
    const l = await api(E.student, 'GET', '/regulations');
    expect(l.status).toBe(200);
    expect(l.body.canManage).toBe(false);
    expect(l.body.items[0].code).toBe('QC-KHCN-MAU-2026');
    expect(l.body.items[0].articleCount).toBe(29);
    const d = await api(E.student, 'GET', `/regulations/${l.body.items[0].id}`);
    expect(d.body.articles.find((a: { number: number }) => a.number === 15).title).toBe('Gia hạn');
  });

  it('trả lời có dẫn điều khoản (mock: trích nguyên văn); ghi lượt dùng AI, không lưu câu hỏi', async () => {
    const r = await ask(E.student, 'Đề tài được gia hạn tối đa mấy lần, bao lâu?');
    expect(r.status).toBe(201);
    expect(r.body.found).toBe(true);
    expect(r.body.mock).toBe(true);
    expect(r.body.sources[0].label).toBe('khoản 1 Điều 15');
    expect(r.body.text).toContain('khoản 1 Điều 15');
    expect(r.body.text).toContain('tối đa 01 lần');
    expect(r.body.unverifiedCitations).toEqual([]);
    const usage = await api(E.admin, 'GET', '/ai/admin/usage');
    expect(usage.raw).toContain('regulation_qa');
    expect(usage.raw).not.toContain('gia hạn tối đa mấy lần');
  });

  it('câu hỏi ngoài phạm vi → "không tìm thấy", không gọi AI', async () => {
    const count = async () => (await api(E.admin, 'GET', '/ai/admin/usage')).raw.split('regulation_qa').length;
    const before = await count();
    const r = await ask(E.student, 'Thủ tục đăng ký ký túc xá và học bổng khuyến khích học tập');
    expect(r.body.found).toBe(false);
    expect(r.body.text).toContain('Không tìm thấy quy định');
    expect(r.body.usage.inputTokens).toBe(0);
    expect(await count()).toBe(before);
    expect((await ask(E.student, 'a')).status).toBe(400);
  });

  it('chế độ thật: phát hiện căn cứ mô hình tự nêu không có trong quy chế; nội dung quy chế nằm trong thẻ dữ liệu', async () => {
    const settings = { mode: 'live', usdToVnd: 26000, usdToVndDate: null, monthlyBudgetVnd: 500000, hardStop: true, killSwitch: false, defaultModelId: 'anthropic__claude-opus-5-5', maxOutputTokens: 2000 };
    expect((await api(E.admin, 'PUT', '/ai/admin/providers/anthropic/key', { apiKey: 'sk-ant-test-0000000000000000000000000000XYZ9' })).status).toBe(200);
    expect((await api(E.admin, 'PUT', '/ai/admin/settings', settings)).status).toBe(200);
    const original = PROVIDERS.anthropic.complete;
    let seenPrompt = '';
    PROVIDERS.anthropic.complete = async (i) => {
      seenPrompt = i.prompt;
      return {
        text: 'Đề tài được gia hạn tối đa 01 lần, không quá 06 tháng (khoản 1 Điều 15). Ngoài ra được miễn báo cáo (khoản 9 Điều 40).',
        inputTokens: 900,
        outputTokens: 60,
        stopReason: 'end_turn',
        fallbackUsed: false,
      };
    };
    try {
      const r = await ask(E.focal, 'Đề tài được gia hạn tối đa mấy lần?');
      expect(r.body.found).toBe(true);
      expect(r.body.mock).toBe(false);
      expect(r.body.unverifiedCitations).toEqual(['khoản 9 Điều 40']);
      expect(seenPrompt).toMatch(/<quy_che>[\s\S]*khoản 1 Điều 15[\s\S]*<\/quy_che>/);
      expect(seenPrompt).toMatch(/<cau_hoi>\nĐề tài được gia hạn/);
    } finally {
      PROVIDERS.anthropic.complete = original;
      await api(E.admin, 'PUT', '/ai/admin/settings', { ...settings, mode: 'mock' });
      await api(E.admin, 'DELETE', '/ai/admin/providers/anthropic/key');
    }
  });

  it('nạp văn bản: chỉ Phòng QLKH/quản trị; xem trước; nạp lại; tạm ngưng thì không còn được trả lời', async () => {
    const txt =
      'QUY ĐỊNH THỬ NGHIỆM\nĐiều 1. Giờ làm việc phòng thí nghiệm\n1. Phòng thí nghiệm trung tâm mở cửa từ 7 giờ 30 đến 21 giờ các ngày trong tuần.\n2. Ngoài giờ phải đăng ký trước 02 ngày làm việc.';
    const q = 'Phòng thí nghiệm mở cửa mấy giờ, ngoài giờ đăng ký thế nào';
    expect((await api(E.focal, 'POST', '/regulations', form({ code: 'QD-PTN', title: 'Quy định phòng thí nghiệm' }, 'qd.txt', txt))).status).toBe(403);
    expect((await api(E.officer, 'POST', '/regulations', form({ code: 'QD-X', title: 'Không có điều' }, 'x.txt', 'chỉ là đoạn văn'))).body.code).toBe('NO_ARTICLES');
    expect((await api(E.officer, 'POST', '/regulations', form({ code: 'QD-X', title: 'Tệp PDF' }, 'x.pdf', '%PDF-1.4', 'application/pdf'))).body.code).toBe('FILE_TYPE_NOT_ALLOWED');

    const dry = await api(E.officer, 'POST', '/regulations', form({ code: 'QD-PTN', title: 'Quy định phòng thí nghiệm', dryRun: 'true' }, 'qd.txt', txt));
    expect(dry.body).toMatchObject({ dryRun: true, preview: { articleCount: 1, clauseCount: 2 } });
    expect((await ask(E.student, q)).body.found).toBe(false);

    const up = await api(E.officer, 'POST', '/regulations', form({ code: 'QD-PTN', title: 'Quy định phòng thí nghiệm' }, 'qd.txt', txt));
    expect(up.status).toBe(201);
    const a = await ask(E.student, q);
    expect(a.body.found).toBe(true);
    expect(a.body.sources[0].regCode).toBe('QD-PTN');

    const v2 = await api(E.officer, 'POST', '/regulations', form({ code: 'QD-PTN', title: 'Quy định phòng thí nghiệm' }, 'qd.txt', txt.replace('21 giờ', '22 giờ')));
    expect(v2.body.item.version).toBe(2);
    expect((await ask(E.student, q)).body.text).toContain('22 giờ');

    expect((await api(E.officer, 'PATCH', `/regulations/${up.body.item.id}`, { status: 'INACTIVE' })).status).toBe(200);
    expect((await ask(E.student, q)).body.found).toBe(false);
    expect((await api(E.student, 'GET', `/regulations/${up.body.item.id}`)).status).toBe(404);
  });

  it('đọc được tệp Word (.docx) của bản quy chế mẫu', async () => {
    let docx: Buffer;
    try {
      docx = readFileSync(join(__dirname, '..', '..', '..', '..', 'Quy_che_KHCN_mau_FTU.docx'));
    } catch {
      return; // tệp mẫu nằm ngoài repo — bỏ qua trên CI
    }
    const w = await api(
      E.officer,
      'POST',
      '/regulations',
      form({ code: 'QC-DOCX', title: 'Bản Word', dryRun: 'true' }, 'Quy_che.docx', docx, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    );
    expect(w.body.preview.articleCount).toBe(29);
    expect(w.body.preview.warnings).toEqual([]);
  });

  it('cô lập trường: tenant khác không thấy quy chế của FTU', async () => {
    expect((await api(E.t2, 'GET', '/regulations')).body.items).toEqual([]);
    expect((await ask(E.t2, 'Đề tài được gia hạn tối đa mấy lần?')).body.found).toBe(false);
  });
});
