/** Đăng nhập trong test theo chế độ đang chạy: Firebase Auth emulator hoặc đăng nhập nội bộ (/auth/login). */
import { identity } from '../../src/infra';

export async function signIn(base: string, email: string, password: string): Promise<string> {
  if (identity().kind === 'local') {
    const r = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const j = (await r.json()) as { token?: string };
    if (!j.token) throw new Error(`Đăng nhập nội bộ thất bại cho ${email}: ${r.status}`);
    return j.token;
  }
  const r = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const j = (await r.json()) as { idToken?: string };
  if (!j.idToken) throw new Error(`Đăng nhập emulator thất bại cho ${email}`);
  return j.idToken;
}
