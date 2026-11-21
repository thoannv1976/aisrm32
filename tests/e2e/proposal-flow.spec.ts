import { expect, test, type Page } from '@playwright/test';

/**
 * Kịch bản xuyên suốt qua giao diện theo đúng vai trò (dữ liệu seed giả lập):
 * giảng viên tạo và nộp hồ sơ → đầu mối khoa xác nhận → chuyên viên trình → Phó HT phê duyệt → đề tài được lập.
 */

const PDF = { name: 'tai-lieu.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% e2e\n') };

async function login(page: Page, roleLabel: string) {
  await page.goto('/');
  const logout = page.getByRole('button', { name: 'Đăng xuất' });
  const loginBtn = page.getByRole('button', { name: 'Đăng nhập', exact: true });
  await expect(logout.or(loginBtn)).toBeVisible();
  if (await logout.isVisible()) await logout.click();
  await page.getByRole('button', { name: new RegExp(roleLabel) }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Chào');
}

async function act(page: Page, action: string, comment?: string) {
  await page.getByRole('button', { name: action, exact: true }).click();
  const dialog = page.getByRole('dialog');
  if (comment) await dialog.getByRole('textbox').fill(comment);
  await dialog.getByRole('button', { name: `Xác nhận: ${action}` }).click();
  await expect(dialog).toBeHidden();
}

test('đăng ký đề tài đi xuyên suốt đến khi lập đề tài', async ({ page }) => {
  const title = `Đề tài E2E ${Date.now()}`;

  // 1. Giảng viên tạo hồ sơ từ đợt đang mở
  await login(page, 'Giảng viên / chủ nhiệm đề tài');
  await page.getByRole('link', { name: 'Đợt đăng ký' }).click();
  const call = page.locator('article', { hasText: 'Đợt đăng ký đề tài KH&CN cấp trường' });
  await call.getByRole('button', { name: '+ Tạo hồ sơ đề xuất' }).click();
  await expect(page).toHaveURL(/\/proposals\/.+/);
  const url = page.url();

  // 2. Điền thuyết minh, lưu nháp
  await page.getByLabel(/Tên đề tài/).fill(title);
  await page.getByLabel(/Kinh phí đề xuất/).fill('95000000');
  await page.getByLabel(/Thời gian thực hiện/).fill('12');
  await page.getByLabel(/Lĩnh vực nghiên cứu/).selectOption('Kinh tế');
  await page.getByLabel(/Tính cấp thiết/).fill('Nhu cầu thực tiễn của doanh nghiệp.');
  await page.getByLabel(/Mục tiêu nghiên cứu/).fill('Đề xuất mô hình quản trị chuỗi cung ứng xanh.');
  await page.getByLabel(/Phương pháp nghiên cứu/).fill('Khảo sát, phân tích định lượng.');
  await page.getByLabel(/Sản phẩm dự kiến/).fill('01 bài báo, 01 báo cáo chính sách.');
  await page.getByRole('button', { name: /Lưu nháp/ }).click();
  await expect(page.getByText(/Đã lưu lúc/)).toBeVisible();
  await expect(page.getByText('Thiếu tài liệu bắt buộc: Thuyết minh đề tài (theo mẫu).')).toBeVisible();

  // 3. Đính kèm tài liệu bắt buộc
  await page.getByRole('tab', { name: /Tài liệu/ }).click();
  for (const label of ['Thuyết minh đề tài (theo mẫu)', 'Dự toán kinh phí']) {
    const row = page.locator('li', { hasText: label }).first();
    await row.locator('input[type=file]').setInputFiles(PDF);
    await expect(row.getByRole('button', { name: 'tai-lieu.pdf' })).toBeVisible();
  }
  await expect(page.getByText('✓ Hồ sơ đã đủ thông tin và tài liệu bắt buộc.')).toBeVisible();

  // 4. Nộp
  await act(page, 'Nộp hồ sơ');
  await expect(page.getByText('Đơn vị xem xét').first()).toBeVisible();

  // 5. Đầu mối khoa xác nhận (thấy trong trang làm việc)
  await login(page, 'Đầu mối KH Khoa KTQT');
  await expect(page.getByRole('cell', { name: new RegExp(title) })).toBeVisible();
  await page.goto(url);
  await act(page, 'Đơn vị xác nhận');
  await expect(page.getByText('Phòng KH xử lý').first()).toBeVisible();

  // 6. Chuyên viên trình phê duyệt
  await login(page, 'Chuyên viên Phòng QLKH');
  await page.goto(url);
  await act(page, 'Trình phê duyệt');

  // 7. Phó Hiệu trưởng phê duyệt
  await login(page, 'Phó Hiệu trưởng');
  await page.goto(url);
  await act(page, 'Phê duyệt', 'Đồng ý triển khai.');
  await expect(page.getByText('Đề xuất đã được phê duyệt và lập đề tài.')).toBeVisible();

  // 8. Đề tài đã được lập, chờ giao nhiệm vụ
  await page.getByRole('link', { name: 'Mở đề tài →' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
  await expect(page.getByText('Chờ ký hợp đồng / giao nhiệm vụ').first()).toBeVisible();

  // Lịch sử đề xuất đủ 4 bước
  await page.goto(url);
  await page.getByRole('tab', { name: 'Lịch sử xử lý' }).click();
  for (const step of ['Nộp hồ sơ', 'Đơn vị xác nhận', 'Trình phê duyệt', 'Phê duyệt']) {
    await expect(page.locator('ol li', { hasText: step }).first()).toBeVisible();
  }
});

test('người ngoài phạm vi không xem được hồ sơ khoa khác', async ({ page }) => {
  await login(page, 'Đầu mối KH Khoa KTQT');
  await page.goto('/proposals/dx1');
  await expect(page.getByRole('alert')).toContainText('Không tìm thấy dữ liệu hoặc bạn không có quyền xem.');
});

test('sinh viên không thấy menu điều hành, quản trị', async ({ page }) => {
  await login(page, 'Sinh viên');
  const nav = page.getByRole('navigation', { name: 'Điều hướng chính' });
  await expect(nav.getByRole('link', { name: 'Đề xuất' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Điều hành & báo cáo' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Quản trị' })).toHaveCount(0);
});
