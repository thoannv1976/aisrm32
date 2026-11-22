import type { ApiError } from '@aisrm/shared';
import { getToken, onUnauthorized } from './auth';

export class ApiFailure extends Error {
  constructor(
    public status: number,
    public body: ApiError,
  ) {
    super(body.message);
  }
}

const TENANT_KEY = 'aisrm.tenant';

export function getTenant(): string | null {
  try {
    return localStorage.getItem(TENANT_KEY);
  } catch {
    return null;
  }
}

export function setTenant(id: string) {
  try {
    localStorage.setItem(TENANT_KEY, id);
  } catch {
    /* bỏ qua */
  }
}

async function headers(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const h: Record<string, string> = { ...extra };
  const token = await getToken();
  if (token) h.Authorization = `Bearer ${token}`;
  const t = getTenant();
  if (t) h['X-Tenant-Id'] = t;
  return h;
}

async function handle<T>(r: Response): Promise<T> {
  if (r.ok) {
    const ct = r.headers.get('content-type') ?? '';
    return (ct.includes('application/json') ? r.json() : r.text()) as Promise<T>;
  }
  if (r.status === 401) onUnauthorized();
  let body: ApiError;
  try {
    body = await r.json();
  } catch {
    body = { code: 'HTTP_' + r.status, message: `Lỗi máy chủ (${r.status}).`, requestId: r.headers.get('x-request-id') ?? '-' };
  }
  throw new ApiFailure(r.status, body);
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
  const isForm = init.body instanceof FormData;
  const h = await headers({ ...(init.body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}) });
  const r = await fetch(`/api/v1${path}`, {
    method: init.method ?? 'GET',
    headers: h,
    body: init.body === undefined ? undefined : isForm ? (init.body as FormData) : JSON.stringify(init.body),
  });
  return handle<T>(r);
}

/** Tải tệp (tài liệu/CSV) qua API có kiểm tra quyền, rồi lưu bằng trình duyệt. */
export async function download(path: string, fallbackName: string) {
  const r = await fetch(`/api/v1${path}`, { headers: await headers() });
  if (!r.ok) await handle(r);
  const blob = await r.blob();
  const cd = r.headers.get('content-disposition') ?? '';
  const m = /filename\*=UTF-8''([^;]+)/.exec(cd) ?? /filename="([^"]+)"/.exec(cd);
  const name = m ? decodeURIComponent(m[1]) : fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiFailure) return e.body.message;
  if (e instanceof Error) return e.message;
  return 'Đã có lỗi xảy ra.';
}

export function newIdempotencyKey(): string {
  return (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^\w-]/g, '');
}
