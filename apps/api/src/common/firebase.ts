import { getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

let app: App | undefined;
let db: Firestore | undefined;

export const config = {
  appEnv: process.env.APP_ENV ?? 'local',
  projectId: process.env.FIREBASE_PROJECT_ID ?? process.env.GCP_PROJECT_ID ?? 'demo-aisrm',
  storageBucket: process.env.STORAGE_BUCKET ?? `${process.env.FIREBASE_PROJECT_ID ?? 'demo-aisrm'}.appspot.com`,
  aiMode: (process.env.AI_MODE ?? 'mock') as 'mock' | 'live',
  uniMode: (process.env.UNI_DATA360_MODE ?? 'mock') as 'mock' | 'live' | 'disabled',
  timezone: process.env.DEFAULT_TIMEZONE ?? 'Asia/Ho_Chi_Minh',
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES ?? 15 * 1024 * 1024),
  usingEmulators: !!process.env.FIRESTORE_EMULATOR_HOST,
};

export function firebaseApp(): App {
  if (!app) {
    app = getApps()[0] ?? initializeApp({ projectId: config.projectId, storageBucket: config.storageBucket });
  }
  return app;
}

export function firestore(): Firestore {
  if (!db) {
    db = getFirestore(firebaseApp());
    db.settings({ ignoreUndefinedProperties: true });
  }
  return db;
}

export const auth = () => getAuth(firebaseApp());
export const bucket = () => getStorage(firebaseApp()).bucket();

/** Tham chiếu collection trong phạm vi tenant. Không bao giờ nhận tenantId từ client chưa kiểm tra. */
export function tcol(tenantId: string, name: string) {
  return firestore().collection('tenants').doc(tenantId).collection(name);
}

export const nowIso = () => new Date().toISOString();
