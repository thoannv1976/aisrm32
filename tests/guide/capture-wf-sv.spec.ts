/**
 * Tài liệu thực hành QUY TRÌNH NCKH SINH VIÊN — đi trọn một đề tài sinh viên qua mọi vai trò, chụp màn hình từng bước.
 * Chạy trên bản cài có dữ liệu mẫu (vd bản cài PC, AI nội bộ): ảnh docs/huong-dan-su-dung/anh/WS-*.jpg, ghi chú manifest-wf-sv.json.
 *
 *   GUIDE_BASE_URL=http://localhost:8088 GUIDE_HEADLESS=1 pnpm exec playwright test -c tests/guide/playwright.config.ts capture-wf-sv
 */
import { expect, test, type Page } from '@playwright/test';
import { act, apiAs, btn, loginAs, main, nav, PDF, saveManifest, shot } from './helpers';

test.describe.configure({ mode: 'serial' });

const SV = 'sv.an@demo.aisrm.test'; // sinh viên chủ nhiệm
const GVHD = 'gv.binh@demo.aisrm.test'; // giảng viên hướng dẫn
const DM = 'dm.ktqt@demo.aisrm.test'; // đầu mối KH khoa
const CV = 'cv.linh@demo.aisrm.test'; // chuyên viên Phòng QLKH
const CV2 = 'cv.minh@demo.aisrm.test'; // chuyên viên Phòng QLKH (thư ký hội đồng)
const TP = 'tp.hung@demo.aisrm.test'; // trưởng phòng QLKH
const PHT = 'pht.nam@demo.aisrm.test'; // phó hiệu trưởng
const HT = 'ht.quang@demo.aisrm.test'; // hiệu trưởng
const CT = 'gv.dung@demo.aisrm.test'; // chủ tịch hội đồng
const UV = 'gv.chi@demo.aisrm.test'; // ủy viên phản biện

const CALL = 'Đợt NCKH sinh viên năm học 2026–2027';
const TITLE = 'Ảnh hưởng của mạng xã hội đến ý định khởi nghiệp của sinh viên khối kinh tế tại Hà Nội';
const S = { proposalUrl: '', code: '', projectUrl: '', councilUrl: '', accUrl: '', callId: '' };

let page: Page;
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  page.on('dialog', (d) => void d.accept(d.type() === 'prompt' ? 'Đã hoàn thành theo kế hoạch.' : undefined));
});
test.afterAll(async () => {
  saveManifest('wf-sv');
  await page.close();
});

const STUDENT_FIELDS = JSON.stringify(
  [
    { key: 'field', label: 'Lĩnh vực', type: 'select', required: true, options: ['Kinh tế', 'Kinh doanh – Quản lý', 'Luật', 'Ngôn ngữ – Văn hóa', 'Khác'] },
    { key: 'objective', label: 'Mục tiêu nghiên cứu', type: 'textarea', required: true, maxLength: 3000 },
    { key: 'methods', label: 'Phương pháp nghiên cứu', type: 'textarea', required: true, maxLength: 3000 },
    { key: 'expectedOutputs', label: 'Sản phẩm dự kiến', type: 'textarea', required: true, maxLength: 2000 },
  ],
  null,
  1,
);

// ------------------------------------------------------------ Bước 1. Phòng QLKH mở đợt NCKH sinh viên
test('01 Phòng QLKH mở đợt NCKH sinh viên', async () => {
  test.setTimeout(6 * 60_000);
  // Làm nóng AI nội bộ (LocalAI nhả GPU sau thời gian không dùng; nạp lại mất 1–3 phút)
  await page.goto('/');
  const ov = await apiAs(page, 'admin@demo.aisrm.test', 'GET', '/ai/admin/overview');
  if (ov.settings.mode === 'live' && String(ov.settings.defaultModelId).startsWith('local__'))
    await apiAs(page, 'admin@demo.aisrm.test', 'POST', '/ai/admin/providers/local/warmup', { modelConfigId: ov.settings.defaultModelId });
  await loginAs(page, CV, '/calls');
  await main(page).getByRole('link', { name: '+ Mở đợt mới' }).click();
  await main(page).getByLabel(/Tên đợt/).fill(CALL);
  await main(page).getByLabel(/Năm kế hoạch/).fill('2027');
  await main(page).getByLabel(/^Cấp/).selectOption('STUDENT');
  await main(page).getByLabel(/Ngày mở/).fill('2026-11-20');
  await main(page).getByLabel(/Hạn nộp/).fill('2027-01-31');
  await main(page).getByLabel(/^Mô tả/).fill('Sinh viên đăng ký đề tài NCKH năm học 2026–2027, có giảng viên hướng dẫn xác nhận. Đề tài xuất sắc được xét giải cấp trường.');
  await main(page).getByLabel(/Điều kiện tham gia/).fill('Sinh viên chính quy năm 2–4; nhóm tối đa 5 sinh viên; có giảng viên hướng dẫn.');
  await main(page).getByLabel(/Trường biểu mẫu/).fill(STUDENT_FIELDS);
  await main(page).getByLabel(/Tài liệu bắt buộc/).fill('de_cuong|Đề cương nghiên cứu|1\nxac_nhan_khoa|Ý kiến của khoa (nếu có)|0');
  await shot(page, 'WS-01-mo-dot', 'Mở đợt NCKH sinh viên', [
    { at: main(page).getByLabel(/Tên đợt/), note: 'Tên đợt, năm kế hoạch.' },
    { at: main(page).getByLabel(/^Cấp/), note: 'Cấp: chọn "Sinh viên" — hồ sơ của đợt sẽ có phần người hướng dẫn.' },
    { at: main(page).getByLabel(/Ngày mở/), note: 'Thời gian nhận hồ sơ.' },
    { at: main(page).getByLabel(/Trường biểu mẫu/), note: 'Biểu mẫu thuyết minh rút gọn cho sinh viên.' },
    { at: main(page).getByLabel(/Tài liệu bắt buộc/), note: 'Tài liệu đính kèm: đề cương (bắt buộc).' },
  ], { fullPage: true });
  await btn(main(page), 'Tạo đợt').click();
  await expect(btn(main(page), 'Mở nhận hồ sơ')).toBeVisible();
  S.callId = new URL(page.url()).pathname.split('/').pop()!;
  await btn(main(page), 'Mở nhận hồ sơ').click();
  await expect(btn(main(page), 'Đóng đợt')).toBeVisible();
  await shot(page, 'WS-02-dot-da-mo', 'Đợt đã mở nhận hồ sơ', [{ at: btn(main(page), 'Đóng đợt'), note: 'Đợt đã mở: sinh viên thấy đợt và tạo hồ sơ. Hết hạn thì bấm "Đóng đợt".' }]);
});

// ------------------------------------------------------------ Bước 2. Sinh viên lập hồ sơ, chọn người hướng dẫn
test('02 Sinh viên lập hồ sơ, chọn giảng viên hướng dẫn', async () => {
  test.setTimeout(6 * 60_000);
  await loginAs(page, SV, '/calls');
  const call = main(page).locator('article', { hasText: CALL });
  await shot(page, 'WS-03-sv-chon-dot', 'Sinh viên chọn đợt', [{ at: btn(call, '+ Tạo hồ sơ đề xuất'), note: 'Sinh viên đăng nhập, vào "Đợt đăng ký", bấm "+ Tạo hồ sơ đề xuất" ở đợt NCKH sinh viên.' }]);
  await btn(call, '+ Tạo hồ sơ đề xuất').click();
  await expect(page).toHaveURL(/\/proposals\/.+/);
  S.proposalUrl = new URL(page.url()).pathname;
  S.code = ((await main(page).getByText(/^DX-\d{4}-\d+$/).first().textContent()) ?? '').trim();

  await main(page).getByLabel(/Tên đề tài/).fill(TITLE);
  await main(page).getByLabel(/Kinh phí đề xuất/).fill('15000000');
  await main(page).getByLabel(/Thời gian thực hiện/).fill('8');
  await main(page).getByLabel(/^Lĩnh vực/).selectOption('Kinh tế');
  await main(page).getByLabel(/Mục tiêu nghiên cứu/).fill('Đo lường mức độ ảnh hưởng của mạng xã hội (TikTok, Facebook, LinkedIn) đến ý định khởi nghiệp của sinh viên khối kinh tế; đề xuất giải pháp cho nhà trường.');
  await main(page).getByLabel(/Phương pháp nghiên cứu/).fill('Khảo sát 400 sinh viên tại 4 trường; mô hình TPB mở rộng; phân tích PLS-SEM; phỏng vấn sâu 10 sinh viên đã khởi nghiệp.');
  await main(page).getByLabel(/Sản phẩm dự kiến/).fill('01 báo cáo tổng kết; 01 bài tham luận hội thảo sinh viên; bộ dữ liệu khảo sát.');
  // Lưu nháp TRƯỚC khi lưu thông tin người hướng dẫn (lưu thẻ hướng dẫn làm tải lại hồ sơ, mất nội dung chưa lưu)
  await btn(page, /Lưu nháp/).click();
  await expect(page.getByText(/Đã lưu lúc/)).toBeVisible();
  const card = main(page).locator('.card', { hasText: 'NCKH sinh viên — người hướng dẫn' });
  await card.getByLabel('Giảng viên hướng dẫn').fill('Bình');
  await card.getByRole('button', { name: /Trần Thị Bình/ }).first().click();
  await card.getByLabel('Ngành').fill('Kinh tế quốc tế');
  await card.getByLabel('Khóa').fill('K62');
  await shot(page, 'WS-04-sv-khai-ho-so', 'Sinh viên khai thuyết minh và chọn giảng viên hướng dẫn', [
    { at: main(page).getByLabel(/Tên đề tài/), note: 'Khai các mục thuyết minh theo biểu mẫu của đợt.' },
    { at: card.getByText('Trần Thị Bình').first(), note: 'Chọn giảng viên hướng dẫn (gõ tên để tìm); khai ngành, khóa.' },
    { at: btn(card, 'Lưu thông tin'), note: 'Bấm "Lưu thông tin" — giảng viên nhận thông báo đề nghị xác nhận hướng dẫn.' },
  ], { fullPage: true });
  await btn(card, 'Lưu thông tin').click();
  await expect(card.getByText(/Chờ .* xác nhận hướng dẫn/)).toBeVisible();
  await expect(main(page).getByLabel(/Tên đề tài/)).toHaveValue(TITLE);
  await main(page).getByRole('tab', { name: /Tài liệu/ }).click();
  const row = main(page).locator('li', { hasText: 'Đề cương nghiên cứu' }).first();
  await row.locator('input[type=file]').setInputFiles(PDF('de-cuong-nckh-sv.pdf'));
  await expect(row.getByRole('button', { name: /\.pdf/ })).toBeVisible();
  await btn(page, '✨ Kiểm tra thuyết minh').click();
  await expect(page.getByText('AI đang xử lý…')).toBeHidden({ timeout: 240_000 });
  await shot(page, 'WS-05-sv-ai-gop-y', 'AI góp ý đề cương trước khi nộp', [
    { at: btn(page, '✨ Kiểm tra thuyết minh'), note: 'AI (chạy trên máy chủ AI nội bộ) rà soát đề cương theo biểu mẫu, quy chế.' },
    { at: page.locator('aside').getByText('Kiểm tra', { exact: true }).locator('..'), note: 'Góp ý để sinh viên tự sửa — AI không quyết định thay hội đồng.' },
  ]);
  // Chưa có xác nhận hướng dẫn → chưa nộp được
  await main(page).getByRole('tab').first().click();
  await shot(page, 'WS-06-cho-gvhd', 'Chờ giảng viên xác nhận hướng dẫn', [{ at: main(page).getByText(/Chờ .* xác nhận hướng dẫn/), note: 'Điểm kiểm soát: chưa có xác nhận của giảng viên hướng dẫn thì hệ thống chưa cho nộp hồ sơ.' }]);
  saveManifest('wf-sv');
});

// ------------------------------------------------------------ Bước 3. Giảng viên xác nhận hướng dẫn
test('03 Giảng viên xác nhận hướng dẫn', async () => {
  await loginAs(page, GVHD);
  await page.locator('header').getByRole('button', { name: /Thông báo/ }).first().click();
  await shot(page, 'WS-07-gvhd-thong-bao', 'Giảng viên nhận thông báo', [{ at: page.getByText('Đề nghị xác nhận hướng dẫn NCKH sinh viên').first(), note: 'Giảng viên nhận thông báo đề nghị xác nhận hướng dẫn; bấm để mở hồ sơ.' }]);
  await page.locator('header').getByRole('button', { name: /Thông báo/ }).first().click();
  await page.goto(S.proposalUrl);
  const card = main(page).locator('.card', { hasText: 'NCKH sinh viên — người hướng dẫn' });
  await shot(page, 'WS-08-gvhd-xac-nhan', 'Giảng viên xác nhận hướng dẫn', [
    { at: btn(card, '✓ Xác nhận hướng dẫn'), note: 'Đọc đề cương; đồng ý hướng dẫn: bấm "✓ Xác nhận hướng dẫn".' },
    { at: btn(card, 'Từ chối'), note: 'Không nhận: "Từ chối" kèm lý do — sinh viên chọn người khác.' },
  ]);
  await btn(card, '✓ Xác nhận hướng dẫn').click();
  await expect(card.getByText(/đã xác nhận hướng dẫn/)).toBeVisible();
});

// ------------------------------------------------------------ Bước 4. Sinh viên nộp hồ sơ
test('04 Sinh viên nộp hồ sơ', async () => {
  await loginAs(page, SV, S.proposalUrl);
  await expect(page.getByText(/đã xác nhận hướng dẫn/)).toBeVisible();
  await act(page, 'Nộp hồ sơ', undefined, { id: 'WS-09-sv-nop', title: 'Sinh viên nộp hồ sơ', notes: ['', 'Giảng viên đã xác nhận → bấm "Nộp hồ sơ", xác nhận. Hồ sơ khóa lại, chuyển về khoa.'] });
  await expect(page.getByText('Đơn vị xem xét').first()).toBeVisible();
});

// ------------------------------------------------------------ Bước 5. Khoa xác nhận
test('05 Khoa xác nhận', async () => {
  await loginAs(page, DM);
  await shot(page, 'WS-10-khoa-viec-cho', 'Khoa: hồ sơ chờ xác nhận', [{ at: main(page).getByRole('row', { name: S.code }), note: 'Đầu mối KH của khoa thấy hồ sơ sinh viên của khoa trong "Việc cần tôi xử lý".' }]);
  await page.goto(S.proposalUrl);
  await act(page, 'Đơn vị xác nhận', undefined, { id: 'WS-11-khoa-xac-nhan', title: 'Khoa xác nhận hồ sơ', notes: ['', 'Khoa xem xét, bấm "Đơn vị xác nhận" để chuyển Phòng QLKH (hoặc "Trả bổ sung" kèm yêu cầu).'] });
  await expect(page.getByText('Phòng KH xử lý').first()).toBeVisible();
});

// ------------------------------------------------------------ Bước 6. Phòng QLKH lập hội đồng xét chọn, hội đồng chấm
test('06 Phòng QLKH lập hội đồng đánh giá NCKH sinh viên', async () => {
  test.setTimeout(8 * 60_000);
  await loginAs(page, CV, '/councils');
  await btn(main(page), '+ Thành lập hội đồng').click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel(/Tên hội đồng/).fill('Hội đồng xét chọn NCKH sinh viên 2026–2027 — Khối Kinh tế');
  await dlg.getByLabel(/^Loại/).selectOption('STUDENT_AWARD');
  await dlg.locator('input[type=date]').fill('2026-12-20');
  await dlg.locator('label', { hasText: S.code }).locator('input[type=checkbox]').check();
  await shot(page, 'WS-12-lap-hoi-dong', 'Thành lập hội đồng đánh giá NCKH sinh viên', [
    { at: dlg.getByLabel(/^Loại/), note: 'Loại: "Đánh giá NCKH sinh viên" — phiếu chấm dành cho sinh viên.' },
    { at: dlg.getByLabel(/Phiếu chấm/), note: 'Mẫu phiếu chấm (tiêu chí, thang điểm).' },
    { at: dlg.locator('label', { hasText: S.code }), note: 'Chọn các đề tài sinh viên đưa ra hội đồng.' },
  ]);
  await dlg.getByRole('button').last().click();
  await expect(page).toHaveURL(/\/councils\/.+/);
  S.councilUrl = new URL(page.url()).pathname;
  await main(page).getByRole('tab', { name: /Thành viên/ }).click();
  const invite = main(page).locator('.card', { hasText: 'Mời thành viên' });
  await invite.getByLabel('Hoặc tìm theo tên').fill('Bình');
  await expect(invite.locator('li', { hasText: 'Trần Thị Bình' }).first()).toBeVisible();
  await shot(page, 'WS-13-xung-dot', 'Cảnh báo xung đột lợi ích khi mời', [{ at: invite.locator('li', { hasText: 'Trần Thị Bình' }).first(), note: 'Điểm kiểm soát: giảng viên hướng dẫn của đề tài bị cảnh báo xung đột lợi ích, không được mời chấm.' }]);
  for (const [name, role] of [['Phạm Quốc Dũng', 'CHAIR'], ['Đặng Quang Minh', 'SECRETARY'], ['Lê Minh Chí', 'REVIEWER']] as const) {
    await invite.getByLabel('Vai trò khi mời').selectOption(role);
    await invite.getByLabel('Hoặc tìm theo tên').fill(name.split(' ').pop()!);
    await invite.locator('li', { hasText: name }).last().getByRole('button', { name: 'Mời', exact: true }).click();
    await page.waitForLoadState('networkidle');
  }
  const cid = S.councilUrl.split('/').pop();
  for (const e of [CT, CV2, UV]) await apiAs(page, e, 'POST', `/councils/${cid}/respond`, { accept: true });
  await page.reload();
  await main(page).getByRole('tab', { name: /Thành viên/ }).click();
  await shot(page, 'WS-14-thanh-vien', 'Thành viên đã nhận lời — mở chấm', [
    { at: main(page).locator('table').first(), note: 'Chủ tịch, thư ký, phản biện đã nhận lời.' },
    { at: btn(page, 'Mở chấm'), note: 'Bấm "Mở chấm" để hội đồng chấm phiếu.' },
  ]);
  await btn(page, 'Mở chấm').click();
  await expect(page.getByText('Đang chấm').first()).toBeVisible();

  for (const [email, scores, comment, cap] of [
    [CT, [22, 18, 18, 18, 8], 'Đề tài thời sự, phương pháp phù hợp. Cần mô tả rõ cách chọn mẫu.', true],
    [UV, [20, 17, 17, 16, 8], 'Đồng ý; bổ sung thang đo biến kiểm soát.', false],
  ] as const) {
    await loginAs(page, email, S.councilUrl);
    await btn(page, 'Tôi không có xung đột lợi ích').click();
    const inputs = main(page).locator('input[type=number]');
    await expect(inputs.first()).toBeVisible();
    const n = await inputs.count();
    for (let i = 0; i < n; i++) {
      const max = Number((await inputs.nth(i).getAttribute('max')) ?? 10);
      await inputs.nth(i).fill(String(Math.min(scores[i] ?? Math.round(max * 0.8), max)));
    }
    await main(page).getByLabel('Nhận xét').fill(comment);
    if (cap)
      await shot(page, 'WS-15-cham-phieu', 'Thành viên hội đồng chấm phiếu', [
        { at: inputs.first(), note: 'Sau khi khai báo không có xung đột lợi ích, chấm từng tiêu chí.' },
        { at: main(page).getByLabel('Nhận xét'), note: 'Nhận xét, yêu cầu chỉnh sửa.' },
        { at: btn(main(page), 'Nộp phiếu'), note: '"Nộp phiếu" — phiếu đã nộp bị khóa.' },
      ]);
    await btn(main(page), 'Nộp phiếu').click();
    await expect(main(page).getByText(/Đã nộp phiếu lúc/)).toBeVisible();
  }
  await loginAs(page, CT, S.councilUrl);
  await btn(page, 'Khóa phiếu & tổng hợp').click();
  await expect(page.getByText('Đã khóa phiếu').first()).toBeVisible();
  await main(page).getByRole('tab', { name: /Kết quả/ }).click();
  await main(page).getByLabel(/^Kết luận /).first().selectOption('APPROVE');
  await btn(main(page), '✨ AI dự thảo biên bản').click();
  await expect(btn(main(page), '✨ AI dự thảo biên bản')).toBeEnabled({ timeout: 240_000 });
  await shot(page, 'WS-16-bien-ban', 'Tổng hợp điểm, AI dự thảo biên bản', [
    { at: main(page).getByText(/Tổng hợp điểm/), note: 'Hệ thống tự tính điểm trung bình — không cộng tay.' },
    { at: main(page).getByLabel(/^Kết luận /).first(), note: 'Chủ tịch chọn kết luận cho từng đề tài.' },
    { at: main(page).getByLabel('Nội dung biên bản'), note: 'AI dự thảo biên bản từ điểm và nhận xét; thư ký, chủ tịch sửa lại.' },
  ], { fullPage: true });
  await btn(main(page), 'Lưu biên bản và kết luận').click();
  await page.waitForLoadState('networkidle');
  await btn(main(page), 'Chủ tịch xác nhận biên bản').click();
  await expect(main(page).getByText(/xác nhận lúc/)).toBeVisible();
  saveManifest('wf-sv');
});

// ------------------------------------------------------------ Bước 7. Trình và phê duyệt
test('07 Phòng QLKH trình, lãnh đạo phê duyệt', async () => {
  await loginAs(page, CV, S.proposalUrl);
  await act(page, 'Trình phê duyệt', 'Hội đồng xét chọn đã thông qua (biên bản đã xác nhận). Kính trình phê duyệt.', { id: 'WS-17-trinh-phe-duyet', title: 'Phòng QLKH trình phê duyệt', notes: ['Ý kiến trình.', 'Bấm "Xác nhận: Trình phê duyệt".'] });
  await loginAs(page, PHT, S.proposalUrl);
  await act(page, 'Phê duyệt', 'Đồng ý cho thực hiện.', { id: 'WS-18-phe-duyet', title: 'Lãnh đạo phê duyệt', notes: ['Ý kiến chỉ đạo.', 'Bấm "Xác nhận: Phê duyệt" — hệ thống tự lập đề tài.'] });
  await expect(page.getByText('Đề xuất đã được phê duyệt và lập đề tài.')).toBeVisible();
  await page.getByRole('link', { name: 'Mở đề tài →' }).click();
  await expect(page).toHaveURL(/\/projects\/.+/);
  S.projectUrl = new URL(page.url()).pathname;
});

// ------------------------------------------------------------ Bước 8. Giao nhiệm vụ
test('08 Phòng QLKH lập mốc, giao nhiệm vụ', async () => {
  await loginAs(page, CV, S.projectUrl);
  await main(page).getByLabel('Bắt đầu').fill('2026-12-01');
  await main(page).getByLabel('Kết thúc').fill('2027-07-31');
  await btn(main(page), 'Cập nhật thời gian').click();
  await page.waitForLoadState('networkidle');
  for (const [t, due, out] of [
    ['Báo cáo giữa kỳ', '2027-03-31', 'Báo cáo giữa kỳ; bộ dữ liệu khảo sát'],
    ['Báo cáo tổng kết', '2027-07-15', 'Báo cáo tổng kết; bài tham luận'],
  ]) {
    await btn(main(page), '+ Thêm mốc').click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel(/Tên mốc/).fill(t);
    await dlg.getByLabel(/Hạn hoàn thành/).fill(due);
    await dlg.getByLabel(/Sản phẩm cần nộp/).fill(out);
    await dlg.getByRole('button', { name: 'Thêm', exact: true }).click();
    await expect(dlg).toBeHidden();
  }
  await shot(page, 'WS-19-lap-moc', 'Lập thời gian, mốc tiến độ', [
    { at: main(page).getByText(/Mốc tiến độ và sản phẩm/), note: 'Thời gian thực hiện và các mốc sản phẩm — hệ thống tự nhắc hạn.' },
    { at: btn(page, 'Giao nhiệm vụ / bắt đầu'), note: 'Bấm "Giao nhiệm vụ / bắt đầu".' },
  ], { fullPage: true });
  await act(page, 'Giao nhiệm vụ / bắt đầu');
  await expect(page.getByText('Đang thực hiện').first()).toBeVisible();
});

// ------------------------------------------------------------ Bước 9. Thực hiện: nhật ký hướng dẫn, nộp sản phẩm
test('09 Thực hiện: nhật ký hướng dẫn, nộp sản phẩm', async () => {
  await loginAs(page, GVHD, S.projectUrl);
  await main(page).getByRole('tab', { name: 'Nhật ký hướng dẫn' }).click();
  const f = main(page).locator('.card', { hasText: 'Ghi buổi hướng dẫn' });
  await f.getByLabel('Ngày').fill('2026-12-10');
  await f.getByLabel(/Nội dung trao đổi/).fill('Góp ý bảng hỏi; thống nhất thang đo TPB; hướng dẫn cách lấy mẫu thuận tiện có kiểm soát.');
  await f.getByLabel('Việc tiếp theo').fill('Khảo sát thử 30 phiếu, kiểm định Cronbach alpha trước 25/12.');
  await shot(page, 'WS-20-nhat-ky-huong-dan', 'Giảng viên ghi nhật ký hướng dẫn', [
    { at: f.getByLabel(/Nội dung trao đổi/), note: 'Sau mỗi buổi hướng dẫn: ghi nội dung trao đổi.' },
    { at: f.getByLabel('Việc tiếp theo'), note: 'Việc sinh viên cần làm tiếp.' },
    { at: btn(f, 'Lưu'), note: 'Bấm "Lưu" — nhật ký là minh chứng quá trình hướng dẫn.' },
  ]);
  await btn(f, 'Lưu').click();
  await expect(main(page).getByText(/Góp ý bảng hỏi/).first()).toBeVisible();

  await loginAs(page, SV, S.projectUrl);
  for (const [title, name] of [['Báo cáo giữa kỳ', 'bao-cao-giua-ky.pdf'], ['Báo cáo tổng kết', 'bao-cao-tong-ket.pdf']]) {
    const ms = main(page).locator('li', { hasText: title }).filter({ has: page.getByRole('button', { name: 'Nộp sản phẩm' }) }).first();
    await ms.locator('input[type=file]').last().setInputFiles(PDF(name));
    await expect(ms.getByRole('button', { name })).toBeVisible();
    if (name.includes('giua'))
      await shot(page, 'WS-21-sv-nop-san-pham', 'Sinh viên nộp sản phẩm theo mốc', [
        { at: ms.getByRole('button', { name: '⬆ Tải sản phẩm' }), note: 'Bấm "⬆ Tải sản phẩm" để chọn tệp sản phẩm của mốc.' },
        { at: ms.getByRole('button', { name: 'Nộp sản phẩm' }), note: 'Bấm "Nộp sản phẩm" — Phòng QLKH xem và chấp nhận.' },
      ]);
    await ms.getByRole('button', { name: 'Nộp sản phẩm' }).click();
    await page.waitForLoadState('networkidle');
  }
  await loginAs(page, CV, S.projectUrl);
  for (let i = 0; i < 2; i++) {
    await main(page).getByRole('button', { name: 'Chấp nhận', exact: true }).first().click();
    await page.waitForLoadState('networkidle');
  }
  await shot(page, 'WS-22-duyet-san-pham', 'Phòng QLKH chấp nhận sản phẩm', [{ at: main(page).getByText(/Mốc tiến độ và sản phẩm/), note: 'Các mốc đã được chấp nhận — tiến độ hiển thị cho khoa, lãnh đạo.' }], { fullPage: true });
});

// ------------------------------------------------------------ Bước 10. Nghiệm thu, hoàn thành
test('10 Nghiệm thu và xác nhận hoàn thành', async () => {
  test.setTimeout(8 * 60_000);
  await loginAs(page, SV, S.projectUrl);
  await act(page, 'Đề nghị nghiệm thu', undefined, { id: 'WS-23-de-nghi-nghiem-thu', title: 'Sinh viên đề nghị nghiệm thu', notes: ['', 'Các mốc đã nộp → bấm "Đề nghị nghiệm thu".'] });
  await loginAs(page, CV, S.projectUrl);
  await act(page, 'Tiếp nhận nghiệm thu');
  // Hội đồng nghiệm thu (chuẩn bị nhanh bằng API, chụp màn hình kết quả)
  const pid = S.projectUrl.split('/').pop()!;
  const c = await apiAs(page, CV, 'POST', '/councils', { title: 'Hội đồng nghiệm thu đề tài NCKH sinh viên — Khoa KTQT', type: 'ACCEPTANCE', rubricTemplateKey: 'acceptance', targets: [{ type: 'project', id: pid }], scoringDeadline: '2027-07-31' });
  for (const [name, role] of [[CT, 'CHAIR'], [CV2, 'SECRETARY'], [UV, 'REVIEWER']] as const) {
    const me = await apiAs(page, name, 'GET', '/me');
    await apiAs(page, CV, 'POST', `/councils/${c.id}/members`, { uid: me.uid, role });
    await apiAs(page, name, 'POST', `/councils/${c.id}/respond`, { accept: true });
  }
  await apiAs(page, CV, 'POST', `/councils/${c.id}/open`);
  for (const email of [CT, UV]) {
    await apiAs(page, email, 'POST', `/councils/${c.id}/coi`, { targetId: pid, hasConflict: false });
    const d = await apiAs(page, email, 'GET', `/councils/${c.id}`);
    const crit = d.item.rubric.criteria as { key: string; maxScore: number }[];
    await apiAs(page, email, 'PUT', `/councils/${c.id}/sheets/${pid}`, { scores: Object.fromEntries(crit.map((k) => [k.key, Math.round(k.maxScore * 0.85)])), comment: 'Đạt yêu cầu; sản phẩm đầy đủ.', submit: true });
  }
  await apiAs(page, CT, 'POST', `/councils/${c.id}/close`);
  S.accUrl = `/councils/${c.id}`;
  await loginAs(page, CT, S.accUrl);
  await main(page).getByRole('tab', { name: /Kết quả/ }).click();
  await main(page).getByLabel(/^Kết luận /).first().selectOption({ index: 1 });
  await btn(main(page), '✨ AI dự thảo biên bản').click();
  await expect(btn(main(page), '✨ AI dự thảo biên bản')).toBeEnabled({ timeout: 240_000 });
  await btn(main(page), 'Lưu biên bản và kết luận').click();
  await page.waitForLoadState('networkidle');
  await btn(main(page), 'Chủ tịch xác nhận biên bản').click();
  await expect(main(page).getByText(/xác nhận lúc/)).toBeVisible();
  await shot(page, 'WS-24-nghiem-thu', 'Hội đồng nghiệm thu: kết quả, biên bản', [{ at: main(page).getByText(/Tổng hợp điểm/), note: 'Hội đồng nghiệm thu chấm, chủ tịch xác nhận biên bản (các bước như hội đồng xét chọn).' }], { fullPage: true });

  await loginAs(page, TP, S.projectUrl);
  await act(page, 'Xác nhận hoàn thành', undefined, { id: 'WS-25-hoan-thanh', title: 'Trưởng phòng QLKH xác nhận hoàn thành', notes: ['', 'Trưởng phòng bấm "Xác nhận hoàn thành" — người tiếp nhận nghiệm thu không được tự xác nhận.'] });
  await expect(page.getByText('Đã hoàn thành').first()).toBeVisible();
  saveManifest('wf-sv');
});

// ------------------------------------------------------------ Bước 11. Xếp giải, thống kê, lãnh đạo theo dõi
test('11 Xếp giải, thống kê, lãnh đạo theo dõi', async () => {
  await loginAs(page, CV, '/student-research');
  await main(page).getByRole('tab', { name: 'Xếp giải' }).click();
  await main(page).getByRole('combobox').first().selectOption(S.callId);
  const sel = main(page).getByLabel(`Giải cho ${S.code}`);
  await expect(sel).toBeVisible();
  await sel.selectOption({ index: 1 });
  await page.waitForLoadState('networkidle');
  await shot(page, 'WS-26-xep-giai', 'Phòng QLKH xếp giải theo điểm hội đồng', [
    { at: main(page).locator('table').first(), note: 'Đề tài xếp theo điểm trung bình hội đồng — minh bạch, không chấm lại.' },
    { at: sel, note: 'Ghi mức giải theo quyết định; sinh viên nhận thông báo.' },
  ]);
  await loginAs(page, HT, '/student-research');
  await shot(page, 'WS-27-thong-ke', 'Lãnh đạo xem thống kê NCKH sinh viên', [
    { at: main(page).getByText('Theo khoa / đơn vị').first(), note: 'Số đề tài theo khoa, ngành, khóa; cơ cấu giải — số liệu tức thì, không phải tổng hợp tay.' },
    { at: btn(main(page), '⬇ Xuất Excel'), note: 'Xuất Excel phục vụ báo cáo.' },
  ], { fullPage: true });
  await page.goto(S.proposalUrl);
  await main(page).getByRole('tab', { name: 'Lịch sử xử lý' }).click();
  await shot(page, 'WS-28-truy-vet', 'Lịch sử xử lý — truy vết toàn bộ quy trình', [{ at: main(page).locator('ol').first(), note: 'Mỗi bước: ai làm, lúc nào, ý kiến gì — phục vụ kiểm tra, thanh tra.' }], { fullPage: true });
  saveManifest('wf-sv');
});
