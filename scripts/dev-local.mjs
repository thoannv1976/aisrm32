#!/usr/bin/env node
/**
 * Chạy bản Local trên máy phát triển (PostgreSQL + đăng nhập nội bộ + tệp trên ổ đĩa + AI nội bộ),
 * song song với bản dev dùng Firebase emulator.
 *
 *   node scripts/dev-local.mjs api     # API cổng 8092 (CSDL aisrm_dev)
 *   node scripts/dev-local.mjs web     # Web cổng 5174, gọi API 8092
 *   node scripts/dev-local.mjs seed    # Xóa và nạp lại dữ liệu mẫu vào aisrm_dev
 *
 * CHỈ DÙNG KHI PHÁT TRIỂN: khóa LOCAL_SECRET_KEY dưới đây là khóa dev cố định, không dùng khi cài thật.
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const what = process.argv[2] ?? 'api';

const env = {
  ...process.env,
  APP_ENV: 'local',
  DEPLOY_TARGET: 'local',
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://aisrm:aisrm_dev@127.0.0.1:5433/aisrm_dev',
  FILE_STORAGE_DIR: process.env.FILE_STORAGE_DIR ?? join(root, 'data', 'files-dev'),
  LOCAL_SECRET_KEY: process.env.LOCAL_SECRET_KEY ?? 'dev-only-local-secret-key-0123456789abcdef',
  LOCAL_AI_BASE_URL: process.env.LOCAL_AI_BASE_URL ?? 'http://127.0.0.1:8080',
  AI_MODE: 'mock',
  UNI_DATA360_MODE: 'mock',
  DEFAULT_TIMEZONE: 'Asia/Ho_Chi_Minh',
  PORT: '8092',
  CORS_ORIGINS: 'http://localhost:5174,http://127.0.0.1:5174',
  API_PROXY_TARGET: 'http://127.0.0.1:8092',
};
for (const k of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST']) delete env[k];

const cmd = {
  api: ['--filter', '@aisrm/api', 'dev'],
  web: ['--filter', '@aisrm/web', 'exec', 'vite', '--port', '5174', '--strictPort'],
  seed: ['--filter', '@aisrm/api', 'seed'],
}[what];
if (!cmd) {
  console.error(`Không rõ lệnh "${what}" (api | web | seed)`);
  process.exit(2);
}
const child = spawn('pnpm', cmd, { cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32' });
child.on('exit', (code) => process.exit(code ?? 0));
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => child.kill(s));
