import { existsSync } from 'node:fs';

/**
 * Nạp biến môi trường cho chạy local (phải import đầu tiên trong main.ts).
 * Ưu tiên: biến đã đặt sẵn > .env (không commit) > .env.emulator (cấu hình emulator, không chứa bí mật).
 * Trên Cloud Run, biến môi trường do dịch vụ cung cấp; bí mật lấy từ Secret Manager.
 */
for (const file of ['.env', '.env.emulator']) {
  if (process.env.APP_ENV) break;
  if (existsSync(file)) process.loadEnvFile(file);
}
