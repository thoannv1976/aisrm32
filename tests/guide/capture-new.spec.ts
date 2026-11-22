/**
 * Chụp màn hình cho tài liệu "Chức năng mới" (hoàn thiện theo Thư mời K24): danh mục KH&CN, kinh phí – hợp đồng,
 * HEMIS, công bố (PDF, ORCID, phân loại), NCKH sinh viên, Researcher 360, điều hành, quản trị.
 * Ảnh: docs/huong-dan-su-dung/anh/N*.jpg; ghi chú: manifest-moi.json.
 *
 *   GUIDE_HEADLESS=1 pnpm exec playwright test -c tests/guide/playwright.config.ts capture-new
 */
import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { apiAs, btn, loginAs, main, nav, saveManifest, shot } from './helpers';

test.describe.configure({ mode: 'serial' });

const GV = 'gv.binh@demo.aisrm.test';
const GV2 = 'gv.chi@demo.aisrm.test';
const SV = 'sv.an@demo.aisrm.test';
const DM = 'dm.ktqt@demo.aisrm.test';
const TK = 'tk.ktqt@demo.aisrm.test';
const CV = 'cv.linh@demo.aisrm.test';
const TP = 'tp.hung@demo.aisrm.test';
const ADMIN = 'admin@demo.aisrm.test';

/** PDF có lớp chữ (trang đầu bài báo mẫu) để minh họa "Điền từ tệp PDF". */
function samplePdf(): Buffer {
  const lines = [
    'Digital trade and export performance of Vietnamese SMEs',
    'Nguyen Van A, Tran Thi Binh',
    'Journal of Economics and Development (sample), Vol. 27, No. 4, pp. 33-49, 2025',
    'ISSN 1859-0020',
    'DOI: 10.1234/jed.2025.27.4.33',
    'Abstract: This paper examines how digital trade platforms affect export performance.',
  ];
  const content = `BT /F1 11 Tf 50 760 Td 16 TL ${lines.map((l) => `(${l}) Tj T*`).join(' ')} ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offs: number[] = [];
  objs.forEach((o, i) => {
    offs.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}

let page: Page;
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  page.on('dialog', (d) => void d.accept(d.type() === 'prompt' ? 'Bổ sung bảng số liệu chương 3' : undefined));
});
test.afterAll(async () => {
  saveManifest('moi');
  await page.close();
});

async function pick(label: string, name: string) {
  const input = page.getByRole('textbox', { name: label, exact: true });
  await input.fill(name.split(' ').slice(-2).join(' '));
  await page.getByRole('button', { name: new RegExp(name) }).first().click();
}

test('00 chuẩn bị dữ liệu và AI nội bộ', async () => {
  test.setTimeout(10 * 60_000);
  if (process.env.GUIDE_SKIP_SEED !== '1') execFileSync(process.execPath, [join(__dirname, '..', '..', 'scripts', 'dev-local.mjs'), 'seed'], { stdio: 'inherit' });
  await page.goto('/');
  const ov = await apiAs(page, ADMIN, 'GET', '/ai/admin/overview');
  let model = (ov.models as { id: string; provider: string; modelId: string }[]).find((m) => m.provider === 'local' && m.modelId === 'ornith-1.5-9b-q4');
  model ??= await apiAs(page, ADMIN, 'POST', '/ai/admin/models', { provider: 'local', modelId: 'ornith-1.5-9b-q4', label: 'Ornith 9B (máy chủ AI nội bộ)', inputPricePerMTokUsd: '0', outputPricePerMTokUsd: '0' });
  await apiAs(page, ADMIN, 'PUT', '/ai/admin/settings', { ...ov.settings, mode: 'live', defaultModelId: model!.id, maxOutputTokens: Math.max(ov.settings.maxOutputTokens, 900) });
  await apiAs(page, ADMIN, 'POST', '/ai/admin/providers/local/warmup', { modelConfigId: model!.id });
  // ORCID mẫu chính thức của ORCID (Josiah Carberry — hồ sơ hư cấu dùng để thử)
  await apiAs(page, GV, 'PUT', '/me/profile', { degree: 'TS', orcid: '0000-0002-1825-0097', expertise: ['Kinh tế quốc tế', 'Chuỗi giá trị toàn cầu', 'Thương mại quốc tế', 'Doanh nghiệp xuất khẩu'], researchInterests: 'Chuỗi cung ứng toàn cầu, logistics, hiệp định thương mại tự do' });
});

// ---------------------------------------------------------------- A. Danh mục KH&CN
test('A danh mục KH&CN', async () => {
  test.setTimeout(10 * 60_000);
  await loginAs(page, GV, '/');
  await nav(page, 'Danh mục KH&CN').click();
  await expect(main(page).getByRole('heading', { name: 'Danh mục KH&CN' })).toBeVisible();
  await shot(page, 'N-A1-danh-muc', 'Trang Danh mục KH&CN', [
    { at: nav(page, 'Danh mục KH&CN'), note: 'Menu **Danh mục KH&CN** (mọi vai trò).' },
    { at: main(page).locator('a.card'), all: true, note: 'Năm danh mục: nhóm nghiên cứu, sở hữu trí tuệ, chuyển giao, hội thảo, giải thưởng — kèm số đã xác nhận / chờ xác nhận.' },
  ]);
  await main(page).getByRole('link', { name: /Sở hữu trí tuệ/ }).click();
  await shot(page, 'N-A2-shtt-danh-sach', 'Danh sách tài sản trí tuệ', [
    { at: page.getByRole('link', { name: /Kê khai/ }), note: 'Bấm **+ Kê khai tài sản trí tuệ** để thêm mới.' },
    { at: btn(page, '⬇ Xuất Excel'), note: 'Xuất danh mục ra Excel (theo phạm vi quyền).' },
    { at: main(page).locator('table'), note: 'Danh sách: mã, tên, loại, tình trạng, văn bằng, trạng thái xác nhận.' },
  ]);
  await page.getByRole('link', { name: /Kê khai/ }).click();
  await page.getByLabel(/Tên đối tượng/).fill('Phương pháp dự báo nhu cầu xuất khẩu nông sản bằng học máy');
  await page.getByLabel(/^Loại/).selectOption('UTILITY');
  await pick('Thêm người', 'Trần Thị Bình');
  await page.getByLabel(/Tình trạng/).selectOption('FILED');
  await page.getByLabel(/Số đơn/).fill('2-2026-00315');
  await page.getByLabel(/Ngày nộp đơn/).fill('2026-10-15');
  await page.getByLabel(/Cơ quan cấp/).fill('Cục Sở hữu trí tuệ');
  await shot(page, 'N-A3-shtt-ke-khai', 'Kê khai tài sản trí tuệ', [
    { at: page.getByLabel(/Tên đối tượng/), note: 'Nhập tên đối tượng; các trường có dấu * là bắt buộc.' },
    { at: page.getByLabel(/^Loại/), note: 'Chọn loại theo danh mục (sáng chế, giải pháp hữu ích, quyền tác giả…).' },
    { at: page.getByText('Trần Thị Bình').first(), note: 'Thêm tác giả: gõ tên để chọn người trong trường, hoặc nhập tên người ngoài trường.' },
    { at: btn(page, 'Lưu nháp'), note: 'Bấm **Lưu nháp**.' },
  ], { fullPage: true });
  await btn(page, 'Lưu nháp').click();
  await expect(btn(page, 'Nộp để xác nhận')).toBeVisible();
  await page.locator('input[type=file]').first().setInputFiles({ name: 'don-dang-ky-GPHI.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% mau\n') });
  await expect(main(page).getByRole('button', { name: 'don-dang-ky-GPHI.pdf' })).toBeVisible();
  await shot(page, 'N-A4-shtt-nop', 'Đính kèm minh chứng và nộp xác nhận', [
    { at: page.getByRole('button', { name: /Tải minh chứng/ }), note: 'Tải minh chứng (đơn, văn bằng, quyết định…).' },
    { at: btn(page, 'Nộp để xác nhận'), note: 'Bấm **Nộp để xác nhận** — Phòng KH nhận thông báo.' },
  ]);
  const url = page.url();
  await btn(page, 'Nộp để xác nhận').click();
  await expect(main(page).getByText('Chờ xác nhận').first()).toBeVisible();

  await loginAs(page, CV, new URL(url).pathname);
  await page.getByLabel(/Ghi chú/).fill('Đã đối chiếu đơn đăng ký và giấy báo nhận đơn.');
  await shot(page, 'N-A5-xac-nhan', 'Phòng KH xác nhận bản kê khai', [
    { at: page.getByLabel(/Ghi chú/), note: 'Ghi chú (bắt buộc khi trả bổ sung).' },
    { at: btn(page, '✓ Xác nhận'), note: 'Bấm **✓ Xác nhận** nếu thông tin khớp minh chứng; hoặc **↺ Trả bổ sung**.' },
  ]);
  await btn(page, '✓ Xác nhận').click();
  await expect(main(page).getByText('Đã xác nhận').first()).toBeVisible();
});

// ---------------------------------------------------------------- B. Kinh phí – hợp đồng, HEMIS
test('B kinh phí – hợp đồng, HEMIS', async () => {
  test.setTimeout(10 * 60_000);
  await loginAs(page, GV, '/projects/dt1');
  await page.getByRole('tab', { name: 'Kinh phí – hợp đồng' }).click();
  await expect(main(page).getByText('Dự toán (đã chốt)')).toBeVisible();
  await shot(page, 'N-B1-kinh-phi', 'Tab Kinh phí – hợp đồng của đề tài', [
    { at: page.getByRole('tab', { name: 'Kinh phí – hợp đồng' }), note: 'Mở tab **Kinh phí – hợp đồng** trong trang đề tài.' },
    { at: main(page).locator('.card.p-3'), all: true, note: 'Tổng hợp: đề xuất, giá trị hợp đồng, đã duyệt chi, đã giải ngân, còn lại.' },
    { at: main(page).getByRole('heading', { name: 'Hợp đồng' }), note: 'Hợp đồng do Phòng KH nhập.' },
    { at: main(page).getByRole('heading', { name: /Dự toán/ }), note: 'Dự toán theo mục chi; sau khi Phòng KH **chốt** mới lập đề nghị chi.' },
  ]);
  await btn(page, '+ Lập đề nghị chi').click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel(/Mục chi/).selectOption('LABOR');
  await dlg.getByLabel(/Nội dung chi/).fill('Thuê khoán chuyên đề 2: mô hình dự báo kim ngạch');
  await dlg.getByLabel(/Số tiền/).fill('15000000');
  await shot(page, 'N-B2-de-nghi-chi', 'Lập đề nghị chi', [
    { at: dlg.getByLabel(/Mục chi/), note: 'Chọn mục chi trong dự toán đã chốt.' },
    { at: dlg.getByLabel(/Nội dung chi/), note: 'Ghi nội dung chi.' },
    { at: dlg.getByLabel(/Số tiền/), note: 'Số tiền — hệ thống chặn nếu vượt phần còn lại của mục chi.' },
    { at: dlg.getByRole('button', { name: 'Gửi đề nghị' }), note: 'Bấm **Gửi đề nghị**.' },
  ]);
  await dlg.getByRole('button', { name: 'Gửi đề nghị' }).click();
  await expect(dlg).toBeHidden();

  await loginAs(page, CV, '/projects/dt1');
  await page.getByRole('tab', { name: 'Kinh phí – hợp đồng' }).click();
  const row = main(page).locator('tr', { hasText: 'chuyên đề 2' });
  await shot(page, 'N-B3-duyet-chi', 'Phòng KH duyệt đề nghị chi', [
    { at: row.getByRole('button', { name: 'Duyệt', exact: true }), note: 'Bấm **Duyệt** (hoặc **Không duyệt** kèm lý do).' },
    { at: main(page).locator('tr', { hasText: 'Hội thảo công bố' }).getByRole('button', { name: 'Duyệt', exact: true }), note: 'Đề nghị khác đang chờ duyệt.' },
  ]);
  await row.getByRole('button', { name: 'Duyệt', exact: true }).click();
  await expect(row.getByRole('button', { name: 'Ghi nhận giải ngân' })).toBeVisible();
  await row.getByRole('button', { name: 'Ghi nhận giải ngân' }).click();
  const d2 = page.getByRole('dialog');
  await d2.getByLabel(/Số chứng từ/).fill('PC-2026-1187');
  await shot(page, 'N-B4-giai-ngan', 'Ghi nhận giải ngân theo chứng từ', [
    { at: d2.getByLabel(/Số tiền giải ngân/), note: 'Số tiền giải ngân (không vượt số đã duyệt).' },
    { at: d2.getByLabel(/Số chứng từ/), note: 'Số chứng từ theo Phòng Tài chính — hệ thống không tự suy ra giải ngân.' },
    { at: d2.getByRole('button', { name: 'Ghi nhận' }), note: 'Bấm **Ghi nhận**.' },
  ]);
  await d2.getByRole('button', { name: 'Ghi nhận' }).click();
  await expect(d2).toBeHidden();
  await page.getByRole('tab', { name: 'Tổng quan & tiến độ' }).click();
  await main(page).getByRole('heading', { name: 'Thông tin HEMIS' }).scrollIntoViewIfNeeded();
  await main(page).locator('section', { hasText: 'Thông tin HEMIS' }).getByRole('button', { name: /Cập nhật/ }).click();
  const d3 = page.getByRole('dialog');
  await d3.getByLabel('Kết quả nghiệm thu').selectOption('GOOD');
  await shot(page, 'N-B5-hemis', 'Cập nhật thông tin HEMIS của đề tài', [
    { at: d3.getByLabel('Cấp đề tài'), note: 'Cấp, phân loại, lĩnh vực KH&CN, nguồn kinh phí theo danh mục HEMIS.' },
    { at: d3.getByLabel('Kết quả nghiệm thu'), note: 'Kết quả nghiệm thu, ngày nghiệm thu (khi có).' },
    { at: d3.getByRole('button', { name: 'Lưu' }), note: 'Bấm **Lưu** — dữ liệu dùng cho báo cáo HEMIS.' },
  ]);
  await d3.getByRole('button', { name: 'Lưu' }).click();
});

// ---------------------------------------------------------------- C. Công bố: PDF, ORCID, phân loại, phiên bản
test('C công bố mở rộng', async () => {
  test.setTimeout(15 * 60_000);
  await loginAs(page, GV, '/publications/new');
  await page.locator('input[type=file][accept="application/pdf"]').setInputFiles({ name: 'bai-bao.pdf', mimeType: 'application/pdf', buffer: samplePdf() });
  await expect(page.getByText('Các trường đã điền')).toBeVisible({ timeout: 240_000 });
  await shot(page, 'N-C1-dien-tu-pdf', 'Điền thông tin công bố từ tệp PDF', [
    { at: btn(page, '✨ Điền từ tệp PDF'), note: 'Bấm **✨ Điền từ tệp PDF**, chọn bản PDF bài báo.' },
    { at: page.getByLabel(/Tiêu đề/), note: 'Tiêu đề, DOI, năm, nơi công bố được điền sẵn — **kiểm tra lại** trước khi lưu.' },
    { at: page.locator('fieldset', { hasText: 'Thông tin theo HEMIS' }), note: 'Nhóm trường HEMIS: tập, số, trang, ISSN (sách: ISBN, NXB).' },
  ], { fullPage: true });
  await btn(page, 'Lưu nháp').click();
  await expect(page.getByRole('link', { name: '✎ Sửa' })).toBeVisible();
  await page.locator('input[type=file]').first().setInputFiles({ name: 'ban-thao.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% v1\n') });
  await expect(main(page).getByRole('button', { name: 'ban-thao.pdf' })).toBeVisible();
  await main(page).getByRole('button', { name: '⟳ Phiên bản mới' }).first().locator('..').locator('input[type=file]').setInputFiles({ name: 'ban-in-chinh-thuc.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% v2\n') });
  await expect(main(page).getByRole('button', { name: 'ban-in-chinh-thuc.pdf' })).toBeVisible();
  await main(page).getByRole('button', { name: 'Lịch sử phiên bản' }).click();
  await shot(page, 'N-C2-phien-ban', 'Kho minh chứng có phiên bản', [
    { at: page.getByRole('dialog').locator('ol'), note: 'Bản mới (v2) đang hiệu lực; bản cũ (v1) vẫn lưu, tải lại được.' },
  ]);
  await page.getByRole('dialog').getByRole('button', { name: 'Đóng' }).click();

  await loginAs(page, GV, '/publications/cb1');
  await btn(page, '🔎 Kiểm chứng ORCID').click();
  await expect(main(page).getByText(/Kiểm chứng lúc/)).toBeVisible({ timeout: 60_000 });
  await btn(page, '✨ Giải thích kết quả').click();
  await expect(main(page).getByText('AI giải thích kết quả kiểm chứng')).toBeVisible({ timeout: 240_000 });
  await shot(page, 'N-C3-orcid', 'Kiểm chứng ORCID và AI giải thích kết quả', [
    { at: btn(page, '🔎 Kiểm chứng ORCID'), note: 'Đối chiếu công bố với hồ sơ ORCID công khai của tác giả trong trường.' },
    { at: main(page).locator('section', { hasText: 'Kiểm chứng ORCID' }).locator('ul').first(), note: 'Kết quả theo từng tác giả: khớp DOI / khớp tên bài / không thấy.' },
    { at: main(page).getByText('AI giải thích kết quả kiểm chứng'), note: 'AI tóm tắt kết quả Crossref + ORCID và việc cần kiểm tra — không kết luận thay cán bộ.' },
  ], { fullPage: true });

  await page.goto('/publications/orcid');
  await expect(page.getByText(/ORCID có \d+ công trình/)).toBeVisible({ timeout: 60_000 });
  await main(page).locator('tbody input[type=checkbox]:not([disabled])').first().check();
  await shot(page, 'N-C4-nhap-orcid', 'Nhập công bố từ ORCID', [
    { at: main(page).locator('tbody input[type=checkbox]').first(), note: 'Chọn công trình chưa có trong AI-SRM (công trình đã có bị làm mờ).' },
    { at: page.getByRole('button', { name: /Tạo \d+ bản nháp/ }), note: 'Bấm **Tạo … bản nháp** — bổ sung tác giả, minh chứng rồi nộp như thường lệ.' },
  ]);

  await loginAs(page, CV, '/publications/cb1');
  await main(page).getByRole('button', { name: '✎ Xác nhận phân loại' }).click();
  const card = main(page).locator('section', { hasText: 'Phân loại tạp chí' });
  await card.getByLabel('Phạm vi tạp chí').selectOption('DOMESTIC');
  await card.getByLabel(/Nguồn xếp hạng/).fill('Danh mục HĐGSNN 2025');
  await shot(page, 'N-C5-phan-loai', 'Phòng KH xác nhận phân loại tạp chí', [
    { at: card.getByLabel('Phạm vi tạp chí'), note: 'Phạm vi tạp chí: quốc tế / trong nước.' },
    { at: card.getByLabel('Xếp hạng'), note: 'Xếp hạng Q (nếu có) — bắt buộc ghi nguồn tra cứu. AI không tự kết luận Q.' },
    { at: card.getByRole('button', { name: 'Lưu' }), note: 'Bấm **Lưu**.' },
  ]);
  await card.getByRole('button', { name: 'Lưu' }).click();
});

// ---------------------------------------------------------------- D. NCKH sinh viên
test('D NCKH sinh viên', async () => {
  test.setTimeout(15 * 60_000);
  await loginAs(page, SV, '/calls/call-sv');
  await btn(page, '+ Tạo hồ sơ đề xuất').click();
  await expect(page).toHaveURL(/proposals\//);
  const pid = page.url().split('/').pop()!;
  await pick('Giảng viên hướng dẫn', 'Trần Thị Bình');
  await page.getByLabel('Ngành').fill('Kinh tế quốc tế');
  await page.getByLabel('Khóa').fill('K63');
  await shot(page, 'N-D1-chon-gvhd', 'Sinh viên chọn giảng viên hướng dẫn', [
    { at: main(page).locator('section', { hasText: 'NCKH sinh viên — người hướng dẫn' }).locator('form'), note: 'Chọn giảng viên hướng dẫn, khai ngành, khóa.' },
    { at: btn(page, 'Lưu thông tin'), note: 'Bấm **Lưu thông tin** — giảng viên nhận thông báo đề nghị xác nhận.' },
  ]);
  await btn(page, 'Lưu thông tin').click();
  await expect(main(page).getByText(/Chờ .* xác nhận hướng dẫn/)).toBeVisible();

  await loginAs(page, GV, `/proposals/${pid}`);
  await shot(page, 'N-D2-gv-xac-nhan', 'Giảng viên xác nhận hướng dẫn', [
    { at: main(page).getByText(/Chờ .* xác nhận hướng dẫn/), note: 'Hồ sơ chưa nộp được khi giảng viên chưa xác nhận.' },
    { at: btn(page, '✓ Xác nhận hướng dẫn'), note: 'Giảng viên bấm **✓ Xác nhận hướng dẫn** (hoặc **Từ chối** kèm lý do).' },
  ]);
  await btn(page, '✓ Xác nhận hướng dẫn').click();
  await expect(main(page).getByText(/đã xác nhận hướng dẫn/)).toBeVisible();

  await loginAs(page, DM, '/projects/dtsv1');
  await page.getByRole('tab', { name: 'Nhật ký hướng dẫn' }).click();
  await page.getByLabel(/Nội dung trao đổi/).fill('Góp ý cấu trúc báo cáo tổng kết; thống nhất bổ sung kiểm định độ ổn định mô hình.');
  await shot(page, 'N-D3-nhat-ky', 'Nhật ký hướng dẫn', [
    { at: page.getByRole('tab', { name: 'Nhật ký hướng dẫn' }), note: 'Tab **Nhật ký hướng dẫn** của đề tài sinh viên.' },
    { at: main(page).locator('ol').first(), note: 'Các buổi hướng dẫn đã ghi.' },
    { at: page.getByLabel(/Nội dung trao đổi/), note: 'Ghi buổi mới: ngày, nội dung, việc tiếp theo → **Lưu**.' },
  ]);
  await main(page).getByRole('button', { name: 'Lưu' }).click();

  await loginAs(page, CV, '/proposals/sv1');
  await btn(page, '✨ Gợi ý nhận xét theo tiêu chí').click();
  await expect(main(page).getByText('Nhận xét sơ bộ theo tiêu chí')).toBeVisible({ timeout: 240_000 });
  await shot(page, 'N-D4-ai-tieu-chi', 'AI gợi ý nhận xét theo tiêu chí', [
    { at: btn(page, '✨ Gợi ý nhận xét theo tiêu chí'), note: 'Bấm **✨ Gợi ý nhận xét theo tiêu chí**.' },
    { at: main(page).getByText('Nhận xét sơ bộ theo tiêu chí').locator('..'), note: 'Nhận xét sơ bộ theo từng tiêu chí của phiếu — chỉ để tham khảo, không chấm điểm.' },
  ], { fullPage: true });

  await nav(page, 'NCKH sinh viên').click();
  await expect(main(page).getByRole('heading', { name: 'Theo khoa / đơn vị' })).toBeVisible();
  await shot(page, 'N-D5-thong-ke', 'Thống kê NCKH sinh viên', [
    { at: nav(page, 'NCKH sinh viên'), note: 'Menu **NCKH sinh viên**.' },
    { at: page.getByRole('tablist'), note: 'Ba tab: Thống kê, Danh sách đề tài, Xếp giải.' },
    { at: main(page).locator('section').first(), note: 'Thống kê theo khoa; bên dưới: cơ cấu giải, theo ngành, theo khóa.' },
  ]);
  await page.getByRole('tab', { name: 'Xếp giải' }).click();
  const opts = await main(page).getByRole('combobox').locator('option').allTextContents();
  await main(page).getByRole('combobox').selectOption({ label: opts.find((o) => o.includes('sinh viên'))! });
  await expect(main(page).getByText(/Xếp hạng, xếp giải/)).toBeVisible();
  await shot(page, 'N-D6-xep-giai', 'Xếp giải NCKH sinh viên', [
    { at: main(page).getByRole('combobox').first(), note: 'Chọn đợt NCKH sinh viên.' },
    { at: main(page).locator('table'), note: 'Xếp theo điểm trung bình của hội đồng; Phòng KH chọn mức giải theo quyết định.' },
  ]);
});

// ---------------------------------------------------------------- E. Researcher 360
test('E Researcher 360', async () => {
  test.setTimeout(10 * 60_000);
  await loginAs(page, CV, '/experts');
  await page.getByLabel('Từ khóa tìm chuyên gia').fill('xuất khẩu nông sản');
  await btn(page, 'Tìm chuyên gia').click();
  await expect(main(page).locator('ul li.card').first()).toBeVisible();
  await shot(page, 'N-E1-tim-chuyen-gia', 'Tìm chuyên gia theo chủ đề', [
    { at: page.getByLabel('Từ khóa tìm chuyên gia'), note: 'Nhập chủ đề / từ khóa, bấm **Tìm chuyên gia**.' },
    { at: main(page).locator('ul li.card').first(), note: 'Kết quả xếp theo điểm phù hợp, kèm minh chứng khớp (chuyên môn, công bố, đề tài).' },
  ]);
  await page.getByRole('tab', { name: 'Mạng lưới hợp tác' }).click();
  await expect(main(page).locator('svg circle').first()).toBeVisible();
  await shot(page, 'N-E2-mang-luoi', 'Mạng lưới đồng tác giả', [
    { at: main(page).locator('svg[aria-label*="mạng lưới"]'), note: 'Mỗi nút là một nhà khoa học (màu theo đơn vị); cạnh là công bố chung.' },
    { at: main(page).getByRole('heading', { name: 'Thống kê' }).locator('..').locator('..'), note: 'Số người, số cặp hợp tác, hợp tác liên đơn vị.' },
  ]);
  await page.getByRole('tab', { name: 'Bản đồ năng lực' }).click();
  await expect(main(page).locator('table')).toBeVisible();
  await shot(page, 'N-E3-nang-luc', 'Bản đồ năng lực theo đơn vị', [
    { at: main(page).locator('svg').first(), note: 'Chuyên môn phổ biến toàn trường.' },
    { at: main(page).locator('table'), note: 'Theo đơn vị: nhà khoa học, công bố, đề tài, nhóm nghiên cứu, chuyên môn nổi bật, lĩnh vực.' },
  ], { fullPage: true });

  await loginAs(page, GV, '/profile');
  await btn(page, '✨ AI dự thảo giới thiệu').click();
  await expect(page.getByLabel('English')).toBeVisible({ timeout: 240_000 });
  await shot(page, 'N-E4-gioi-thieu', 'AI dự thảo giới thiệu học thuật song ngữ', [
    { at: page.getByLabel('Tiếng Việt'), note: 'Bản tiếng Việt do AI dự thảo từ dữ liệu đã xác nhận — sửa nếu cần.' },
    { at: page.getByLabel('English'), note: 'Bản tiếng Anh.' },
    { at: btn(page, '✓ Duyệt và công khai'), note: 'Bấm **✓ Duyệt và công khai**; chỉ bản đã duyệt hiển thị trên hồ sơ.' },
  ]);
  await btn(page, '✓ Duyệt và công khai').click();
  await expect(btn(page, '✓ Duyệt và công khai')).toBeHidden();
  await shot(page, 'N-E5-ho-so-360', 'Hồ sơ khoa học 360', [
    { at: btn(page, '⬇ Lý lịch (Word)'), note: '**⬇ Lý lịch (Word)**: lý lịch khoa học theo mẫu, chỉ dữ liệu đã xác nhận.' },
    { at: page.getByRole('link', { name: '⇩ Nhập từ ORCID' }), note: 'Nhập công bố từ ORCID.' },
    { at: main(page).getByRole('heading', { name: /Giới thiệu học thuật/ }), note: 'Giới thiệu song ngữ đã duyệt.' },
  ]);
  await main(page).getByRole('heading', { name: /Giải thưởng KH&CN/ }).scrollIntoViewIfNeeded();
  await shot(page, 'N-E6-ho-so-danh-muc', 'Danh mục và đồng tác giả trên hồ sơ', [
    { at: main(page).getByRole('heading', { name: /Giải thưởng KH&CN|Sở hữu trí tuệ|Nhóm nghiên cứu/ }), all: true, note: 'Nhóm nghiên cứu, sở hữu trí tuệ, giải thưởng… đã xác nhận tự hiện trên hồ sơ.' },
    { at: main(page).getByRole('heading', { name: /Mạng lưới đồng tác giả/ }), note: 'Đồng tác giả trong trường.' },
  ]);
});

// ---------------------------------------------------------------- F. Điều hành & báo cáo
test('F điều hành', async () => {
  test.setTimeout(15 * 60_000);
  await loginAs(page, TP, '/dashboard');
  await page.getByRole('tab', { name: /Lĩnh vực, năm/ }).click();
  await expect(main(page).getByRole('heading', { name: 'Số đề tài theo lĩnh vực KH&CN' })).toBeVisible();
  await shot(page, 'N-F1-chi-so', 'Chỉ số theo lĩnh vực, năm, sinh viên, kinh phí', [
    { at: page.getByRole('tab', { name: /Lĩnh vực, năm/ }), note: 'Tab **Lĩnh vực, năm, sinh viên, kinh phí**.' },
    { at: main(page).locator('.card.p-3'), all: true, note: 'Chỉ số NCKH sinh viên, hợp đồng, giải ngân, SHTT, nhóm mạnh.' },
    { at: main(page).getByRole('heading', { name: 'Số đề tài theo lĩnh vực KH&CN' }), note: 'Biểu đồ + bảng số liệu (bấm “Bảng số liệu”), có định nghĩa chỉ số.' },
  ]);
  await page.getByRole('tab', { name: 'Hỏi đáp số liệu' }).click();
  await page.getByLabel('Câu hỏi số liệu').fill('Khoa nào có nhiều đề tài nhất?');
  await btn(page, 'Hỏi').click();
  await expect(main(page).getByText(/Truy vấn:/)).toBeVisible({ timeout: 240_000 });
  await shot(page, 'N-F2-hoi-dap', 'Hỏi đáp số liệu bằng tiếng Việt', [
    { at: page.getByLabel('Câu hỏi số liệu'), note: 'Gõ câu hỏi tiếng Việt (hoặc bấm câu hỏi gợi ý), bấm **Hỏi**.' },
    { at: main(page).locator('p.rounded-md').first(), note: 'Câu trả lời do hệ thống tính.' },
    { at: main(page).getByText(/Truy vấn:/), note: 'Truy vấn được chọn, phạm vi, định nghĩa — AI chỉ chọn truy vấn, không tự sinh số.' },
  ], { fullPage: true });
  await page.getByRole('tab', { name: 'Báo cáo & chốt kỳ' }).click();
  await btn(page, '✨ Tạo dự thảo').click();
  await expect(btn(page, '⬇ Xuất Word (kèm bảng chỉ số)')).toBeVisible({ timeout: 300_000 });
  await page.getByPlaceholder(/Kính gửi/).fill('Bộ Giáo dục và Đào tạo');
  await shot(page, 'N-F3-bao-cao', 'Xuất báo cáo và báo cáo cấp trên', [
    { at: btn(page, '⬇ Báo cáo HEMIS (Excel)'), note: '**Báo cáo HEMIS (Excel)**: các bảng nhiệm vụ, bài báo, sách, nhóm NC, sáng chế, chuyển giao, hội thảo, giải thưởng.' },
    { at: page.getByPlaceholder(/Kính gửi/), note: 'Tiêu đề, nơi nhận của báo cáo.' },
    { at: btn(page, '⬇ Xuất Word (kèm bảng chỉ số)'), note: 'Sau khi sửa dự thảo AI, bấm **⬇ Xuất Word** — kèm phụ lục bảng chỉ số.' },
  ]);
  await btn(page, '🔒 Chốt kỳ').click();
  const d = page.getByRole('dialog');
  await d.getByLabel(/Tên kỳ/).fill('Báo cáo năm học 2025–2026');
  await d.getByLabel(/^Kỳ/).fill('2025-2026');
  await shot(page, 'N-F4-chot-ky', 'Chốt kỳ số liệu', [
    { at: d.getByLabel(/Tên kỳ/), note: 'Đặt tên kỳ, kỳ báo cáo.' },
    { at: d.getByRole('button', { name: 'Chốt' }), note: 'Bấm **Chốt** — bộ số liệu được lưu bất biến để báo cáo kỳ luôn khớp.' },
  ]);
  await d.getByRole('button', { name: 'Chốt' }).click();
  await expect(d).toBeHidden();
});

// ---------------------------------------------------------------- G. Quản trị, ủy quyền
test('G quản trị', async () => {
  test.setTimeout(10 * 60_000);
  await loginAs(page, TK, '/delegations');
  await main(page).getByRole('combobox').first().selectOption({ index: 1 });
  await pick('Người nhận', 'Hoàng Thu Hà');
  await page.getByLabel(/Lý do/).fill('Đi công tác nước ngoài');
  await shot(page, 'N-G1-uy-quyen', 'Ủy quyền có thời hạn', [
    { at: nav(page, 'Ủy quyền'), note: 'Menu **Ủy quyền** (lãnh đạo đơn vị, Phòng KH, BGH).' },
    { at: main(page).getByRole('combobox').first(), note: 'Chọn vai trò của mình cần ủy quyền.' },
    { at: page.getByLabel(/Từ ngày/), note: 'Người nhận, thời hạn, lý do.' },
    { at: btn(page, 'Ủy quyền'), note: 'Bấm **Ủy quyền**; tự hết hiệu lực khi đến hạn, có thể thu hồi sớm.' },
  ]);
  await btn(page, 'Ủy quyền').click();
  await expect(main(page).getByText('Đang hiệu lực')).toBeVisible();

  await loginAs(page, CV, '/external-reviewers');
  await page.getByLabel(/Email/).fill('pgs.phanbien@vien-mau.vn');
  await page.getByLabel(/Họ tên/).fill('PGS.TS. Nguyễn Phản Biện');
  await page.getByLabel(/Cơ quan công tác/).fill('Viện Nghiên cứu Thương mại (mẫu)');
  await page.getByLabel(/Chuyên môn/).fill('Thương mại quốc tế, Xuất khẩu nông sản');
  await shot(page, 'N-G2-phan-bien-ngoai', 'Tài khoản phản biện ngoài trường', [
    { at: nav(page, 'Phản biện ngoài trường'), note: 'Menu **Phản biện ngoài trường** (Phòng KH).' },
    { at: page.getByLabel(/Cơ quan công tác/), note: 'Thông tin phản biện; chuyên môn dùng cho gợi ý phản biện.' },
    { at: page.getByLabel(/Hiệu lực đến/), note: 'Thời hạn tài khoản (tối đa 12 tháng).' },
    { at: btn(page, 'Tạo tài khoản'), note: 'Bấm **Tạo tài khoản** — mật khẩu tạm hiện một lần, gửi qua kênh an toàn.' },
  ]);

  await loginAs(page, TP, '/admin');
  await page.getByRole('tab', { name: 'Bàn giao hồ sơ' }).click();
  await pick('Người bàn giao', 'Phạm Quốc Dũng');
  await expect(main(page).locator('table')).toBeVisible();
  await shot(page, 'N-G3-ban-giao', 'Bàn giao hồ sơ', [
    { at: page.getByRole('tab', { name: 'Bàn giao hồ sơ' }), note: 'Quản trị → **Bàn giao hồ sơ** (khi nghỉ việc, chuyển công tác).' },
    { at: main(page).locator('table'), note: 'Hồ sơ chưa kết thúc của người bàn giao — chọn hồ sơ cần chuyển.' },
    { at: btn(page, /Bàn giao \d+ hồ sơ/), note: 'Chọn người nhận, ghi lý do, bấm **Bàn giao**.' },
  ]);

  await loginAs(page, ADMIN, '/admin');
  await page.getByRole('tab', { name: 'Thư điện tử' }).click();
  await expect(main(page).getByText('Máy chủ thư:')).toBeVisible();
  await shot(page, 'N-G4-thu-dien-tu', 'Cấu hình thư điện tử thông báo', [
    { at: main(page).getByText('Máy chủ thư:'), note: 'Trạng thái máy chủ thư (SMTP) — đặt bằng biến môi trường khi cài đặt.' },
    { at: main(page).getByText('Gửi thư kèm thông báo trong ứng dụng'), note: 'Bật / tắt gửi thư; chọn phạm vi (mọi thông báo / chỉ nhắc hạn).' },
    { at: btn(page, 'Gửi thư thử tới email quản trị'), note: 'Gửi thư thử; kết quả ghi ở Nhật ký gửi thư.' },
  ]);
});
