import type { Role } from './roles';

export type ScopeType = 'tenant' | 'unit';

export interface RoleBinding {
  role: Role;
  scopeType: ScopeType;
  /** Mã đơn vị khi scopeType = 'unit'. */
  scopeId?: string | null;
  /** ISO datetime; null = không giới hạn. */
  validFrom?: string | null;
  validUntil?: string | null;
  /** Ủy quyền: uid người ủy quyền. */
  delegatedBy?: string | null;
}

export interface Principal {
  uid: string;
  tenantId: string;
  displayName: string;
  email?: string | null;
  unitId?: string | null;
  bindings: RoleBinding[];
}

export function isBindingActive(b: RoleBinding, now: Date = new Date()): boolean {
  if (b.validFrom && new Date(b.validFrom) > now) return false;
  if (b.validUntil && new Date(b.validUntil) < now) return false;
  return true;
}

/**
 * Người dùng có một trong các vai trò `roles` áp dụng cho đơn vị đích không?
 * `unitPath` = [unitId, ...ancestorIds] của đối tượng; null = chỉ chấp nhận vai trò cấp trường.
 */
export function hasRoleFor(
  p: Pick<Principal, 'bindings'>,
  roles: readonly Role[],
  unitPath: readonly string[] | null,
  now: Date = new Date(),
): boolean {
  return p.bindings.some((b) => {
    if (!roles.includes(b.role) || !isBindingActive(b, now)) return false;
    if (b.scopeType === 'tenant') return true;
    return !!unitPath && !!b.scopeId && unitPath.includes(b.scopeId);
  });
}

export function hasAnyRole(p: Pick<Principal, 'bindings'>, roles: readonly Role[], now: Date = new Date()): boolean {
  return p.bindings.some((b) => roles.includes(b.role) && isBindingActive(b, now));
}

export function activeRoles(p: Pick<Principal, 'bindings'>, now: Date = new Date()): Role[] {
  return [...new Set(p.bindings.filter((b) => isBindingActive(b, now)).map((b) => b.role))];
}

/** Đơn vị (đường dẫn) mà người dùng có vai trò cấp đơn vị. */
export function unitScopesFor(p: Pick<Principal, 'bindings'>, roles: readonly Role[], now: Date = new Date()): string[] {
  return p.bindings
    .filter((b) => roles.includes(b.role) && isBindingActive(b, now) && b.scopeType === 'unit' && b.scopeId)
    .map((b) => b.scopeId as string);
}
