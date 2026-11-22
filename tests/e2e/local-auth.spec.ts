import { expect, test, type Page } from '@playwright/test';

/**
 * Đăng nhập nội bộ (bản Local): quản trị cấp mật khẩu tạm → người dùng buộc đổi → dùng mật khẩu mới.
 * Chỉ chạy khi máy chủ ở chế độ đăng nhập nội bộ (IDENTITY_BACKEND=local).
 */

async function logoutIfNeeded(page: Page) {
  await page.goto('/');
  const logout = page.getByRole('button', { name: 'Đăng xuất' });
  const loginBtn = page.getByRole('button', { name: 'Đăng nhập', exact: true });
  await expect(logout.or(loginBtn).first()).toBeVisible();
  if (await logout.first().isVisible()) await logout.first().click();
  await expect(loginBtn).toBeVisible();
}

async function loginForm(page: Page, email: string, password: string) {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
}

test('quản trị đặt lại mật khẩu → người dùng buộc đổi mật khẩu tạm → đăng nhập bằng mật khẩu mới', async ({ page, request }) => {
  const cfg = await (await request.get('http://127.0.0.1:8090/api/v1/auth/config')).json();
  test.skip(cfg.mode !== 'local', 'Máy chủ không ở chế độ đăng nhập nội bộ');

  // Sai mật khẩu → thông báo chung
  await logoutIfNeeded(page);
  await loginForm(page, 'gv.chi@demo.aisrm.test', 'Sai-Mat-Khau-1');
  await expect(page.getByRole('alert')).toContainText('Email hoặc mật khẩu không đúng.');

  // Quản trị cấp mật khẩu tạm
  await page.getByRole('button', { name: /Quản trị hệ thống/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Chào');
  await page.getByRole('link', { name: 'Quản trị' }).click();
  await page.getByRole('tab', { name: 'Tài khoản' }).click();
  const row = page.getByRole('row', { name: /gv\.chi@demo\.aisrm\.test/ });
  page.once('dialog', (d) => d.accept());
  await row.getByRole('button', { name: 'Đặt lại mật khẩu' }).click();
  const temp = (await page.getByRole('status').locator('code').textContent())!.trim();
  expect(temp).toHaveLength(14);

  // Người dùng đăng nhập bằng mật khẩu tạm → buộc đổi
  await logoutIfNeeded(page);
  await loginForm(page, 'gv.chi@demo.aisrm.test', temp);
  await expect(page.getByRole('heading', { name: 'Đặt mật khẩu mới' })).toBeVisible();
  await page.getByLabel('Mật khẩu tạm').fill(temp);
  await page.getByLabel('Mật khẩu mới', { exact: true }).fill('ngan');
  await page.getByLabel('Nhập lại mật khẩu mới').fill('ngan');
  await page.getByRole('button', { name: 'Đổi mật khẩu' }).click();
  await expect(page.getByRole('alert')).toContainText('ít nhất 10 ký tự');
  await page.getByLabel('Mật khẩu mới', { exact: true }).fill('Chi-Mat-Khau-2026');
  await page.getByLabel('Nhập lại mật khẩu mới').fill('Chi-Mat-Khau-2026');
  await page.getByRole('button', { name: 'Đổi mật khẩu' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Chào');

  // Đăng xuất rồi đăng nhập lại bằng mật khẩu mới
  await logoutIfNeeded(page);
  await loginForm(page, 'gv.chi@demo.aisrm.test', 'Chi-Mat-Khau-2026');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Chào');
  await expect(page.getByRole('link', { name: 'Đổi mật khẩu' })).toBeVisible();
});
