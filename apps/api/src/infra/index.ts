/**
 * Điểm vào hạ tầng (ADR-0003). Chọn bản cài đặt theo DEPLOY_TARGET:
 *  - online (mặc định): Firestore + Cloud Storage + Firebase Auth;
 *  - local: PostgreSQL + ổ đĩa + tài khoản nội bộ (L2–L4).
 */
import type { CollectionRef, DataStore } from './datastore';
import type { FileStore } from './filestore';
import type { IdentityProvider } from './identity';
import { firebaseIdentity, firestoreStore, gcsFileStore } from './firebase';

export type { CollectionRef, CountQuery, DataStore, DocData, DocRef, DocSnap, Query, QueryDocSnap, QuerySnap, Tx, WhereOp, WriteBatch } from './datastore';
export type { FileStore } from './filestore';
export { IdentityError, type IdentityProvider, type VerifiedIdentity } from './identity';

export const config = {
  appEnv: process.env.APP_ENV ?? 'local',
  get deployTarget() {
    return (process.env.DEPLOY_TARGET ?? 'online') as 'online' | 'local';
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

function notYet(what: string): never {
  throw new Error(`DEPLOY_TARGET=local: ${what} chưa được cài đặt (kế hoạch L2–L4).`);
}

export function db(): DataStore {
  if (!_db) _db = config.deployTarget === 'local' ? notYet('DataStore PostgreSQL') : firestoreStore(config);
  return _db;
}

export function files(): FileStore {
  if (!_files) _files = config.deployTarget === 'local' ? notYet('FileStore ổ đĩa') : gcsFileStore(config);
  return _files;
}

export function identity(): IdentityProvider {
  if (!_identity) _identity = config.deployTarget === 'local' ? notYet('đăng nhập nội bộ') : firebaseIdentity(config);
  return _identity;
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
