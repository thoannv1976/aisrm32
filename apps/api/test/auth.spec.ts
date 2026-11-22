/**
 * Đăng nhập & quản trị tài khoản.
 *  - "nhập CSV" chạy ở cả hai chế độ (Firebase Auth emulator và đăng nhập nội bộ);
 *  - phần bảo mật đăng nhập nội bộ chỉ chạy khi IDENTITY_BACKEND=local.
 */
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8180';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= '127.0.0.1:9199';
process.env.FIREBASE_PROJECT_ID ??= 'demo-aisrm';
process.env.APP_ENV ??= 'test';

import type { INestApplication } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_PASSWORD } from '../scripts/seed-data';
import { seed } from '../scripts/seed';
import { createApp } from '../src/main';
import { db, identity } from '../src/infra';
import { signIn } from './support/auth';

let app: INestApplication;
let base = '';
const isLocal = () => identity().kind === 'local';

async function call(token: string | null, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const h: Record<string, string> = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const r = await fetch(`${base}/api/v1${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* 204 */
  }
  return { status: r.status, body: json, headers: r.headers };
}
const login = (email: string, password: string) => call(null, 'POST', '/auth/login', { email, password });
const tokenOf = (email: string, password = DEMO_PASSWORD) => signIn(base, email, password);

const ADMIN = 'admin@demo.aisrm.test';

beforeAll(async () => {
  await seed({ log: false, business: false });
  app = await createApp();
  await app.listen(0);
  base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
});

afterAll(async () => {
  await app?.close();
});

describe('nhập tài khoản từ CSV (cả hai chế độ đăng nhập)', () => {
  const csv = [
    'email,displayName,unitId,title,roles',
    'gv.moi1@demo.aisrm.test,"TS. Nguyễn Mới, Một",k-ktqt,Giảng viên,RESEARCHER',
    'gv.moi2@demo.aisrm.test,ThS. Trần Mới Hai,k-qtkd,,RESEARCHER;UNIT_FOCAL@k-qtkd',
    'gv.binh@demo.aisrm.test,TS. Trần Thị Bình,k-ktqt,Giảng viên chính,REVIEWER',
  ].join('\n');

  it('chỉ quản trị hệ thống; kiểm tra trước (dryRun) báo lỗi từng dòng; có lỗi thì không nhập dòng nào', async () => {
    const pi = await tokenOf('gv.binh@demo.aisrm.test');
    expect((await call(pi, 'POST', '/admin/accounts/import', { csv, dryRun: true })).status).toBe(403);

    const admin = await tokenOf(ADMIN);
    const bad = csv + '\nkhong-phai-email,X,khong-co,,ROLE_LA';
    const dry = await call(admin, 'POST', '/admin/accounts/import', { csv: bad, dryRun: true });
    expect(dry.status).toBe(200);
    expect(dry.body.valid).toBe(3);
    expect(dry.body.invalid).toBe(1);
    expect(dry.body.rows[0]).toMatchObject({ email: 'gv.moi1@demo.aisrm.test', displayName: 'TS. Nguyễn Mới, Một', action: 'CREATE' });
    expect(dry.body.rows[2].action).toBe('UPDATE');
    expect(dry.body.rows[3].errors.join(' ')).toMatch(/Email không hợp lệ.*Đơn vị "khong-co".*Vai trò không hợp lệ/);

    const rejected = await call(admin, 'POST', '/admin/accounts/import', { csv: bad });
    expect(rejected.status).toBe(422);
    expect(await identity().findUidByEmail('gv.moi1@demo.aisrm.test')).toBeNull();

    const missingCol = await call(admin, 'POST', '/admin/accounts/import', { csv: 'email,displayName\na@b.vn,A', dryRun: true });
    expect(missingCol.status).toBe(422);
  });

  it('nhập thật: tạo tài khoản mới với mật khẩu tạm, thêm vai trò cho tài khoản đã có, không đổi mật khẩu của họ', async () => {
    const admin = await tokenOf(ADMIN);
    const r = await call(admin, 'POST', '/admin/accounts/import', { csv });
    expect(r.status).toBe(200);
    const [a, b, c] = r.body.results;
    expect(a).toMatchObject({ action: 'CREATE', rolesAdded: 1 });
    expect(a.temporaryPassword).toMatch(/^.{14}$/);
    expect(b).toMatchObject({ action: 'CREATE', rolesAdded: 2 });
    expect(c).toMatchObject({ action: 'UPDATE', rolesAdded: 1, temporaryPassword: null });

    // Tài khoản cũ vẫn đăng nhập bằng mật khẩu cũ và có thêm vai trò REVIEWER
    const pi = await tokenOf('gv.binh@demo.aisrm.test');
    expect((await call(pi, 'GET', '/me')).body.roles).toContain('REVIEWER');

    // Tài khoản mới đăng nhập bằng mật khẩu tạm
    const t = await tokenOf('gv.moi2@demo.aisrm.test', b.temporaryPassword);
    if (isLocal()) {
      expect((await call(t, 'GET', '/me')).body.code).toBe('PASSWORD_CHANGE_REQUIRED');
      const changed = await call(t, 'POST', '/auth/change-password', { currentPassword: b.temporaryPassword, newPassword: 'Moi2-Mat-Khau-2026' });
      expect(changed.status).toBe(200);
      const me = await call(changed.body.token, 'GET', '/me');
      expect(me.body.roles).toEqual(expect.arrayContaining(['RESEARCHER', 'UNIT_FOCAL']));
    } else {
      expect((await call(t, 'GET', '/me')).body.roles).toEqual(expect.arrayContaining(['RESEARCHER', 'UNIT_FOCAL']));
    }

    // Nhập lại cùng tệp: không tạo trùng vai trò
    const again = await call(admin, 'POST', '/admin/accounts/import', { csv });
    expect(again.body.results.map((x: { rolesAdded: number }) => x.rolesAdded)).toEqual([0, 0, 0]);
  });
});

describe.skipIf(!isLocal())('đăng nhập nội bộ — bảo mật', () => {
  const PI = 'gv.chi@demo.aisrm.test';
  const sid = (token: string) => createHash('sha256').update(token).digest('hex');

  it('cấu hình công khai cho biết chế độ đăng nhập; Firebase token / chuỗi lạ bị từ chối', async () => {
    const c = await call(null, 'GET', '/auth/config');
    expect(c.body).toMatchObject({ mode: 'local' });
    expect(c.body.passwordPolicy).toMatch(/10 ký tự/);
    for (const bad of ['abc', 'srm_' + 'x'.repeat(43), 'eyJhbGciOiJSUzI1NiJ9.e30.sig']) {
      expect((await call(bad, 'GET', '/me')).status).toBe(401);
    }
  });

  it('sai mật khẩu và email không tồn tại trả cùng một thông báo', async () => {
    const a = await login(PI, 'Sai-Mat-Khau-1');
    const b = await login('khong.co@demo.aisrm.test', 'Sai-Mat-Khau-1');
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.message).toBe(b.body.message);
    expect(a.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('khóa tạm sau 5 lần sai — kể cả mật khẩu đúng; email không tồn tại cũng bị khóa như thật; quản trị gỡ được', async () => {
    const victim = 'gv.dung@demo.aisrm.test';
    for (let i = 0; i < 4; i++) expect((await login(victim, `Sai-${i}-abcdefg`)).status).toBe(401);
    const fifth = await login(victim, 'Sai-5-abcdefg');
    expect(fifth.status).toBe(423);
    expect(fifth.body.code).toBe('ACCOUNT_LOCKED');
    expect((await login(victim, DEMO_PASSWORD)).status).toBe(423);

    for (let i = 0; i < 5; i++) await login('ma@demo.aisrm.test', `Sai-${i}-abcdefg`);
    expect((await login('ma@demo.aisrm.test', 'Bat-ky-2026')).status).toBe(423);

    // Quản trị đặt lại mật khẩu → gỡ khóa, buộc đổi mật khẩu
    const admin = await tokenOf(ADMIN);
    const uid = (await identity().findUidByEmail(victim))!;
    const reset = await call(admin, 'POST', `/admin/accounts/${uid}/reset-password`);
    expect(reset.status).toBe(200);
    const ok = await login(victim, reset.body.temporaryPassword);
    expect(ok.status).toBe(200);
    expect(ok.body.mustChangePassword).toBe(true);
    expect((await call(ok.body.token, 'GET', '/me')).status).toBe(403);
    expect((await call(ok.body.token, 'GET', '/proposals')).body.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('phiên: đăng xuất thu hồi token; hết hạn tuyệt đối và hết hạn khi không hoạt động', async () => {
    const t = (await login(PI, DEMO_PASSWORD)).body.token as string;
    expect((await call(t, 'GET', '/me')).status).toBe(200);
    expect((await call(t, 'POST', '/auth/logout')).status).toBe(204);
    expect((await call(t, 'GET', '/me')).status).toBe(401);

    const past = new Date(Date.now() - 1000).toISOString();
    const t2 = (await login(PI, DEMO_PASSWORD)).body.token as string;
    await db().collection('authSessions').doc(sid(t2)).update({ expiresAt: past });
    expect((await call(t2, 'GET', '/me')).status).toBe(401);
    expect((await db().collection('authSessions').doc(sid(t2)).get()).exists).toBe(false);

    const t3 = (await login(PI, DEMO_PASSWORD)).body.token as string;
    await db().collection('authSessions').doc(sid(t3)).update({ idleUntil: past });
    expect((await call(t3, 'GET', '/me')).status).toBe(401);
  });

  it('đổi mật khẩu: kiểm tra mật khẩu hiện tại và chính sách; thu hồi mọi phiên cũ', async () => {
    const user = 'gv.binh@demo.aisrm.test';
    const t1 = (await login(user, DEMO_PASSWORD)).body.token as string;
    const t2 = (await login(user, DEMO_PASSWORD)).body.token as string;
    expect((await call(t1, 'POST', '/auth/change-password', { currentPassword: 'sai', newPassword: 'Mat-Khau-Moi-2026' })).body.code).toBe('INVALID_CREDENTIALS');
    for (const weak of ['ngan', 'chuthuongdai', 'GV.BINH-2026-abc', DEMO_PASSWORD]) {
      const r = await call(t1, 'POST', '/auth/change-password', { currentPassword: DEMO_PASSWORD, newPassword: weak });
      expect(r.status, weak).toBe(422);
    }
    const ok = await call(t1, 'POST', '/auth/change-password', { currentPassword: DEMO_PASSWORD, newPassword: 'Mat-Khau-Moi-2026' });
    expect(ok.status).toBe(200);
    expect((await call(t1, 'GET', '/me')).status).toBe(401);
    expect((await call(t2, 'GET', '/me')).status).toBe(401);
    expect((await call(ok.body.token, 'GET', '/me')).status).toBe(200);
    expect((await login(user, DEMO_PASSWORD)).status).toBe(401);
    expect((await login(user, 'Mat-Khau-Moi-2026')).status).toBe(200);
  });

  it('quản trị: chỉ SYS_ADMIN; không tự đặt lại cho mình; không chạm tài khoản trường khác; khóa tài khoản thu hồi phiên', async () => {
    const admin = await tokenOf(ADMIN);
    const pi = (await login(PI, DEMO_PASSWORD)).body.token as string;
    const piUid = (await identity().findUidByEmail(PI))!;
    const adminUid = (await identity().findUidByEmail(ADMIN))!;
    const otherTenantUid = (await identity().findUidByEmail('gv.xuan@demo2.aisrm.test'))!;

    expect((await call(pi, 'POST', `/admin/accounts/${adminUid}/reset-password`)).status).toBe(403);
    expect((await call(admin, 'POST', `/admin/accounts/${adminUid}/reset-password`)).body.code).toBe('SELF_FORBIDDEN');
    expect((await call(admin, 'POST', `/admin/accounts/${otherTenantUid}/reset-password`)).status).toBe(404);

    const list = await call(admin, 'GET', '/admin/accounts');
    expect(list.body.mode).toBe('local');
    expect(list.body.items.find((x: { uid: string }) => x.uid === piUid).account).toMatchObject({ disabled: false, hasPassword: true });

    expect((await call(admin, 'POST', `/admin/accounts/${piUid}/disable`, { disabled: true })).status).toBe(200);
    expect((await call(pi, 'GET', '/me')).status).toBe(401);
    const blocked = await login(PI, DEMO_PASSWORD);
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('ACCOUNT_DISABLED');
    await call(admin, 'POST', `/admin/accounts/${piUid}/disable`, { disabled: false });
    expect((await login(PI, DEMO_PASSWORD)).status).toBe(200);
  });

  it('không có CSRF: API không nhận cookie làm phiên; CORS không cho gửi kèm thông tin đăng nhập', async () => {
    const t = (await login(PI, DEMO_PASSWORD)).body.token as string;
    const r = await call(null, 'GET', '/me', undefined, { Cookie: `token=${t}; session=${t}`, Origin: 'https://evil.example' });
    expect(r.status).toBe(401);
    const pre = await fetch(`${base}/api/v1/auth/change-password`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' } });
    expect(pre.headers.get('access-control-allow-origin')).toBeNull();
    expect(pre.headers.get('access-control-allow-credentials')).toBeNull();
  });

  it('kho dữ liệu chỉ lưu bản băm: không có mật khẩu hay token dạng rõ', async () => {
    const t = (await login(PI, DEMO_PASSWORD)).body.token as string;
    const uid = (await identity().findUidByEmail(PI))!;
    const acc = (await db().collection('authAccounts').doc(uid).get()).data()!;
    expect(JSON.stringify(acc)).not.toContain(DEMO_PASSWORD);
    expect(acc.passwordHash).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect((await db().collection('authSessions').doc(t).get()).exists).toBe(false);
    expect((await db().collection('authSessions').doc(sid(t)).get()).exists).toBe(true);
  });
});
