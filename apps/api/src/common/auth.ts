import {
  createParamDecorator,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
  type NestMiddleware,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Principal, RoleBinding, Unit } from '@aisrm/shared';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { AppError, forbidden } from './errors';
import { auth, firestore, tcol } from './firebase';

export interface AuthedRequest extends Request {
  requestId?: string;
  principal?: Principal;
}

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const CurrentPrincipal = createParamDecorator((_: unknown, ctx: ExecutionContext): Principal => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  if (!req.principal) throw forbidden();
  return req.principal;
});

export const RequestId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().requestId ?? '-';
});

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: AuthedRequest, res: Response, next: NextFunction) {
    const incoming = req.header('x-request-id');
    req.requestId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    res.setHeader('x-request-id', req.requestId);
    next();
  }
}

/**
 * Xác minh Firebase ID token, xác định tenant (kiểm tra membership — không tin tenantId từ client),
 * nạp vai trò hiện hành từ dữ liệu quyền ở backend (không lấy vai trò do trình duyệt gửi).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new AppError(401, 'UNAUTHENTICATED', 'Chưa đăng nhập.');

    let decoded;
    try {
      decoded = await auth().verifyIdToken(token, true);
    } catch {
      throw new AppError(401, 'UNAUTHENTICATED', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
    }

    req.principal = await loadPrincipal(decoded.uid, req.header('x-tenant-id') ?? null);
    return true;
  }
}

export async function loadPrincipal(uid: string, requestedTenant: string | null): Promise<Principal> {
  const membership = await firestore().collection('userTenants').doc(uid).get();
  const tenantIds: string[] = membership.exists ? (membership.get('tenantIds') ?? []) : [];
  if (tenantIds.length === 0) throw forbidden('Tài khoản chưa được cấp quyền truy cập trường nào.', 'NO_TENANT');
  const tenantId = requestedTenant ?? tenantIds[0];
  if (!tenantIds.includes(tenantId)) throw forbidden('Bạn không thuộc trường được yêu cầu.', 'TENANT_FORBIDDEN');

  const [person, bindingsSnap] = await Promise.all([
    tcol(tenantId, 'people').doc(uid).get(),
    tcol(tenantId, 'roleBindings').where('uid', '==', uid).get(),
  ]);
  if (!person.exists || person.get('status') !== 'ACTIVE') {
    throw forbidden('Tài khoản đã ngừng hoạt động tại trường này.', 'ACCOUNT_INACTIVE');
  }
  const bindings = bindingsSnap.docs.map((d) => {
    const b = d.data();
    return {
      role: b.role,
      scopeType: b.scopeType,
      scopeId: b.scopeId ?? null,
      validFrom: b.validFrom ?? null,
      validUntil: b.validUntil ?? null,
      delegatedBy: b.delegatedBy ?? null,
    } as RoleBinding;
  });
  return {
    uid,
    tenantId,
    displayName: person.get('displayName'),
    email: person.get('email') ?? null,
    unitId: person.get('unitId') ?? null,
    bindings,
  };
}

/** Đường dẫn đơn vị [unitId, ...ancestorIds] — dùng cho phân quyền theo phạm vi. */
export async function unitPathOf(tenantId: string, unitId: string): Promise<{ path: string[]; unit: Unit }> {
  const snap = await tcol(tenantId, 'units').doc(unitId).get();
  if (!snap.exists) throw new AppError(400, 'UNIT_NOT_FOUND', 'Đơn vị không tồn tại.');
  const unit = { id: snap.id, ...snap.data() } as Unit;
  return { path: [unit.id, ...(unit.ancestorIds ?? [])], unit };
}
