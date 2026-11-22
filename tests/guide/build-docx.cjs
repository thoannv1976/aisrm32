/**
 * Dựng "Hướng dẫn sử dụng AI-SRM (bản Local)" dạng Word từ ảnh chụp (anh/*.jpg) và ghi chú (manifest-all.json)
 * do tests/guide/capture.spec.ts tạo ra. Nội dung diễn giải nằm trong file này.
 *
 *   node tests/guide/build-docx.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, ImageRun, LevelFormat, Packer, PageBreak,
  PageNumber, Paragraph, ShadingType, Table, TableCell, TableOfContents, TableRow, TextRun, WidthType,
} = require('docx');

const OUT = path.join(__dirname, '..', '..', 'docs', 'huong-dan-su-dung');
const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest-all.json'), 'utf8'));
const byId = new Map(manifest.map((m) => [m.id, m]));
const used = new Set();

const FONT = 'Arial';
const CONTENT_W = 9638; // A4 (11906) − lề 2×1134 DXA
const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
const RED = 'C62828';

// ---------- tiện ích ----------
const p = (text, opts = {}) => new Paragraph({ spacing: { after: 120 }, ...opts, children: runs(text) });
/** Văn bản có **đậm**. */
function runs(text) {
  return String(text)
    .split(/(\*\*[^*]+\*\*)/)
    .filter(Boolean)
    .map((t) => (t.startsWith('**') ? new TextRun({ text: t.slice(2, -2), bold: true }) : new TextRun(t)));
}
const h1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun(t)] });
const h2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const h3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(t)] });
const bullet = (t) => new Paragraph({ numbering: { reference: 'bullets', level: 0 }, spacing: { after: 60 }, children: runs(t) });
const step = (t) => new Paragraph({ numbering: { reference: 'steps', level: 0 }, spacing: { after: 60 }, children: runs(t) });
const note = (t) =>
  new Paragraph({
    spacing: { before: 60, after: 120 },
    shading: { type: ShadingType.CLEAR, fill: 'FFF8E1', color: 'auto' },
    border: { left: { style: BorderStyle.SINGLE, size: 18, color: 'F9A825', space: 6 } },
    indent: { left: 120 },
    children: [new TextRun({ text: 'Lưu ý: ', bold: true }), ...runs(t)],
  });

function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}

/** Ảnh + chú thích + các ghi chú ①②③ khớp với ô đỏ trên ảnh. */
function figure(id, lead) {
  const m = byId.get(id);
  if (!m) throw new Error(`Thiếu ảnh ${id}`);
  used.add(id);
  const buf = fs.readFileSync(path.join(OUT, 'anh', m.file));
  const { w, h } = jpegSize(buf);
  const maxW = 6.6 * 96;
  const maxH = 8.4 * 96;
  let width = maxW;
  let height = (h / w) * width;
  if (height > maxH) {
    height = maxH;
    width = (w / h) * height;
  }
  const out = [h3(m.title)];
  if (lead) out.push(...(Array.isArray(lead) ? lead : [lead]).map((t) => p(t)));
  out.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 60, after: 60 },
      keepNext: true,
      children: [new ImageRun({ type: 'jpg', data: buf, transformation: { width: Math.round(width), height: Math.round(height) }, altText: { title: m.title, description: m.title, name: m.id } })],
    }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, keepNext: m.notes.length > 0, children: [new TextRun({ text: `Hình ${figNo++}. ${m.title}`, italics: true, size: 18, color: '555555' })] }),
  );
  m.notes.forEach((n, i) =>
    out.push(
      new Paragraph({
        spacing: { after: 60 },
        keepNext: i < m.notes.length - 1,
        keepLines: true,
        indent: { left: 400, hanging: 400 },
        children: [new TextRun({ text: `${CIRCLED[i]}\t`, bold: true, color: RED }), ...runs(n)],
        tabStops: [{ type: 'left', position: 400 }],
      }),
    ),
  );
  return out;
}
let figNo = 1;

function table(headers, rows, widths) {
  const total = widths.reduce((a, b) => a + b, 0);
  const scaled = widths.map((x) => Math.floor((x / total) * CONTENT_W));
  scaled[scaled.length - 1] += CONTENT_W - scaled.reduce((a, b) => a + b, 0);
  const cell = (t, head, i) =>
    new TableCell({
      width: { size: scaled[i], type: WidthType.DXA },
      shading: head ? { type: ShadingType.CLEAR, fill: '1F3A5F', color: 'auto' } : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({ children: head ? [new TextRun({ text: t, bold: true, color: 'FFFFFF' })] : runs(t) })],
    });
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: scaled,
    rows: [new TableRow({ tableHeader: true, children: headers.map((t, i) => cell(t, true, i)) }), ...rows.map((r) => new TableRow({ children: r.map((t, i) => cell(t, false, i)) }))],
  });
}

// ---------- nội dung ----------
const body = [];
const add = (...xs) => body.push(...xs.flat());

// Trang bìa
add(
  new Paragraph({ spacing: { before: 2400 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'AI-SRM', bold: true, size: 64, color: '1F3A5F' })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: 'Hệ thống quản lý khoa học và đổi mới sáng tạo tích hợp trí tuệ nhân tạo', size: 26, color: '444444' })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 600, after: 120 }, children: [new TextRun({ text: 'HƯỚNG DẪN SỬ DỤNG', bold: true, size: 48 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: 'Bản Local (cài đặt tại trường) — theo vai trò người dùng', size: 28 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1800 }, children: [new TextRun({ text: 'Phiên bản tài liệu 0.1 — 22/11/2026', size: 22 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Ảnh minh họa chụp trên dữ liệu mẫu (giả lập), không phải dữ liệu thật của trường.', italics: true, size: 20, color: '777777' })] }),
  new Paragraph({ children: [new PageBreak()] }),
  new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: 'Mục lục', bold: true, size: 32, color: '1F3A5F' })] }),
  new TableOfContents('Mục lục', { hyperlink: true, headingStyleRange: '1-2' }),
);

// Giới thiệu
add(
  h1('Giới thiệu'),
  h2('Tài liệu này dành cho ai'),
  p('Tài liệu hướng dẫn thao tác trên AI-SRM cho từng vai trò trong trường. Mỗi người chỉ cần đọc **Chương 1 (dùng chung)** và chương ứng với vai trò của mình:'),
  table(
    ['Vai trò', 'Đọc chương'],
    [
      ['Giảng viên, nhà khoa học, chủ nhiệm đề tài', '1, 2'],
      ['Sinh viên, học viên, nghiên cứu sinh', '1, 2, 3'],
      ['Đầu mối khoa học, lãnh đạo khoa / viện / cơ sở', '1, 4'],
      ['Chuyên viên, Trưởng phòng Quản lý khoa học (QLKH)', '1, 5'],
      ['Phản biện, thành viên hội đồng', '1, 6'],
      ['Phó Hiệu trưởng, Hiệu trưởng', '1, 7'],
      ['Quản trị hệ thống, quản trị AI, quản trị tích hợp', '1, 8'],
    ],
    [6, 2],
  ),
  h2('Cách đọc hình minh họa'),
  p('Trên mỗi hình, các vùng cần chú ý được khoanh **ô đỏ có đánh số**. Ngay dưới hình là ghi chú cùng số:'),
  p('①, ②, ③… ứng với ô số 1, 2, 3… trên hình. Làm theo thứ tự số nếu đó là các bước thao tác.'),
  h2('Nguyên tắc chung của hệ thống'),
  bullet('**Mỗi người chỉ thấy và làm được việc thuộc vai trò, phạm vi của mình.** Menu bên trái thay đổi theo vai trò đang chọn; quyền thực tế luôn được kiểm tra ở máy chủ.'),
  bullet('**Mọi thao tác xét duyệt đều có xác nhận và được ghi lịch sử** (ai, lúc nào, ý kiến gì). Hồ sơ đã nộp được lưu thành bản bất biến.'),
  bullet('**Không tự duyệt hồ sơ của mình; người trình và người phê duyệt phải khác nhau.**'),
  bullet('**AI chỉ gợi ý và dự thảo.** Người có thẩm quyền kiểm tra và quyết định. Bản Local dùng máy chủ AI nội bộ đặt tại trường, dữ liệu không gửi ra ngoài.'),
  h2('Quy trình đề tài cấp trường (tóm tắt)'),
  table(
    ['Bước', 'Người thực hiện', 'Trạng thái sau bước'],
    [
      ['1. Lập và nộp hồ sơ đề xuất', 'Chủ nhiệm', 'Đơn vị xem xét'],
      ['2. Xác nhận cấp đơn vị (hoặc trả bổ sung)', 'Đầu mối / lãnh đạo đơn vị', 'Phòng KH xử lý'],
      ['3. Tổ chức hội đồng xét duyệt (nếu có), trình phê duyệt', 'Phòng QLKH, hội đồng', 'Chờ phê duyệt'],
      ['4. Phê duyệt (hoặc trả bổ sung / không phê duyệt)', 'Phó Hiệu trưởng / Hiệu trưởng', 'Đã phê duyệt — tự lập đề tài'],
      ['5. Cập nhật thời gian, mốc tiến độ, giao nhiệm vụ', 'Phòng QLKH', 'Đang thực hiện'],
      ['6. Nộp sản phẩm theo mốc; xin gia hạn khi cần', 'Chủ nhiệm', '—'],
      ['7. Đề nghị nghiệm thu → hội đồng nghiệm thu → xác nhận hoàn thành', 'Chủ nhiệm, Phòng QLKH, lãnh đạo', 'Đã hoàn thành'],
    ],
    [5, 3, 3],
  ),
  h2('Quy trình xác nhận công bố (tóm tắt)'),
  table(
    ['Bước', 'Người thực hiện', 'Trạng thái sau bước'],
    [
      ['1. Khai báo công bố, đính kèm minh chứng, nộp xác nhận', 'Tác giả', 'Đã nộp'],
      ['2. Xác minh minh chứng (hoặc trả bổ sung)', 'Chuyên viên QLKH', 'Đã xác minh'],
      ['3. Xác nhận công bố', 'Trưởng phòng QLKH', 'Đã xác nhận'],
    ],
    [5, 3, 3],
  ),
);

// Chương 1
add(
  h1('Chương 1. Thao tác dùng chung'),
  p('Áp dụng cho mọi người dùng.'),
  h2('1.1. Đăng nhập, trang làm việc, thông báo'),
  ...figure('01-01-dang-nhap', 'Mở trình duyệt (Chrome, Edge, Firefox bản mới), vào địa chỉ AI-SRM do Trung tâm CNTT của trường cung cấp.'),
  note('Tài khoản do quản trị hệ thống cấp. Lần đầu đăng nhập bằng mật khẩu tạm, hệ thống bắt buộc đổi mật khẩu. Nhập sai mật khẩu 5 lần liên tiếp, tài khoản bị khóa tạm 15 phút. Quên mật khẩu: liên hệ quản trị để được cấp mật khẩu tạm.'),
  ...figure('01-02-trang-lam-viec', 'Sau khi đăng nhập, **Trang làm việc** tổng hợp việc đang chờ bạn và các hạn sắp đến.'),
  ...figure('01-03-thong-bao'),
  ...figure('01-04-doi-mat-khau', 'Bấm **Đổi mật khẩu** ở thanh trên cùng.'),
  note('Mật khẩu cần ít nhất 10 ký tự, gồm 3 trong 4 nhóm: chữ hoa, chữ thường, chữ số, ký hiệu; không chứa tên tài khoản. Phiên đăng nhập tự hết hạn sau 2 giờ không thao tác (tối đa 12 giờ).'),
  h2('1.2. Hỏi đáp quy chế bằng AI'),
  ...figure('01-05-hoi-dap-quy-che', 'Chọn **Hỏi đáp quy chế** trên menu để tra cứu quy chế khoa học và công nghệ bằng câu hỏi tự nhiên.'),
  ...figure('01-06-cau-tra-loi', 'Câu trả lời được tạo bởi máy chủ AI nội bộ của trường, chỉ dựa trên văn bản quy chế đã nạp.'),
  note('Nếu quy chế không có quy định liên quan, hệ thống trả lời "không tìm thấy" thay vì suy đoán. Khi có khác biệt, áp dụng theo văn bản quy chế gốc.'),
  ...figure('01-07-van-ban-quy-che'),
  h2('1.3. Lý lịch khoa học'),
  ...figure('01-08-ho-so-khoa-hoc', 'Chọn **Hồ sơ khoa học**. Đề tài đã phê duyệt và công bố đã xác nhận được hệ thống tự đưa vào lý lịch.'),
  ...figure('01-09-cap-nhat-ho-so'),
);

// Chương 2
add(
  h1('Chương 2. Giảng viên, nhà khoa học, chủ nhiệm đề tài'),
  h2('2.1. Đăng ký đề tài'),
  ...figure('02-01-dot-dang-ky', 'Chọn **Đợt đăng ký** trên menu. Chỉ tạo được hồ sơ khi đợt đang trong thời gian nhận.'),
  ...figure('02-02-chi-tiet-dot'),
  ...figure('02-03-thuyet-minh', 'Sau khi bấm **+ Tạo hồ sơ đề xuất**, hệ thống tạo hồ sơ nháp có mã DX-…. Khai thuyết minh theo biểu mẫu của đợt.'),
  note('Dòng chữ đỏ dưới ô nhập là kết quả kiểm tra của lần lưu trước; chúng mất đi sau khi bấm "Lưu nháp" với đủ thông tin.'),
  ...figure('02-04-kiem-tra-truoc-khi-nop'),
  ...figure('02-05-dinh-kem-tai-lieu', 'Chọn tab **Tài liệu**, tải tệp cho từng loại tài liệu yêu cầu. Định dạng: PDF, Word, Excel, PowerPoint, ảnh; tối đa 15 MB mỗi tệp.'),
  ...figure('02-06-ai-kiem-tra', 'Trước khi nộp, có thể dùng **Trợ lý AI** để tóm tắt hoặc rà soát thuyết minh.'),
  ...figure('02-06b-ai-tom-tat'),
  note('Góp ý của AI chỉ để tham khảo, không phải kết quả xét duyệt. Bạn tự quyết định sửa hay không.'),
  ...figure('02-07-nop-ho-so'),
  ...figure('02-08-trang-thai', 'Sau khi nộp, theo dõi trạng thái và lịch sử xử lý trên chính hồ sơ. Khi hồ sơ bị **trả bổ sung**, bạn nhận thông báo; mở hồ sơ, xem lý do ở tab Lịch sử xử lý, sửa rồi bấm **Nộp lại**.'),
  ...figure('02-09-danh-sach-de-xuat'),
  h2('2.2. Thực hiện đề tài'),
  ...figure('02-10-danh-sach-de-tai', 'Khi đề xuất được phê duyệt, hệ thống tự lập đề tài (mã DT-…). Chọn **Đề tài** trên menu.'),
  ...figure('02-11-chi-tiet-de-tai'),
  note('Hệ thống tự nhắc qua thông báo khi mốc còn 7 ngày, còn 1 ngày và khi đã quá hạn.'),
  ...figure('02-12-yeu-cau-gia-han', 'Trên trang đề tài, mục **Yêu cầu thay đổi / gia hạn**, bấm **+ Gửi yêu cầu**.'),
  p('Khi hoàn thành nội dung, bấm **Đề nghị nghiệm thu** trên trang đề tài; Phòng QLKH tiếp nhận và tổ chức hội đồng nghiệm thu.'),
  h2('2.3. Khai báo công bố khoa học'),
  ...figure('02-13-khai-bao-cong-bo', 'Chọn **Công bố** → **+ Khai báo công bố**.'),
  ...figure('02-14-minh-chung', 'Sau khi lưu nháp, đính kèm minh chứng rồi nộp xác nhận.'),
  ...figure('02-15-kiem-chung-doi', 'Công bố có DOI: sau khi lưu nháp, kiểm chứng với Crossref để phát hiện sai lệch trước khi nộp.'),
  note('Kiểm chứng DOI cần máy chủ có Internet.'),
  note('Hệ thống cảnh báo khi công bố có thể trùng với bản ghi đã có (cùng DOI hoặc tiêu đề gần giống), nhưng không tự gộp hay xóa.'),
);

// Chương 3
add(
  h1('Chương 3. Sinh viên, học viên, nghiên cứu sinh'),
  p('Sinh viên đăng ký đề tài NCKH theo **đợt dành cho sinh viên**. Các bước lập hồ sơ, đính kèm, nộp, theo dõi giống mục 2.1; thực hiện đề tài giống mục 2.2.'),
  ...figure('03-01-dot-sinh-vien'),
  ...figure('03-02-de-tai-sinh-vien'),
);

// Chương 4
add(
  h1('Chương 4. Đầu mối khoa học, lãnh đạo đơn vị'),
  p('Đầu mối khoa học và lãnh đạo khoa / viện / cơ sở xem xét hồ sơ của đơn vị mình trước khi chuyển lên Phòng QLKH. Bạn chỉ thấy hồ sơ thuộc đơn vị được phân quyền.'),
  ...figure('04-01-viec-cho-xu-ly'),
  ...figure('04-02-xem-ho-so'),
  ...figure('04-03-xac-nhan'),
  note('Không tự xét duyệt được hồ sơ do chính mình làm chủ nhiệm. Khi trả bổ sung, ghi rõ nội dung cần sửa; chủ nhiệm nộp lại thì hồ sơ quay về đúng bước của bạn.'),
  ...figure('04-04-bao-cao-don-vi', 'Chọn **Điều hành & báo cáo** để xem số liệu của đơn vị.'),
);

// Chương 5
add(
  h1('Chương 5. Phòng Quản lý khoa học'),
  ...figure('05-01-trang-lam-viec-qlkh'),
  h2('5.1. Mở đợt đăng ký'),
  ...figure('05-14-mo-dot-moi', 'Chọn **Đợt đăng ký** → **+ Mở đợt mới**.'),
  ...figure('05-15-mo-nhan-ho-so'),
  h2('5.2. Thành lập hội đồng xét duyệt'),
  ...figure('05-02-thanh-lap-hoi-dong', 'Chọn **Hội đồng** → **+ Thành lập hội đồng**.'),
  ...figure('05-03-moi-thanh-vien', 'Trên trang hội đồng, tab **Thành viên**: mời chủ tịch, thư ký, phản biện, ủy viên.'),
  ...figure('05-04-mo-cham'),
  p('Theo dõi tiến độ chấm ở tab **Hồ sơ & chấm điểm**. Việc khóa phiếu, kết luận và biên bản: xem Chương 6.'),
  h2('5.3. Xử lý hồ sơ đề xuất'),
  ...figure('05-05-xu-ly-ho-so', 'Mở hồ sơ ở bước **Phòng KH xử lý** (từ Trang làm việc hoặc menu Đề xuất).'),
  ...figure('05-06-trinh-phe-duyet'),
  note('Đợt có cấu hình "bước thẩm định" thì nút là **Chuyển thẩm định**; sau khi có kết quả, bấm **Ghi nhận kết quả thẩm định** để trình phê duyệt.'),
  h2('5.4. Giao nhiệm vụ và theo dõi đề tài'),
  ...figure('05-07-de-tai-moi', 'Mở đề tài vừa được lập (trạng thái **Chờ ký hợp đồng / giao nhiệm vụ**).'),
  ...figure('05-08-them-moc'),
  ...figure('05-09-giao-nhiem-vu'),
  ...figure('05-10-duyet-san-pham', 'Khi chủ nhiệm nộp sản phẩm mốc hoặc gửi yêu cầu gia hạn, bạn nhận việc trên Trang làm việc.'),
  h2('5.5. Xác minh và xác nhận công bố'),
  ...figure('05-11-danh-sach-cong-bo'),
  ...figure('05-12-xac-minh-cong-bo'),
  ...figure('05-13-xac-nhan-cong-bo'),
  h2('5.6. Nạp văn bản quy chế cho hỏi đáp AI'),
  ...figure('05-16-nap-quy-che', 'Chọn **Hỏi đáp quy chế** → tab **Văn bản quy chế** → **+ Nạp văn bản**.'),
  note('Nạp lại văn bản cùng mã sẽ thay thế phiên bản cũ. Có thể tạm ngưng một văn bản để không dùng khi tra cứu.'),
);

// Chương 6
add(
  h1('Chương 6. Phản biện, thành viên hội đồng'),
  ...figure('06-01-danh-sach-hoi-dong', 'Khi được mời, bạn nhận thông báo. Chọn **Hội đồng** trên menu.'),
  ...figure('06-02-nhan-loi'),
  ...figure('06-03-xung-dot-loi-ich'),
  ...figure('06-04-cham-diem'),
  ...figure('06-05-da-nop-phieu'),
  h2('Dành cho chủ tịch, thư ký hội đồng'),
  ...figure('06-06-khoa-phieu'),
  ...figure('06-07-ket-qua-bien-ban', 'Sau khi khóa phiếu, mở tab **Kết quả & biên bản**.'),
  note('Biên bản do AI dự thảo cần được đọc lại và sửa trước khi lưu. Sau khi chủ tịch xác nhận, biên bản không sửa được và thành viên hết quyền xem hồ sơ.'),
);

// Chương 7
add(
  h1('Chương 7. Lãnh đạo trường'),
  ...figure('07-01-viec-cho-phe-duyet'),
  ...figure('07-02-phe-duyet', 'Mở hồ sơ, đọc thuyết minh, kết quả hội đồng và lịch sử xử lý, rồi chọn **Phê duyệt**, **Trả bổ sung** hoặc **Không phê duyệt**.'),
  ...figure('07-03-da-lap-de-tai'),
  p('Với đề tài đang thực hiện, lãnh đạo có thể **Tạm dừng**, **Tiếp tục thực hiện**, **Hủy đề tài** (ghi lý do) và **Xác nhận hoàn thành** sau nghiệm thu.'),
  ...figure('07-04-dieu-hanh', 'Chọn **Điều hành & báo cáo**.'),
  ...figure('07-05-du-thao-bao-cao'),
);

// Chương 8
add(
  h1('Chương 8. Quản trị hệ thống, AI, tích hợp'),
  h2('8.1. Tổ chức, tài khoản, phân quyền'),
  ...figure('08-01-don-vi', 'Chọn **Quản trị** trên menu.'),
  ...figure('08-02-nhap-tai-khoan', 'Tab **Tài khoản** → khung **Nhập tài khoản từ CSV**.'),
  note('Mật khẩu tạm chỉ hiện một lần. Gửi cho từng người qua kênh an toàn; người dùng bắt buộc đổi khi đăng nhập lần đầu.'),
  ...figure('08-03-danh-sach-tai-khoan'),
  ...figure('08-04-phan-quyen'),
  h2('8.2. Tác vụ nền và nhật ký'),
  ...figure('08-05-tac-vu-nen'),
  ...figure('08-06-nhat-ky'),
  h2('8.3. AI Center'),
  ...figure('08-07-ai-nha-cung-cap', 'Chọn **AI Center** trên menu (quản trị AI).'),
  note('Sau khi khởi động lại máy chủ AI nội bộ, bấm **Làm nóng** để lần hỏi đầu tiên của người dùng không phải chờ nạp mô hình.'),
  ...figure('08-08-ai-model'),
  ...figure('08-09-ai-cau-hinh'),
  ...figure('08-10-ai-su-dung'),
  h2('8.4. Integration Center'),
  ...figure('08-11-tich-hop'),
  ...figure('08-12-hemis'),
);

// Phụ lục
add(
  h1('Phụ lục A. Trạng thái hồ sơ'),
  h2('Đề xuất đề tài'),
  table(
    ['Trạng thái', 'Ý nghĩa'],
    [
      ['Nháp', 'Chủ nhiệm đang soạn; chỉ chủ nhiệm xem được.'],
      ['Đơn vị xem xét', 'Chờ đầu mối / lãnh đạo đơn vị xác nhận.'],
      ['Phòng KH xử lý', 'Phòng QLKH kiểm tra, tổ chức hội đồng.'],
      ['Thẩm định / phản biện', 'Đang thẩm định (khi đợt có bước thẩm định).'],
      ['Chờ phê duyệt', 'Chờ Phó Hiệu trưởng / Hiệu trưởng.'],
      ['Cần bổ sung', 'Bị trả lại; chủ nhiệm sửa và nộp lại.'],
      ['Đã phê duyệt', 'Kết thúc; đề tài được lập.'],
      ['Không phê duyệt / Đã rút', 'Kết thúc.'],
    ],
    [3, 7],
  ),
  h2('Đề tài'),
  table(
    ['Trạng thái', 'Ý nghĩa'],
    [
      ['Chờ ký hợp đồng / giao nhiệm vụ', 'Vừa lập; Phòng QLKH cập nhật thời gian, mốc tiến độ.'],
      ['Đang thực hiện', 'Chủ nhiệm nộp sản phẩm theo mốc.'],
      ['Tạm dừng', 'Lãnh đạo tạm dừng (có lý do).'],
      ['Đề nghị nghiệm thu → Đang nghiệm thu', 'Chủ nhiệm đề nghị; Phòng QLKH tiếp nhận, tổ chức hội đồng.'],
      ['Hoàn thiện sau nghiệm thu', 'Chủ nhiệm nộp bản hoàn thiện theo yêu cầu.'],
      ['Đã hoàn thành → Đã lưu trữ', 'Kết thúc.'],
      ['Đã hủy', 'Kết thúc.'],
    ],
    [4, 6],
  ),
  h2('Công bố'),
  table(
    ['Trạng thái', 'Ý nghĩa'],
    [
      ['Nháp', 'Tác giả đang khai.'],
      ['Đã nộp', 'Chờ chuyên viên xác minh.'],
      ['Đã xác minh', 'Chờ Trưởng phòng QLKH xác nhận.'],
      ['Cần bổ sung', 'Tác giả bổ sung minh chứng, nộp lại.'],
      ['Đã xác nhận', 'Được tính vào lý lịch khoa học, báo cáo.'],
      ['Đã xuất dữ liệu / Không xác nhận', 'Kết thúc.'],
    ],
    [3, 7],
  ),
  h1('Phụ lục B. Câu hỏi thường gặp'),
  h3('Không thấy nút thao tác trên hồ sơ?'),
  p('Nút chỉ hiện khi hồ sơ đang ở bước của bạn và bạn có vai trò, phạm vi phù hợp. Kiểm tra ô **Vai trò** ở thanh trên cùng (tài khoản nhiều vai trò) và trạng thái hồ sơ.'),
  h3('Không lưu được hồ sơ, báo "dữ liệu đã thay đổi"?'),
  p('Hồ sơ vừa được người khác cập nhật. Tải lại trang (F5), kiểm tra rồi thao tác lại.'),
  h3('AI báo "đang bận" hoặc chờ lâu?'),
  p('Máy chủ AI nội bộ xử lý lần lượt từng yêu cầu. Chờ ít phút rồi thử lại; nếu kéo dài, báo quản trị AI kiểm tra (AI Center → Kiểm tra kết nối, Làm nóng).'),
  h3('Kiểm chứng DOI báo lỗi kết nối?'),
  p('Đối chiếu DOI cần Internet để truy cập Crossref. Khi máy chủ không có Internet, dùng minh chứng tệp hoặc đường dẫn để Phòng QLKH xác minh thủ công.'),
  h3('Tài khoản bị khóa?'),
  p('Sai mật khẩu 5 lần sẽ khóa tạm 15 phút. Quản trị có thể đặt lại mật khẩu tạm (Quản trị → Tài khoản).'),
  h1('Phụ lục C. Chức năng sẽ bổ sung'),
  p('Các chức năng sau nằm trong kế hoạch, chưa có trong phiên bản này; tài liệu sẽ được bổ sung khi hoàn thành:'),
  bullet('Kinh phí và hợp đồng đề tài; nhóm nghiên cứu; sở hữu trí tuệ; hội thảo khoa học.'),
  bullet('Kho minh chứng có phiên bản tệp.'),
  bullet('Xuất Word / Excel / PDF theo mẫu biểu của trường.'),
  bullet('Đăng nhập một lần (SSO) với hệ thống định danh của trường.'),
  bullet('Hướng dẫn cài đặt, sao lưu – phục hồi máy chủ (tài liệu riêng cho cán bộ CNTT).'),
);

const missing = manifest.filter((m) => !used.has(m.id)).map((m) => m.id);
if (missing.length) throw new Error(`Ảnh chưa dùng trong tài liệu: ${missing.join(', ')}`);

const doc = new Document({
  creator: 'AI-SRM',
  title: 'Hướng dẫn sử dụng AI-SRM (bản Local)',
  features: { updateFields: true },
  styles: {
    default: { document: { run: { font: FONT, size: 22 }, paragraph: { spacing: { line: 276 } } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 32, bold: true, color: '1F3A5F' }, paragraph: { spacing: { before: 240, after: 200 }, keepNext: true, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 27, bold: true, color: '1F3A5F' }, paragraph: { spacing: { before: 280, after: 120 }, keepNext: true, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 23, bold: true, color: '333333' }, paragraph: { spacing: { before: 240, after: 80 }, keepNext: true, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [
      { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 260 } } } }] },
      { reference: 'steps', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 300 } } } }] },
    ],
  },
  sections: [
    {
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
      headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Hướng dẫn sử dụng AI-SRM — bản Local', size: 16, color: '888888' })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: ['Trang ', PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES], size: 18, color: '666666' })] })] }) },
      children: body,
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  const file = path.join(OUT, 'HUONG_DAN_SU_DUNG.docx');
  fs.writeFileSync(file, buf);
  console.log(`Đã ghi ${file} (${(buf.length / 1024 / 1024).toFixed(1)} MB, ${figNo - 1} hình)`);
});
