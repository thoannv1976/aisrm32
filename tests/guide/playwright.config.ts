import { defineConfig } from '@playwright/test';

/**
 * Chụp màn hình cho Hướng dẫn sử dụng — chạy trên bản Local (node scripts/dev-local.mjs api|web, cổng 5174).
 * Mặc định mở cửa sổ Chrome thật, thao tác chậm để người xem theo dõi; GUIDE_HEADLESS=1 để chạy ẩn.
 *
 *   pnpm exec playwright test -c tests/guide/playwright.config.ts
 */
const headless = process.env.GUIDE_HEADLESS === '1';

export default defineConfig({
  testDir: '.',
  testMatch: /capture(-new)?\.spec\.ts/,
  timeout: 15 * 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.GUIDE_BASE_URL ?? 'http://localhost:5174',
    channel: 'chrome',
    headless,
    viewport: { width: 1440, height: 900 },
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    launchOptions: { slowMo: headless ? 0 : Number(process.env.GUIDE_SLOWMO ?? 250), args: ['--window-size=1460,1000'] },
    actionTimeout: 20_000,
  },
});
