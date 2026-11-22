/**
 * Gửi thư thông báo. Bản Local dùng máy chủ thư (SMTP) của trường; bản Online dùng SMTP của dịch vụ gửi thư đã chọn.
 * Cấu hình qua biến môi trường SMTP_URL (smtp(s)://user:pass@host:port) và MAIL_FROM. Mật khẩu SMTP chỉ nằm ở biến môi trường
 * (hoặc Secret Manager), không lưu trong cơ sở dữ liệu.
 * Mọi thư đều ghi nhật ký (mailLog) — khi chưa cấu hình SMTP, thư được ghi "Chưa cấu hình" để quản trị thấy, không mất thông báo trong ứng dụng.
 */
import { db, nowIso, tcol } from './index';

export interface MailSettings {
  enabled: boolean;
  /** Loại thông báo gửi thư: all = mọi thông báo, deadlines = chỉ nhắc hạn. */
  scope: 'all' | 'deadlines';
}

export const DEFAULT_MAIL_SETTINGS: MailSettings = { enabled: false, scope: 'all' };

export function smtpConfigured(): boolean {
  return !!process.env.SMTP_URL;
}

export function smtpInfo() {
  const url = process.env.SMTP_URL;
  if (!url) return { configured: false, host: null, from: process.env.MAIL_FROM ?? null };
  try {
    const u = new URL(url);
    return { configured: true, host: `${u.protocol}//${u.hostname}:${u.port || (u.protocol === 'smtps:' ? 465 : 587)}`, from: process.env.MAIL_FROM ?? null };
  } catch {
    return { configured: false, host: 'SMTP_URL không hợp lệ', from: process.env.MAIL_FROM ?? null };
  }
}

type Transport = { sendMail: (m: { from: string; to: string; subject: string; text: string }) => Promise<unknown> };
let transport: Transport | null = null;
let testTransport: Transport | null = null;
export function setMailTransportForTest(t: Transport | null) {
  testTransport = t;
}

async function getTransport(): Promise<Transport | null> {
  if (testTransport) return testTransport;
  if (!smtpConfigured()) return null;
  if (!transport) {
    const nodemailer = await import('nodemailer');
    transport = nodemailer.createTransport(process.env.SMTP_URL!) as unknown as Transport;
  }
  return transport;
}

export async function loadMailSettings(tenantId: string): Promise<MailSettings> {
  const s = await tcol(tenantId, 'settings').doc('mail').get();
  return { ...DEFAULT_MAIL_SETTINGS, ...((s.exists ? s.data() : {}) as Partial<MailSettings>) };
}

export async function sendMail(tenantId: string, to: { uid: string | null; email: string }, subject: string, text: string, kind = 'notification') {
  const t = await getTransport();
  const base = { to: to.email, toUid: to.uid, subject, kind, at: nowIso() };
  const log = tcol(tenantId, 'mailLog').doc();
  if (!t) {
    await log.set({ ...base, status: 'NOT_CONFIGURED', error: 'Chưa cấu hình máy chủ thư (SMTP_URL).' });
    return { status: 'NOT_CONFIGURED' as const };
  }
  try {
    await t.sendMail({ from: process.env.MAIL_FROM ?? 'AI-SRM <no-reply@localhost>', to: to.email, subject, text });
    await log.set({ ...base, status: 'SENT', error: null });
    return { status: 'SENT' as const };
  } catch (e) {
    const error = e instanceof Error ? e.message.slice(0, 300) : 'Lỗi gửi thư';
    await log.set({ ...base, status: 'FAILED', error });
    return { status: 'FAILED' as const, error };
  }
}

/** Gửi thư kèm thông báo trong ứng dụng (nếu quản trị bật). Lỗi gửi thư không làm hỏng nghiệp vụ. */
export async function mailNotifications(tenantId: string, uids: string[], n: { title: string; body: string; link?: string | null }, kind: 'notification' | 'deadline' = 'notification') {
  const settings = await loadMailSettings(tenantId);
  if (!settings.enabled) return;
  if (settings.scope === 'deadlines' && kind !== 'deadline') return;
  const base = process.env.PUBLIC_BASE_URL ?? '';
  const people = await Promise.all(uids.map((u) => tcol(tenantId, 'people').doc(u).get()));
  for (const p of people) {
    const email = p.exists ? (p.get('email') as string | undefined) : undefined;
    if (!email || p.get('status') !== 'ACTIVE') continue;
    const text = `${n.body}\n\n${n.link ? `Xem chi tiết: ${base}${n.link}\n\n` : ''}— Thư tự động từ AI-SRM. Không trả lời thư này.`;
    await sendMail(tenantId, { uid: p.id, email }, `[AI-SRM] ${n.title}`, text, kind);
  }
}

