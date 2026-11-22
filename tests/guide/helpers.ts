import { expect, type Locator, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEMO_PASSWORD } from '../../apps/api/scripts/seed-data';

export const OUT = join(__dirname, '..', '..', 'docs', 'huong-dan-su-dung');
export const IMG = join(OUT, 'anh');
mkdirSync(IMG, { recursive: true });

const HEADED = process.env.GUIDE_HEADLESS !== '1';
const PAUSE = Number(process.env.GUIDE_PAUSE ?? (HEADED ? 1200 : 0));

export interface ShotEntry {
  id: string;
  file: string;
  title: string;
  notes: string[];
}
const manifest: ShotEntry[] = [];
export function saveManifest(part: string) {
  writeFileSync(join(OUT, `manifest-${part}.json`), JSON.stringify(manifest, null, 1));
}

export interface Mark {
  at: Locator;
  note: string;
  /** Khoanh một khung bao quanh mọi phần tử khớp (vd các mục menu) thay vì phần tử đầu tiên. */
  all?: boolean;
}

/**
 * Chụp màn hình có khoanh vùng đánh số ①②③… khớp với ghi chú.
 * Khung nhìn 1440×900; cuộn để vùng đánh dấu đầu tiên nằm trong khung (hoặc chụp cả trang khi fullPage).
 */
export async function shot(page: Page, id: string, title: string, marks: Mark[] = [], opts: { fullPage?: boolean; clip?: Locator } = {}) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.addStyleTag({ content: '::-webkit-scrollbar{display:none} html{scrollbar-width:none}' });
  if (marks[0]) await marks[0].at.first().scrollIntoViewIfNeeded().catch(() => undefined);
  const boxes: { x: number; y: number; w: number; h: number }[] = [];
  for (const m of marks) {
    const els = m.all ? await m.at.all() : [m.at.first()];
    let u: { x1: number; y1: number; x2: number; y2: number } | null = null;
    for (const e of els) {
      const b = await e.boundingBox();
      if (!b) continue;
      u = u ? { x1: Math.min(u.x1, b.x), y1: Math.min(u.y1, b.y), x2: Math.max(u.x2, b.x + b.width), y2: Math.max(u.y2, b.y + b.height) } : { x1: b.x, y1: b.y, x2: b.x + b.width, y2: b.y + b.height };
    }
    if (!u) throw new Error(`[${id}] không thấy vùng đánh dấu cho: ${m.note}`);
    boxes.push({ x: u.x1, y: u.y1, w: u.x2 - u.x1, h: u.y2 - u.y1 });
  }
  await page.evaluate((bs) => {
    const sx = window.scrollX;
    const sy = window.scrollY;
    bs.forEach((b, i) => {
      const box = document.createElement('div');
      box.className = '__guide_mark';
      Object.assign(box.style, {
        position: 'absolute', left: `${b.x + sx - 4}px`, top: `${b.y + sy - 4}px`, width: `${b.w + 8}px`, height: `${b.h + 8}px`,
        border: '3px solid #dc2626', borderRadius: '6px', zIndex: '99998', pointerEvents: 'none', boxSizing: 'border-box',
      });
      const n = document.createElement('div');
      n.className = '__guide_mark';
      n.textContent = String(i + 1);
      const left = b.x + sx - 16 < 2 ? b.x + sx + b.w - 10 : b.x + sx - 16;
      Object.assign(n.style, {
        position: 'absolute', left: `${left}px`, top: `${Math.max(2, b.y + sy - 16)}px`, width: '26px', height: '26px', borderRadius: '13px',
        background: '#dc2626', color: '#fff', font: 'bold 15px/26px Arial, sans-serif', textAlign: 'center', zIndex: '99999', pointerEvents: 'none',
        boxShadow: '0 1px 3px rgba(0,0,0,.4)',
      });
      document.body.append(box, n);
    });
  }, boxes);
  const file = `${id}.jpg`;
  if (opts.clip) await opts.clip.screenshot({ path: join(IMG, file), type: 'jpeg', quality: 85 });
  else await page.screenshot({ path: join(IMG, file), type: 'jpeg', quality: 85, fullPage: !!opts.fullPage });
  if (PAUSE) await page.waitForTimeout(PAUSE);
  await page.evaluate(() => document.querySelectorAll('.__guide_mark').forEach((e) => e.remove()));
  manifest.push({ id, file, title, notes: marks.map((m) => m.note) });
}

const tokens = new Map<string, unknown>();

/** Đăng nhập nhanh bằng API (không chụp màn hình đăng nhập), rồi mở trang chủ. */
export async function loginAs(page: Page, email: string, path = '/') {
  let s = tokens.get(email);
  if (!s) {
    const r = await page.request.post('/api/v1/auth/login', { data: { email, password: DEMO_PASSWORD } });
    expect(r.ok(), `đăng nhập ${email}`).toBeTruthy();
    s = await r.json();
    tokens.set(email, s);
  }
  await page.goto('/');
  await page.evaluate((v) => {
    localStorage.setItem('aisrm.session', v);
    localStorage.removeItem('aisrm.activeRole');
  }, JSON.stringify(s));
  await page.goto(path);
  await expect(page.getByRole('navigation', { name: 'Điều hướng chính' })).toBeVisible();
}

export async function logout(page: Page) {
  await page.evaluate(() => localStorage.removeItem('aisrm.session'));
}

/** Gọi API bằng phiên của một tài khoản (dùng để chuẩn bị dữ liệu, không chụp). */
export async function apiAs(page: Page, email: string, method: string, path: string, body?: unknown) {
  if (!tokens.get(email)) {
    const r = await page.request.post('/api/v1/auth/login', { data: { email, password: DEMO_PASSWORD } });
    tokens.set(email, await r.json());
  }
  const token = (tokens.get(email) as { token: string }).token;
  const r = await page.request.fetch(`/api/v1${path}`, { method, headers: { Authorization: `Bearer ${token}` }, data: body, timeout: 240_000 });
  const text = await r.text();
  if (!r.ok()) throw new Error(`${method} ${path} → ${r.status()}: ${text}`);
  return text ? JSON.parse(text) : null;
}

export const main = (page: Page) => page.locator('main');
export const nav = (page: Page, name: string) => page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link', { name });
export const btn = (scope: Page | Locator, name: string | RegExp, exact = true) => scope.getByRole('button', { name, exact: typeof name === 'string' ? exact : undefined });

/** Bấm một thao tác quy trình (mở hộp xác nhận), tùy chọn chụp hộp thoại, rồi xác nhận. */
export async function act(page: Page, action: string, comment?: string, capture?: { id: string; title: string; notes?: [string, string?] }) {
  await btn(page, action).click();
  const dialog = page.getByRole('dialog');
  if (comment) await dialog.getByRole('textbox').fill(comment);
  if (capture) {
    const marks: Mark[] = [];
    if (comment) marks.push({ at: dialog.getByRole('textbox'), note: capture.notes?.[0] ?? 'Nhập ý kiến / lý do.' });
    marks.push({ at: dialog.getByRole('button', { name: `Xác nhận: ${action}` }), note: capture.notes?.[1] ?? `Bấm "Xác nhận: ${action}".` });
    await shot(page, capture.id, capture.title, marks);
  }
  await dialog.getByRole('button', { name: `Xác nhận: ${action}` }).click();
  await expect(dialog).toBeHidden();
}

export const PDF = (name: string) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% tai lieu mau AI-SRM\n') });
