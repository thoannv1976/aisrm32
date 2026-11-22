/**
 * Chức năng AI nghiệp vụ (chế độ mock) + kiểm chứng Crossref (phản hồi Crossref được giả lập, không gọi mạng).
 */
import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signIn } from './support/auth';
import { DEMO_PASSWORD } from '../scripts/seed-data';
import { seed } from '../scripts/seed';
import { setCrossrefFetcherForTest, similarity } from '../src/integrations/crossref';
import { createApp } from '../src/main';

let app: INestApplication;
let base = '';
const tokens = new Map<string, string>();
const U = {
  pi: 'gv.binh@demo.aisrm.test',
  officer: 'cv.linh@demo.aisrm.test',
  head: 'tp.hung@demo.aisrm.test',
  focal: 'dm.ktqt@demo.aisrm.test',
  student: 'sv.an@demo.aisrm.test',
  r3: 'gv.dung@demo.aisrm.test',
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

beforeAll(async () => {
  await seed({ log: false });
  app = await createApp();
  await app.listen(0);
  base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
});
afterAll(async () => app?.close());

describe('AI trên hồ sơ đề xuất (mock)', () => {
  it('tóm tắt thuyết minh: dự thảo có nhãn giả lập, lưu kèm phiên bản hồ sơ', async () => {
    const r = await api(U.officer, 'POST', '/proposals/dx2/ai', { task: 'summary' });
    expect(r.status).toBe(201);
    expect(r.body.mock).toBe(true);
    expect(r.body.text).toContain('GIẢ LẬP');
    expect(r.body.text).toContain('Phương pháp');
    expect(r.body.disclaimer).toContain('Dự thảo do AI tạo');
    const latest = await api(U.r3, 'GET', '/proposals/dx2/ai');
    expect(latest.body.latest.summary.proposalVersion).toBe(r.body.proposalVersion);
  });

  it('kiểm tra thuyết minh: gộp lỗi theo quy tắc (thiếu tài liệu) và nhận xét AI', async () => {
    const r = await api(U.officer, 'POST', '/proposals/dx2/ai', { task: 'check' });
    expect(r.status).toBe(201);
    const sources = new Set(r.body.findings.map((f: { source: string }) => f.source));
    expect(sources.has('RULE')).toBe(true);
    expect(sources.has('AI')).toBe(true);
    expect(r.body.findings.some((f: { message: string }) => f.message.includes('Thiếu tài liệu bắt buộc'))).toBe(true);
  });

  it('người ngoài phạm vi không dùng AI trên hồ sơ khoa khác', async () => {
    expect((await api(U.focal, 'POST', '/proposals/dx1/ai', { task: 'summary' })).status).toBe(404);
  });

  it('AI tắt khẩn cấp → nút AI báo lỗi nhưng hồ sơ vẫn xem/xử lý bình thường', async () => {
    const admin = 'admin@demo.aisrm.test';
    const ov = await api(admin, 'GET', '/ai/admin/overview');
    await api(admin, 'PUT', '/ai/admin/settings', { ...ov.body.settings, killSwitch: true });
    expect((await api(U.officer, 'POST', '/proposals/dx2/ai', { task: 'summary' })).status).toBe(503);
    expect((await api(U.officer, 'GET', '/proposals/dx2')).status).toBe(200);
    await api(admin, 'PUT', '/ai/admin/settings', { ...ov.body.settings, killSwitch: false });
  });
});

describe('Dự thảo báo cáo (mock)', () => {
  it('chỉ dùng số liệu đã tính, có mã chỉ số để đối chiếu', async () => {
    const r = await api(U.head, 'POST', '/dashboard/ai-report');
    expect(r.status).toBe(201);
    expect(r.body.text).toContain('[projects_active]');
    const active = r.body.metrics.tiles.find((t: { key: string }) => t.key === 'projects_active').value;
    expect(r.body.text).toContain(`${active} đề tài đang thực hiện`);
  });
  it('sinh viên không tạo được báo cáo điều hành', async () => {
    expect((await api(U.student, 'POST', '/dashboard/ai-report')).status).toBe(403);
  });
});

describe('Dữ liệu mẫu NCKH sinh viên', () => {
  it('có hồ sơ sinh viên chờ đơn vị xét và đề tài sinh viên đang thực hiện', async () => {
    const list = await api(U.student, 'GET', '/proposals');
    expect(list.body.items.map((x: { id: string }) => x.id).sort()).toEqual(['sv1', 'sv2']);
    const pj = await api(U.student, 'GET', '/projects/dtsv1');
    expect(pj.body.item.status).toBe('ACTIVE');
  });
});

describe('Kiểm chứng DOI qua Crossref (phản hồi giả lập)', () => {
  it('so khớp tên bài, tạp chí, năm, tác giả và chỉ ra chỗ lệch', async () => {
    setCrossrefFetcherForTest(async (url) => {
      expect(url).toContain('api.crossref.org/works/10.5555%2Fftu.demo.2026.001');
      return new Response(
        JSON.stringify({
          message: {
            title: ['Global value chain participation of Vietnamese exporting firms: evidence from panel data'],
            'container-title': ['Journal of Foreign Economic Studies'],
            issued: { 'date-parts': [[2025, 12]] },
            author: [{ given: 'Thi Binh', family: 'Tran' }, { given: 'Van', family: 'Nguyen' }],
            type: 'journal-article',
            publisher: 'Demo Publisher',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    const r = await api(U.officer, 'POST', '/publications/cb1/verify-doi');
    expect(r.status).toBe(201);
    expect(r.body.found).toBe(true);
    const byField = Object.fromEntries(r.body.checks.map((c: { field: string; status: string }) => [c.field, c.status]));
    expect(byField.title).toBe('MATCH');
    expect(byField.year).toBe('PARTIAL');
    expect(byField.authors).toBe('MATCH');
    expect(r.body.overall).toBe('REVIEW');
    // Kết quả được lưu vào bản ghi, không đổi trạng thái công bố
    const pub = await api(U.pi, 'GET', '/publications/cb1');
    expect(pub.body.item.verification.overall).toBe('REVIEW');
    expect(pub.body.item.status).toBe('CONFIRMED');
  });

  it('DOI không có trên Crossref → NOT_FOUND', async () => {
    setCrossrefFetcherForTest(async () => new Response('Resource not found.', { status: 404 }));
    const r = await api(U.officer, 'POST', '/publications/cb3/verify-doi');
    expect(r.body.overall).toBe('NOT_FOUND');
  });

  it('người không phải chủ / Phòng KH không được kiểm chứng', async () => {
    // Đầu mối khoa đọc được công bố của khoa mình nhưng không có quyền kiểm chứng
    expect((await api(U.focal, 'POST', '/publications/cb1/verify-doi')).status).toBe(403);
    // Người ngoài phạm vi không biết bản ghi tồn tại
    expect((await api(U.r3, 'POST', '/publications/cb1/verify-doi')).status).toBe(404);
  });

  it('độ tương đồng tiêu đề bỏ dấu, không phân biệt hoa thường', () => {
    expect(similarity('Đổi mới sáng tạo', 'doi moi SANG tao')).toBe(1);
    expect(similarity('abc', '')).toBe(0);
  });
});
