/** Tác vụ nền (quản trị hệ thống): xem trạng thái, chạy ngay. */
import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { hasAnyRole, type Principal } from '@aisrm/shared';
import { CurrentPrincipal, RequestId } from '../common/auth';
import { forbidden, notFound } from '../common/errors';
import { audit } from '../common/records';
import '../jobs/reminders';
import { jobStatuses, listJobs, runJob } from '../jobs/scheduler';

function requireSysAdmin(p: Principal) {
  if (!hasAnyRole(p, ['SYS_ADMIN'])) throw forbidden('Chỉ quản trị hệ thống được thực hiện.');
}

@Controller('admin/jobs')
export class JobsController {
  @Get()
  async list(@CurrentPrincipal() p: Principal) {
    requireSysAdmin(p);
    return { schedulerEnabled: process.env.SCHEDULER_ENABLED === 'true', items: await jobStatuses() };
  }

  @Post(':name/run')
  @HttpCode(200)
  async run(@CurrentPrincipal() p: Principal, @Param('name') name: string, @RequestId() rid: string) {
    requireSysAdmin(p);
    if (!listJobs().some((j) => j.name === name)) throw notFound('Không có tác vụ này.');
    const r = await runJob(name, { force: true });
    await audit({ actor: p, action: 'job.run', resourceType: 'job', resourceId: name, requestId: rid, result: r.ran && r.ok === false ? 'ERROR' : 'SUCCESS', detail: r.ran ? (r.result?.summary ?? r.error ?? null) : 'đang chạy ở bản khác' });
    if (!r.ran) return { ran: false, message: 'Tác vụ đang chạy, thử lại sau.' };
    return { ran: true, ok: r.ok, summary: r.ok ? r.result!.summary : `Lỗi: ${r.error}`, counts: r.result?.counts ?? null };
  }
}
