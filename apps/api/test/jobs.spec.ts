/** Bộ hẹn giờ + nhắc hạn (L4): giờ chạy theo múi giờ trường, khóa chạy một bản, nhắc đúng mức và không gửi trùng. */
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
import { db, tcol } from '../src/infra';
import '../src/jobs/reminders';
import { localDate, nextDailyRun, runJob } from '../src/jobs/scheduler';
import { signIn } from './support/auth';

describe('giờ chạy theo múi giờ Việt Nam', () => {
  it('ngày địa phương và lần chạy 7 giờ sáng kế tiếp', () => {
    expect(localDate(new Date('2026-11-22T18:00:00Z'), 'Asia/Ho_Chi_Minh')).toBe('2026-11-23');
    expect(localDate(new Date('2026-11-22T16:59:00Z'), 'Asia/Ho_Chi_Minh')).toBe('2026-11-22');
    expect(nextDailyRun(new Date('2026-11-22T23:30:00Z'), 7, 'Asia/Ho_Chi_Minh').toISOString()).toBe('2026-11-23T00:00:00.000Z');
    expect(nextDailyRun(new Date('2026-11-23T00:30:00Z'), 7, 'Asia/Ho_Chi_Minh').toISOString()).toBe('2026-11-24T00:00:00.000Z');
  });
});

describe('nhắc hạn', () => {
  let app: INestApplication;
  let base = '';
  const api = async (who: string, method: string, path: string, body?: unknown) => {
    const r = await fetch(`${base}/api/v1${path}`, { method, headers: { Authorization: `Bearer ${await signIn(base, who, DEMO_PASSWORD)}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: (await r.json().catch(() => null)) as any };
  };
  const ADMIN = 'admin@demo.aisrm.test';
  const STUDENT = 'sv.an@demo.aisrm.test';
  const PI = 'gv.binh@demo.aisrm.test';

  beforeAll(async () => {
    await seed({ log: false });
    app = await createApp();
    await app.listen(0);
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });
  afterAll(async () => app?.close());

  it('nhắc mốc sắp đến hạn / quá hạn và hồ sơ nháp của đợt sắp đóng; chạy lại không gửi trùng; chỉ quản trị được chạy', async () => {
    const today = localDate(new Date());
    const ms = tcol('ftu', 'projects').doc('dtsv1').collection('milestones');
    const add = (title: string, dueDate: string, status = 'OPEN') =>
      ms.add({ title, dueDate, deliverable: '-', status, submittedAt: null, submittedNote: null, documentIds: [], acceptedBy: null, acceptedAt: null, createdAt: today });
    await add('Mốc thử còn 3 ngày', localDate(new Date(), undefined, 3));
    await add('Mốc thử quá hạn', localDate(new Date(), undefined, -2));
    await add('Mốc thử còn xa', localDate(new Date(), undefined, 40));
    await add('Mốc thử đã nộp', localDate(new Date(), undefined, 1), 'SUBMITTED');

    // Đợt đăng ký đóng sau 2 ngày + một hồ sơ nháp
    await tcol('ftu', 'calls').doc('call-truong').update({ closeAt: `${localDate(new Date(), undefined, 2)}T16:59:00.000Z` });
    const draft = await api(PI, 'POST', '/proposals', { callId: 'call-truong', title: 'Hồ sơ nháp chờ nhắc' });
    expect(draft.status).toBe(201);

    expect((await api(STUDENT, 'POST', '/admin/jobs/deadline-reminders/run')).status).toBe(403);
    const first = await api(ADMIN, 'POST', '/admin/jobs/deadline-reminders/run');
    expect(first.body).toMatchObject({ ran: true, ok: true });
    expect(first.body.counts.milestoneReminders).toBeGreaterThanOrEqual(2);
    expect(first.body.counts.callReminders).toBeGreaterThanOrEqual(1);

    const notes = (await api(STUDENT, 'GET', '/me/notifications')).body.items.map((n: { body: string }) => n.body).join('\n');
    expect(notes).toMatch(/"Mốc thử còn 3 ngày" còn 3 ngày/);
    expect(notes).toMatch(/"Mốc thử quá hạn" đã quá hạn 2 ngày/);
    expect(notes).not.toMatch(/Mốc thử còn xa|Mốc thử đã nộp/);
    const piNotes = (await api(PI, 'GET', '/me/notifications')).body.items.map((n: { body: string }) => n.body).join('\n');
    expect(piNotes).toMatch(/Hồ sơ nháp chờ nhắc" vẫn là bản nháp/);

    const again = await api(ADMIN, 'POST', '/admin/jobs/deadline-reminders/run');
    expect(again.body.counts).toMatchObject({ milestoneReminders: 0, callReminders: 0 });

    const list = await api(ADMIN, 'GET', '/admin/jobs');
    expect(list.body.items[0]).toMatchObject({ name: 'deadline-reminders', lastOk: true, running: false });
    expect(Date.parse(list.body.items[0].nextRunAt)).toBeGreaterThan(Date.now());
  });

  it('bản API khác đang giữ khóa chạy thì không chạy chồng; khóa hết hạn thì chạy được', async () => {
    const job = db().collection('_jobs').doc('deadline-reminders');
    await job.set({ leaseUntil: new Date(Date.now() + 60_000).toISOString(), leaseOwner: 'ban-khac' }, { merge: true });
    expect((await runJob('deadline-reminders', { force: true })).ran).toBe(false);
    await job.set({ leaseUntil: new Date(Date.now() - 1000).toISOString() }, { merge: true });
    expect((await runJob('deadline-reminders', { force: true })).ran).toBe(true);
    // Chưa đến giờ hẹn thì lượt kiểm tra định kỳ không chạy
    expect((await runJob('deadline-reminders')).ran).toBe(false);
  });
});
