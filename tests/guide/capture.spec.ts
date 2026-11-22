/**
 * Kịch bản chụp màn hình cho Hướng dẫn sử dụng AI-SRM (bản Local, dữ liệu mẫu).
 * Mỗi chương đi đúng thao tác thật theo vai trò; ảnh lưu ở docs/huong-dan-su-dung/anh, ghi chú ở manifest-*.json.
 * Chạy lại được: bước 00 nạp lại dữ liệu mẫu vào CSDL aisrm_dev.
 */
import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { DEMO_PASSWORD } from '../../apps/api/scripts/seed-data';
import { act, apiAs, btn, loginAs, main, nav, PDF, saveManifest, shot } from './helpers';

test.describe.configure({ mode: 'serial' });

const GV = 'gv.binh@demo.aisrm.test';
const SV = 'sv.an@demo.aisrm.test';
const DM = 'dm.ktqt@demo.aisrm.test';
const CV = 'cv.linh@demo.aisrm.test';
const CV2 = 'cv.minh@demo.aisrm.test';
const TP = 'tp.hung@demo.aisrm.test';
const PHT = 'pht.nam@demo.aisrm.test';
const ADMIN = 'admin@demo.aisrm.test';

const TITLE = 'Ứng dụng trí tuệ nhân tạo trong dự báo nhu cầu xuất khẩu nông sản Việt Nam';
let proposalUrl = '';
let proposalCode = '';

let page: Page;
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  page.on('dialog', (d) => void d.accept(d.type() === 'prompt' ? 'Đã hoàn thành theo kế hoạch.' : undefined));
});
test.afterAll(async () => {
  saveManifest('all');
  await page.close();
});

test('00 chuẩn bị: nạp lại dữ liệu mẫu, bật AI nội bộ', async () => {
  test.setTimeout(10 * 60_000);
  if (process.env.GUIDE_SKIP_SEED !== '1') {
    execFileSync(process.execPath, [join(__dirname, '..', '..', 'scripts', 'dev-local.mjs'), 'seed'], { stdio: 'inherit' });
  }
  await page.goto('/');
  const ov = await apiAs(page, ADMIN, 'GET', '/ai/admin/overview');
  let model = (ov.models as { id: string; provider: string; modelId: string }[]).find((m) => m.provider === 'local' && m.modelId === 'ornith-1.5-9b-q4');
  model ??= await apiAs(page, ADMIN, 'POST', '/ai/admin/models', { provider: 'local', modelId: 'ornith-1.5-9b-q4', label: 'Ornith 9B (máy chủ AI nội bộ)', inputPricePerMTokUsd: '0', outputPricePerMTokUsd: '0' });
  await apiAs(page, ADMIN, 'PUT', '/ai/admin/settings', { ...ov.settings, mode: 'live', defaultModelId: model!.id, maxOutputTokens: Math.max(ov.settings.maxOutputTokens, 800) });
  // Nạp model vào GPU trước để các bước AI phía sau không phải chờ lâu
  await apiAs(page, ADMIN, 'POST', '/ai/admin/providers/local/warmup', { modelConfigId: model!.id });
});

// ---------------------------------------------------------------- Chương 1: dùng chung
test('01 dùng chung', async () => {
  test.setTimeout(10 * 60_000);
  await page.goto('/');
  await page.evaluate(() => localStorage.removeItem('aisrm.session'));
  await page.goto('/');
  const email = page.getByLabel('Email');
  await email.fill(GV);
  await page.getByLabel('Mật khẩu').fill(DEMO_PASSWORD);
  await shot(page, '01-01-dang-nhap', 'Màn hình đăng nhập', [
    { at: email, note: 'Nhập email tài khoản do quản trị hệ thống cấp.' },
    { at: page.getByLabel('Mật khẩu'), note: 'Nhập mật khẩu.' },
    { at: btn(page, 'Đăng nhập'), note: 'Bấm "Đăng nhập".' },
  ]);
  await btn(page, 'Đăng nhập').click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Chào');

  await shot(page, '01-02-trang-lam-viec', 'Trang làm việc', [
    { at: page.getByRole('navigation', { name: 'Điều hướng chính' }).getByRole('link'), all: true, note: 'Menu chức năng — chỉ hiện các mục phù hợp vai trò đang chọn.' },
    { at: page.locator('header select').first(), note: 'Chọn vai trò làm việc (khi tài khoản có nhiều vai trò).' },
    { at: page.locator('header').getByRole('button', { name: /🔔|Thông báo/ }).first(), note: 'Thông báo: hồ sơ cần xử lý, kết quả xét duyệt, nhắc hạn.' },
    { at: page.locator('header').getByRole('link', { name: 'Đổi mật khẩu' }), note: 'Đổi mật khẩu.' },
    { at: page.locator('header').getByRole('button', { name: 'Đăng xuất' }), note: 'Đăng xuất khi dùng xong (nhất là máy dùng chung).' },
    { at: main(page).getByText('Việc cần tôi xử lý').last(), note: 'Danh sách việc đang chờ bạn — bấm mã hồ sơ để mở.' },
    { at: main(page).getByText('Thời hạn trong 30 ngày'), note: 'Các hạn sắp tới và hạn đã quá.' },
  ]);

  await page.locator('header').getByRole('button', { name: /🔔|Thông báo/ }).first().click();
  await shot(page, '01-03-thong-bao', 'Xem thông báo', [{ at: page.getByText('Thông báo', { exact: true }).last(), note: 'Danh sách thông báo mới nhất; chấm xanh là thông báo chưa đọc.' }]);
  await page.locator('header').getByRole('button', { name: /🔔|Thông báo/ }).first().click();

  await page.locator('header').getByRole('link', { name: 'Đổi mật khẩu' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const pw = main(page).locator('input[type=password]');
  await shot(page, '01-04-doi-mat-khau', 'Đổi mật khẩu', [
    { at: pw.nth(0), note: 'Nhập mật khẩu hiện tại.' },
    { at: pw.nth(1), note: 'Nhập mật khẩu mới theo quy định độ mạnh hiển thị trên trang.' },
    { at: pw.nth(2), note: 'Nhập lại mật khẩu mới.' },
    { at: main(page).getByRole('button').last(), note: 'Bấm để lưu. Các phiên đăng nhập khác của bạn sẽ bị đăng xuất.' },
  ]);

  // Hỏi đáp quy chế bằng AI nội bộ
  await nav(page, 'Hỏi đáp quy chế').click();
  const q = main(page).getByRole('textbox').first();
  await shot(page, '01-05-hoi-dap-quy-che', 'Hỏi đáp quy chế', [
    { at: main(page).getByText('Gợi ý câu hỏi'), note: 'Bấm một câu gợi ý để hỏi nhanh.' },
    { at: q, note: 'Hoặc gõ câu hỏi bằng lời tự nhiên.' },
    { at: btn(main(page), 'Hỏi'), note: 'Bấm "Hỏi".' },
    { at: main(page).getByText('Phạm vi tra cứu'), note: 'Các văn bản quy chế đang được dùng để tra cứu.' },
  ]);
  await q.fill('Đề tài được gia hạn tối đa mấy lần, mỗi lần bao lâu?');
  await btn(main(page), 'Hỏi').click();
  await expect(main(page).getByText('Đang tra cứu quy chế…')).toBeHidden({ timeout: 180_000 });
  const answer = main(page).locator('article, .card').filter({ hasText: 'gia hạn' }).last();
  await shot(page, '01-06-cau-tra-loi', 'Câu trả lời có dẫn căn cứ', [
    { at: answer, note: 'Câu trả lời luôn ghi căn cứ (khoản, điều). Bấm vào căn cứ để xem nguyên văn điều khoản.' },
  ]);
  await main(page).getByRole('tab', { name: /Văn bản quy chế/ }).click();
  await shot(page, '01-07-van-ban-quy-che', 'Danh sách văn bản quy chế', [{ at: main(page).locator('table').first(), note: 'Văn bản quy chế đang áp dụng; bấm tên văn bản để xem các điều, khoản.' }]);

  // Hồ sơ khoa học
  await nav(page, 'Hồ sơ khoa học').click();
  await shot(page, '01-08-ho-so-khoa-hoc', 'Lý lịch khoa học', [
    { at: btn(main(page), '✎ Cập nhật thông tin'), note: 'Cập nhật học hàm, học vị, ORCID, chuyên môn, hướng nghiên cứu.' },
    { at: btn(main(page), '🖨 In / Lưu PDF'), note: 'In hoặc lưu lý lịch khoa học ra PDF.' },
  ]);
  await btn(main(page), '✎ Cập nhật thông tin').click();
  await main(page).getByLabel('Chuyên môn').fill('Kinh tế quốc tế; chuỗi cung ứng; logistics');
  await main(page).getByLabel('Hướng nghiên cứu').fill('Chuỗi giá trị toàn cầu, logistics xanh, ứng dụng AI trong thương mại');
  await shot(page, '01-09-cap-nhat-ho-so', 'Cập nhật lý lịch khoa học', [
    { at: main(page).getByLabel('ORCID'), note: 'Mã ORCID (nếu có) giúp đối chiếu công bố.' },
    { at: main(page).getByLabel('Chuyên môn'), note: 'Chuyên môn — dùng để gợi ý mời phản biện đúng lĩnh vực.' },
    { at: btn(main(page), 'Lưu'), note: 'Bấm "Lưu".' },
  ]);
  await btn(main(page), 'Lưu').click();
  saveManifest('all');
});

// ---------------------------------------------------------------- Chương 2: giảng viên / chủ nhiệm
test('02 giảng viên lập và nộp đề xuất', async () => {
  test.setTimeout(10 * 60_000);
  await loginAs(page, GV, '/calls');
  const call = main(page).locator('article', { hasText: 'Đợt đăng ký đề tài KH&CN cấp trường' });
  await shot(page, '02-01-dot-dang-ky', 'Danh sách đợt đăng ký', [
    { at: call, note: 'Đợt đang mở nhận hồ sơ: tên, cấp, thời hạn nộp.' },
    { at: call.getByRole('link', { name: 'Xem chi tiết' }), note: 'Xem điều kiện tham gia, biểu mẫu và tài liệu yêu cầu.' },
    { at: btn(call, '+ Tạo hồ sơ đề xuất'), note: 'Tạo hồ sơ đề xuất cho đợt này.' },
  ]);
  await call.getByRole('link', { name: 'Xem chi tiết' }).click();
  await shot(page, '02-02-chi-tiet-dot', 'Chi tiết đợt đăng ký', [
    { at: main(page).getByText('Thông tin đợt').first(), note: 'Thời gian nhận hồ sơ, mô tả, điều kiện tham gia.' },
    { at: main(page).getByText('Biểu mẫu & hồ sơ yêu cầu').first(), note: 'Nội dung thuyết minh phải khai và tài liệu phải đính kèm.' },
  ]);
  await page.goBack();
  await btn(main(page).locator('article', { hasText: 'Đợt đăng ký đề tài KH&CN cấp trường' }), '+ Tạo hồ sơ đề xuất').click();
  await expect(page).toHaveURL(/\/proposals\/.+/);
  proposalUrl = new URL(page.url()).pathname;
  proposalCode = ((await main(page).getByText(/^DX-\d{4}-\d+$/).first().textContent()) ?? '').trim();

  await main(page).getByLabel(/Tên đề tài/).fill(TITLE);
  await main(page).getByLabel(/Kinh phí đề xuất/).fill('120000000');
  await main(page).getByLabel(/Thời gian thực hiện/).fill('12');
  await main(page).getByLabel(/Lĩnh vực nghiên cứu/).selectOption('Kinh tế');
  await main(page).getByLabel(/Tính cấp thiết/).fill('Xuất khẩu nông sản biến động mạnh theo mùa vụ và thị trường; doanh nghiệp thiếu công cụ dự báo để chủ động sản xuất, logistics.');
  await main(page).getByLabel(/Mục tiêu nghiên cứu/).fill('Xây dựng mô hình dự báo nhu cầu xuất khẩu 5 nhóm nông sản chủ lực bằng học máy, sai số dưới 10%.');
  await main(page).getByLabel(/Phương pháp nghiên cứu/).fill('Thu thập dữ liệu hải quan 2015–2025; so sánh ARIMA, XGBoost, LSTM; kiểm định ngoài mẫu; phỏng vấn 20 doanh nghiệp.');
  await main(page).getByLabel(/Sản phẩm dự kiến/).fill('01 bài báo tạp chí trong nước, 01 công cụ dự báo thử nghiệm, 01 báo cáo khuyến nghị chính sách.');
  await shot(page, '02-03-thuyet-minh', 'Khai thuyết minh đề tài', [
    { at: main(page).getByLabel(/Tên đề tài/), note: 'Khai các mục thuyết minh theo biểu mẫu của đợt (mục có dấu * là bắt buộc).' },
    { at: main(page).getByRole('tab', { name: /Tài liệu/ }), note: 'Tab "Tài liệu" để đính kèm tệp theo danh mục yêu cầu.' },
    { at: btn(page, /Lưu nháp/), note: 'Bấm "Lưu nháp" thường xuyên; hồ sơ nháp chỉ bạn xem được.' },
  ]);
  await btn(page, /Lưu nháp/).click();
  await expect(page.getByText(/Đã lưu lúc/)).toBeVisible();
  await shot(page, '02-04-kiem-tra-truoc-khi-nop', 'Kiểm tra trước khi nộp', [
    { at: page.getByText('Kiểm tra trước khi nộp'), note: 'Hệ thống liệt kê thông tin, tài liệu còn thiếu theo biểu mẫu.' },
    { at: page.getByText('Trợ lý AI').first(), note: 'Trợ lý AI: tóm tắt và góp ý thuyết minh (chỉ để tham khảo).' },
  ]);

  await main(page).getByRole('tab', { name: /Tài liệu/ }).click();
  for (const label of ['Thuyết minh đề tài (theo mẫu)', 'Dự toán kinh phí']) {
    const row = main(page).locator('li', { hasText: label }).first();
    await row.locator('input[type=file]').setInputFiles(PDF(label.includes('Dự toán') ? 'du-toan-kinh-phi.pdf' : 'thuyet-minh.pdf'));
    await expect(row.getByRole('button', { name: /\.pdf/ })).toBeVisible();
  }
  await expect(page.getByText('✓ Hồ sơ đã đủ thông tin và tài liệu bắt buộc.')).toBeVisible();
  await shot(page, '02-05-dinh-kem-tai-lieu', 'Đính kèm tài liệu', [
    { at: main(page).locator('li', { hasText: 'Thuyết minh đề tài (theo mẫu)' }).first(), note: 'Mỗi dòng là một loại tài liệu yêu cầu; bấm nút tải lên để chọn tệp (PDF, Word…).' },
    { at: page.getByText('✓ Hồ sơ đã đủ thông tin và tài liệu bắt buộc.'), note: 'Khi đủ thông tin và tài liệu bắt buộc, khung kiểm tra chuyển sang màu xanh.' },
  ]);

  await btn(page, '✨ Kiểm tra thuyết minh').click();
  await expect(page.getByText('AI đang xử lý…')).toBeHidden({ timeout: 180_000 });
  await shot(page, '02-06-ai-kiem-tra', 'AI góp ý thuyết minh', [
    { at: btn(page, '✨ Kiểm tra thuyết minh'), note: 'Bấm để AI rà soát thuyết minh theo biểu mẫu và quy chế.' },
    { at: page.locator('aside').getByText('Kiểm tra', { exact: true }).locator('..'), note: 'Kết quả góp ý (Quy tắc / AI). AI chỉ gợi ý — người khai tự quyết định sửa.' },
  ]);
  await btn(page, '✨ Tóm tắt thuyết minh').click();
  await expect(page.locator('aside').getByText('Tóm tắt', { exact: true })).toBeVisible({ timeout: 180_000 });
  await shot(page, '02-06b-ai-tom-tat', 'AI tóm tắt thuyết minh', [
    { at: btn(page, '✨ Tóm tắt thuyết minh'), note: 'Bấm để AI tóm tắt thuyết minh (dùng khi trình lãnh đạo, gửi hội đồng).' },
    { at: page.locator('aside').getByText('Tóm tắt', { exact: true }).locator('..'), note: 'Bản tóm tắt kèm tên mô hình, thời điểm tạo; có cảnh báo khi hồ sơ đã thay đổi sau lần tạo.' },
  ]);

  await act(page, 'Nộp hồ sơ', undefined, { id: '02-07-nop-ho-so', title: 'Nộp hồ sơ', notes: ['', 'Bấm "Nộp hồ sơ" rồi "Xác nhận". Sau khi nộp, hồ sơ được khóa và chuyển cho đơn vị xem xét.'] });
  await expect(page.getByText('Đơn vị xem xét').first()).toBeVisible();
  await main(page).getByRole('tab', { name: 'Lịch sử xử lý' }).click();
  await shot(page, '02-08-trang-thai', 'Theo dõi trạng thái hồ sơ', [
    { at: main(page).getByText('Đơn vị xem xét').first(), note: 'Trạng thái hiện tại của hồ sơ.' },
    { at: main(page).locator('ol').first(), note: 'Lịch sử xử lý: ai làm gì, lúc nào, ý kiến kèm theo.' },
  ]);
  await nav(page, 'Đề xuất').click();
  await shot(page, '02-09-danh-sach-de-xuat', 'Danh sách đề xuất của tôi', [
    { at: main(page).locator('table').first(), note: 'Các hồ sơ của bạn và trạng thái; bấm mã để mở.' },
    { at: btn(main(page), '⬇ Xuất CSV'), note: 'Xuất danh sách ra Excel (CSV).' },
  ]);
  saveManifest('all');
});

// ---------------------------------------------------------------- Chương 3: sinh viên
test('03 sinh viên', async () => {
  await loginAs(page, SV, '/calls');
  const call = main(page).locator('article').filter({ hasText: /sinh viên/i }).first();
  await shot(page, '03-01-dot-sinh-vien', 'Đợt đăng ký NCKH sinh viên', [
    { at: call, note: 'Đợt dành cho sinh viên — khai thêm người hướng dẫn theo biểu mẫu của đợt.' },
    { at: btn(call, '+ Tạo hồ sơ đề xuất'), note: 'Tạo hồ sơ; các bước khai, đính kèm, nộp giống Chương 2.' },
  ]);
  await nav(page, 'Đề tài').click();
  await shot(page, '03-02-de-tai-sinh-vien', 'Đề tài sinh viên đang thực hiện', [{ at: main(page).locator('table').first(), note: 'Đề tài đã được phê duyệt của bạn; bấm mã để nộp sản phẩm theo mốc.' }]);
  saveManifest('all');
});

// ---------------------------------------------------------------- Chương 4: đầu mối / lãnh đạo đơn vị
test('04 đơn vị xác nhận', async () => {
  await loginAs(page, DM);
  const row = main(page).getByRole('row', { name: proposalCode });
  await shot(page, '04-01-viec-cho-xu-ly', 'Hồ sơ chờ đơn vị xem xét', [{ at: row, note: 'Hồ sơ của đơn vị đang chờ bạn xác nhận; bấm mã hồ sơ để mở.' }]);
  await page.goto(proposalUrl);
  await expect(btn(page, 'Đơn vị xác nhận')).toBeVisible();
  await shot(page, '04-02-xem-ho-so', 'Xem và xử lý hồ sơ', [
    { at: main(page).getByRole('tab').first(), note: 'Đọc thuyết minh, tài liệu, lịch sử xử lý ở các tab.' },
    { at: btn(page, 'Đơn vị xác nhận'), note: '"Đơn vị xác nhận": chuyển hồ sơ lên Phòng Quản lý khoa học.' },
    { at: btn(page, 'Trả bổ sung'), note: '"Trả bổ sung": trả lại chủ nhiệm kèm yêu cầu (bắt buộc ghi lý do).' },
  ]);
  await act(page, 'Đơn vị xác nhận', undefined, { id: '04-03-xac-nhan', title: 'Xác nhận cấp đơn vị', notes: ['', 'Bấm "Xác nhận: Đơn vị xác nhận".'] });
  await expect(page.getByText('Phòng KH xử lý').first()).toBeVisible();
  await nav(page, 'Điều hành & báo cáo').click();
  await shot(page, '04-04-bao-cao-don-vi', 'Báo cáo của đơn vị', [
    { at: main(page).getByText('Đề xuất theo trạng thái').first(), note: 'Số liệu đề xuất, đề tài, công bố trong phạm vi đơn vị.' },
    { at: btn(main(page), '⬇ Đề xuất (CSV)'), note: 'Tải danh sách ra Excel.' },
  ]);
  saveManifest('all');
});

// ---------------------------------------------------------------- Chương 5a: Phòng QLKH lập hội đồng
let councilUrl = '';
test('05a phòng QLKH lập hội đồng', async () => {
  await loginAs(page, CV);
  await shot(page, '05-01-trang-lam-viec-qlkh', 'Trang làm việc của chuyên viên', [
    { at: main(page).getByText('Việc cần tôi xử lý').last(), note: 'Hồ sơ đến bước Phòng QLKH xử lý, công bố chờ xác minh, mốc chờ duyệt.' },
  ]);
  await nav(page, 'Hội đồng').click();
  await btn(main(page), '+ Thành lập hội đồng').click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel(/Tên hội đồng/).fill('Hội đồng xét duyệt thuyết minh đề tài cấp trường 2027 — Tiểu ban Kinh tế');
  await dlg.locator('input[type=date]').fill('2026-12-15');
  await dlg.locator('label', { hasText: proposalCode }).locator('input[type=checkbox]').check();
  await shot(page, '05-02-thanh-lap-hoi-dong', 'Thành lập hội đồng', [
    { at: dlg.getByLabel(/Tên hội đồng/), note: 'Tên hội đồng.' },
    { at: dlg.getByLabel(/^Loại/), note: 'Loại: xét duyệt thuyết minh, nghiệm thu, đánh giá NCKH sinh viên.' },
    { at: dlg.getByLabel(/Phiếu chấm/), note: 'Mẫu phiếu chấm (tiêu chí, thang điểm, ngưỡng đề nghị).' },
    { at: dlg.locator('label', { hasText: proposalCode }), note: 'Chọn các hồ sơ đưa ra hội đồng.' },
    { at: dlg.getByRole('button').last(), note: 'Bấm để tạo hội đồng.' },
  ]);
  await dlg.getByRole('button').last().click();
  await expect(page).toHaveURL(/\/councils\/.+/);
  councilUrl = new URL(page.url()).pathname;

  await main(page).getByRole('tab', { name: /Thành viên/ }).click();
  const invite = main(page).locator('.card', { hasText: 'Mời thành viên' });
  await expect(invite.getByText(/điểm phù hợp/).first()).toBeVisible();
  await shot(page, '05-03-moi-thanh-vien', 'Mời thành viên hội đồng', [
    { at: invite.getByLabel('Vai trò khi mời'), note: 'Chọn vai trò khi mời: Chủ tịch, Thư ký, Phản biện, Ủy viên.' },
    { at: invite.locator('li').first(), note: 'Hệ thống gợi ý người phù hợp chuyên môn và cảnh báo xung đột lợi ích (⛔ không được mời).' },
    { at: invite.getByLabel('Hoặc tìm theo tên'), note: 'Hoặc tìm theo tên rồi bấm "Mời".' },
  ], { fullPage: true });
  for (const [name, role] of [['Phạm Quốc Dũng', 'CHAIR'], ['Đặng Quang Minh', 'SECRETARY'], ['Lê Minh Chí', 'REVIEWER']] as const) {
    await invite.getByLabel('Vai trò khi mời').selectOption(role);
    await invite.getByLabel('Hoặc tìm theo tên').fill(name.split(' ').pop()!);
    await invite.locator('li', { hasText: name }).last().getByRole('button', { name: 'Mời', exact: true }).click();
    await page.waitForLoadState('networkidle');
  }

  // Thành viên nhận lời (chủ tịch thao tác trên giao diện, các thành viên khác nhận lời nhanh)
  await loginAs(page, 'gv.dung@demo.aisrm.test', '/councils');
  await shot(page, '06-01-danh-sach-hoi-dong', 'Hội đồng tôi được mời', [{ at: main(page).locator('table').first(), note: 'Các hội đồng bạn được mời, vai trò của bạn và hạn chấm. Bấm tên hội đồng để mở.' }]);
  await page.goto(councilUrl);
  await shot(page, '06-02-nhan-loi', 'Nhận lời mời', [{ at: btn(page, 'Nhận lời'), note: 'Bấm "Nhận lời" (hoặc "Từ chối") lời mời tham gia hội đồng.' }]);
  await btn(page, 'Nhận lời').click();
  await expect(btn(page, 'Nhận lời')).toBeHidden();
  const cid = councilUrl.split('/').pop();
  for (const e of [CV2, 'gv.chi@demo.aisrm.test']) await apiAs(page, e, 'POST', `/councils/${cid}/respond`, { accept: true });

  await loginAs(page, CV, councilUrl);
  await main(page).getByRole('tab', { name: /Thành viên/ }).click();
  await shot(page, '05-04-mo-cham', 'Mở chấm', [
    { at: main(page).locator('table').first(), note: 'Danh sách thành viên, trạng thái nhận lời và khai báo xung đột lợi ích.' },
    { at: btn(page, 'Mở chấm'), note: 'Khi chủ tịch và thư ký đã nhận lời, bấm "Mở chấm" để thành viên bắt đầu chấm phiếu.' },
  ]);
  await btn(page, 'Mở chấm').click();
  await expect(page.getByText('Đang chấm').first()).toBeVisible();
  saveManifest('all');
});

// ---------------------------------------------------------------- Chương 6: thành viên hội đồng
async function scoreAs(email: string, scores: number[], comment: string, capture: boolean) {
  await loginAs(page, email, councilUrl);
  await expect(btn(page, 'Tôi không có xung đột lợi ích')).toBeVisible();
  if (capture)
    await shot(page, '06-03-xung-dot-loi-ich', 'Khai báo xung đột lợi ích', [
      { at: btn(page, 'Tôi không có xung đột lợi ích'), note: 'Bắt buộc khai báo trước khi xem hồ sơ. Không có xung đột: bấm nút này.' },
      { at: page.getByPlaceholder('Mô tả xung đột (nếu có)'), note: 'Có xung đột: mô tả rồi bấm "Có xung đột — không chấm"; bạn sẽ không xem, không chấm hồ sơ này.' },
    ]);
  await btn(page, 'Tôi không có xung đột lợi ích').click();
  const inputs = main(page).locator('input[type=number]');
  await expect(inputs.first()).toBeVisible();
  for (let i = 0; i < scores.length; i++) await inputs.nth(i).fill(String(scores[i]));
  await main(page).getByLabel('Nhận xét').fill(comment);
  if (capture)
    await shot(page, '06-04-cham-diem', 'Chấm phiếu', [
      { at: inputs.first(), note: 'Chấm từng tiêu chí (không vượt điểm tối đa ghi bên phải).' },
      { at: main(page).getByLabel('Nhận xét'), note: 'Ghi nhận xét, yêu cầu chỉnh sửa.' },
      { at: btn(main(page), 'Lưu nháp'), note: '"Lưu nháp" để chấm tiếp sau.' },
      { at: btn(main(page), 'Nộp phiếu'), note: '"Nộp phiếu": phiếu đã nộp không sửa được.' },
    ]);
  await btn(main(page), 'Nộp phiếu').click();
  await expect(main(page).getByText(/Đã nộp phiếu lúc/)).toBeVisible();
  if (capture) await shot(page, '06-05-da-nop-phieu', 'Phiếu đã nộp', [{ at: main(page).getByText(/Đã nộp phiếu lúc/), note: 'Phiếu đã nộp được khóa; điểm của bạn hiển thị để đối chiếu.' }]);
}

test('06 thành viên hội đồng chấm phiếu, chủ tịch tổng hợp', async () => {
  test.setTimeout(10 * 60_000);
  await scoreAs('gv.dung@demo.aisrm.test', [17, 18, 21, 17, 13], 'Thuyết minh rõ ràng, phương pháp phù hợp. Đề nghị bổ sung chỉ số đánh giá sai số dự báo (MAPE).', true);
  await scoreAs('gv.chi@demo.aisrm.test', [16, 17, 20, 16, 12], 'Đồng ý thông qua; cần làm rõ nguồn dữ liệu hải quan.', false);

  // Chủ tịch khóa phiếu, kết luận, biên bản
  await loginAs(page, 'gv.dung@demo.aisrm.test', councilUrl);
  await shot(page, '06-06-khoa-phieu', 'Khóa phiếu và tổng hợp (chủ tịch)', [{ at: btn(page, 'Khóa phiếu & tổng hợp'), note: 'Khi các thành viên đã nộp phiếu, chủ tịch (hoặc Phòng QLKH) bấm để khóa phiếu và tổng hợp điểm.' }]);
  await btn(page, 'Khóa phiếu & tổng hợp').click();
  await expect(page.getByText('Đã khóa phiếu').first()).toBeVisible();
  await main(page).getByRole('tab', { name: /Kết quả/ }).click();
  await main(page).getByLabel(/^Kết luận /).first().selectOption('APPROVE');
  await btn(main(page), '✨ AI dự thảo biên bản').click();
  await expect(btn(main(page), '✨ AI dự thảo biên bản')).toBeEnabled({ timeout: 240_000 });
  await shot(page, '06-07-ket-qua-bien-ban', 'Kết quả và biên bản hội đồng', [
    { at: main(page).getByText(/Tổng hợp điểm/), note: 'Điểm trung bình các phiếu, so với ngưỡng đề nghị của phiếu chấm.' },
    { at: main(page).getByLabel(/^Kết luận /).first(), note: 'Chọn kết luận của hội đồng cho từng hồ sơ.' },
    { at: btn(main(page), '✨ AI dự thảo biên bản'), note: 'AI dự thảo biên bản từ điểm và nhận xét; thư ký / chủ tịch sửa lại.' },
    { at: main(page).getByLabel('Nội dung biên bản'), note: 'Nội dung biên bản (sửa trực tiếp).' },
    { at: btn(main(page), 'Lưu biên bản và kết luận'), note: 'Lưu; sau đó chủ tịch bấm "Chủ tịch xác nhận biên bản".' },
  ], { fullPage: true });
  await btn(main(page), 'Lưu biên bản và kết luận').click();
  await page.waitForLoadState('networkidle');
  await btn(main(page), 'Chủ tịch xác nhận biên bản').click();
  await expect(main(page).getByText(/xác nhận lúc/)).toBeVisible();
  saveManifest('all');
});

// ---------------------------------------------------------------- Chương 5b: trình phê duyệt
test('05b phòng QLKH trình phê duyệt', async () => {
  await loginAs(page, CV, proposalUrl);
  await shot(page, '05-05-xu-ly-ho-so', 'Xử lý hồ sơ ở Phòng QLKH', [
    { at: btn(page, 'Trình phê duyệt'), note: '"Trình phê duyệt": chuyển lãnh đạo trường phê duyệt.' },
    { at: btn(page, 'Trả bổ sung'), note: '"Trả bổ sung": trả chủ nhiệm sửa; nộp lại sẽ quay về đúng bước này.' },
    { at: btn(page, 'Không phê duyệt'), note: '"Không phê duyệt": kết thúc hồ sơ (bắt buộc ghi lý do).' },
  ]);
  await act(page, 'Trình phê duyệt', 'Hội đồng đã thông qua (biên bản đã xác nhận). Kính trình Phó Hiệu trưởng phê duyệt.', { id: '05-06-trinh-phe-duyet', title: 'Trình phê duyệt', notes: ['Ghi ý kiến trình (không bắt buộc).', 'Bấm "Xác nhận: Trình phê duyệt".'] });
  saveManifest('all');
});

// ---------------------------------------------------------------- Chương 7: lãnh đạo trường
let projectUrl = '';
test('07 lãnh đạo phê duyệt, xem báo cáo', async () => {
  test.setTimeout(10 * 60_000);
  await loginAs(page, PHT);
  await shot(page, '07-01-viec-cho-phe-duyet', 'Hồ sơ chờ phê duyệt', [{ at: main(page).getByRole('row', { name: proposalCode }), note: 'Hồ sơ Phòng QLKH đã trình; bấm mã để mở.' }]);
  await page.goto(proposalUrl);
  await act(page, 'Phê duyệt', 'Đồng ý triển khai.', { id: '07-02-phe-duyet', title: 'Phê duyệt đề xuất', notes: ['Ghi ý kiến chỉ đạo.', 'Bấm "Xác nhận: Phê duyệt" — hệ thống tự lập đề tài.'] });
  await expect(page.getByText('Đề xuất đã được phê duyệt và lập đề tài.')).toBeVisible();
  await shot(page, '07-03-da-lap-de-tai', 'Đề tài được lập', [{ at: page.getByText('Đề xuất đã được phê duyệt và lập đề tài.'), note: 'Sau phê duyệt, đề tài được lập tự động; bấm "Mở đề tài →".' }]);
  await page.getByRole('link', { name: 'Mở đề tài →' }).click();
  await expect(page).toHaveURL(/\/projects\/.+/);
  projectUrl = new URL(page.url()).pathname;

  await nav(page, 'Điều hành & báo cáo').click();
  await shot(page, '07-04-dieu-hanh', 'Điều hành & báo cáo toàn trường', [
    { at: main(page).getByText('Đề xuất theo trạng thái').first(), note: 'Số liệu theo trạng thái: đề xuất, đề tài, công bố.' },
    { at: main(page).getByText('Theo đơn vị').first(), note: 'So sánh giữa các đơn vị.' },
    { at: main(page).getByText(/Đề tài có mốc quá hạn/).first(), note: 'Đề tài có mốc quá hạn cần đôn đốc.' },
  ], { fullPage: true });
  await btn(main(page), '✨ Tạo dự thảo').click();
  await expect(main(page).getByLabel('Dự thảo báo cáo')).toBeVisible({ timeout: 240_000 });
  await shot(page, '07-05-du-thao-bao-cao', 'AI dự thảo báo cáo hoạt động khoa học', [
    { at: btn(main(page), '✨ Tạo dự thảo'), note: 'AI dự thảo báo cáo từ số liệu hiện có.' },
    { at: main(page).getByLabel('Dự thảo báo cáo'), note: 'Bản dự thảo để biên tập — kiểm tra số liệu trước khi dùng.' },
  ]);
  saveManifest('all');
});

// ---------------------------------------------------------------- Chương 5c: Phòng QLKH giao nhiệm vụ đề tài mới
test('05c phòng QLKH lập mốc, giao nhiệm vụ', async () => {
  await loginAs(page, CV, projectUrl);
  await main(page).getByLabel('Bắt đầu').fill('2027-01-01');
  await main(page).getByLabel('Kết thúc').fill('2027-12-31');
  await shot(page, '05-07-de-tai-moi', 'Đề tài mới lập — chờ giao nhiệm vụ', [
    { at: main(page).getByLabel('Bắt đầu'), note: 'Nhập ngày bắt đầu, kết thúc theo hợp đồng / quyết định giao nhiệm vụ.' },
    { at: btn(main(page), 'Cập nhật thời gian'), note: 'Bấm "Cập nhật thời gian".' },
    { at: main(page).getByText(/Mốc tiến độ và sản phẩm/), note: 'Đề tài cần ít nhất một mốc tiến độ trước khi giao nhiệm vụ.' },
    { at: btn(main(page), '+ Thêm mốc'), note: 'Bấm "+ Thêm mốc".' },
  ], { fullPage: true });
  await btn(main(page), 'Cập nhật thời gian').click();
  await page.waitForLoadState('networkidle');
  const milestones: [string, string, string][] = [
    ['Báo cáo tổng quan và bộ dữ liệu', '2027-04-30', 'Báo cáo tổng quan; bộ dữ liệu đã làm sạch'],
    ['Mô hình dự báo và bài báo', '2027-10-31', 'Mô hình dự báo; bản thảo bài báo'],
    ['Báo cáo tổng kết', '2027-12-31', 'Báo cáo tổng kết, công cụ thử nghiệm'],
  ];
  for (const [i, [t, due, out]] of milestones.entries()) {
    await btn(main(page), '+ Thêm mốc').click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel(/Tên mốc/).fill(t);
    await dlg.getByLabel(/Hạn hoàn thành/).fill(due);
    await dlg.getByLabel(/Sản phẩm cần nộp/).fill(out);
    if (i === 0)
      await shot(page, '05-08-them-moc', 'Thêm mốc tiến độ', [
        { at: dlg.getByLabel(/Tên mốc/), note: 'Tên mốc (ví dụ: báo cáo giữa kỳ).' },
        { at: dlg.getByLabel(/Hạn hoàn thành/), note: 'Hạn hoàn thành — hệ thống tự nhắc trước 7 ngày, 1 ngày và khi quá hạn.' },
        { at: dlg.getByLabel(/Sản phẩm cần nộp/), note: 'Sản phẩm chủ nhiệm phải nộp ở mốc này.' },
        { at: dlg.getByRole('button', { name: 'Thêm', exact: true }), note: 'Bấm "Thêm".' },
      ]);
    await dlg.getByRole('button', { name: 'Thêm', exact: true }).click();
    await expect(dlg).toBeHidden();
  }
  await act(page, 'Giao nhiệm vụ / bắt đầu', undefined, { id: '05-09-giao-nhiem-vu', title: 'Giao nhiệm vụ', notes: ['', 'Sau khi ký hợp đồng / có quyết định giao nhiệm vụ, bấm "Giao nhiệm vụ / bắt đầu" rồi xác nhận.'] });
  await expect(page.getByText('Đang thực hiện').first()).toBeVisible();
  saveManifest('all');
});

// ---------------------------------------------------------------- Chương 2b: chủ nhiệm thực hiện đề tài
test('02b chủ nhiệm nộp sản phẩm, xin gia hạn', async () => {
  await loginAs(page, GV, '/projects');
  await shot(page, '02-10-danh-sach-de-tai', 'Đề tài của tôi', [{ at: main(page).locator('table').first(), note: 'Đề tài bạn chủ nhiệm hoặc tham gia: tiến độ mốc, trạng thái; dấu đỏ là có mốc quá hạn.' }]);
  await page.goto('/projects/dt1');
  const ms = main(page).locator('li').filter({ has: page.getByRole('button', { name: 'Nộp sản phẩm' }) }).first();
  await shot(page, '02-11-chi-tiet-de-tai', 'Chi tiết đề tài', [
    { at: main(page).getByText('Thông tin đề tài').first(), note: 'Thông tin đề tài, thời gian thực hiện, thành viên.' },
    { at: ms, note: 'Mốc tiến độ: hạn, sản phẩm cần nộp, trạng thái.' },
    { at: ms.getByRole('button', { name: /Tải sản phẩm/ }), note: 'Tải tệp sản phẩm của mốc.' },
    { at: ms.getByRole('button', { name: 'Nộp sản phẩm' }), note: 'Bấm "Nộp sản phẩm", ghi chú khi nộp; Phòng QLKH sẽ xem và chấp nhận hoặc trả lại.' },
  ]);
  await ms.locator('input[type=file]').setInputFiles(PDF('bao-cao-khao-sat.pdf'));
  await expect(ms.getByRole('button', { name: 'bao-cao-khao-sat.pdf' })).toBeVisible();
  await ms.getByRole('button', { name: 'Nộp sản phẩm' }).click();
  await expect(main(page).getByText('Đã hoàn thành theo kế hoạch.').first()).toBeVisible();

  await btn(main(page), '+ Gửi yêu cầu').click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel(/Loại yêu cầu/).selectOption('EXTENSION');
  await dlg.getByLabel(/Ngày kết thúc mới/).fill('2027-03-31');
  await dlg.getByLabel(/Lý do/).fill('Doanh nghiệp khảo sát lùi lịch phỏng vấn sang quý I/2027; đề nghị gia hạn 03 tháng.');
  await shot(page, '02-12-yeu-cau-gia-han', 'Gửi yêu cầu thay đổi / gia hạn', [
    { at: dlg.getByLabel(/Loại yêu cầu/), note: 'Loại yêu cầu: gia hạn, thay đổi thành viên, điều chỉnh dự toán, khác.' },
    { at: dlg.getByLabel(/Ngày kết thúc mới/), note: 'Với gia hạn: ngày kết thúc mới đề nghị.' },
    { at: dlg.getByLabel(/Lý do/), note: 'Lý do (bắt buộc).' },
    { at: dlg.getByRole('button', { name: 'Gửi', exact: true }), note: 'Bấm "Gửi" — Phòng QLKH xem xét, chấp thuận.' },
  ]);
  await dlg.getByRole('button', { name: 'Gửi', exact: true }).click();
  await expect(dlg).toBeHidden();

  // Khai báo công bố
  await nav(page, 'Công bố').click();
  await main(page).getByRole('link', { name: '+ Khai báo công bố' }).click();
  await main(page).getByLabel(/Tiêu đề/).fill('Dự báo nhu cầu xuất khẩu nông sản bằng mô hình học máy: trường hợp Việt Nam');
  await main(page).getByLabel(/^Loại/).selectOption('JOURNAL');
  await main(page).getByLabel(/Năm công bố/).fill('2026');
  await main(page).getByLabel(/Chỉ mục/).fill('HĐGSNN');
  await main(page).getByLabel(/Tạp chí \/ hội thảo/).fill('Tạp chí Kinh tế đối ngoại (mẫu)');
  await shot(page, '02-13-khai-bao-cong-bo', 'Khai báo công bố', [
    { at: main(page).getByLabel(/Tiêu đề/), note: 'Tiêu đề, loại, năm, chỉ mục (Scopus, WoS, HĐGSNN…).' },
    { at: main(page).getByLabel(/^DOI/), note: 'DOI (nếu có) — hệ thống đối chiếu với Crossref (cần Internet).' },
    { at: main(page).getByText('Tác giả (theo thứ tự)'), note: 'Danh sách tác giả theo thứ tự; thêm tác giả trong trường hoặc ngoài trường.' },
    { at: btn(main(page), 'Lưu nháp'), note: 'Bấm "Lưu nháp".' },
  ], { fullPage: true });
  await btn(main(page), 'Lưu nháp').click();
  await expect(page).toHaveURL(/\/publications\/(?!new)[^/]+$/);
  const ev = main(page).locator('.card', { hasText: 'Minh chứng' });
  await ev.locator('input[type=file]').setInputFiles(PDF('bai-bao-ban-in.pdf'));
  await expect(ev.getByRole('button', { name: 'bai-bao-ban-in.pdf' })).toBeVisible();
  await shot(page, '02-14-minh-chung', 'Đính kèm minh chứng và nộp xác nhận', [
    { at: ev, note: 'Tải minh chứng (bản in, trang bìa, thư chấp nhận…) — bắt buộc khi không có DOI.' },
    { at: btn(page, 'Nộp xác nhận'), note: 'Bấm "Nộp xác nhận" để Phòng QLKH xác minh.' },
  ]);
  await act(page, 'Nộp xác nhận');

  // Kiểm chứng DOI với Crossref (cần Internet)
  await nav(page, 'Công bố').click();
  await main(page).getByRole('link', { name: '+ Khai báo công bố' }).click();
  await main(page).getByLabel(/Tiêu đề/).fill('Deep learning');
  await main(page).getByLabel(/^Loại/).selectOption('JOURNAL');
  await main(page).getByLabel(/Năm công bố/).fill('2015');
  await main(page).getByLabel(/Chỉ mục/).fill('Scopus, WoS');
  await main(page).getByLabel(/Tạp chí \/ hội thảo/).fill('Nature');
  await main(page).getByLabel(/^DOI/).fill('10.1038/nature14539');
  await btn(main(page), 'Lưu nháp').click();
  await expect(page).toHaveURL(/\/publications\/(?!new)[^/]+$/);
  const vc = main(page).locator('.card', { hasText: 'Kiểm chứng với Crossref' });
  await vc.getByRole('button', { name: 'Kiểm chứng DOI' }).click();
  await expect(vc.locator('table')).toBeVisible({ timeout: 60_000 });
  await shot(page, '02-15-kiem-chung-doi', 'Kiểm chứng DOI với Crossref', [
    { at: vc.getByRole('button', { name: 'Kiểm chứng DOI' }), note: 'Bấm "Kiểm chứng DOI": hệ thống tra Crossref theo DOI đã khai.' },
    { at: vc.locator('table'), note: 'Đối chiếu từng trường (tiêu đề, tạp chí, năm, tác giả): khớp / lệch. Ví dụ này lệch tác giả vì người khai không có trong danh sách tác giả của bài.' },
  ], { fullPage: true });
  saveManifest('all');
});

// ---------------------------------------------------------------- Chương 5d: Phòng QLKH theo dõi đề tài, xác minh công bố, mở đợt, nạp quy chế
test('05d phòng QLKH theo dõi đề tài, công bố, mở đợt, quy chế', async () => {
  test.setTimeout(10 * 60_000);
  await loginAs(page, CV, '/projects/dt1');
  const ms = main(page).locator('li').filter({ has: page.getByRole('button', { name: 'Chấp nhận', exact: true }) }).first();
  const cr = main(page).locator('li').filter({ has: page.getByRole('button', { name: 'Chấp thuận', exact: true }) }).first();
  await shot(page, '05-10-duyet-san-pham', 'Duyệt sản phẩm mốc và yêu cầu gia hạn', [
    { at: ms.getByRole('button', { name: 'Chấp nhận', exact: true }), note: 'Sản phẩm mốc đã nộp: "Chấp nhận" hoặc "Trả lại" (ghi lý do).' },
    { at: cr, note: 'Yêu cầu thay đổi / gia hạn của chủ nhiệm.' },
    { at: cr.getByRole('button', { name: 'Chấp thuận', exact: true }), note: '"Chấp thuận" (hoặc từ chối) yêu cầu.' },
  ], { fullPage: true });
  await ms.getByRole('button', { name: 'Chấp nhận', exact: true }).click();
  await page.waitForLoadState('networkidle');
  await cr.getByRole('button', { name: 'Chấp thuận', exact: true }).click();
  await page.waitForLoadState('networkidle');

  // Công bố chờ xác minh
  await nav(page, 'Công bố').click();
  await shot(page, '05-11-danh-sach-cong-bo', 'Danh sách công bố', [
    { at: main(page).locator('table').first(), note: 'Công bố của toàn trường; lọc theo trạng thái; ⚠ cảnh báo bản ghi nghi trùng.' },
    { at: btn(main(page), '⬇ Xuất công bố đã xác nhận'), note: 'Xuất công bố đã xác nhận (phục vụ báo cáo, HEMIS).' },
  ]);
  await main(page).getByRole('row', { name: /Dự báo nhu cầu xuất khẩu nông sản/ }).getByRole('link').first().click();
  await shot(page, '05-12-xac-minh-cong-bo', 'Xác minh công bố', [
    { at: main(page).locator('.card', { hasText: 'Minh chứng' }), note: 'Kiểm tra minh chứng, kết quả đối chiếu DOI.' },
    { at: btn(page, 'Xác minh minh chứng'), note: '"Xác minh minh chứng" khi hợp lệ; "Trả bổ sung" / "Không xác nhận" kèm lý do.' },
  ]);
  await act(page, 'Xác minh minh chứng');
  const pubUrl = new URL(page.url()).pathname;
  await loginAs(page, TP, pubUrl);
  await act(page, 'Xác nhận công bố', undefined, { id: '05-13-xac-nhan-cong-bo', title: 'Trưởng phòng xác nhận công bố', notes: ['', 'Trưởng phòng QLKH bấm "Xác nhận công bố" (người xác minh và người xác nhận phải khác nhau).'] });

  // Mở đợt đăng ký
  await loginAs(page, CV, '/calls');
  await main(page).getByRole('link', { name: '+ Mở đợt mới' }).click();
  await main(page).getByLabel(/Tên đợt/).fill('Đợt đăng ký đề tài KH&CN cấp trường năm 2028');
  await main(page).getByLabel(/Năm kế hoạch/).fill('2028');
  await main(page).getByLabel(/Ngày mở/).fill('2027-01-05');
  await main(page).getByLabel(/Hạn nộp/).fill('2027-03-31');
  await main(page).getByLabel(/^Mô tả/).fill('Nhận đề xuất đề tài KH&CN cấp trường thực hiện năm 2028.');
  await shot(page, '05-14-mo-dot-moi', 'Mở đợt đăng ký mới', [
    { at: main(page).getByLabel(/Tên đợt/), note: 'Tên đợt, năm kế hoạch, cấp đề tài.' },
    { at: main(page).getByLabel(/Ngày mở/), note: 'Thời gian nhận hồ sơ (ngày mở, hạn nộp).' },
    { at: main(page).getByLabel(/Trường biểu mẫu/), note: 'Biểu mẫu thuyết minh (mặc định theo mẫu chuẩn; sửa khi cần — do quản trị / Phòng QLKH).' },
    { at: main(page).getByLabel(/Tài liệu bắt buộc/), note: 'Danh mục tài liệu đính kèm, đánh dấu bắt buộc.' },
    { at: btn(main(page), 'Tạo đợt'), note: 'Bấm "Tạo đợt"; sau đó bấm "Mở nhận hồ sơ" để công bố đợt.' },
  ], { fullPage: true });
  await btn(main(page), 'Tạo đợt').click();
  await expect(btn(main(page), 'Mở nhận hồ sơ')).toBeVisible();
  await shot(page, '05-15-mo-nhan-ho-so', 'Mở nhận hồ sơ', [{ at: btn(main(page), 'Mở nhận hồ sơ'), note: 'Bấm "Mở nhận hồ sơ" để đợt hiển thị cho giảng viên, sinh viên; "Đóng đợt" khi kết thúc.' }]);
  await btn(main(page), 'Mở nhận hồ sơ').click();

  // Nạp văn bản quy chế (chỉ chụp, không nạp)
  await nav(page, 'Hỏi đáp quy chế').click();
  await main(page).getByRole('tab', { name: /Văn bản quy chế/ }).click();
  await btn(main(page), '+ Nạp văn bản').click();
  const dlg = page.getByRole('dialog');
  await shot(page, '05-16-nap-quy-che', 'Nạp văn bản quy chế', [
    { at: dlg.getByLabel(/Mã văn bản/), note: 'Mã, tên, ngày hiệu lực của văn bản.' },
    { at: dlg.getByLabel(/Tệp văn bản/), note: 'Chọn tệp văn bản (Word/PDF/TXT) — hệ thống tự tách Điều, khoản.' },
    { at: dlg.getByRole('button', { name: 'Xem trước' }), note: 'Bấm "Xem trước" để kiểm tra kết quả tách, rồi "Xác nhận nạp".' },
  ]);
  await dlg.getByRole('button', { name: 'Hủy' }).click();
  saveManifest('all');
});

// ---------------------------------------------------------------- Chương 8: quản trị
test('08 quản trị hệ thống, AI, tích hợp', async () => {
  test.setTimeout(10 * 60_000);
  await loginAs(page, ADMIN, '/admin');
  const tab = (n: string | RegExp) => main(page).getByRole('tab', { name: n });
  await shot(page, '08-01-don-vi', 'Cơ cấu tổ chức', [
    { at: tab('Đơn vị'), note: 'Các tab quản trị: Đơn vị, Tài khoản, Phân quyền, Tác vụ nền, Nhật ký.' },
    { at: main(page).getByText('Cơ cấu tổ chức').first(), note: 'Cây đơn vị (khoa, viện, cơ sở, phòng) — dùng cho phạm vi quyền.' },
  ]);
  await tab(/Tài khoản/).click();
  const csv = main(page).getByLabel('Nội dung CSV');
  await csv.fill('email,displayName,unitId,title,roles\nnguyen.minh@demo.aisrm.test,ThS. Nguyễn Văn Minh,k-ktqt,Giảng viên,RESEARCHER\ntran.lan@demo.aisrm.test,TS. Trần Thị Lan,k-qtkd,Đầu mối KH,RESEARCHER;UNIT_FOCAL@k-qtkd');
  await btn(main(page), 'Kiểm tra').click();
  await expect(btn(main(page), /Nhập 2 tài khoản/)).toBeVisible();
  await shot(page, '08-02-nhap-tai-khoan', 'Nhập tài khoản từ CSV', [
    { at: btn(main(page), 'Tải tệp mẫu'), note: 'Tải tệp mẫu CSV, điền danh sách cán bộ.' },
    { at: csv, note: 'Chọn tệp hoặc dán nội dung CSV. Vai trò cách nhau bằng dấu ;, phạm vi đơn vị viết VAI_TRO@maDonVi.' },
    { at: btn(main(page), 'Kiểm tra'), note: 'Bấm "Kiểm tra" để xem trước từng dòng (thêm mới / cập nhật / lỗi).' },
    { at: btn(main(page), /Nhập 2 tài khoản/), note: 'Bấm "Nhập…" — hệ thống tạo tài khoản và hiển thị mật khẩu tạm một lần để gửi người dùng.' },
  ], { fullPage: true });
  const acc = main(page).locator('.card', { hasText: /^Tài khoản \(/ }).last();
  await shot(page, '08-03-danh-sach-tai-khoan', 'Danh sách tài khoản', [
    { at: acc.locator('table'), note: 'Tài khoản, đơn vị, lần đăng nhập gần nhất, trạng thái.' },
    { at: acc.getByRole('button', { name: 'Đặt lại mật khẩu' }).first(), note: '"Đặt lại mật khẩu": cấp mật khẩu tạm (hiện một lần); người dùng phải đổi khi đăng nhập.' },
  ]);
  await tab('Phân quyền').click();
  await shot(page, '08-04-phan-quyen', 'Phân quyền', [{ at: main(page).locator('table').first(), note: 'Vai trò của từng người, phạm vi (toàn trường hoặc một đơn vị), thời hạn hiệu lực.' }]);
  await tab('Tác vụ nền').click();
  await shot(page, '08-05-tac-vu-nen', 'Tác vụ nền', [
    { at: main(page).locator('table').first(), note: 'Tác vụ tự động (nhắc hạn 7:00 hằng ngày…): lần chạy gần nhất, kết quả, lần chạy kế tiếp.' },
    { at: btn(main(page), 'Chạy ngay').first(), note: '"Chạy ngay" khi cần chạy thủ công.' },
  ]);
  await tab('Nhật ký').click();
  await shot(page, '08-06-nhat-ky', 'Nhật ký kiểm toán', [{ at: main(page).locator('table').first(), note: 'Mọi thao tác quan trọng: ai, lúc nào, làm gì, trên hồ sơ nào, kết quả.' }]);

  // AI Center
  await nav(page, 'AI Center').click();
  const aiTab = (n: string) => main(page).getByRole('tab', { name: n });
  const localCard = main(page).locator('.card', { hasText: 'Máy chủ AI nội bộ' }).first();
  await shot(page, '08-07-ai-nha-cung-cap', 'AI Center — nhà cung cấp', [
    { at: localCard, note: 'Máy chủ AI nội bộ (chạy trong trường, không gửi dữ liệu ra ngoài): trạng thái kết nối, hàng đợi GPU.' },
    { at: localCard.getByRole('button', { name: 'Kiểm tra kết nối' }), note: '"Kiểm tra kết nối" tới máy chủ AI nội bộ.' },
    { at: localCard.getByRole('button', { name: 'Làm nóng' }), note: '"Làm nóng": nạp sẵn mô hình vào GPU sau khi khởi động máy (lần đầu mất 1–2 phút).' },
    { at: main(page).getByRole('button', { name: 'Lưu khóa' }).first(), note: 'Nhà cung cấp thương mại (Claude, ChatGPT, Gemini): nhập khóa API — khóa được mã hóa, không hiển thị lại.' },
  ], { fullPage: true });
  await aiTab('Model & bảng giá').click();
  await shot(page, '08-08-ai-model', 'AI Center — model và bảng giá', [{ at: main(page).locator('table').first(), note: 'Danh sách model, đơn giá; bật / tắt từng model. Model nội bộ có chi phí 0 đ.' }]);
  await aiTab('Cấu hình & hạn mức').click();
  await shot(page, '08-09-ai-cau-hinh', 'AI Center — cấu hình và hạn mức', [
    { at: main(page).getByLabel(/Chế độ chạy/), note: 'Bật / tắt AI cho toàn trường; chọn model mặc định.' },
    { at: main(page).getByText(/Hỏi đáp quy chế/).first(), note: 'Chọn model riêng cho từng chức năng (ví dụ: hỏi đáp quy chế dùng AI nội bộ).' },
    { at: btn(main(page), 'Lưu cấu hình'), note: 'Hạn mức chi phí tháng, giới hạn độ dài; bấm "Lưu cấu hình".' },
  ], { fullPage: true });
  await aiTab('Sử dụng & chi phí').click();
  await shot(page, '08-10-ai-su-dung', 'AI Center — sử dụng và chi phí', [{ at: main(page).locator('table').first(), note: 'Lượt dùng theo chức năng, người dùng, model; token và chi phí.' }], { fullPage: true });

  // Integration Center
  await nav(page, 'Integration Center').click();
  await shot(page, '08-11-tich-hop', 'Integration Center', [
    { at: main(page).getByRole('tab', { name: 'Đồng bộ UNI-DATA360' }), note: 'Đồng bộ với UNI-DATA360: gửi dữ liệu, đồng bộ ban đầu, nhận danh mục đơn vị / cán bộ, đối soát.' },
    { at: main(page).getByRole('tab', { name: 'Xem trước chuẩn HEMIS' }), note: 'Xem trước dữ liệu theo chuẩn HEMIS (đề tài, công bố đã xác nhận).' },
  ]);
  await main(page).getByRole('tab', { name: 'Xem trước chuẩn HEMIS' }).click();
  await shot(page, '08-12-hemis', 'Xem trước chuẩn HEMIS', [{ at: main(page).getByRole('button', { name: 'Nhiệm vụ KHCN (đề tài)' }), note: 'Chọn nhóm dữ liệu để xem bản ghi theo chuẩn HEMIS trước khi gửi.' }]);
  saveManifest('all');
});
