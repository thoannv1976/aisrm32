/**
 * Đăng nhập nội bộ (bản Local) và quản trị tài khoản.
 * Bản Online (Firebase Auth) chỉ dùng /auth/config và nhập CSV; các API mật khẩu trả 404 AUTH_MODE_UNSUPPORTED.
 */
import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { hasAnyRole, type Principal } from '@aisrm/shared';
import { z } from 'zod';
import { applyImport, planImport } from '../accounts/import';
import { AllowPendingPassword, CurrentPrincipal, Public, RequestId, type AuthedRequest } from '../common/auth';
import { AppError, forbidden, unprocessable } from '../common/errors';
import { audit } from '../common/records';
import { parse } from '../common/util';
import { AuthFailure, db, identity, localAuth, PASSWORD_POLICY_TEXT, tcol, type LocalIdentity } from '../infra';

const STATUS: Record<AuthFailure['code'], number> = {
  INVALID_CREDENTIALS: 401,
  ACCOUNT_LOCKED: 423,
  ACCOUNT_DISABLED: 403,
  WEAK_PASSWORD: 422,
  SAME_PASSWORD: 422,
  NOT_FOUND: 404,
};

async function mapAuth<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AuthFailure) throw new AppError(STATUS[e.code], e.code, e.message, e.details);
    throw e;
  }
}

function requireLocal(): LocalIdentity {
  const l = localAuth();
  if (!l) throw new AppError(404, 'AUTH_MODE_UNSUPPORTED', 'Chức năng này chỉ có ở bản Local (đăng nhập nội bộ).');
  return l;
}

function requireSysAdmin(p: Principal) {
  if (!hasAnyRole(p, ['SYS_ADMIN'])) throw forbidden('Chỉ quản trị hệ thống được thực hiện.');
}

/** Giới hạn số lần đăng nhập SAI theo địa chỉ IP (bổ sung cho khóa tạm theo tài khoản). Chỉ đếm lần sai để không chặn cả trường dùng chung NAT. */
const ipFailures = new Map<string, { n: number; since: number }>();
const IP_WINDOW_MS = 15 * 60_000;
const IP_MAX_FAILURES = Number(process.env.AUTH_IP_MAX_FAILURES ?? 50);
function ipBlocked(ip: string) {
  const e = ipFailures.get(ip);
  if (!e || Date.now() - e.since > IP_WINDOW_MS) return false;
  return e.n >= IP_MAX_FAILURES;
}
function ipFail(ip: string) {
  const e = ipFailures.get(ip);
  if (!e || Date.now() - e.since > IP_WINDOW_MS) ipFailures.set(ip, { n: 1, since: Date.now() });
  else e.n++;
  if (ipFailures.size > 10_000) ipFailures.clear();
}

const loginBody = z.object({ email: z.string().max(254), password: z.string().max(200) });
const changeBody = z.object({ currentPassword: z.string().max(200), newPassword: z.string().max(200) });
const importBody = z.object({ csv: z.string().min(1).max(2_000_000), dryRun: z.boolean().optional() });
const disableBody = z.object({ disabled: z.boolean() });

const meta = (req: AuthedRequest) => ({ ip: req.ip ?? null, userAgent: req.header('user-agent') ?? null });

@Controller('auth')
export class AuthController {
  @Public()
  @Get('config')
  config() {
    return { mode: identity().kind, passwordPolicy: localAuth() ? PASSWORD_POLICY_TEXT : null };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: AuthedRequest) {
    const local = requireLocal();
    const ip = req.ip ?? '-';
    if (ipBlocked(ip)) throw new AppError(429, 'TOO_MANY_ATTEMPTS', 'Quá nhiều lần đăng nhập sai từ địa chỉ này. Thử lại sau 15 phút.');
    const { email, password } = parse(loginBody, body);
    try {
      return await mapAuth(() => local.login(email, password, meta(req)));
    } catch (e) {
      if (e instanceof AppError && ['INVALID_CREDENTIALS', 'ACCOUNT_LOCKED'].includes(e.code)) ipFail(ip);
      throw e;
    }
  }

  @AllowPendingPassword()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: AuthedRequest) {
    await requireLocal().logout(req.authToken ?? '');
  }

  @AllowPendingPassword()
  @Post('change-password')
  @HttpCode(200)
  async changePassword(@CurrentPrincipal() p: Principal, @Body() body: unknown, @Req() req: AuthedRequest, @RequestId() rid: string) {
    const local = requireLocal();
    const { currentPassword, newPassword } = parse(changeBody, body);
    const res = await mapAuth(() => local.changePassword(p.uid, currentPassword, newPassword, meta(req)));
    await audit({ actor: p, action: 'auth.change_password', resourceType: 'account', resourceId: p.uid, requestId: rid });
    return res;
  }
}

@Controller('admin/accounts')
export class AccountsAdminController {
  /** Danh sách tài khoản của trường kèm trạng thái đăng nhập (bản Local). */
  @Get()
  async list(@CurrentPrincipal() p: Principal) {
    requireSysAdmin(p);
    const local = localAuth();
    const people = await tcol(p.tenantId, 'people').limit(2000).get();
    const items = await Promise.all(
      people.docs.map(async (d) => {
        const acc = local ? await local.getAccount(d.id) : null;
        return {
          uid: d.id,
          displayName: d.get('displayName') as string,
          email: (d.get('email') as string) ?? null,
          unitId: (d.get('unitId') as string) ?? null,
          status: d.get('status') as string,
          account: acc ? { disabled: acc.disabled, mustChangePassword: acc.mustChangePassword, hasPassword: acc.hasPassword, lastLoginAt: acc.lastLoginAt } : null,
        };
      }),
    );
    items.sort((a, b) => a.displayName.localeCompare(b.displayName, 'vi'));
    return { mode: identity().kind, items };
  }

  /** Nhập CSV: dryRun=true chỉ kiểm tra; thật thì trả mật khẩu tạm của tài khoản mới (một lần duy nhất). */
  @Post('import')
  @HttpCode(200)
  async import(@CurrentPrincipal() p: Principal, @Body() body: unknown, @RequestId() rid: string) {
    requireSysAdmin(p);
    const { csv, dryRun } = parse(importBody, body);
    const plan = await planImport(p.tenantId, csv);
    if (plan.errors.length) throw unprocessable('IMPORT_INVALID', plan.errors.join(' '), { errors: plan.errors, rows: [] });
    const invalid = plan.rows.filter((r) => r.errors.length);
    if (dryRun) return { dryRun: true, rows: plan.rows, valid: plan.rows.length - invalid.length, invalid: invalid.length };
    if (invalid.length) throw unprocessable('IMPORT_INVALID', `Có ${invalid.length} dòng lỗi, chưa nhập dòng nào.`, { rows: plan.rows });
    const results = await applyImport(p.tenantId, plan.rows);
    await audit({
      actor: p,
      action: 'accounts.import',
      resourceType: 'accounts',
      resourceId: p.tenantId,
      requestId: rid,
      detail: `${results.filter((r) => r.action === 'CREATE').length} tạo mới, ${results.filter((r) => r.action === 'UPDATE').length} cập nhật`,
    });
    return { dryRun: false, results };
  }

  @Post(':uid/reset-password')
  @HttpCode(200)
  async resetPassword(@CurrentPrincipal() p: Principal, @Param('uid') uid: string, @RequestId() rid: string) {
    requireSysAdmin(p);
    const local = requireLocal();
    await assertManageable(p, uid);
    const temporaryPassword = await mapAuth(() => local.adminResetPassword(uid));
    await audit({ actor: p, action: 'auth.reset_password', resourceType: 'account', resourceId: uid, requestId: rid });
    return { temporaryPassword, mustChangePassword: true };
  }

  @Post(':uid/disable')
  @HttpCode(200)
  async disable(@CurrentPrincipal() p: Principal, @Param('uid') uid: string, @Body() body: unknown, @RequestId() rid: string) {
    requireSysAdmin(p);
    const local = requireLocal();
    await assertManageable(p, uid);
    const { disabled } = parse(disableBody, body);
    await mapAuth(() => local.setDisabled(uid, disabled));
    await audit({ actor: p, action: disabled ? 'auth.disable' : 'auth.enable', resourceType: 'account', resourceId: uid, requestId: rid });
    return { uid, disabled };
  }
}

/**
 * Quản trị một trường chỉ được đặt lại / khóa tài khoản thuộc DUY NHẤT trường mình
 * (tránh quản trị trường A chiếm tài khoản đang có quyền ở trường B), và không tự thao tác trên chính mình.
 */
async function assertManageable(p: Principal, uid: string) {
  if (uid === p.uid) throw forbidden('Dùng chức năng "Đổi mật khẩu" cho tài khoản của chính bạn.', 'SELF_FORBIDDEN');
  const [person, membership] = await Promise.all([tcol(p.tenantId, 'people').doc(uid).get(), db().collection('userTenants').doc(uid).get()]);
  if (!person.exists) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy tài khoản trong trường.');
  const tenants: string[] = membership.exists ? (membership.get('tenantIds') ?? []) : [];
  if (tenants.some((t) => t !== p.tenantId)) {
    throw forbidden('Tài khoản này thuộc nhiều trường — cần quản trị cấp hệ thống xử lý.', 'MULTI_TENANT_ACCOUNT');
  }
}
