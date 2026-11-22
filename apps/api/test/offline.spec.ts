/**
 * Bản Local chạy KHÔNG cần Internet (nghiệm thu L4).
 * Cấu hình như cài tại trường: DEPLOY_TARGET=local → PostgreSQL + đăng nhập nội bộ + tệp trên ổ đĩa + AI nội bộ.
 * Mọi kết nối mạng ra ngoài máy (không phải 127.0.0.1 / localhost / ::1) đều bị chặn và ghi lại; cuối test danh sách phải rỗng.
 * Chỉ chạy khi có DATABASE_URL (PostgreSQL thử).
 */
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const enabled = !!process.env.DATABASE_URL;
const savedEnv = { ...process.env };
const filesDir = enabled ? mkdtempSync(join(tmpdir(), 'aisrm-offline-')) : '';
const violations: string[] = [];
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '::ffff:127.0.0.1']);
const origConnect = net.Socket.prototype.connect;

if (enabled) {
  process.env.DEPLOY_TARGET = 'local';
  for (const k of ['DATA_BACKEND', 'IDENTITY_BACKEND', 'FILE_BACKEND', 'FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST']) delete process.env[k];
  process.env.FILE_STORAGE_DIR = filesDir;
  process.env.LOCAL_SECRET_KEY = 'khoa-thu-nghiem-offline-0123456789abcdef';
  process.env.APP_ENV = 'test';

  // ---- Chặn mọi kết nối ra ngoài máy ----
  net.Socket.prototype.connect = function (this: net.Socket, ...args: any[]) {
    const opts = typeof args[0] === 'object' && args[0] !== null ? args[0] : { port: args[0], host: typeof args[1] === 'string' ? args[1] : undefined };
    const host: string = opts.path ? 'unix-socket' : (opts.host ?? 'localhost');
    if (host !== 'unix-socket' && !LOOPBACK.has(host)) {
      violations.push(`${host}:${opts.port}`);
      throw new Error(`Chặn kết nối ra ngoài trong test ngoại tuyến: ${host}:${opts.port}`);
    }
    return (origConnect as any).apply(this, args);
  } as typeof net.Socket.prototype.connect;
}

import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_PASSWORD } from '../scripts/seed-data';
import { seed } from '../scripts/seed';
import { createApp } from '../src/main';
import { config, db, files, identity } from '../src/infra';

let app: INestApplication;
let ai: Server;
let base = '';

describe.skipIf(!enabled)('bản Local hoạt động khi không có Internet', () => {
  beforeAll(async () => {
    ai = createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/v1/models') return res.end(JSON.stringify({ data: [{ id: 'granite-4.2-8b-q4' }] }));
      res.end(JSON.stringify({ choices: [{ message: { content: 'Đề tài được gia hạn tối đa 01 lần, không quá 06 tháng (khoản 1 Điều 15).' }, finish_reason: 'stop' }], usage: { prompt_tokens: 600, completion_tokens: 30 } }));
    });
    await new Promise<void>((r) => ai.listen(0, '127.0.0.1', () => r()));
    process.env.LOCAL_AI_BASE_URL = `http://127.0.0.1:${(ai.address() as AddressInfo).port}`;
    await seed({ log: false });
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await app?.close();
    await new Promise<void>((r) => (ai ? ai.close(() => r()) : r()));
    net.Socket.prototype.connect = origConnect;
    rmSync(filesDir, { recursive: true, force: true });
    for (const k of Object.keys(process.env)) if (!(k in savedEnv)) delete process.env[k];
    Object.assign(process.env, savedEnv);
  });

  const token = new Map<string, string>();
  async function api(who: string, method: string, path: string, body?: unknown) {
    if (!token.has(who)) {
      const r = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: who, password: DEMO_PASSWORD }) });
      token.set(who, ((await r.json()) as { token: string }).token);
    }
    const isForm = body instanceof FormData;
    const r = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: { Authorization: `Bearer ${token.get(who)}`, ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}) },
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });
    const buf = Buffer.from(await r.arrayBuffer());
    let json: any = null;
    try {
      json = JSON.parse(buf.toString('utf8'));
    } catch {
      /* tệp */
    }
    return { status: r.status, body: json, raw: buf };
  }

  it('đúng cấu hình bản Local, và bộ chặn mạng hoạt động', async () => {
    expect([config.dataBackend, config.identityBackend, config.fileBackend]).toEqual(['postgres', 'local', 'disk']);
    expect([db().kind, identity().kind, files().kind]).toEqual(['postgres', 'local', 'disk']);
    await expect(fetch('https://www.google.com')).rejects.toThrow();
    expect(violations.length).toBeGreaterThan(0);
    violations.length = 0;
  });

  it('đăng nhập, lập hồ sơ, tải tệp lên / xuống, hỏi đáp quy chế bằng AI nội bộ, chạy nhắc hạn — không kết nối ra ngoài', async () => {
    const PI = 'gv.binh@demo.aisrm.test';
    const ADMIN = 'admin@demo.aisrm.test';
    expect((await api(PI, 'GET', '/me')).body.roles).toContain('RESEARCHER');

    const created = await api(PI, 'POST', '/proposals', { callId: 'call-truong', title: 'Đề tài thử ngoại tuyến' });
    expect(created.status).toBe(201);
    const fd = new FormData();
    fd.set('parentType', 'proposal');
    fd.set('parentId', created.body.id);
    fd.set('checklistKey', 'thuyet_minh');
    const pdf = Buffer.from('%PDF-1.4\n% tai lieu ngoai tuyen\n');
    fd.set('file', new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }), 'thuyet-minh.pdf');
    const up = await api(PI, 'POST', '/documents', fd);
    expect(up.status).toBe(201);
    const down = await api(PI, 'GET', `/documents/${up.body.id}/download`);
    expect(down.status).toBe(200);
    expect(down.raw.equals(pdf)).toBe(true);
    expect(readdirSync(join(filesDir, 'tenants', 'ftu', 'proposal', created.body.id)).length).toBe(2); // tệp + .meta.json

    const ov = await api(ADMIN, 'GET', '/ai/admin/overview');
    const m = await api(ADMIN, 'POST', '/ai/admin/models', { provider: 'local', modelId: 'granite-4.2-8b-q4', label: 'Granite 8B (nội bộ)', inputPricePerMTokUsd: '0', outputPricePerMTokUsd: '0' });
    expect((await api(ADMIN, 'PUT', '/ai/admin/settings', { ...ov.body.settings, mode: 'live', defaultModelId: m.body.id })).status).toBe(200);
    const ans = await api(PI, 'POST', '/regulations/ask', { question: 'Đề tài được gia hạn tối đa mấy lần?' });
    expect(ans.body).toMatchObject({ found: true, mock: false, unverifiedCitations: [] });
    expect(ans.body.model.provider).toBe('local');

    const job = await api(ADMIN, 'POST', '/admin/jobs/deadline-reminders/run');
    expect(job.body).toMatchObject({ ran: true, ok: true });

    expect(violations).toEqual([]);
  });
});
