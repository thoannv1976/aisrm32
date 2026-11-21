import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import type { AiProvider } from '@aisrm/shared';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { AppError } from '../common/errors';
import { config, firestore } from '../common/firebase';

/**
 * Kho bí mật cho khóa API của nhà cung cấp AI.
 * - Cloud (staging/production): Google Secret Manager. Secret `aisrm-{tenant}-{provider}-api-key` được tạo sẵn
 *   khi khởi tạo môi trường; service account API chỉ có quyền thêm phiên bản và đọc các secret có tiền tố `aisrm-`.
 * - Local (emulator): mã hóa AES-256-GCM, lưu trong emulator — chỉ để chạy thử, không dùng cho dữ liệu thật.
 * Khóa không bao giờ được trả lại qua API, không ghi log.
 */
export interface SecretStore {
  put(tenantId: string, provider: AiProvider, value: string): Promise<string>;
  get(tenantId: string, provider: AiProvider): Promise<string | null>;
  remove(tenantId: string, provider: AiProvider): Promise<void>;
}

export const secretId = (tenantId: string, provider: AiProvider) => `aisrm-${tenantId}-${provider}-api-key`;

class GcpSecretStore implements SecretStore {
  private client = new SecretManagerServiceClient();
  private name = (t: string, p: AiProvider) => `projects/${config.projectId}/secrets/${secretId(t, p)}`;

  async put(tenantId: string, provider: AiProvider, value: string) {
    const parent = this.name(tenantId, provider);
    try {
      const [version] = await this.client.addSecretVersion({ parent, payload: { data: Buffer.from(value, 'utf8') } });
      // Vô hiệu hóa các phiên bản cũ (giữ lại để kiểm toán, không dùng nữa)
      const [versions] = await this.client.listSecretVersions({ parent, filter: 'state:ENABLED' });
      await Promise.all(
        versions.filter((v) => v.name !== version.name).map((v) => this.client.disableSecretVersion({ name: v.name! })),
      );
      return version.name ?? parent;
    } catch (e) {
      const code = (e as { code?: number }).code;
      if (code === 5) {
        throw new AppError(
          409,
          'SECRET_NOT_PROVISIONED',
          `Chưa khởi tạo secret ${secretId(tenantId, provider)} trên Secret Manager. Quản trị hạ tầng cần chạy lệnh khởi tạo (xem docs/TRIEN_KHAI_STAGING.md).`,
        );
      }
      if (code === 7) throw new AppError(403, 'SECRET_FORBIDDEN', 'Service account API chưa có quyền ghi Secret Manager.');
      throw e;
    }
  }

  async get(tenantId: string, provider: AiProvider) {
    try {
      const [v] = await this.client.accessSecretVersion({ name: `${this.name(tenantId, provider)}/versions/latest` });
      const data = v.payload?.data;
      return data ? Buffer.from(data as Uint8Array).toString('utf8') : null;
    } catch (e) {
      const code = (e as { code?: number }).code;
      if (code === 5 || code === 9) return null; // chưa có / phiên bản bị vô hiệu
      throw e;
    }
  }

  async remove(tenantId: string, provider: AiProvider) {
    const parent = this.name(tenantId, provider);
    try {
      const [versions] = await this.client.listSecretVersions({ parent, filter: 'state:ENABLED' });
      await Promise.all(versions.map((v) => this.client.disableSecretVersion({ name: v.name! })));
    } catch (e) {
      if ((e as { code?: number }).code !== 5) throw e;
    }
  }
}

class LocalEncryptedStore implements SecretStore {
  private key = createHash('sha256').update(process.env.LOCAL_SECRET_KEY ?? 'aisrm-local-emulator-only').digest();
  private ref = (t: string, p: AiProvider) => firestore().collection('_localSecrets').doc(secretId(t, p));

  async put(tenantId: string, provider: AiProvider, value: string) {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([c.update(value, 'utf8'), c.final()]);
    await this.ref(tenantId, provider).set({ iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: enc.toString('base64') });
    return `local:${secretId(tenantId, provider)}`;
  }

  async get(tenantId: string, provider: AiProvider) {
    const s = await this.ref(tenantId, provider).get();
    if (!s.exists) return null;
    const d = createDecipheriv('aes-256-gcm', this.key, Buffer.from(s.get('iv'), 'base64'));
    d.setAuthTag(Buffer.from(s.get('tag'), 'base64'));
    return Buffer.concat([d.update(Buffer.from(s.get('data'), 'base64')), d.final()]).toString('utf8');
  }

  async remove(tenantId: string, provider: AiProvider) {
    await this.ref(tenantId, provider).delete();
  }
}

let store: SecretStore | undefined;
export function secretStore(): SecretStore {
  if (!store) store = process.env.FIRESTORE_EMULATOR_HOST ? new LocalEncryptedStore() : new GcpSecretStore();
  return store;
}

/** Cho phép test thay kho bí mật. */
export function setSecretStoreForTest(s: SecretStore) {
  store = s;
}
