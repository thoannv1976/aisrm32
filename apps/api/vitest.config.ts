import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
    env: {
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8180',
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
      FIREBASE_PROJECT_ID: 'demo-aisrm',
      APP_ENV: 'test',
    },
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
