/**
 * Port Identity — xác thực danh tính người gọi API (ADR-0003). Phân quyền (vai trò + phạm vi) KHÔNG nằm ở đây.
 * Bản Online: Firebase Auth ID token. Bản Local (L3): tài khoản nội bộ / OIDC.
 */
export interface VerifiedIdentity {
  uid: string;
  email: string | null;
}

export class IdentityError extends Error {
  constructor(
    readonly code: 'TOKEN_INVALID' | 'TOKEN_EXPIRED' | 'TOKEN_REVOKED' | 'ACCOUNT_DISABLED',
    message: string,
  ) {
    super(message);
  }
}

export interface IdentityProvider {
  readonly kind: 'firebase' | 'local' | 'oidc';
  verifyToken(token: string): Promise<VerifiedIdentity>;
  /** Tạo / cập nhật tài khoản (seed, quản trị). Trả về uid. */
  upsertUser(input: { email: string; password?: string; displayName: string }): Promise<string>;
  findUidByEmail(email: string): Promise<string | null>;
}
