/**
 * Nhắc hạn hằng ngày (thông báo trong ứng dụng):
 *  - mốc tiến độ đề tài đang thực hiện: còn ≤ 7 ngày, còn ≤ 1 ngày, đã quá hạn → nhắc chủ nhiệm (và thành viên);
 *  - đợt đăng ký sắp đóng (≤ 3 ngày) mà hồ sơ còn ở trạng thái nháp → nhắc người lập hồ sơ.
 * Mỗi mức nhắc chỉ gửi MỘT lần (ghi dấu ở reminderLog bằng create — chạy lại cùng ngày không gửi trùng).
 */
import { notify } from '../common/records';
import { db, tcol } from '../infra';
import { localDate, registerJob, type JobResult } from './scheduler';

const ACTIVE_PROJECT = ['ACTIVE', 'COMPLETION_REVISION'];

async function once(tenantId: string, key: string): Promise<boolean> {
  try {
    await tcol(tenantId, 'reminderLog').doc(key).create({ at: new Date().toISOString() });
    return true;
  } catch (e) {
    if ((e as { code?: number }).code === 6) return false; // đã nhắc mức này rồi
    throw e;
  }
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export async function runDeadlineReminders(now: Date): Promise<JobResult> {
  const today = localDate(now);
  const counts = { tenants: 0, milestoneReminders: 0, callReminders: 0 };
  const tenants = await db().collection('tenants').get();
  for (const t of tenants.docs) {
    const tenantId = t.id;
    counts.tenants++;

    // 1) Mốc tiến độ đề tài
    const projects = await tcol(tenantId, 'projects').where('status', 'in', ACTIVE_PROJECT).limit(2000).get();
    for (const p of projects.docs) {
      const ms = await p.ref.collection('milestones').where('status', '==', 'OPEN').get();
      for (const m of ms.docs) {
        const due = String(m.get('dueDate') ?? '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) continue;
        const left = daysBetween(today, due);
        const level = left < 0 ? 'OVERDUE' : left <= 1 ? 'D1' : left <= 7 ? 'D7' : null;
        if (!level || !(await once(tenantId, `ms_${p.id}_${m.id}_${level}`))) continue;
        const when = left < 0 ? `đã quá hạn ${-left} ngày (hạn ${due})` : left === 0 ? `đến hạn hôm nay (${due})` : `còn ${left} ngày (hạn ${due})`;
        await notify(tenantId, [p.get('ownerUid'), ...((p.get('memberUids') as string[] | undefined) ?? [])], {
          title: left < 0 ? 'Mốc tiến độ đã quá hạn' : 'Sắp đến hạn mốc tiến độ',
          body: `Đề tài ${p.get('code') ?? ''} — mốc "${m.get('title')}" ${when}.`,
          link: `/projects/${p.id}`,
        });
        counts.milestoneReminders++;
      }
    }

    // 2) Đợt đăng ký sắp đóng, hồ sơ còn nháp
    const calls = await tcol(tenantId, 'calls').where('status', '==', 'OPEN').get();
    for (const c of calls.docs) {
      const close = String(c.get('closeAt') ?? '').slice(0, 10);
      const left = /^\d{4}-\d{2}-\d{2}$/.test(close) ? daysBetween(today, close) : -1;
      if (left < 0 || left > 3) continue;
      const drafts = await tcol(tenantId, 'proposals').where('callId', '==', c.id).where('status', '==', 'DRAFT').get();
      for (const d of drafts.docs) {
        if (!(await once(tenantId, `call_${c.id}_${d.id}_D3`))) continue;
        await notify(tenantId, [d.get('ownerUid')], {
          title: 'Đợt đăng ký sắp đóng',
          body: `Đợt "${c.get('title')}" đóng ${left === 0 ? 'hôm nay' : `sau ${left} ngày`} (${close}). Hồ sơ "${d.get('title') || d.get('code')}" vẫn là bản nháp, chưa nộp.`,
          link: `/proposals/${d.id}`,
        });
        counts.callReminders++;
      }
    }
  }
  return { summary: `Đã gửi ${counts.milestoneReminders} nhắc mốc tiến độ, ${counts.callReminders} nhắc nộp hồ sơ (${counts.tenants} trường).`, counts };
}

registerJob({ name: 'deadline-reminders', label: 'Nhắc hạn mốc tiến độ và đợt đăng ký', dailyAtHour: 7, run: runDeadlineReminders });
