/**
 * Bản cài đặt Online (Google): Firestore, Cloud Storage, Firebase Auth.
 * Firestore Admin SDK có cùng hình dạng với port DataStore (khác ở generic/overload của SDK nên cần ép kiểu);
 * sự tương đương về hành vi được bảo đảm bằng bộ test tích hợp chạy qua port.
 * Tệp này là nơi DUY NHẤT trong src/ được import firebase-admin.
 */
import { getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import type { CollectionRef, DataStore, Tx, WriteBatch } from './datastore';
import type { FileStore } from './filestore';
import { IdentityError, type IdentityProvider } from './identity';

export interface FirebaseConfig {
  projectId: string;
  storageBucket: string;
}

let app: App | undefined;
function firebaseApp(cfg: FirebaseConfig): App {
  if (!app) app = getApps()[0] ?? initializeApp({ projectId: cfg.projectId, storageBucket: cfg.storageBucket });
  return app;
}

export function firestoreStore(cfg: FirebaseConfig): DataStore {
  const fs: Firestore = getFirestore(firebaseApp(cfg));
  fs.settings({ ignoreUndefinedProperties: true });
  return {
    kind: 'firestore',
    collection: (path) => fs.collection(path) as unknown as CollectionRef,
    runTransaction: (fn) => fs.runTransaction((tx) => fn(tx as unknown as Tx)),
    batch: () => fs.batch() as unknown as WriteBatch,
    increment: (n) => FieldValue.increment(n),
  };
}

export function gcsFileStore(cfg: FirebaseConfig): FileStore {
  const bucket = () => getStorage(firebaseApp(cfg)).bucket();
  return {
    kind: 'gcs',
    async save(path, data, opts) {
      await bucket().file(path).save(data, { contentType: opts.contentType, resumable: false, metadata: { metadata: opts.metadata ?? {} } });
    },
    async read(path) {
      const [buf] = await bucket().file(path).download();
      return buf;
    },
    async remove(path) {
      await bucket().file(path).delete({ ignoreNotFound: true });
    },
  };
}

export function firebaseIdentity(cfg: FirebaseConfig): IdentityProvider {
  const auth = () => getAuth(firebaseApp(cfg));
  return {
    kind: 'firebase',
    async verifyToken(token) {
      try {
        const d = await auth().verifyIdToken(token, true);
        return { uid: d.uid, email: d.email ?? null };
      } catch (e) {
        const code = (e as { code?: string }).code ?? '';
        if (code.includes('expired')) throw new IdentityError('TOKEN_EXPIRED', 'Phiên đăng nhập đã hết hạn.');
        if (code.includes('revoked')) throw new IdentityError('TOKEN_REVOKED', 'Phiên đăng nhập đã bị thu hồi.');
        if (code.includes('disabled')) throw new IdentityError('ACCOUNT_DISABLED', 'Tài khoản đã bị khóa.');
        throw new IdentityError('TOKEN_INVALID', 'Phiên đăng nhập không hợp lệ.');
      }
    },
    async upsertUser({ email, password, displayName }) {
      const existing = await auth()
        .getUserByEmail(email)
        .catch(() => null);
      if (existing) {
        await auth().updateUser(existing.uid, { displayName, ...(password ? { password } : {}) });
        return existing.uid;
      }
      const rec = await auth().createUser({ email, password, displayName, emailVerified: true });
      return rec.uid;
    },
    async findUidByEmail(email) {
      const u = await auth()
        .getUserByEmail(email)
        .catch(() => null);
      return u?.uid ?? null;
    },
  };
}

