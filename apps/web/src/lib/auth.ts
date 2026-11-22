/**
 * Lớp đăng nhập phía trình duyệt, chạy được cả hai kiểu (ADR-0003):
 *  - "firebase": Firebase Auth (bản Online) — SDK chỉ được tải khi cần;
 *  - "local": đăng nhập nội bộ qua /api/v1/auth/* (bản Local) — phiên là token Bearer, không dùng cookie.
 * Kiểu đăng nhập lấy từ máy chủ lúc khởi động (/auth/config), nên cùng một bản build web chạy được cho cả hai.
 */
export type AuthMode = 'firebase' | 'local';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
}

export interface AuthState {
  user: AuthUser | null;
  /** Bản Local: đang dùng mật khẩu tạm, phải đổi trước khi dùng hệ thống. */
  mustChangePassword: boolean;
}

const env = import.meta.env;
export const usingEmulators = (env.VITE_USE_EMULATORS ?? (env.DEV ? 'true' : 'false')) === 'true';

let mode: AuthMode | null = null;
let passwordPolicy: string | null = null;
let modePromise: Promise<AuthMode> | null = null;

export function initAuth(): Promise<AuthMode> {
  modePromise ??= fetchAuthConfig()
    .then((c: { mode?: string; passwordPolicy?: string | null }) => {
      mode = c.mode === 'local' ? 'local' : 'firebase';
      passwordPolicy = c.passwordPolicy ?? null;
      return mode;
    });
  return modePromise;
}

/**
 * Đọc chế độ đăng nhập từ API. Khi API chưa sẵn sàng (vd máy chủ vừa khởi động: lỗi mạng, 502/503/504)
 * thì chờ và thử lại — không được đoán chế độ, vì đoán sai sẽ giữ trang ở chế độ đăng nhập sai cho tới khi tải lại.
 * Chỉ coi là bản Online cũ (Firebase) khi API trả 404 (chưa có endpoint này).
 */
async function fetchAuthConfig(): Promise<{ mode?: string; passwordPolicy?: string | null }> {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch('/api/v1/auth/config');
      if (r.ok) return (await r.json()) as { mode?: string; passwordPolicy?: string | null };
      if (r.status === 404) return { mode: 'firebase' };
    } catch {
      // lỗi mạng — thử lại
    }
    await new Promise((res) => setTimeout(res, Math.min(5000, 500 * 2 ** attempt)));
  }
}

export const authMode = () => mode;
export const getPasswordPolicy = () => passwordPolicy;

// ---------- bản Local ----------

const SESSION_KEY = 'aisrm.session';
interface LocalSession {
  token: string;
  expiresAt: string;
  mustChangePassword: boolean;
  user: { uid: string; email: string; displayName: string };
}

function readLocal(): LocalSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as LocalSession;
    if (!s.token || Date.parse(s.expiresAt) <= Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

const listeners = new Set<(s: AuthState) => void>();
function localState(): AuthState {
  const s = readLocal();
  return s ? { user: { uid: s.user.uid, email: s.user.email, displayName: s.user.displayName }, mustChangePassword: s.mustChangePassword } : { user: null, mustChangePassword: false };
}
function writeLocal(s: LocalSession | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* bỏ qua */
  }
  const st = localState();
  listeners.forEach((l) => l(st));
}

/** Gọi khi API trả 401 ở bản Local: phiên hết hạn / bị thu hồi → về trang đăng nhập. */
export function onUnauthorized() {
  if (mode === 'local' && readLocal()) writeLocal(null);
}

async function postJson<T>(path: string, body: unknown, token?: string): Promise<T> {
  const r = await fetch(`/api/v1${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const j = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.message ?? `Lỗi máy chủ (${r.status}).`);
  return j as T;
}

// ---------- API chung ----------

/** Đăng ký nhận trạng thái đăng nhập; gọi cb ngay khi đã biết trạng thái ban đầu. */
export function subscribeAuth(cb: (s: AuthState) => void): () => void {
  let unsub: (() => void) | null = null;
  let cancelled = false;
  void initAuth().then(async (m) => {
    if (cancelled) return;
    if (m === 'local') {
      listeners.add(cb);
      cb(localState());
      const onStorage = (e: StorageEvent) => e.key === SESSION_KEY && cb(localState());
      window.addEventListener('storage', onStorage);
      unsub = () => {
        listeners.delete(cb);
        window.removeEventListener('storage', onStorage);
      };
    } else {
      const [{ auth }, { onIdTokenChanged }] = await Promise.all([import('./firebase'), import('firebase/auth')]);
      if (cancelled) return;
      unsub = onIdTokenChanged(auth, (u) => cb({ user: u ? { uid: u.uid, email: u.email, displayName: u.displayName } : null, mustChangePassword: false }));
    }
  });
  return () => {
    cancelled = true;
    unsub?.();
  };
}

export async function getToken(): Promise<string | null> {
  const m = await initAuth();
  if (m === 'local') return readLocal()?.token ?? null;
  const { auth } = await import('./firebase');
  return auth.currentUser ? auth.currentUser.getIdToken() : null;
}

export async function signIn(email: string, password: string): Promise<void> {
  const m = await initAuth();
  if (m === 'local') {
    writeLocal(await postJson<LocalSession>('/auth/login', { email, password }));
    return;
  }
  const [{ auth }, { signInWithEmailAndPassword }] = await Promise.all([import('./firebase'), import('firebase/auth')]);
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch {
    throw new Error('Email hoặc mật khẩu không đúng.');
  }
}

export async function signOutUser(): Promise<void> {
  const m = await initAuth();
  if (m === 'local') {
    const s = readLocal();
    if (s) await postJson('/auth/logout', {}, s.token).catch(() => undefined);
    writeLocal(null);
    return;
  }
  const [{ auth }, { signOut }] = await Promise.all([import('./firebase'), import('firebase/auth')]);
  await signOut(auth);
}

/** Chỉ bản Local. Thành công → phiên mới (mọi phiên cũ bị thu hồi ở máy chủ). */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const s = readLocal();
  if (!s) throw new Error('Phiên đăng nhập đã hết hạn.');
  writeLocal(await postJson<LocalSession>('/auth/change-password', { currentPassword, newPassword }, s.token));
}
