/**
 * Tài liệu thực hành QUY TRÌNH ĐỀ TÀI KH&CN CẤP TRƯỜNG (cán bộ, giảng viên) — một đề tài đi trọn vòng đời qua mọi vai trò.
 * Ảnh docs/huong-dan-su-dung/anh/WD-*.jpg, ghi chú manifest-wf-dt.json.
 *
 *   GUIDE_BASE_URL=http://localhost:8088 GUIDE_HEADLESS=1 pnpm exec playwright test -c tests/guide/playwright.config.ts capture-wf-dt
 */
import { expect, test, type Page } from '@playwright/test';
import { act, apiAs, btn, loginAs, main, nav, PDF, saveManifest, shot } from './helpers';

test.describe.configure({ mode: 'serial' });

const GV = 'gv.binh@demo.aisrm.test'; // chủ nhiệm đề tài
const TK = 'tk.ktqt@demo.aisrm.test'; // trưởng khoa
const CV = 'cv.linh@demo.aisrm.test'; // chuyên viên Phòng QLKH
const CV2 = 'cv.minh@demo.aisrm.test'; // chuyên viên (thư ký hội đồng)
const TP = 'tp.hung@demo.aisrm.test'; // trưởng phòng QLKH
const PHT = 'pht.nam@demo.aisrm.test'; // phó hiệu trưởng
const HT = 'ht.quang@demo.aisrm.test'; // hiệu trưởng
const CT = 'gv.dung@demo.aisrm.test'; // chủ tịch hội đồng
const UV = 'gv.chi@demo.aisrm.test'; // phản biện

const CALL = 'Đợt xét chọn đề tài KH&CN cấp trường thực hiện năm 2027 (đợt 2)';
const TITLE = 'Giải pháp thúc đẩy chuyển đổi số trong logistics của doanh nghiệp nhỏ và vừa Việt Nam';
const S = { proposalUrl: '', code: '', projectUrl: '', projectCode: '', councilUrl: '' };

let page: Page;
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  page.on('dialog', (d) => void d.accept(d.type() === 'prompt' ? 'Đã hoàn thành theo kế hoạch.' : undefined));
});
test.afterAll(async () => {
  saveManifest('wf-dt');
  await page.close();
});

/** Hội đồng qua API (mời, nhận lời, mở chấm, chấm, khóa) — các bước đã minh họa chi tiết ở hội đồng xét chọn. */
async function quickCouncil(title: string, type: 'PROPOSAL_REVIEW' | 'ACCEPTANCE', rubric: string, target: { type: 'proposal' | 'project'; id: string }, pct: number) {
  const c = await apiAs(page, CV, 'POST', '/councils', { title, type, rubricTemplateKey: rubric, targets: [target], scoringDeadline: '2027-12-31' });
  for (const [email, role] of [[CT, 'CHAIR'], [CV2, 'SECRETARY'], [UV, 'REVIEWER']] as const) {
    const me = await apiAs(page, email, 'GET', '/me');
    await apiAs(page, CV, 'POST', `/councils/${c.id}/members`, { uid: me.uid, role });
    await apiAs(page, email, 'POST', `/councils/${c.id}/respond`, { accept: true });
  }
  await apiAs(page, CV, 'POST', `/councils/${c.id}/open`);
  for (const email of [CT, UV]) {
    await apiAs(page, email, 'POST', `/councils/${c.id}/coi`, { targetId: target.id, hasConflict: false });
    const d = await apiAs(page, email, 'GET', `/councils/${c.id}`);
    const crit = d.item.rubric.criteria as { key: string; maxScore: number }[];
    await apiAs(page, email, 'PUT', `/councils/${c.id}/sheets/${target.id}`, { scores: Object.fromEntries(crit.map((k) => [k.key, Math.round(k.maxScore * pct)])), comment: 'Đạt yêu cầu.', submit: true });
  }
  await apiAs(page, CT, 'POST', `/councils/${c.id}/close`);
  return `/councils/${c.id}`;
}

// ------------------------------------------------------------ Bước 1. Phòng QLKH mở đợt (có bước thẩm định)
test('01 Phòng QLKH mở đợt cấp trường', async () => {
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
  await main(page).getByLabel(/^Cấp/).selectOption('UNIVERSITY');
  await main(page).getByText('Có bước thẩm định / phản biện').click();
  await main(page).getByLabel(/Ngày mở/).fill('2026-11-20');
  await main(page).getByLabel(/Hạn nộp/).fill('2027-01-15');
  await main(page).getByLabel(/^Mô tả/).fill('Nhận đề xuất đề tài KH&CN cấp trường thực hiện năm 2027; ưu tiên hướng chuyển đổi số, kinh tế xanh.');
  await shot(page, 'WD-01-mo-dot', 'Mở đợt đăng ký đề tài cấp trường', [
    { at: main(page).getByLabel(/Tên đợt/), note: 'Tên đợt, năm kế hoạch.' },
    { at: main(page).getByLabel(/^Cấp/), note: 'Cấp: "Cấp trường".' },
    { at: main(page).getByText('Có bước thẩm định / phản biện'), note: 'Bật bước thẩm định: hồ sơ qua hội đồng / phản biện trước khi trình duyệt.' },
    { at: main(page).getByLabel(/Ngày mở/), note: 'Thời gian nhận hồ sơ.' },
    { at: main(page).getByLabel(/Trường biểu mẫu/), note: 'Biểu mẫu thuyết minh chuẩn (sửa khi cần).' },
  ], { fullPage: true });
  await btn(main(page), 'Tạo đợt').click();
  await btn(main(page), 'Mở nhận hồ sơ').click();
  await expect(btn(main(page), 'Đóng đợt')).toBeVisible();
});

// ------------------------------------------------------------ Bước 2. Chủ nhiệm lập, nộp đề xuất
test('02 Giảng viên lập và nộp đề xuất', async () => {
  test.setTimeout(8 * 60_000);
  await loginAs(page, GV, '/calls');
  await btn(main(page).locator('article', { hasText: CALL }), '+ Tạo hồ sơ đề xuất').click();
  await expect(page).toHaveURL(/\/proposals\/.+/);
  S.proposalUrl = new URL(page.url()).pathname;
  S.code = ((await main(page).getByText(/^DX-\d{4}-\d+$/).first().textContent()) ?? '').trim();
  await main(page).getByLabel(/Tên đề tài/).fill(TITLE);
  await main(page).getByLabel(/Kinh phí đề xuất/).fill('150000000');
  await main(page).getByLabel(/Thời gian thực hiện/).fill('12');
  await main(page).getByLabel(/Lĩnh vực nghiên cứu/).selectOption('Kinh doanh – Quản lý');
  await main(page).getByLabel(/Tính cấp thiết/).fill('Chi phí logistics của Việt Nam khoảng 16–17% GDP, cao hơn khu vực; doanh nghiệp nhỏ và vừa chậm ứng dụng công nghệ số trong vận tải, kho bãi.');
  await main(page).getByLabel(/Mục tiêu nghiên cứu/).fill('Đánh giá mức độ chuyển đổi số logistics của DNNVV; xác định rào cản; đề xuất lộ trình và chính sách hỗ trợ.');
  await main(page).getByLabel(/Phương pháp nghiên cứu/).fill('Khảo sát 300 DNNVV; mô hình TOE; hồi quy logistic; nghiên cứu tình huống 5 doanh nghiệp.');
  await main(page).getByLabel(/Sản phẩm dự kiến/).fill('01 bài báo tạp chí trong nước; 01 báo cáo chính sách; 01 bộ chỉ số đánh giá mức độ chuyển đổi số.');
  await btn(page, /Lưu nháp/).click();
  await expect(page.getByText(/Đã lưu lúc/)).toBeVisible();
  await main(page).getByRole('tab', { name: /Tài liệu/ }).click();
  for (const label of ['Thuyết minh đề tài', 'Dự toán kinh phí']) {
    const row = main(page).locator('li', { hasText: label }).first();
    await row.locator('input[type=file]').setInputFiles(PDF(label.includes('Dự toán') ? 'du-toan.pdf' : 'thuyet-minh.pdf'));
    await expect(row.getByRole('button', { name: /\.pdf/ })).toBeVisible();
  }
  await expect(page.getByText('✓ Hồ sơ đã đủ thông tin và tài liệu bắt buộc.')).toBeVisible();
  await shot(page, 'WD-02-ho-so-day-du', 'Thuyết minh, tài liệu đủ — kiểm tra tự động', [
    { at: main(page).locator('li', { hasText: 'Thuyết minh đề tài' }).first(), note: 'Đính kèm tài liệu theo danh mục của đợt.' },
    { at: page.getByText('✓ Hồ sơ đã đủ thông tin và tài liệu bắt buộc.'), note: 'Hệ thống tự kiểm tra đủ mục, đủ tài liệu — thiếu thì chưa cho nộp.' },
  ]);
  await btn(page, '✨ Tóm tắt thuyết minh').click();
  await expect(page.locator('aside').getByText('Tóm tắt', { exact: true })).toBeVisible({ timeout: 240_000 });
  await shot(page, 'WD-03-ai-tom-tat', 'AI tóm tắt thuyết minh', [{ at: page.locator('aside').getByText('Tóm tắt', { exact: true }).locator('..'), note: 'AI nội bộ tóm tắt thuyết minh — dùng khi trình lãnh đạo, gửi hội đồng. Dữ liệu không ra khỏi trường.' }]);
  await act(page, 'Nộp hồ sơ', undefined, { id: 'WD-04-nop', title: 'Chủ nhiệm nộp hồ sơ', notes: ['', 'Bấm "Nộp hồ sơ", xác nhận — hồ sơ khóa lại, chuyển về khoa.'] });
  await expect(page.getByText('Đơn vị xem xét').first()).toBeVisible();
});

// ------------------------------------------------------------ Bước 3. Khoa trả bổ sung, chủ nhiệm nộp lại, khoa xác nhận
test('03 Khoa trả bổ sung, chủ nhiệm nộp lại', async () => {
  await loginAs(page, TK, S.proposalUrl);
  await act(page, 'Trả bổ sung', 'Đề nghị bổ sung kế hoạch khảo sát chi tiết (cỡ mẫu theo vùng, thời gian) và thành viên từ doanh nghiệp.', { id: 'WD-05-tra-bo-sung', title: 'Khoa trả hồ sơ để bổ sung', notes: ['Ghi rõ yêu cầu bổ sung (bắt buộc).', 'Bấm "Xác nhận: Trả bổ sung" — chủ nhiệm nhận thông báo.'] });
  await expect(page.getByText('Cần bổ sung').first()).toBeVisible();
  await loginAs(page, GV, S.proposalUrl);
  await main(page).getByLabel(/Phương pháp nghiên cứu/).fill('Khảo sát 300 DNNVV (Bắc 120, Trung 60, Nam 120) trong tháng 3–5/2027; mô hình TOE; hồi quy logistic; nghiên cứu tình huống 5 doanh nghiệp, có chuyên gia doanh nghiệp tham gia.');
  await btn(page, /Lưu nháp/).click();
  await expect(page.getByText(/Đã lưu lúc/)).toBeVisible();
  await act(page, 'Nộp lại', undefined, { id: 'WD-06-nop-lai', title: 'Chủ nhiệm sửa và nộp lại', notes: ['', 'Sửa theo yêu cầu, bấm "Nộp lại" — hồ sơ quay về đúng bước đã trả.'] });
  await expect(page.getByText('Đơn vị xem xét').first()).toBeVisible();
  await loginAs(page, TK, S.proposalUrl);
  await act(page, 'Đơn vị xác nhận');
  await expect(page.getByText('Phòng KH xử lý').first()).toBeVisible();
});

// ------------------------------------------------------------ Bước 4. Phòng QLKH chuyển thẩm định, hội đồng xét chọn
test('04 Phòng QLKH chuyển thẩm định, hội đồng xét chọn', async () => {
  test.setTimeout(8 * 60_000);
  await loginAs(page, CV, S.proposalUrl);
  await act(page, 'Chuyển thẩm định', undefined, { id: 'WD-07-chuyen-tham-dinh', title: 'Phòng QLKH chuyển thẩm định', notes: ['', 'Hồ sơ hợp lệ → "Chuyển thẩm định" để đưa ra hội đồng xét chọn.'] });
  await expect(page.getByText('Thẩm định / phản biện').first()).toBeVisible();
  await nav(page, 'Hội đồng').click();
  await btn(main(page), '+ Thành lập hội đồng').click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel(/Tên hội đồng/).fill('Hội đồng xét chọn đề tài cấp trường 2027 — Tiểu ban Kinh doanh – Quản lý');
  await dlg.locator('input[type=date]').fill('2026-12-20');
  await dlg.locator('label', { hasText: S.code }).locator('input[type=checkbox]').check();
  await dlg.getByRole('button').last().click();
  await expect(page).toHaveURL(/\/councils\/.+/);
  S.councilUrl = new URL(page.url()).pathname;
  await main(page).getByRole('tab', { name: /Thành viên/ }).click();
  const invite = main(page).locator('.card', { hasText: 'Mời thành viên' });
  await expect(invite.getByText(/điểm phù hợp/).first()).toBeVisible();
  await shot(page, 'WD-08-goi-y-phan-bien', 'Gợi ý thành viên hội đồng theo chuyên môn', [
    { at: invite.locator('li').first(), note: 'Hệ thống gợi ý người phù hợp chuyên môn, cảnh báo xung đột lợi ích (cùng đơn vị, là thành viên đề tài).' },
    { at: invite.getByLabel('Vai trò khi mời'), note: 'Chọn vai trò: Chủ tịch, Thư ký, Phản biện, Ủy viên.' },
    { at: nav(page, 'Phản biện ngoài trường'), note: 'Mời chuyên gia ngoài trường: tạo tài khoản phản biện có thời hạn.' },
  ], { fullPage: true });
  for (const [name, role] of [['Phạm Quốc Dũng', 'CHAIR'], ['Đặng Quang Minh', 'SECRETARY'], ['Lê Minh Chí', 'REVIEWER']] as const) {
    await invite.getByLabel('Vai trò khi mời').selectOption(role);
    await invite.getByLabel('Hoặc tìm theo tên').fill(name.split(' ').pop()!);
    await invite.locator('li', { hasText: name }).last().getByRole('button', { name: 'Mời', exact: true }).click();
    await page.waitForLoadState('networkidle');
  }
  const cid = S.councilUrl.split('/').pop();
  for (const e of [CT, CV2, UV]) await apiAs(page, e, 'POST', `/councils/${cid}/respond`, { accept: true });
  await page.reload();
  await btn(page, 'Mở chấm').click();
  await expect(page.getByText('Đang chấm').first()).toBeVisible();
  for (const [email, pct, comment, cap] of [
    [UV, 0.82, 'Thuyết minh tốt; đề nghị làm rõ thang đo mức độ chuyển đổi số.', true],
    [CT, 0.85, 'Đề tài có tính ứng dụng cao; đồng ý thông qua.', false],
  ] as const) {
    await loginAs(page, email, S.councilUrl);
    await btn(page, 'Tôi không có xung đột lợi ích').click();
    const inputs = main(page).locator('input[type=number]');
    await expect(inputs.first()).toBeVisible();
    const n = await inputs.count();
    for (let i = 0; i < n; i++) {
      const max = Number((await inputs.nth(i).getAttribute('max')) ?? 20);
      await inputs.nth(i).fill(String(Math.round(max * pct)));
    }
    await main(page).getByLabel('Nhận xét').fill(comment);
    if (cap)
      await shot(page, 'WD-09-phan-bien-cham', 'Phản biện chấm phiếu trực tuyến', [
        { at: inputs.first(), note: 'Khai báo không xung đột lợi ích rồi chấm từng tiêu chí.' },
        { at: main(page).getByLabel('Nhận xét'), note: 'Nhận xét, yêu cầu chỉnh sửa.' },
        { at: btn(main(page), 'Nộp phiếu'), note: 'Nộp phiếu — không cần họp, không cần phiếu giấy.' },
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
  await btn(main(page), 'Lưu biên bản và kết luận').click();
  await page.waitForLoadState('networkidle');
  await btn(main(page), 'Chủ tịch xác nhận biên bản').click();
  await expect(main(page).getByText(/xác nhận lúc/)).toBeVisible();
  await shot(page, 'WD-10-ket-qua-hoi-dong', 'Kết quả hội đồng xét chọn, biên bản đã xác nhận', [
    { at: main(page).getByText(/Tổng hợp điểm/), note: 'Điểm tổng hợp tự động, so ngưỡng đề nghị.' },
    { at: main(page).getByText(/xác nhận lúc/), note: 'Biên bản (AI dự thảo, chủ tịch chỉnh và xác nhận) — tải Word để lưu hồ sơ.' },
  ], { fullPage: true });
});

// ------------------------------------------------------------ Bước 5. Ghi nhận thẩm định, phê duyệt
test('05 Ghi nhận thẩm định, lãnh đạo phê duyệt', async () => {
  test.setTimeout(6 * 60_000);
  await loginAs(page, CV, S.proposalUrl);
  await act(page, 'Ghi nhận kết quả thẩm định', 'Hội đồng xét chọn thông qua, điểm TB 83/100 (biên bản đã xác nhận). Kính trình phê duyệt.', { id: 'WD-11-ghi-nhan-tham-dinh', title: 'Ghi nhận kết quả thẩm định, trình phê duyệt', notes: ['Tóm tắt kết quả hội đồng (bắt buộc).', 'Bấm "Xác nhận: Ghi nhận kết quả thẩm định" — hồ sơ chuyển lãnh đạo.'] });
  await loginAs(page, PHT);
  await shot(page, 'WD-12-lanh-dao-viec-cho', 'Lãnh đạo: hồ sơ chờ phê duyệt', [{ at: main(page).getByRole('row', { name: S.code }), note: 'Phó Hiệu trưởng thấy ngay hồ sơ chờ phê duyệt trên trang làm việc.' }]);
  await page.goto(S.proposalUrl);
  await main(page).getByRole('tab', { name: 'Lịch sử xử lý' }).click();
  await shot(page, 'WD-13-lanh-dao-xem-lich-su', 'Lãnh đạo xem toàn bộ quá trình trước khi duyệt', [{ at: main(page).locator('ol').first(), note: 'Đủ căn cứ để quyết định: ai đã xét, ý kiến gì, hội đồng kết luận ra sao.' }], { fullPage: true });
  await act(page, 'Phê duyệt', 'Đồng ý triển khai; Phòng QLKH ký hợp đồng.', { id: 'WD-14-phe-duyet', title: 'Phê duyệt', notes: ['Ý kiến chỉ đạo.', 'Bấm "Xác nhận: Phê duyệt" — đề tài được lập tự động.'] });
  await page.getByRole('link', { name: 'Mở đề tài →' }).click();
  await expect(page).toHaveURL(/\/projects\/.+/);
  S.projectUrl = new URL(page.url()).pathname;
});

// ------------------------------------------------------------ Bước 6. Hợp đồng, mốc, giao nhiệm vụ
test('06 Phòng QLKH ký hợp đồng, lập mốc, giao nhiệm vụ', async () => {
  await loginAs(page, CV, S.projectUrl);
  await main(page).getByRole('tab', { name: 'Kinh phí – hợp đồng' }).click();
  await btn(main(page), '+ Nhập hợp đồng').click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel(/Số hợp đồng/).fill('25/2026/HĐ-KHCN');
  await dlg.getByLabel(/Ngày ký/).fill('2026-12-01');
  await dlg.getByLabel(/Giá trị/).fill('150000000');
  await dlg.getByLabel(/Nguồn kinh phí/).fill('Ngân sách KH&CN của trường năm 2027');
  await shot(page, 'WD-15-hop-dong', 'Nhập hợp đồng thực hiện đề tài', [
    { at: dlg.getByLabel(/Số hợp đồng/), note: 'Số, ngày ký, giá trị hợp đồng.' },
    { at: dlg.getByLabel(/Nguồn kinh phí/), note: 'Nguồn kinh phí — dùng cho báo cáo HEMIS, quyết toán.' },
    { at: dlg.getByRole('button', { name: 'Lưu' }), note: 'Bấm "Lưu".' },
  ]);
  await dlg.getByRole('button', { name: 'Lưu' }).click();
  await expect(dlg).toBeHidden();
  // Tải lại trang sau khi nhập hợp đồng (trang chưa tự làm mới phiên bản đề tài — lỗi đã báo)
  await page.reload();
  await page.waitForLoadState('networkidle');
  await main(page).getByLabel('Bắt đầu').fill('2027-01-01');
  await main(page).getByLabel('Kết thúc').fill('2027-12-31');
  await Promise.all([page.waitForResponse((r) => r.url().includes('/schedule') && r.ok()), btn(main(page), 'Cập nhật thời gian').click()]);
  await page.waitForLoadState('networkidle');
  for (const [t, due, out] of [
    ['Báo cáo khảo sát', '2027-05-31', 'Bộ dữ liệu khảo sát 300 DN; báo cáo mô tả'],
    ['Báo cáo tổng kết', '2027-11-30', 'Báo cáo tổng kết; bản thảo bài báo; bộ chỉ số'],
  ]) {
    await btn(main(page), '+ Thêm mốc').click();
    const d = page.getByRole('dialog');
    await d.getByLabel(/Tên mốc/).fill(t);
    await d.getByLabel(/Hạn hoàn thành/).fill(due);
    await d.getByLabel(/Sản phẩm cần nộp/).fill(out);
    await d.getByRole('button', { name: 'Thêm', exact: true }).click();
    await expect(d).toBeHidden();
  }
  await act(page, 'Giao nhiệm vụ / bắt đầu', undefined, { id: 'WD-16-giao-nhiem-vu', title: 'Giao nhiệm vụ', notes: ['', 'Đủ thời gian và mốc tiến độ → "Giao nhiệm vụ / bắt đầu". Thiếu thì hệ thống chặn.'] });
  await expect(page.getByText('Đang thực hiện').first()).toBeVisible();
  S.projectCode = ((await main(page).getByText(/^DT-\d{4}-\d+$/).first().textContent().catch(() => '')) ?? '').trim();
});

// ------------------------------------------------------------ Bước 7. Thực hiện: sản phẩm, gia hạn
test('07 Chủ nhiệm nộp sản phẩm, xin gia hạn; Phòng QLKH duyệt', async () => {
  await loginAs(page, GV, S.projectUrl);
  for (const [title, name] of [['Báo cáo khảo sát', 'bao-cao-khao-sat.pdf'], ['Báo cáo tổng kết', 'bao-cao-tong-ket.pdf']]) {
    const ms = main(page).locator('li', { hasText: title }).filter({ has: page.getByRole('button', { name: 'Nộp sản phẩm' }) }).first();
    await ms.locator('input[type=file]').last().setInputFiles(PDF(name));
    await expect(ms.getByRole('button', { name })).toBeVisible();
    if (name.includes('khao-sat'))
      await shot(page, 'WD-17-nop-san-pham', 'Chủ nhiệm nộp sản phẩm theo mốc', [
        { at: ms.getByRole('button', { name: '⬆ Tải sản phẩm' }), note: 'Tải tệp sản phẩm của mốc.' },
        { at: ms.getByRole('button', { name: 'Nộp sản phẩm' }), note: '"Nộp sản phẩm" — hệ thống nhắc hạn trước 7 ngày, 1 ngày, khi quá hạn.' },
      ]);
    await ms.getByRole('button', { name: 'Nộp sản phẩm' }).click();
    await page.waitForLoadState('networkidle');
  }
  await btn(main(page), '+ Gửi yêu cầu').click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel(/Loại yêu cầu/).selectOption('EXTENSION');
  await dlg.getByLabel(/Ngày kết thúc mới/).fill('2028-02-29');
  await dlg.getByLabel(/Lý do/).fill('Doanh nghiệp khu vực miền Trung lùi lịch phỏng vấn; đề nghị gia hạn 02 tháng.');
  await shot(page, 'WD-18-xin-gia-han', 'Chủ nhiệm gửi yêu cầu gia hạn', [
    { at: dlg.getByLabel(/Loại yêu cầu/), note: 'Gia hạn, đổi thành viên, điều chỉnh dự toán…' },
    { at: dlg.getByLabel(/Lý do/), note: 'Lý do (bắt buộc) — lưu vào hồ sơ đề tài.' },
  ]);
  await dlg.getByRole('button', { name: 'Gửi', exact: true }).click();
  await expect(dlg).toBeHidden();
  await loginAs(page, CV, S.projectUrl);
  const cr = main(page).locator('li').filter({ has: page.getByRole('button', { name: 'Chấp thuận', exact: true }) }).first();
  await shot(page, 'WD-19-duyet-san-pham-gia-han', 'Phòng QLKH duyệt sản phẩm và yêu cầu gia hạn', [
    { at: main(page).getByRole('button', { name: 'Chấp nhận', exact: true }).first(), note: 'Sản phẩm mốc: "Chấp nhận" hoặc "Trả lại" kèm lý do.' },
    { at: cr.getByRole('button', { name: 'Chấp thuận', exact: true }), note: 'Yêu cầu gia hạn: "Chấp thuận" / từ chối — ngày kết thúc tự cập nhật.' },
  ], { fullPage: true });
  for (let i = 0; i < 2; i++) {
    await main(page).getByRole('button', { name: 'Chấp nhận', exact: true }).first().click();
    await page.waitForLoadState('networkidle');
  }
  await cr.getByRole('button', { name: 'Chấp thuận', exact: true }).click();
  await page.waitForLoadState('networkidle');
});

// ------------------------------------------------------------ Bước 8. Nghiệm thu, hoàn thiện, hoàn thành, lưu trữ
test('08 Nghiệm thu, hoàn thiện, hoàn thành, lưu trữ', async () => {
  test.setTimeout(8 * 60_000);
  await loginAs(page, GV, S.projectUrl);
  await act(page, 'Đề nghị nghiệm thu', undefined, { id: 'WD-20-de-nghi-nghiem-thu', title: 'Chủ nhiệm đề nghị nghiệm thu', notes: ['', 'Đã nộp đủ sản phẩm → "Đề nghị nghiệm thu".'] });
  await loginAs(page, CV, S.projectUrl);
  await act(page, 'Tiếp nhận nghiệm thu');
  const pid = S.projectUrl.split('/').pop()!;
  const acc = await quickCouncil('Hội đồng nghiệm thu đề tài cấp trường — Kinh doanh – Quản lý', 'ACCEPTANCE', 'acceptance', { type: 'project', id: pid }, 0.8);
  await loginAs(page, CT, acc);
  await main(page).getByRole('tab', { name: /Kết quả/ }).click();
  await main(page).getByLabel(/^Kết luận /).first().selectOption({ index: 1 });
  await btn(main(page), '✨ AI dự thảo biên bản').click();
  await expect(btn(main(page), '✨ AI dự thảo biên bản')).toBeEnabled({ timeout: 240_000 });
  await btn(main(page), 'Lưu biên bản và kết luận').click();
  await page.waitForLoadState('networkidle');
  await btn(main(page), 'Chủ tịch xác nhận biên bản').click();
  await expect(main(page).getByText(/xác nhận lúc/)).toBeVisible();
  await shot(page, 'WD-21-nghiem-thu', 'Hội đồng nghiệm thu: điểm, kết luận, biên bản', [{ at: main(page).getByText(/Tổng hợp điểm/), note: 'Hội đồng nghiệm thu chấm theo phiếu nghiệm thu; chủ tịch xác nhận biên bản.' }], { fullPage: true });

  await loginAs(page, TP, S.projectUrl);
  await act(page, 'Yêu cầu hoàn thiện', 'Hoàn thiện báo cáo tổng kết theo góp ý của hội đồng nghiệm thu (mục 3.2, phụ lục số liệu).', { id: 'WD-22-yeu-cau-hoan-thien', title: 'Yêu cầu hoàn thiện sau nghiệm thu', notes: ['Nội dung cần hoàn thiện (bắt buộc).', 'Bấm "Xác nhận: Yêu cầu hoàn thiện".'] });
  await loginAs(page, GV, S.projectUrl);
  await act(page, 'Nộp bản hoàn thiện');
  await loginAs(page, TP, S.projectUrl);
  await act(page, 'Xác nhận hoàn thành', undefined, { id: 'WD-23-hoan-thanh', title: 'Trưởng phòng xác nhận hoàn thành', notes: ['', '"Xác nhận hoàn thành" — người tiếp nhận nghiệm thu không được tự xác nhận (phân tách nhiệm vụ).'] });
  await expect(page.getByText('Đã hoàn thành').first()).toBeVisible();
  await loginAs(page, CV, S.projectUrl);
  await act(page, 'Lưu trữ', undefined, { id: 'WD-24-luu-tru', title: 'Lưu trữ hồ sơ đề tài', notes: ['', '"Lưu trữ" — toàn bộ hồ sơ số, biên bản, sản phẩm giữ lại để tra cứu, thanh tra.'] });
  await main(page).getByRole('tab', { name: 'Lịch sử xử lý' }).click();
  await shot(page, 'WD-25-lich-su-de-tai', 'Lịch sử đề tài — truy vết toàn bộ vòng đời', [{ at: main(page).locator('ol').first(), note: 'Từ giao nhiệm vụ đến lưu trữ: mỗi bước có người làm, thời gian, ý kiến.' }], { fullPage: true });
});

// ------------------------------------------------------------ Bước 9. Báo cáo, HEMIS, điều hành
test('09 HEMIS, điều hành, AI dự thảo báo cáo', async () => {
  test.setTimeout(6 * 60_000);
  await loginAs(page, 'admin@demo.aisrm.test', '/integrations');
  await main(page).getByRole('tab', { name: 'Xem trước chuẩn HEMIS' }).click();
  await main(page).getByRole('button', { name: 'Nhiệm vụ KHCN (đề tài)' }).click();
  await page.waitForLoadState('networkidle');
  await shot(page, 'WD-26-hemis', 'Dữ liệu đề tài theo chuẩn HEMIS', [
    { at: main(page).getByRole('heading', { name: /HEMIS — API/ }), note: 'Quản trị tích hợp xem trước: đề tài tự động có trong dữ liệu chuẩn HEMIS — không nhập lại.' },
    { at: main(page).getByText('Đủ trường bắt buộc').last(), note: 'Hệ thống kiểm tra đủ trường bắt buộc trước khi gửi qua UNI-DATA360.' },
  ], { fullPage: true });
  await loginAs(page, HT, '/dashboard');
  await shot(page, 'WD-27-dieu-hanh', 'Hiệu trưởng xem điều hành & báo cáo', [
    { at: main(page).getByText('Đề xuất theo trạng thái').first(), note: 'Số liệu tức thì: đề xuất, đề tài, công bố theo trạng thái.' },
    { at: main(page).getByText('Theo đơn vị').first(), note: 'So sánh giữa các khoa, viện.' },
  ], { fullPage: true });
  await main(page).getByRole('tab', { name: 'Hỏi đáp số liệu' }).click();
  const q = main(page).getByRole('textbox', { name: 'Câu hỏi số liệu' });
  await btn(main(page), 'Khoa nào có nhiều đề tài nhất năm 2026?').click();
  await expect(btn(main(page), 'Hỏi')).toBeEnabled({ timeout: 240_000 });
  await page.waitForTimeout(1000);
  const card = main(page).locator('.card', { hasText: 'Hỏi đáp số liệu (tiếng Việt)' });
  await shot(page, 'WD-28a-hoi-dap-so-lieu', 'Lãnh đạo hỏi số liệu bằng lời', [
    { at: q, note: 'Gõ câu hỏi bằng lời tự nhiên hoặc bấm một câu gợi ý.' },
    { at: card.locator('table').first(), note: 'AI chỉ chọn truy vấn có sẵn; hệ thống tự tính số từ dữ liệu thật — AI không tự bịa số.' },
  ], { fullPage: true });
  await main(page).getByRole('tab', { name: 'Báo cáo & chốt kỳ' }).click();
  await btn(main(page), '✨ Tạo dự thảo').click();
  await expect(main(page).getByLabel('Dự thảo báo cáo')).toBeVisible({ timeout: 240_000 });
  await shot(page, 'WD-28-ai-bao-cao', 'AI dự thảo báo cáo hoạt động KH&CN', [{ at: main(page).getByLabel('Dự thảo báo cáo'), note: 'AI viết dự thảo báo cáo từ số liệu đã tính — lãnh đạo, Phòng QLKH chỉnh sửa trước khi dùng.' }]);
  saveManifest('wf-dt');
});
