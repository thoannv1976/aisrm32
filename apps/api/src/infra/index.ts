/**
 * Điểm vào hạ tầng (ADR-0003). Chọn bản cài đặt theo DEPLOY_TARGET:
 *  - online (mặc định): Firestore + Cloud Storage + Firebase Auth;
 *  - local: PostgreSQL + tài khoản nội bộ + tệp trên ổ đĩa.
 */
import type { CollectionRef, DataStore } from './datastore';
import type { FileStore } from './filestore';
import type { IdentityProvider } from './identity';
import { firebaseIdentity, firestoreStore, gcsFileStore } from './firebase';
import { diskFileStore } from './disk-filestore';
import { LocalIdentity } from './local-identity';
import { postgresStore } from './postgres';

export type { CollectionRef, CountQuery, DataStore, DocData, DocRef, DocSnap, Query, QueryDocSnap, QuerySnap, Tx, WhereOp, WriteBatch } from './datastore';
export type { FileStore } from './filestore';
export { IdentityError, type IdentityProvider, type VerifiedIdentity } from './identity';
export { AuthFailure, LocalIdentity, PASSWORD_POLICY_TEXT, passwordPolicyError, type LoginResult } from './local-identity';

export const config = {
  appEnv: process.env.APP_ENV ?? 'local',
  get deployTarget() {
    return (process.env.DEPLOY_TARGET ?? 'online') as 'online' | 'local';
  },
  /** Kho dữ liệu: mặc định theo DEPLOY_TARGET; DATA_BACKEND cho phép chạy riêng PostgreSQL (vd. test L2 khi đăng nhập vẫn dùng emulator). */
  get dataBackend() {
    return (process.env.DATA_BACKEND ?? (this.deployTarget === 'local' ? 'postgres' : 'firestore')) as 'firestore' | 'postgres';
  },
  /** Đăng nhập: mặc định theo DEPLOY_TARGET; IDENTITY_BACKEND=local cho phép chạy riêng (vd. test L3). */
  get identityBackend() {
    return (process.env.IDENTITY_BACKEND ?? (this.deployTarget === 'local' ? 'local' : 'firebase')) as 'firebase' | 'local';
  },
  /** Lưu tệp: gcs (Online) hoặc disk (Local). */
  get fileBackend() {
    return (process.env.FILE_BACKEND ?? (this.deployTarget === 'local' ? 'disk' : 'gcs')) as 'gcs' | 'disk';
  },
  get fileStorageDir() {
    return process.env.FILE_STORAGE_DIR ?? './data/files';
  },
  get databaseUrl() {
    return process.env.DATABASE_URL ?? '';
  },
  projectId: process.env.FIREBASE_PROJECT_ID ?? process.env.GCP_PROJECT_ID ?? 'demo-aisrm',
  storageBucket: process.env.STORAGE_BUCKET ?? `${process.env.FIREBASE_PROJECT_ID ?? 'demo-aisrm'}.appspot.com`,
  aiMode: (process.env.AI_MODE ?? 'mock') as 'mock' | 'live',
  uniMode: (process.env.UNI_DATA360_MODE ?? 'mock') as 'mock' | 'live' | 'disabled',
  timezone: process.env.DEFAULT_TIMEZONE ?? 'Asia/Ho_Chi_Minh',
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES ?? 15 * 1024 * 1024),
  get usingEmulators() {
    return !!process.env.FIRESTORE_EMULATOR_HOST;
  },
};

let _db: DataStore | undefined;
let _files: FileStore | undefined;
let _identity: IdentityProvider | undefined;

export function db(): DataStore {
  if (!_db) {
    if (config.dataBackend === 'postgres') {
      if (!config.databaseUrl) throw new Error('DATA_BACKEND=postgres nhưng chưa đặt DATABASE_URL.');
      _db = postgresStore({ databaseUrl: config.databaseUrl, maxConnections: Number(process.env.DATABASE_POOL_MAX ?? 10) });
    } else _db = firestoreStore(config);
  }
  return _db;
}

export function files(): FileStore {
  if (!_files) _files = config.fileBackend === 'disk' ? diskFileStore(config.fileStorageDir) : gcsFileStore(config);
  return _files;
}

export function identity(): IdentityProvider {
  if (!_identity) _identity = config.identityBackend === 'local' ? new LocalIdentity(db) : firebaseIdentity(config);
  return _identity;
}

/** Đăng nhập nội bộ (chỉ khi bản Local); null nếu đang dùng Firebase Auth. */
export function localAuth(): LocalIdentity | null {
  const id = identity();
  return id instanceof LocalIdentity ? id : null;
}

/** Cho test / bản Local thay bản cài đặt. */
export function setInfra(over: { db?: DataStore; files?: FileStore; identity?: IdentityProvider }) {
  if (over.db) _db = over.db;
  if (over.files) _files = over.files;
  if (over.identity) _identity = over.identity;
}

/** Tham chiếu collection trong phạm vi tenant. Không bao giờ nhận tenantId từ client chưa kiểm tra. */
export function tcol(tenantId: string, name: string): CollectionRef {
  return db().collection('tenants').doc(tenantId).collection(name);
}

export const increment = (n: number) => db().increment(n);
export const nowIso = () => new Date().toISOString();
