/**
 * Port Identity — xác thực danh tính người gọi API (ADR-0003). Phân quyền (vai trò + phạm vi) KHÔNG nằm ở đây.
 * Bản Online: Firebase Auth ID token. Bản Local (L3): tài khoản nội bộ (infra/local-identity.ts).
 */
export interface VerifiedIdentity {
  uid: string;
  email: string | null;
  /** Bản Local: mật khẩu tạm do quản trị cấp — chỉ được gọi /auth/* cho đến khi đổi mật khẩu. */
  mustChangePassword?: boolean;
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
