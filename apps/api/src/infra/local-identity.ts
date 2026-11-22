/**
 * Đăng nhập nội bộ cho bản Local (L3 — ADR-0003). Lưu trong DataStore nên chạy được trên cả PostgreSQL và Firestore.
 *
 * Bảo mật:
 *  - mật khẩu băm scrypt (N=2^15, r=8, p=1, muối 16 byte), so sánh thời gian hằng;
 *  - phiên là chuỗi ngẫu nhiên 256 bit, chỉ lưu SHA-256 của nó; hết hạn tuyệt đối + hết hạn khi không hoạt động;
 *  - khóa tạm theo email sau N lần sai (kể cả email không tồn tại → không dò được tài khoản);
 *  - đổi / đặt lại mật khẩu hoặc khóa tài khoản → thu hồi mọi phiên cũ ngay;
 *  - token gửi qua header Authorization (không dùng cookie) nên không bị CSRF.
 */
import { createHash, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import type { DataStore, DocData } from './datastore';
import { IdentityError, type IdentityProvider, type VerifiedIdentity } from './identity';

const scrypt = (pw: string, salt: Buffer, keylen: number, opts: ScryptOptions) =>
  new Promise<Buffer>((res, rej) => scryptCb(pw, salt, keylen, opts, (e, k) => (e ? rej(e) : res(k))));

export interface LocalIdentityOptions {
  /** Hết hạn tuyệt đối của phiên (giờ). */
  sessionMaxHours: number;
  /** Hết hạn khi không hoạt động (phút). */
  sessionIdleMinutes: number;
  /** Số lần sai liên tiếp trước khi khóa tạm. */
  maxFailures: number;
  /** Thời gian khóa tạm (phút). */
  lockMinutes: number;
  /** Tham số scrypt (log2 N) — giảm chỉ để chạy test nhanh. */
  scryptLogN: number;
}

export const DEFAULT_LOCAL_IDENTITY: LocalIdentityOptions = {
  sessionMaxHours: Number(process.env.AUTH_SESSION_MAX_HOURS ?? 12),
  sessionIdleMinutes: Number(process.env.AUTH_SESSION_IDLE_MINUTES ?? 120),
  maxFailures: Number(process.env.AUTH_MAX_FAILURES ?? 5),
  lockMinutes: Number(process.env.AUTH_LOCK_MINUTES ?? 15),
  scryptLogN: Number(process.env.AUTH_SCRYPT_LOG_N ?? 15),
};

export type AuthFailureCode = 'INVALID_CREDENTIALS' | 'ACCOUNT_LOCKED' | 'ACCOUNT_DISABLED' | 'WEAK_PASSWORD' | 'SAME_PASSWORD' | 'NOT_FOUND';

export class AuthFailure extends Error {
  constructor(
    readonly code: AuthFailureCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export interface LoginResult {
  token: string;
  expiresAt: string;
  mustChangePassword: boolean;
  user: { uid: string; email: string; displayName: string };
}

export interface ClientMeta {
  ip?: string | null;
  userAgent?: string | null;
}

/** Chính sách mật khẩu: ≥ 10 ký tự, có ít nhất 3 trong 4 nhóm (hoa, thường, số, ký hiệu), không chứa phần trước @ của email. */
export function passwordPolicyError(pw: string, email?: string): string | null {
  if (typeof pw !== 'string' || pw.length < 10) return 'Mật khẩu cần ít nhất 10 ký tự.';
  if (pw.length > 200) return 'Mật khẩu quá dài.';
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (classes < 3) return 'Mật khẩu cần có ít nhất 3 trong 4 nhóm: chữ hoa, chữ thường, chữ số, ký hiệu.';
  const local = email?.split('@')[0]?.toLowerCase();
  if (local && local.length >= 3 && pw.toLowerCase().includes(local)) return 'Mật khẩu không được chứa tên tài khoản.';
  return null;
}

export const PASSWORD_POLICY_TEXT = 'Ít nhất 10 ký tự, gồm 3 trong 4 nhóm: chữ hoa, chữ thường, chữ số, ký hiệu; không chứa tên tài khoản.';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const normEmail = (e: string) => e.trim().toLowerCase();
const now = () => new Date();
const iso = (d: Date) => d.toISOString();

function generatePassword(): string {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '@#%+=!?'];
  const all = sets.join('');
  const chars = sets.map((s) => s[randomInt(s.length)]);
  while (chars.length < 14) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export class LocalIdentity implements IdentityProvider {
  readonly kind = 'local' as const;
  private dummyHash?: Promise<string>;

  constructor(
    private readonly store: () => DataStore,
    private readonly opts: LocalIdentityOptions = DEFAULT_LOCAL_IDENTITY,
  ) {}

  private accounts = () => this.store().collection('authAccounts');
  private emails = () => this.store().collection('authEmails');
  private sessions = () => this.store().collection('authSessions');
  private throttle = () => this.store().collection('authThrottle');

  // ---------- băm mật khẩu ----------

  private async hash(pw: string): Promise<string> {
    const N = 2 ** this.opts.scryptLogN;
    const salt = randomBytes(16);
    const key = await scrypt(pw, salt, 32, { N, r: 8, p: 1, maxmem: 256 * N * 8 });
    return `scrypt$${N}$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
  }

  private async verifyHash(pw: string, stored: string): Promise<boolean> {
    const [alg, n, r, p, saltB64, keyB64] = stored.split('$');
    if (alg !== 'scrypt') return false;
    const N = Number(n);
    const expected = Buffer.from(keyB64, 'base64');
    const key = await scrypt(pw, Buffer.from(saltB64, 'base64'), expected.length, { N, r: Number(r), p: Number(p), maxmem: 256 * N * Number(r) });
    return key.length === expected.length && timingSafeEqual(key, expected);
  }

  // ---------- tài khoản ----------

  async findUidByEmail(email: string): Promise<string | null> {
    const s = await this.emails().doc(sha256(normEmail(email))).get();
    return s.exists ? (s.get('uid') as string) : null;
  }

  async upsertUser({ email, password, displayName }: { email: string; password?: string; displayName: string }): Promise<string> {
    const e = normEmail(email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new AuthFailure('INVALID_CREDENTIALS', `Email không hợp lệ: ${email}`);
    if (password !== undefined) {
      const err = passwordPolicyError(password, e);
      if (err) throw new AuthFailure('WEAK_PASSWORD', err);
    }
    const passwordHash = password !== undefined ? await this.hash(password) : undefined;
    const existing = await this.findUidByEmail(e);
    const t = iso(now());
    if (existing) {
      const patch: DocData = { displayName, updatedAt: t };
      if (passwordHash) Object.assign(patch, { passwordHash, mustChangePassword: false, passwordChangedAt: t, sessionsValidAfter: t });
      await this.accounts().doc(existing).update(patch);
      return existing;
    }
    const uid = randomBytes(21).toString('base64url').slice(0, 28);
    await this.store().runTransaction(async (tx) => {
      const emailRef = this.emails().doc(sha256(e));
      const cur = await tx.get(emailRef);
      if (cur.exists) throw new AuthFailure('INVALID_CREDENTIALS', 'Email đã được dùng cho tài khoản khác.');
      tx.create(emailRef, { uid, email: e });
      tx.create(this.accounts().doc(uid), {
        email: e,
        displayName,
        passwordHash: passwordHash ?? null,
        mustChangePassword: false,
        disabled: false,
        createdAt: t,
        updatedAt: t,
        passwordChangedAt: passwordHash ? t : null,
        sessionsValidAfter: t,
        lastLoginAt: null,
      });
    });
    return uid;
  }

  async getAccount(uid: string) {
    const s = await this.accounts().doc(uid).get();
    if (!s.exists) return null;
    const d = s.data()!;
    return {
      uid,
      email: d.email as string,
      displayName: d.displayName as string,
      disabled: !!d.disabled,
      mustChangePassword: !!d.mustChangePassword,
      hasPassword: !!d.passwordHash,
      lastLoginAt: (d.lastLoginAt as string | null) ?? null,
    };
  }

  // ---------- đăng nhập / phiên ----------

  private async recordFailure(key: string): Promise<{ locked: boolean }> {
    return this.store().runTransaction(async (tx) => {
      const ref = this.throttle().doc(key);
      const s = await tx.get(ref);
      const fails = ((s.exists ? (s.get('fails') as number) : 0) ?? 0) + 1;
      if (fails >= this.opts.maxFailures) {
        tx.set(ref, { fails: 0, lockedUntil: iso(new Date(Date.now() + this.opts.lockMinutes * 60_000)), updatedAt: iso(now()) });
        return { locked: true };
      }
      tx.set(ref, { fails, lockedUntil: null, updatedAt: iso(now()) });
      return { locked: false };
    });
  }

  private lockedMessage(until: string) {
    const min = Math.max(1, Math.ceil((Date.parse(until) - Date.now()) / 60_000));
    return new AuthFailure('ACCOUNT_LOCKED', `Tài khoản tạm khóa do nhập sai nhiều lần. Thử lại sau khoảng ${min} phút hoặc liên hệ quản trị.`, { retryAfterMinutes: min });
  }

  private async createSession(uid: string, email: string, displayName: string, mustChangePassword: boolean, meta: ClientMeta): Promise<LoginResult> {
    const token = `srm_${randomBytes(32).toString('base64url')}`;
    const t = now();
    const expiresAt = iso(new Date(t.getTime() + this.opts.sessionMaxHours * 3_600_000));
    await this.sessions()
      .doc(sha256(token))
      .set({
        uid,
        createdAt: iso(t),
        lastSeenAt: iso(t),
        idleUntil: iso(new Date(t.getTime() + this.opts.sessionIdleMinutes * 60_000)),
        expiresAt,
        ip: meta.ip?.slice(0, 64) ?? null,
        userAgent: meta.userAgent?.slice(0, 256) ?? null,
      });
    return { token, expiresAt, mustChangePassword, user: { uid, email, displayName } };
  }

  async login(email: string, password: string, meta: ClientMeta = {}): Promise<LoginResult> {
    const e = normEmail(String(email ?? ''));
    const key = sha256(e);
    const th = await this.throttle().doc(key).get();
    const lockedUntil = th.exists ? (th.get('lockedUntil') as string | null) : null;
    if (lockedUntil && Date.parse(lockedUntil) > Date.now()) throw this.lockedMessage(lockedUntil);

    const uid = e ? await this.findUidByEmail(e) : null;
    const acc = uid ? await this.accounts().doc(uid).get() : null;
    const stored = acc?.exists ? (acc.get('passwordHash') as string | null) : null;
    // Luôn chạy scrypt (kể cả khi không có tài khoản) để thời gian phản hồi không lộ email nào tồn tại.
    this.dummyHash ??= this.hash(randomBytes(16).toString('hex'));
    const ok = await this.verifyHash(String(password ?? ''), stored ?? (await this.dummyHash));
    if (!ok || !stored || !uid || !acc) {
      const { locked } = await this.recordFailure(key);
      if (locked) throw this.lockedMessage(iso(new Date(Date.now() + this.opts.lockMinutes * 60_000)));
      throw new AuthFailure('INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng.');
    }
    if (acc.get('disabled')) throw new AuthFailure('ACCOUNT_DISABLED', 'Tài khoản đã bị khóa. Liên hệ quản trị hệ thống.');
    if (th.exists) await this.throttle().doc(key).delete();
    await this.accounts().doc(uid).update({ lastLoginAt: iso(now()) });
    return this.createSession(uid, acc.get('email'), acc.get('displayName'), !!acc.get('mustChangePassword'), meta);
  }

  async verifyToken(token: string): Promise<VerifiedIdentity> {
    if (typeof token !== 'string' || !/^srm_[A-Za-z0-9_-]{43}$/.test(token)) throw new IdentityError('TOKEN_INVALID', 'Phiên đăng nhập không hợp lệ.');
    const ref = this.sessions().doc(sha256(token));
    const s = await ref.get();
    if (!s.exists) throw new IdentityError('TOKEN_INVALID', 'Phiên đăng nhập không hợp lệ.');
    const d = s.data()!;
    const nowMs = Date.now();
    if (Date.parse(d.expiresAt) <= nowMs || Date.parse(d.idleUntil) <= nowMs) {
      await ref.delete();
      throw new IdentityError('TOKEN_EXPIRED', 'Phiên đăng nhập đã hết hạn.');
    }
    const acc = await this.accounts().doc(d.uid).get();
    if (!acc.exists) throw new IdentityError('TOKEN_INVALID', 'Phiên đăng nhập không hợp lệ.');
    if (acc.get('disabled')) throw new IdentityError('ACCOUNT_DISABLED', 'Tài khoản đã bị khóa.');
    if (String(acc.get('sessionsValidAfter') ?? '') > String(d.createdAt)) {
      await ref.delete();
      throw new IdentityError('TOKEN_REVOKED', 'Phiên đăng nhập đã bị thu hồi.');
    }
    if (nowMs - Date.parse(d.lastSeenAt) > 60_000) {
      await ref.update({ lastSeenAt: iso(new Date(nowMs)), idleUntil: iso(new Date(nowMs + this.opts.sessionIdleMinutes * 60_000)) });
    }
    return { uid: d.uid, email: acc.get('email') ?? null, mustChangePassword: !!acc.get('mustChangePassword') };
  }

  async logout(token: string) {
    if (typeof token === 'string' && token.startsWith('srm_')) await this.sessions().doc(sha256(token)).delete();
  }

  /** Thu hồi mọi phiên của tài khoản (đánh dấu thời điểm + xóa các phiên đang lưu). */
  private async revokeAll(uid: string, at: string) {
    await this.accounts().doc(uid).update({ sessionsValidAfter: at });
    const snap = await this.sessions().where('uid', '==', uid).limit(500).get();
    if (!snap.empty) {
      const b = this.store().batch();
      for (const d of snap.docs) b.delete(d.ref);
      await b.commit();
    }
  }

  async changePassword(uid: string, current: string, next: string, meta: ClientMeta = {}): Promise<LoginResult> {
    const acc = await this.accounts().doc(uid).get();
    if (!acc.exists) throw new AuthFailure('NOT_FOUND', 'Không tìm thấy tài khoản.');
    const email = acc.get('email') as string;
    const key = sha256(email);
    const th = await this.throttle().doc(key).get();
    const lockedUntil = th.exists ? (th.get('lockedUntil') as string | null) : null;
    if (lockedUntil && Date.parse(lockedUntil) > Date.now()) throw this.lockedMessage(lockedUntil);
    const stored = acc.get('passwordHash') as string | null;
    if (!stored || !(await this.verifyHash(String(current ?? ''), stored))) {
      await this.recordFailure(key);
      throw new AuthFailure('INVALID_CREDENTIALS', 'Mật khẩu hiện tại không đúng.');
    }
    const err = passwordPolicyError(next, email);
    if (err) throw new AuthFailure('WEAK_PASSWORD', err);
    if (await this.verifyHash(next, stored)) throw new AuthFailure('SAME_PASSWORD', 'Mật khẩu mới phải khác mật khẩu hiện tại.');
    const t = iso(now());
    await this.accounts().doc(uid).update({ passwordHash: await this.hash(next), mustChangePassword: false, passwordChangedAt: t, updatedAt: t });
    await this.revokeAll(uid, t);
    if (th.exists) await this.throttle().doc(key).delete();
    return this.createSession(uid, email, acc.get('displayName'), false, meta);
  }

  /** Quản trị đặt lại: cấp mật khẩu tạm (chỉ trả về một lần), buộc đổi khi đăng nhập, thu hồi mọi phiên, gỡ khóa tạm. */
  async adminResetPassword(uid: string): Promise<string> {
    const acc = await this.accounts().doc(uid).get();
    if (!acc.exists) throw new AuthFailure('NOT_FOUND', 'Không tìm thấy tài khoản.');
    const temp = generatePassword();
    const t = iso(now());
    await this.accounts().doc(uid).update({ passwordHash: await this.hash(temp), mustChangePassword: true, passwordChangedAt: t, updatedAt: t });
    await this.revokeAll(uid, t);
    await this.throttle().doc(sha256(acc.get('email'))).delete();
    return temp;
  }

  async setDisabled(uid: string, disabled: boolean) {
    const acc = await this.accounts().doc(uid).get();
    if (!acc.exists) throw new AuthFailure('NOT_FOUND', 'Không tìm thấy tài khoản.');
    const t = iso(now());
    await this.accounts().doc(uid).update({ disabled, updatedAt: t });
    if (disabled) await this.revokeAll(uid, t);
  }

  /** Dùng khi nhập tài khoản mới: tạo mật khẩu tạm buộc đổi. */
  async issueTemporaryPassword(uid: string): Promise<string> {
    return this.adminResetPassword(uid);
  }
}

export { generatePassword };
