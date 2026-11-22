import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { usingEmulators } from './auth';

/** Chỉ tải khi chế độ đăng nhập là Firebase (bản Online) — xem lib/auth.ts. */
const env = import.meta.env;

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY ?? 'demo-key',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? 'demo-aisrm.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? 'demo-aisrm',
});

export const auth = getAuth(app);

if (usingEmulators) {
  connectAuthEmulator(auth, env.VITE_AUTH_EMULATOR_URL ?? 'http://127.0.0.1:9099', { disableWarnings: true });
}
