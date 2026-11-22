import { defineConfig } from '@playwright/test';

/**
 * E2E chạy trên Firebase Emulator + dữ liệu seed.
 * Chuẩn bị: `pnpm emulators:fresh` và `pnpm seed` (hoặc dùng `pnpm test:e2e:ci`).
 * Dùng Chrome đã cài trên máy (channel: 'chrome') — không cần tải trình duyệt của Playwright.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    channel: process.env.PW_CHANNEL ?? 'chrome',
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    { command: 'pnpm --filter @aisrm/api dev', url: 'http://127.0.0.1:8090/api/v1/health', reuseExistingServer: true, timeout: 120_000 },
    { command: 'pnpm --filter @aisrm/web dev', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 120_000 },
  ],
});
