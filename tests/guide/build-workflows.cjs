/**
 * Hai tài liệu thực hành theo QUY TRÌNH (workflow) cho học viên tập huấn:
 *   - AI-SRM_THUC_HANH_QUY_TRINH_NCKH_SINH_VIEN.docx   (ảnh WS-*, manifest-wf-sv.json — capture-wf-sv.spec.ts)
 *   - AI-SRM_THUC_HANH_QUY_TRINH_DE_TAI_CAP_TRUONG.docx (ảnh WD-*, manifest-wf-dt.json — capture-wf-dt.spec.ts)
 *
 *   node tests/guide/build-workflows.cjs [thư mục ra]
 */
const { BorderStyle, Paragraph, ShadingType, TextRun } = require('docx');
const { createKit } = require('./docx-kit.cjs');

const outDir = process.argv[2];

function kitFor(manifest) {
  const k = createKit({ manifests: [manifest] });
  const box = (title, t, fill, line) =>
    new Paragraph({
      spacing: { before: 80, after: 140 },
      shading: { type: ShadingType.CLEAR, fill, color: 'auto' },
      border: { left: { style: BorderStyle.SINGLE, size: 24, color: line, space: 6 } },
      indent: { left: 120 },
      children: [new TextRun({ text: `${title} `, bold: true }), ...k.runs(t)],
    });
  return {
    ...k,
    control: (t) => box('🔒 Điểm kiểm soát:', t, 'FDECEA', 'C62828'),
    value: (t) => box('★ Giá trị cho lãnh đạo:', t, 'E8F5E9', '2E7D32'),
    ai: (t) => box('✨ AI hỗ trợ:', t, 'EDE7F6', '5E35B1'),
  };
}

/** Khung một bước: ai làm, tài khoản, kết quả cần đạt. */
function stepHead(k, n, title, { role, account, result }) {
  return [k.h2(`Bước ${n}. ${title}`), k.table(['Ai thực hiện', 'Tài khoản thực hành', 'Kết quả cần đạt'], [[role, account, result]], [2.6, 3, 4]), k.spacer()];
}

function cover(k, { title, subtitle, lines }) {
  return [
    k.centered('KHÓA 24 — ỨNG DỤNG AI TRONG QUẢN LÝ KHOA HỌC', { bold: true, size: 26, color: '1F3A5F' }, { spacing: { before: 1400 } }),
    k.centered('TÀI LIỆU THỰC HÀNH THEO QUY TRÌNH', { bold: true, size: 40, color: '1F3A5F' }, { spacing: { before: 900, after: 160 } }),
    k.centered(title, { bold: true, size: 34 }),
    k.centered(subtitle, { size: 24, color: '555555' }, { spacing: { before: 160, after: 700 } }),
    ...lines.map((l) => k.centered(l, { size: 22 })),
    k.centered('Thực hành trên dữ liệu mẫu (giả lập). Không nhập dữ liệu thật, thông tin cá nhân hoặc mật khẩu thật.', { italics: true, size: 20, color: '777777' }, { spacing: { before: 400 } }),
    k.centered('Họ tên học viên: ....................................................   Đơn vị: ..........................................', { size: 22 }, { spacing: { before: 900 } }),
    k.pageBreak(),
    ...k.toc(),
  ];
}

function howTo(k, accounts) {
  return [
    k.h1('Hướng dẫn chung'),
    k.h2('Mục đích của tài liệu'),
    k.p('Tài liệu đi trọn **một hồ sơ thật** qua toàn bộ quy trình, mỗi bước đăng nhập đúng vai trò. Học xong, học viên:'),
    k.bullet('Hiểu ai làm gì, ở bước nào, hồ sơ chuyển trạng thái ra sao.'),
    k.bullet('Thấy các **điểm kiểm soát** hệ thống tự áp dụng (không tự duyệt, phân tách nhiệm vụ, khai báo xung đột lợi ích, nhật ký truy vết).'),
    k.bullet('Giải thích được cho lãnh đạo **giá trị** của phần mềm: nhanh hơn, minh bạch hơn, số liệu tức thì, AI hỗ trợ nhưng con người quyết định.'),
    k.h2('Nơi thực hành'),
    k.bullet('Bản Online của khóa học: địa chỉ và tài khoản theo **phiếu bàn giao / danh sách tài khoản** do Ban tổ chức phát.'),
    k.bullet('Hoặc bản cài trên PC (http://localhost:8088) — tài khoản mẫu và mật khẩu chung in ở cuối cửa sổ cài đặt (tệp TAI_KHOAN_MAU.txt).'),
    k.bullet('Tài khoản trong tài liệu có đuôi @demo.aisrm.test. Ở không gian riêng của trường trên bản Online, thay "demo" bằng mã trường (ví dụ @ump.aisrm.test).'),
    k.h2('Tài khoản theo vai trò'),
    k.table(['Vai trò trong quy trình', 'Tài khoản', 'Người (mẫu)'], accounts, [3.2, 3.6, 3]),
    k.spacer(),
    k.h2('Cách đổi vai trò khi thực hành'),
    k.steps([
      'Làm xong phần việc của một vai trò: bấm **Đăng xuất** (góc trên phải).',
      'Đăng nhập tài khoản của vai trò kế tiếp theo bảng trên.',
      'Mở hồ sơ từ **Trang làm việc → Việc cần tôi xử lý** hoặc từ **thông báo** 🔔.',
    ]),
    k.tip('Thực hành nhanh hơn: mở 2 trình duyệt (ví dụ Chrome và Edge, hoặc một cửa sổ ẩn danh) để đăng nhập 2 vai trò cùng lúc. Làm theo nhóm 3–4 người, mỗi người đóng một vai trò, để thấy rõ hồ sơ "đi" giữa các bộ phận.'),
    k.note('Các bước có AI (góp ý, tóm tắt, biên bản, báo cáo) có thể mất 10–40 giây. Trên máy dùng AI nội bộ, lần dùng đầu sau một thời gian không dùng có thể mất 1–3 phút để nạp mô hình — quản trị bấm "Làm nóng" trong AI Center trước buổi học.'),
  ];
}

function closing(k, { flow, before, valueRows, questions, pitch, states, issues }) {
  return [
    k.h1('Tổng kết'),
    k.h2('Toàn cảnh quy trình vừa thực hành'),
    k.table(['Bước', 'Vai trò', 'Việc chính', 'Trạng thái hồ sơ sau bước'], flow, [0.7, 2.4, 4, 2.6]),
    k.spacer(),
    k.h2('Trước và sau khi có AI-SRM'),
    k.table(['Nội dung', 'Cách làm thủ công (giấy, email, Excel)', 'Với AI-SRM'], before, [2.2, 3.6, 4]),
    k.spacer(),
    k.h2('Giá trị theo từng bên'),
    k.table(['Đối tượng', 'Lợi ích cụ thể'], valueRows, [2.4, 7.4]),
    k.spacer(),
    k.h2('Kịch bản trình bày 5 phút cho lãnh đạo'),
    k.p('Dùng ngay dữ liệu vừa thực hành, trình chiếu trên trình duyệt:'),
    k.steps(pitch),
    k.h2('Câu hỏi tự kiểm tra'),
    ...questions.map((q) => k.check(q)),
    k.h2('Trạng thái hồ sơ'),
    k.table(['Trạng thái', 'Ý nghĩa', 'Ai xử lý tiếp'], states, [2.4, 4.4, 3]),
    k.spacer(),
    k.h2('Tình huống thường gặp khi thực hành'),
    k.table(['Hiện tượng', 'Cách xử lý'], issues, [4, 5.8]),
  ];
}

// =====================================================================================================
// A. NCKH SINH VIÊN
// =====================================================================================================
async function buildSV() {
  const k = kitFor('wf-sv');
  const { h1, p, bullet, steps, figure, note, tip, control, value, ai } = k;
  const body = [];
  const add = (...xs) => body.push(...xs.flat());

  add(
    cover(k, {
      title: 'QUY TRÌNH ĐỀ TÀI NGHIÊN CỨU KHOA HỌC SINH VIÊN',
      subtitle: 'Từ mở đợt đăng ký đến xếp giải và báo cáo — 11 bước, 8 vai trò',
      lines: ['Hệ thống quản lý khoa học tích hợp AI — AI-SRM', 'Tháng 11/2026'],
    }),
    howTo(k, [
      ['Chuyên viên Phòng QLKH (mở đợt, hội đồng, xếp giải)', 'cv.linh@demo.aisrm.test', 'Ngô Thùy Linh'],
      ['Sinh viên — chủ nhiệm đề tài', 'sv.an@demo.aisrm.test', 'Nguyễn Văn An (K62)'],
      ['Giảng viên hướng dẫn', 'gv.binh@demo.aisrm.test', 'TS. Trần Thị Bình'],
      ['Đầu mối KH của khoa', 'dm.ktqt@demo.aisrm.test', 'ThS. Hoàng Thu Hà'],
      ['Chủ tịch hội đồng', 'gv.dung@demo.aisrm.test', 'TS. Phạm Quốc Dũng'],
      ['Phản biện / ủy viên hội đồng', 'gv.chi@demo.aisrm.test', 'ThS. Lê Minh Chí'],
      ['Thư ký hội đồng', 'cv.minh@demo.aisrm.test', 'Đặng Quang Minh'],
      ['Trưởng phòng QLKH', 'tp.hung@demo.aisrm.test', 'TS. Lý Văn Hùng'],
      ['Phó Hiệu trưởng (phê duyệt)', 'pht.nam@demo.aisrm.test', 'PGS.TS. Trịnh Hoài Nam'],
      ['Hiệu trưởng (theo dõi, báo cáo)', 'ht.quang@demo.aisrm.test', 'GS.TS. Mai Đình Quang'],
    ]),
    h1('Sơ đồ quy trình'),
    p('Một đề tài NCKH sinh viên đi qua 4 giai đoạn. Mỗi ô là một bước trong tài liệu:'),
    k.table(
      ['Giai đoạn', 'Các bước', 'Vai trò chính'],
      [
        ['1. Đăng ký', 'B1 Mở đợt → B2 Sinh viên lập hồ sơ, chọn GV hướng dẫn → B3 GV xác nhận → B4 Sinh viên nộp', 'Phòng QLKH, sinh viên, GV hướng dẫn'],
        ['2. Xét chọn', 'B5 Khoa xác nhận → B6 Hội đồng đánh giá, chấm phiếu, biên bản → B7 Trình, phê duyệt', 'Khoa, hội đồng, Phòng QLKH, lãnh đạo'],
        ['3. Thực hiện', 'B8 Giao nhiệm vụ, mốc tiến độ → B9 Nhật ký hướng dẫn, nộp sản phẩm', 'Phòng QLKH, GV hướng dẫn, sinh viên'],
        ['4. Nghiệm thu, khen thưởng', 'B10 Nghiệm thu, xác nhận hoàn thành → B11 Xếp giải, thống kê, truy vết', 'Hội đồng, Trưởng phòng, Phòng QLKH, lãnh đạo'],
      ],
      [2, 5.4, 2.6],
    ),
    k.spacer(),
    p('Trạng thái hồ sơ đề xuất: **Nháp → Đơn vị xem xét → Phòng KH xử lý → Chờ phê duyệt → Đã phê duyệt**. Sau phê duyệt hệ thống tự lập **đề tài**: **Chờ giao nhiệm vụ → Đang thực hiện → Đề nghị nghiệm thu → Đang nghiệm thu → Đã hoàn thành**.'),
    h1('Thực hành từng bước'),
  );

  // B1
  add(
    stepHead(k, 1, 'Phòng QLKH mở đợt NCKH sinh viên', { role: 'Chuyên viên Phòng QLKH', account: 'cv.linh@demo.aisrm.test', result: 'Đợt "NCKH sinh viên" ở trạng thái Đang mở' }),
    steps(['Menu **Đợt đăng ký** → **+ Mở đợt mới**.', 'Khai tên đợt, năm, **Cấp: Sinh viên**, thời gian nhận hồ sơ, mô tả, điều kiện.', 'Kiểm tra biểu mẫu thuyết minh (rút gọn cho sinh viên) và tài liệu bắt buộc (đề cương).', 'Bấm **Tạo đợt**, rồi **Mở nhận hồ sơ**.']),
    figure('WS-01-mo-dot'),
    figure('WS-02-dot-da-mo'),
    value('Biểu mẫu, tài liệu yêu cầu, thời hạn thống nhất cho toàn trường; không còn phát mẫu Word mỗi khoa một kiểu. Hồ sơ của đợt luôn đúng phiên bản biểu mẫu.'),
  );
  // B2
  add(
    stepHead(k, 2, 'Sinh viên lập hồ sơ, chọn giảng viên hướng dẫn', { role: 'Sinh viên (chủ nhiệm)', account: 'sv.an@demo.aisrm.test', result: 'Hồ sơ nháp đủ thông tin, đã chọn GV hướng dẫn' }),
    steps([
      '**Đợt đăng ký** → đợt NCKH sinh viên → **+ Tạo hồ sơ đề xuất**.',
      'Khai tên đề tài, kinh phí đề xuất, thời gian, lĩnh vực, mục tiêu, phương pháp, sản phẩm. Bấm **Lưu nháp**.',
      'Ở khung **NCKH sinh viên — người hướng dẫn**: gõ tên giảng viên, chọn; khai ngành, khóa; bấm **Lưu thông tin**.',
      'Tab **Tài liệu**: tải đề cương.',
      'Khung **Trợ lý AI** → **✨ Kiểm tra thuyết minh** để nhận góp ý.',
    ]),
    figure('WS-03-sv-chon-dot'),
    figure('WS-04-sv-khai-ho-so'),
    note('Bấm **Lưu nháp** trước khi bấm **Lưu thông tin** ở khung người hướng dẫn. Bản hiện tại: lưu khung người hướng dẫn làm tải lại hồ sơ, nội dung thuyết minh chưa lưu sẽ mất.'),
    figure('WS-05-sv-ai-gop-y'),
    ai('AI rà soát đề cương theo biểu mẫu và quy chế, chỉ ra mục còn sơ sài. AI chạy trên máy chủ AI nội bộ — dữ liệu không ra khỏi trường. AI chỉ góp ý, sinh viên tự quyết định sửa.'),
    figure('WS-06-cho-gvhd'),
    control('Chưa có xác nhận của giảng viên hướng dẫn thì hệ thống **không cho nộp** hồ sơ — không còn tình trạng "ký hộ", ghi tên giảng viên khi chưa được đồng ý.'),
  );
  // B3
  add(
    stepHead(k, 3, 'Giảng viên xác nhận hướng dẫn', { role: 'Giảng viên hướng dẫn', account: 'gv.binh@demo.aisrm.test', result: 'Hồ sơ hiện "đã xác nhận hướng dẫn"' }),
    steps(['Bấm 🔔 → thông báo "Đề nghị xác nhận hướng dẫn NCKH sinh viên".', 'Đọc đề cương; bấm **✓ Xác nhận hướng dẫn** (hoặc **Từ chối** kèm lý do).']),
    figure('WS-07-gvhd-thong-bao'),
    figure('WS-08-gvhd-xac-nhan'),
    value('Xác nhận điện tử có tên, thời điểm — thay chữ ký tay trên đơn giấy; khoa và Phòng QLKH biết ngay giảng viên nào đang hướng dẫn bao nhiêu sinh viên.'),
  );
  // B4
  add(
    stepHead(k, 4, 'Sinh viên nộp hồ sơ', { role: 'Sinh viên', account: 'sv.an@demo.aisrm.test', result: 'Hồ sơ ở trạng thái "Đơn vị xem xét"' }),
    steps(['Mở lại hồ sơ, thấy dòng "đã xác nhận hướng dẫn".', 'Bấm **Nộp hồ sơ** → **Xác nhận: Nộp hồ sơ**.']),
    figure('WS-09-sv-nop'),
    control('Hệ thống kiểm tra đủ mục bắt buộc, đủ tài liệu, đúng thời hạn của đợt trước khi cho nộp. Sau khi nộp, hồ sơ bị khóa — không ai sửa được nội dung đã nộp.'),
  );
  // B5
  add(
    stepHead(k, 5, 'Khoa xác nhận', { role: 'Đầu mối KH của khoa', account: 'dm.ktqt@demo.aisrm.test', result: 'Hồ sơ chuyển "Phòng KH xử lý"' }),
    steps(['**Trang làm việc → Việc cần tôi xử lý**: bấm mã hồ sơ.', 'Xem thuyết minh, tài liệu, lịch sử; bấm **Đơn vị xác nhận** (hoặc **Trả bổ sung** kèm yêu cầu).']),
    figure('WS-10-khoa-viec-cho'),
    figure('WS-11-khoa-xac-nhan'),
    control('Khoa chỉ thấy và xử lý hồ sơ **thuộc khoa mình** (phân quyền theo đơn vị). Người là chủ nhiệm không được tự xác nhận hồ sơ của chính mình.'),
  );
  // B6
  add(
    stepHead(k, 6, 'Hội đồng đánh giá NCKH sinh viên', { role: 'Phòng QLKH lập hội đồng; thành viên chấm; chủ tịch kết luận', account: 'cv.linh → gv.dung (chủ tịch), gv.chi (phản biện)', result: 'Biên bản hội đồng đã được chủ tịch xác nhận' }),
    p('**Phòng QLKH (cv.linh):**'),
    steps(['Menu **Hội đồng** → **+ Thành lập hội đồng**: tên, **Loại: Đánh giá NCKH sinh viên**, hạn chấm, chọn đề tài.', 'Tab **Thành viên**: xem gợi ý theo chuyên môn, mời Chủ tịch, Thư ký, Phản biện.', 'Khi thành viên đã nhận lời: bấm **Mở chấm**.']),
    figure('WS-12-lap-hoi-dong'),
    figure('WS-13-xung-dot'),
    control('Hệ thống tự phát hiện **xung đột lợi ích**: giảng viên hướng dẫn, thành viên đề tài không được mời chấm; người cùng đơn vị được cảnh báo.'),
    figure('WS-14-thanh-vien'),
    p('**Thành viên hội đồng (gv.dung, gv.chi):**'),
    steps(['Mở hội đồng từ thông báo hoặc menu **Hội đồng**; bấm **Nhận lời**.', 'Bấm **Tôi không có xung đột lợi ích** (bắt buộc trước khi xem hồ sơ).', 'Chấm từng tiêu chí, ghi nhận xét, **Nộp phiếu**.']),
    figure('WS-15-cham-phieu'),
    p('**Chủ tịch (gv.dung):**'),
    steps(['Bấm **Khóa phiếu & tổng hợp**.', 'Tab **Kết quả & biên bản**: chọn kết luận; bấm **✨ AI dự thảo biên bản**; sửa nội dung.', 'Bấm **Lưu biên bản và kết luận** → **Chủ tịch xác nhận biên bản**.']),
    figure('WS-16-bien-ban'),
    ai('AI dự thảo biên bản từ điểm và nhận xét trong vài chục giây; chủ tịch, thư ký đọc lại, sửa rồi mới xác nhận. Điểm trung bình do hệ thống tính, không do AI.'),
    value('Hội đồng chấm trực tuyến, không cần tập trung, không cộng điểm tay; biên bản có sẵn bản Word. Rút ngắn thời gian xét chọn từ nhiều tuần xuống vài ngày.'),
  );
  // B7
  add(
    stepHead(k, 7, 'Phòng QLKH trình, lãnh đạo phê duyệt', { role: 'Chuyên viên QLKH → Phó Hiệu trưởng', account: 'cv.linh → pht.nam', result: 'Đề xuất "Đã phê duyệt"; đề tài được lập tự động' }),
    steps(['Chuyên viên mở hồ sơ → **Trình phê duyệt**, ghi ý kiến trình.', 'Phó Hiệu trưởng mở hồ sơ (từ Trang làm việc) → **Phê duyệt**, ghi ý kiến chỉ đạo.', 'Bấm **Mở đề tài →** để xem đề tài vừa được lập.']),
    figure('WS-17-trinh-phe-duyet'),
    figure('WS-18-phe-duyet'),
    control('**Phân tách nhiệm vụ**: người đã trình không được tự phê duyệt; mọi quyết định có tên, thời điểm, ý kiến.'),
  );
  // B8
  add(
    stepHead(k, 8, 'Giao nhiệm vụ, lập mốc tiến độ', { role: 'Chuyên viên Phòng QLKH', account: 'cv.linh@demo.aisrm.test', result: 'Đề tài "Đang thực hiện"' }),
    steps(['Mở đề tài: nhập **Bắt đầu**, **Kết thúc** → **Cập nhật thời gian**.', '**+ Thêm mốc**: tên mốc, hạn, sản phẩm cần nộp (ví dụ báo cáo giữa kỳ, báo cáo tổng kết).', 'Bấm **Giao nhiệm vụ / bắt đầu** → xác nhận.']),
    figure('WS-19-lap-moc'),
    value('Hệ thống tự nhắc hạn (trước 7 ngày, 1 ngày, khi quá hạn) cho sinh viên và giảng viên — Phòng QLKH không phải gọi điện, gửi email đôn đốc từng nhóm.'),
  );
  // B9
  add(
    stepHead(k, 9, 'Thực hiện: nhật ký hướng dẫn, nộp sản phẩm', { role: 'GV hướng dẫn, sinh viên, Phòng QLKH', account: 'gv.binh, sv.an, cv.linh', result: 'Có nhật ký hướng dẫn; các mốc "Đã chấp nhận"' }),
    p('**Giảng viên hướng dẫn:** tab **Nhật ký hướng dẫn** → ghi ngày, nội dung trao đổi, việc tiếp theo → **Lưu**.'),
    figure('WS-20-nhat-ky-huong-dan'),
    p('**Sinh viên:** ở từng mốc bấm **⬆ Tải sản phẩm**, chọn tệp → **Nộp sản phẩm**.'),
    figure('WS-21-sv-nop-san-pham'),
    p('**Phòng QLKH:** xem sản phẩm, bấm **Chấp nhận** (hoặc **Trả lại** kèm lý do).'),
    figure('WS-22-duyet-san-pham'),
    value('Nhật ký hướng dẫn là minh chứng quá trình — phục vụ đánh giá giờ chuẩn của giảng viên, kiểm định chất lượng; lãnh đạo xem tiến độ mọi đề tài không cần họp.'),
  );
  // B10
  add(
    stepHead(k, 10, 'Nghiệm thu và xác nhận hoàn thành', { role: 'Sinh viên → Phòng QLKH → Hội đồng nghiệm thu → Trưởng phòng QLKH', account: 'sv.an → cv.linh → gv.dung → tp.hung', result: 'Đề tài "Đã hoàn thành"' }),
    steps([
      'Sinh viên: **Đề nghị nghiệm thu** (chỉ được khi đã nộp đủ sản phẩm các mốc).',
      'Chuyên viên: **Tiếp nhận nghiệm thu**; lập **hội đồng nghiệm thu** (Loại: Nghiệm thu) — các bước mời, chấm, biên bản như Bước 6.',
      'Trưởng phòng QLKH: **Xác nhận hoàn thành**.',
    ]),
    figure('WS-23-de-nghi-nghiem-thu'),
    figure('WS-24-nghiem-thu'),
    figure('WS-25-hoan-thanh'),
    control('Còn mốc chưa nộp thì không đề nghị nghiệm thu được; còn sản phẩm chưa chấp nhận thì không xác nhận hoàn thành được; người tiếp nhận nghiệm thu không được tự xác nhận hoàn thành.'),
  );
  // B11
  add(
    stepHead(k, 11, 'Xếp giải, thống kê, truy vết', { role: 'Phòng QLKH; lãnh đạo', account: 'cv.linh; ht.quang', result: 'Đề tài có giải; lãnh đạo xem thống kê' }),
    steps(['Chuyên viên: menu **NCKH sinh viên** → tab **Xếp giải** → chọn đợt → chọn mức giải cho từng đề tài (sắp theo điểm hội đồng).', 'Hiệu trưởng: menu **NCKH sinh viên** → tab **Thống kê**: theo khoa, ngành, khóa, cơ cấu giải; **⬇ Xuất Excel**.', 'Mở hồ sơ → tab **Lịch sử xử lý** để xem toàn bộ quá trình.']),
    figure('WS-26-xep-giai'),
    figure('WS-27-thong-ke'),
    figure('WS-28-truy-vet'),
    value('Số liệu NCKH sinh viên theo khoa, ngành, khóa có ngay khi lãnh đạo cần — phục vụ báo cáo năm, kiểm định, xếp hạng; không phải chờ các khoa tổng hợp Excel.'),
  );

  add(
    closing(k, {
      flow: [
        ['1', 'Phòng QLKH', 'Mở đợt NCKH sinh viên', 'Đợt: Đang mở'],
        ['2', 'Sinh viên', 'Lập hồ sơ, chọn GV hướng dẫn, AI góp ý', 'Nháp'],
        ['3', 'GV hướng dẫn', 'Xác nhận hướng dẫn', 'Nháp (đã xác nhận HD)'],
        ['4', 'Sinh viên', 'Nộp hồ sơ', 'Đơn vị xem xét'],
        ['5', 'Khoa', 'Xác nhận', 'Phòng KH xử lý'],
        ['6', 'Hội đồng', 'Chấm phiếu, AI dự thảo biên bản, chủ tịch xác nhận', 'Phòng KH xử lý'],
        ['7', 'Phòng QLKH → Lãnh đạo', 'Trình, phê duyệt', 'Đã phê duyệt; đề tài: Chờ giao nhiệm vụ'],
        ['8', 'Phòng QLKH', 'Thời gian, mốc, giao nhiệm vụ', 'Đang thực hiện'],
        ['9', 'GVHD, sinh viên, Phòng QLKH', 'Nhật ký hướng dẫn, nộp và chấp nhận sản phẩm', 'Đang thực hiện'],
        ['10', 'Sinh viên → HĐ → Trưởng phòng', 'Nghiệm thu, xác nhận hoàn thành', 'Đã hoàn thành'],
        ['11', 'Phòng QLKH, lãnh đạo', 'Xếp giải, thống kê', 'Có giải; số liệu cập nhật'],
      ],
      before: [
        ['Đăng ký, xác nhận GVHD', 'Đơn giấy, chữ ký tay; khó biết GV đã đồng ý thật chưa', 'GV xác nhận điện tử; chưa xác nhận thì không nộp được'],
        ['Tiếp nhận hồ sơ', 'Khoa gom bản cứng/email, nhập Excel', 'Hồ sơ số, kiểm tra đủ mục, đủ tài liệu, đúng hạn tự động'],
        ['Hội đồng', 'Họp tập trung, phiếu giấy, cộng điểm tay, thư ký gõ biên bản', 'Chấm trực tuyến, điểm tự tính, AI dự thảo biên bản, xác nhận điện tử'],
        ['Theo dõi tiến độ', 'Gọi điện, email đôn đốc', 'Nhắc hạn tự động; tiến độ hiển thị theo thời gian thực'],
        ['Xếp giải, báo cáo', 'Tổng hợp từ nhiều file, dễ sai lệch', 'Xếp theo điểm hội đồng; thống kê, xuất Excel tức thì'],
        ['Kiểm tra, thanh tra', 'Tìm lại hồ sơ giấy', 'Lịch sử xử lý đầy đủ: ai, lúc nào, ý kiến gì'],
      ],
      valueRows: [
        ['Sinh viên', 'Đăng ký trực tuyến, biết hồ sơ đang ở đâu, được AI góp ý đề cương, nhận nhắc hạn.'],
        ['Giảng viên hướng dẫn', 'Xác nhận, ghi nhật ký hướng dẫn trên hệ thống — minh chứng cho giờ chuẩn, thi đua.'],
        ['Khoa', 'Thấy toàn bộ đề tài sinh viên của khoa; xác nhận nhanh; số liệu theo ngành, khóa.'],
        ['Phòng QLKH', 'Giảm việc giấy tờ, đôn đốc; hội đồng, biên bản, xếp giải, báo cáo trên một hệ thống.'],
        ['Lãnh đạo', 'Số liệu tức thì, minh bạch, có truy vết; quyết định dựa trên dữ liệu; dữ liệu và AI nằm tại trường.'],
      ],
      pitch: [
        'Mở **NCKH sinh viên → Thống kê**: số đề tài theo khoa, ngành, khóa, cơ cấu giải (30 giây).',
        'Mở một đề tài → **Lịch sử xử lý**: chỉ ra từng bước, ai làm, lúc nào — "không ai sửa được hồ sơ đã nộp" (1 phút).',
        'Mở hội đồng → **Kết quả & biên bản**: điểm tự tính, AI dự thảo biên bản, chủ tịch xác nhận (1 phút).',
        'Chỉ ra 3 điểm kiểm soát: GV phải xác nhận trước khi nộp; cảnh báo xung đột lợi ích; người trình không tự duyệt (1 phút).',
        'Nhấn mạnh: AI chạy nội bộ, dữ liệu không ra ngoài; AI chỉ gợi ý, con người quyết định (30 giây).',
        'Đề xuất: áp dụng cho đợt NCKH sinh viên kế tiếp tại 1–2 khoa thí điểm (1 phút).',
      ],
      questions: [
        'Vì sao sinh viên chưa nộp được hồ sơ ngay sau khi khai xong?',
        'Ai được xác nhận hồ sơ ở cấp khoa? Họ có thấy hồ sơ của khoa khác không?',
        'Vì sao giảng viên hướng dẫn không được mời vào hội đồng chấm đề tài mình hướng dẫn?',
        'Điểm hội đồng do ai tính? AI làm gì trong bước hội đồng?',
        'Khi nào sinh viên mới được bấm "Đề nghị nghiệm thu"?',
        'Lãnh đạo xem số đề tài sinh viên theo khoa ở đâu? Xuất ra Excel thế nào?',
        'Nêu 3 giá trị của quy trình này mà bạn sẽ báo cáo với lãnh đạo đơn vị.',
      ],
      states: [
        ['Nháp', 'Sinh viên đang khai; chỉ nhóm thực hiện và GVHD xem được', 'Sinh viên; GV hướng dẫn xác nhận'],
        ['Đơn vị xem xét', 'Đã nộp, chờ khoa', 'Đầu mối KH / Trưởng khoa'],
        ['Phòng KH xử lý', 'Khoa đã xác nhận', 'Phòng QLKH, hội đồng'],
        ['Cần bổ sung', 'Bị trả lại kèm yêu cầu', 'Sinh viên sửa, nộp lại'],
        ['Chờ phê duyệt', 'Đã trình lãnh đạo', 'Phó Hiệu trưởng / Hiệu trưởng'],
        ['Đã phê duyệt', 'Đề tài được lập', 'Phòng QLKH giao nhiệm vụ'],
        ['Đang thực hiện', 'Theo mốc tiến độ', 'Sinh viên, GVHD; Phòng QLKH duyệt sản phẩm'],
        ['Đề nghị nghiệm thu / Đang nghiệm thu', 'Chờ hội đồng nghiệm thu', 'Phòng QLKH, hội đồng'],
        ['Đã hoàn thành', 'Trưởng phòng QLKH đã xác nhận', 'Phòng QLKH xếp giải, lưu trữ'],
      ],
      issues: [
        ['Nút "Nộp hồ sơ" báo chưa đủ', 'Đọc khung "Kiểm tra trước khi nộp": thiếu mục bắt buộc (ví dụ kinh phí), thiếu tài liệu, hoặc GV chưa xác nhận.'],
        ['Nội dung thuyết minh bị mất sau khi lưu người hướng dẫn', 'Luôn "Lưu nháp" trước khi "Lưu thông tin" ở khung người hướng dẫn (lỗi đã ghi nhận, sẽ sửa).'],
        ['Không thấy hồ sơ cần xử lý', 'Kiểm tra đúng tài khoản, đúng vai trò (ô Vai trò trên thanh trên cùng); mở 🔔 Thông báo.'],
        ['Không mời được một giảng viên vào hội đồng', 'Người đó có xung đột lợi ích (hướng dẫn, thành viên đề tài) — chọn người khác.'],
        ['AI chạy lâu, báo hết thời gian chờ', 'Lần đầu sau thời gian không dùng: chờ 1–3 phút rồi bấm lại; quản trị bấm "Làm nóng" trong AI Center.'],
        ['Báo "hồ sơ đã được cập nhật bởi người khác"', 'Tải lại trang (F5) rồi thao tác lại — có người vừa cập nhật hồ sơ.'],
      ],
    }),
  );
  await k.save(body, { fileName: 'AI-SRM_THUC_HANH_QUY_TRINH_NCKH_SINH_VIEN.docx', title: 'AI-SRM — Thực hành quy trình NCKH sinh viên', header: 'AI-SRM · Thực hành quy trình NCKH sinh viên · Khóa 24', outDir });
}

// =====================================================================================================
// B. ĐỀ TÀI CẤP TRƯỜNG
// =====================================================================================================
async function buildDT() {
  const k = kitFor('wf-dt');
  const { h1, p, steps, figure, note, control, value, ai } = k;
  const body = [];
  const add = (...xs) => body.push(...xs.flat());

  add(
    cover(k, {
      title: 'QUY TRÌNH ĐỀ TÀI KH&CN CẤP TRƯỜNG',
      subtitle: 'Cán bộ, giảng viên — từ mở đợt đến nghiệm thu, lưu trữ, báo cáo — 9 bước, 9 vai trò',
      lines: ['Hệ thống quản lý khoa học tích hợp AI — AI-SRM', 'Tháng 11/2026'],
    }),
    howTo(k, [
      ['Chuyên viên Phòng QLKH', 'cv.linh@demo.aisrm.test', 'Ngô Thùy Linh'],
      ['Chủ nhiệm đề tài (giảng viên)', 'gv.binh@demo.aisrm.test', 'TS. Trần Thị Bình'],
      ['Trưởng khoa', 'tk.ktqt@demo.aisrm.test', 'PGS.TS. Vũ Đức Khang'],
      ['Chủ tịch hội đồng', 'gv.dung@demo.aisrm.test', 'TS. Phạm Quốc Dũng'],
      ['Phản biện', 'gv.chi@demo.aisrm.test', 'ThS. Lê Minh Chí'],
      ['Thư ký hội đồng', 'cv.minh@demo.aisrm.test', 'Đặng Quang Minh'],
      ['Trưởng phòng QLKH', 'tp.hung@demo.aisrm.test', 'TS. Lý Văn Hùng'],
      ['Phó Hiệu trưởng (phê duyệt)', 'pht.nam@demo.aisrm.test', 'PGS.TS. Trịnh Hoài Nam'],
      ['Hiệu trưởng (điều hành)', 'ht.quang@demo.aisrm.test', 'GS.TS. Mai Đình Quang'],
      ['Quản trị hệ thống (HEMIS)', 'admin@demo.aisrm.test', 'Trung tâm CNTT'],
    ]),
    h1('Sơ đồ quy trình'),
    k.table(
      ['Giai đoạn', 'Các bước', 'Vai trò chính'],
      [
        ['1. Đề xuất', 'B1 Mở đợt (có thẩm định) → B2 Lập, AI tóm tắt, nộp → B3 Khoa trả bổ sung, nộp lại, xác nhận', 'Phòng QLKH, chủ nhiệm, trưởng khoa'],
        ['2. Xét chọn, phê duyệt', 'B4 Chuyển thẩm định, hội đồng xét chọn → B5 Ghi nhận thẩm định, phê duyệt', 'Phòng QLKH, hội đồng, Phó Hiệu trưởng'],
        ['3. Thực hiện', 'B6 Hợp đồng, mốc, giao nhiệm vụ → B7 Sản phẩm, gia hạn', 'Phòng QLKH, chủ nhiệm'],
        ['4. Nghiệm thu, báo cáo', 'B8 Nghiệm thu, hoàn thiện, hoàn thành, lưu trữ → B9 HEMIS, điều hành, AI báo cáo', 'Hội đồng, Trưởng phòng, Hiệu trưởng, quản trị'],
      ],
      [2, 5.4, 2.6],
    ),
    k.spacer(),
    p('Đề xuất: **Nháp → Đơn vị xem xét ⇄ Cần bổ sung → Phòng KH xử lý → Thẩm định / phản biện → Chờ phê duyệt → Đã phê duyệt**. Đề tài: **Chờ giao nhiệm vụ → Đang thực hiện → Đề nghị nghiệm thu → Đang nghiệm thu ⇄ Hoàn thiện sau nghiệm thu → Đã hoàn thành → Đã lưu trữ**.'),
    h1('Thực hành từng bước'),
  );

  add(
    stepHead(k, 1, 'Phòng QLKH mở đợt đề tài cấp trường', { role: 'Chuyên viên Phòng QLKH', account: 'cv.linh@demo.aisrm.test', result: 'Đợt cấp trường Đang mở, có bước thẩm định' }),
    steps(['**Đợt đăng ký** → **+ Mở đợt mới**; Cấp: **Cấp trường**.', 'Đánh dấu **Có bước thẩm định / phản biện**.', 'Khai thời gian, mô tả; kiểm tra biểu mẫu thuyết minh, tài liệu bắt buộc.', '**Tạo đợt** → **Mở nhận hồ sơ**.']),
    figure('WD-01-mo-dot'),
    value('Quy trình của từng đợt cấu hình được (có/không thẩm định) mà không cần sửa phần mềm — đúng quy chế của từng loại đề tài.'),
  );
  add(
    stepHead(k, 2, 'Chủ nhiệm lập và nộp đề xuất', { role: 'Giảng viên (chủ nhiệm)', account: 'gv.binh@demo.aisrm.test', result: 'Hồ sơ "Đơn vị xem xét"' }),
    steps(['Đợt cấp trường → **+ Tạo hồ sơ đề xuất**; khai thuyết minh; **Lưu nháp**.', 'Tab **Tài liệu**: tải thuyết minh, dự toán.', '**✨ Tóm tắt thuyết minh** (và **✨ Kiểm tra thuyết minh**) ở khung Trợ lý AI.', '**Nộp hồ sơ** → xác nhận.']),
    figure('WD-02-ho-so-day-du'),
    figure('WD-03-ai-tom-tat'),
    ai('Tóm tắt thuyết minh để trình lãnh đạo, gửi hội đồng; góp ý thuyết minh theo biểu mẫu. AI nội bộ, chi phí 0 đ, dữ liệu không ra ngoài.'),
    figure('WD-04-nop'),
  );
  add(
    stepHead(k, 3, 'Khoa trả bổ sung, chủ nhiệm nộp lại, khoa xác nhận', { role: 'Trưởng khoa ⇄ chủ nhiệm', account: 'tk.ktqt ⇄ gv.binh', result: 'Hồ sơ "Phòng KH xử lý"' }),
    steps(['Trưởng khoa mở hồ sơ → **Trả bổ sung**, ghi rõ yêu cầu.', 'Chủ nhiệm nhận thông báo, sửa thuyết minh, **Lưu nháp** → **Nộp lại**.', 'Trưởng khoa → **Đơn vị xác nhận**.']),
    figure('WD-05-tra-bo-sung'),
    figure('WD-06-nop-lai'),
    control('"Trả bổ sung" bắt buộc ghi lý do; nộp lại thì hồ sơ **quay về đúng bước đã trả** — không phải đi lại từ đầu; mọi lần trả, nộp đều lưu lịch sử.'),
  );
  add(
    stepHead(k, 4, 'Chuyển thẩm định, hội đồng xét chọn', { role: 'Phòng QLKH; hội đồng', account: 'cv.linh; gv.chi (phản biện), gv.dung (chủ tịch)', result: 'Biên bản hội đồng xét chọn đã xác nhận' }),
    steps(['Chuyên viên mở hồ sơ → **Chuyển thẩm định**.', '**Hội đồng** → **+ Thành lập hội đồng** (Loại: Xét duyệt thuyết minh), chọn hồ sơ; mời thành viên theo gợi ý; **Mở chấm**.', 'Thành viên: **Nhận lời** → **Tôi không có xung đột lợi ích** → chấm → **Nộp phiếu**.', 'Chủ tịch: **Khóa phiếu & tổng hợp** → kết luận → **✨ AI dự thảo biên bản** → **Lưu** → **Chủ tịch xác nhận biên bản**.']),
    figure('WD-07-chuyen-tham-dinh'),
    figure('WD-08-goi-y-phan-bien'),
    figure('WD-09-phan-bien-cham'),
    figure('WD-10-ket-qua-hoi-dong'),
    control('Gợi ý thành viên theo chuyên môn kèm cảnh báo xung đột lợi ích; phải khai báo không xung đột trước khi chấm; phiếu đã nộp bị khóa; điểm do hệ thống tính.'),
    value('Mời phản biện đúng chuyên môn trong vài phút (kể cả chuyên gia ngoài trường với tài khoản có thời hạn); hội đồng làm việc trực tuyến, biên bản có ngay.'),
  );
  add(
    stepHead(k, 5, 'Ghi nhận thẩm định, lãnh đạo phê duyệt', { role: 'Chuyên viên QLKH → Phó Hiệu trưởng', account: 'cv.linh → pht.nam', result: 'Đề xuất "Đã phê duyệt"; đề tài được lập' }),
    steps(['Chuyên viên: **Ghi nhận kết quả thẩm định**, tóm tắt kết luận hội đồng.', 'Phó Hiệu trưởng: hồ sơ hiện trên **Trang làm việc**; xem **Lịch sử xử lý**; **Phê duyệt**.', 'Bấm **Mở đề tài →**.']),
    figure('WD-11-ghi-nhan-tham-dinh'),
    figure('WD-12-lanh-dao-viec-cho'),
    figure('WD-13-lanh-dao-xem-lich-su'),
    figure('WD-14-phe-duyet'),
    control('Người chuyển thẩm định và người ghi nhận kết quả thẩm định không được tự phê duyệt (phân tách nhiệm vụ). Phê duyệt điện tử ghi tên, thời điểm, ý kiến.'),
    value('Lãnh đạo duyệt ở bất cứ đâu, có đủ căn cứ trên một màn hình: thuyết minh, tóm tắt AI, kết quả hội đồng, ý kiến các cấp.'),
  );
  add(
    stepHead(k, 6, 'Hợp đồng, mốc tiến độ, giao nhiệm vụ', { role: 'Chuyên viên Phòng QLKH', account: 'cv.linh@demo.aisrm.test', result: 'Đề tài "Đang thực hiện"' }),
    steps(['Đề tài → tab **Kinh phí – hợp đồng** → **+ Nhập hợp đồng**: số, ngày ký, giá trị, nguồn kinh phí → **Lưu**.', 'Tải lại trang (F5), tab **Tổng quan & tiến độ**: nhập thời gian → **Cập nhật thời gian**; **+ Thêm mốc** cho từng sản phẩm.', '**Giao nhiệm vụ / bắt đầu** → xác nhận.']),
    figure('WD-15-hop-dong'),
    note('Bản hiện tại: sau khi lưu hợp đồng, cần tải lại trang (F5) trước khi cập nhật thời gian, nếu không sẽ báo "Đề tài đã được cập nhật bởi người khác" (lỗi đã ghi nhận, sẽ sửa).'),
    figure('WD-16-giao-nhiem-vu'),
    control('Chưa có thời gian thực hiện, chưa có mốc tiến độ thì hệ thống không cho giao nhiệm vụ.'),
  );
  add(
    stepHead(k, 7, 'Nộp sản phẩm, xin gia hạn; Phòng QLKH duyệt', { role: 'Chủ nhiệm; Phòng QLKH', account: 'gv.binh; cv.linh', result: 'Sản phẩm "Đã chấp nhận"; gia hạn được chấp thuận' }),
    steps(['Chủ nhiệm: ở từng mốc **⬆ Tải sản phẩm** → **Nộp sản phẩm**.', 'Chủ nhiệm: **+ Gửi yêu cầu** → Loại: gia hạn, ngày kết thúc mới, lý do → **Gửi**.', 'Chuyên viên: **Chấp nhận** sản phẩm; **Chấp thuận** yêu cầu gia hạn.']),
    figure('WD-17-nop-san-pham'),
    figure('WD-18-xin-gia-han'),
    figure('WD-19-duyet-san-pham-gia-han'),
    value('Mọi thay đổi (gia hạn, thành viên, dự toán) có đề nghị, quyết định, lý do lưu trong hồ sơ đề tài — phục vụ quyết toán, thanh tra; không thất lạc công văn.'),
  );
  add(
    stepHead(k, 8, 'Nghiệm thu, hoàn thiện, hoàn thành, lưu trữ', { role: 'Chủ nhiệm → Phòng QLKH → Hội đồng nghiệm thu → Trưởng phòng QLKH', account: 'gv.binh → cv.linh → gv.dung → tp.hung → cv.linh', result: 'Đề tài "Đã lưu trữ"' }),
    steps([
      'Chủ nhiệm: **Đề nghị nghiệm thu**. Chuyên viên: **Tiếp nhận nghiệm thu**, lập hội đồng (Loại: Nghiệm thu) — các bước như Bước 4.',
      'Trưởng phòng QLKH: **Yêu cầu hoàn thiện** theo góp ý hội đồng (nếu có).',
      'Chủ nhiệm: **Nộp bản hoàn thiện**.',
      'Trưởng phòng QLKH: **Xác nhận hoàn thành**. Chuyên viên: **Lưu trữ**.',
    ]),
    figure('WD-20-de-nghi-nghiem-thu'),
    figure('WD-21-nghiem-thu'),
    figure('WD-22-yeu-cau-hoan-thien'),
    figure('WD-23-hoan-thanh'),
    figure('WD-24-luu-tru'),
    figure('WD-25-lich-su-de-tai'),
    control('Chưa nộp đủ sản phẩm thì không đề nghị nghiệm thu; sản phẩm chưa được chấp nhận hết thì không xác nhận hoàn thành; người tiếp nhận nghiệm thu không tự xác nhận hoàn thành.'),
  );
  add(
    stepHead(k, 9, 'HEMIS, điều hành, AI dự thảo báo cáo', { role: 'Quản trị hệ thống; Hiệu trưởng', account: 'admin; ht.quang', result: 'Dữ liệu HEMIS, báo cáo điều hành, dự thảo báo cáo' }),
    steps(['Quản trị: **Integration Center** → **Xem trước chuẩn HEMIS** → **Nhiệm vụ KHCN (đề tài)**.', 'Hiệu trưởng: **Điều hành & báo cáo** → **Tổng quan**.', 'Tab **Hỏi đáp số liệu**: bấm câu gợi ý hoặc gõ câu hỏi.', 'Tab **Báo cáo & chốt kỳ** → **✨ Tạo dự thảo**.']),
    figure('WD-26-hemis'),
    figure('WD-27-dieu-hanh'),
    figure('WD-28a-hoi-dap-so-lieu'),
    ai('Hỏi số liệu bằng lời: AI chỉ **chọn truy vấn có sẵn**, con số do hệ thống tính từ dữ liệu thật kèm định nghĩa — AI không tự bịa số. Câu hỏi không khớp truy vấn nào thì hệ thống đề nghị chọn trong danh sách.'),
    figure('WD-28-ai-bao-cao'),
    value('Báo cáo hoạt động KH&CN, dữ liệu HEMIS lấy thẳng từ hồ sơ đã xử lý — một lần nhập, dùng nhiều nơi; lãnh đạo có số liệu bất cứ lúc nào.'),
  );

  add(
    closing(k, {
      flow: [
        ['1', 'Phòng QLKH', 'Mở đợt cấp trường (có thẩm định)', 'Đợt: Đang mở'],
        ['2', 'Chủ nhiệm', 'Lập, AI tóm tắt, nộp', 'Đơn vị xem xét'],
        ['3', 'Trưởng khoa ⇄ chủ nhiệm', 'Trả bổ sung, nộp lại, xác nhận', 'Cần bổ sung → Phòng KH xử lý'],
        ['4', 'Phòng QLKH, hội đồng', 'Chuyển thẩm định, hội đồng xét chọn, biên bản', 'Thẩm định / phản biện'],
        ['5', 'Phòng QLKH → Phó HT', 'Ghi nhận thẩm định, phê duyệt', 'Đã phê duyệt; đề tài: Chờ giao nhiệm vụ'],
        ['6', 'Phòng QLKH', 'Hợp đồng, mốc, giao nhiệm vụ', 'Đang thực hiện'],
        ['7', 'Chủ nhiệm, Phòng QLKH', 'Sản phẩm, gia hạn', 'Đang thực hiện'],
        ['8', 'Chủ nhiệm → HĐ → Trưởng phòng', 'Nghiệm thu, hoàn thiện, hoàn thành, lưu trữ', 'Đã lưu trữ'],
        ['9', 'Quản trị, Hiệu trưởng', 'HEMIS, điều hành, AI báo cáo', '—'],
      ],
      before: [
        ['Nộp, tiếp nhận đề xuất', 'Bản cứng, nhiều bộ; Phòng QLKH kiểm tra tay', 'Hồ sơ số, kiểm tra đủ mục, tài liệu, thời hạn tự động'],
        ['Trả bổ sung', 'Công văn, email; khó biết đã sửa gì', 'Trả kèm lý do, nộp lại về đúng bước, lịch sử đầy đủ'],
        ['Mời phản biện, hội đồng', 'Tìm người theo quen biết; khó kiểm soát xung đột lợi ích', 'Gợi ý theo chuyên môn, cảnh báo xung đột lợi ích, chấm trực tuyến'],
        ['Phê duyệt', 'Trình ký giấy, chờ lịch lãnh đạo', 'Phê duyệt điện tử ở mọi nơi, đủ căn cứ trên một màn hình'],
        ['Theo dõi thực hiện', 'Đôn đốc thủ công; gia hạn bằng công văn', 'Nhắc hạn tự động; gia hạn, thay đổi có quy trình, lưu hồ sơ'],
        ['Báo cáo, HEMIS', 'Tổng hợp Excel nhiều lần, số liệu lệch nhau', 'Số liệu tức thì; dữ liệu chuẩn HEMIS; AI dự thảo báo cáo'],
      ],
      valueRows: [
        ['Giảng viên', 'Nộp, theo dõi hồ sơ trực tuyến; AI góp ý, tóm tắt thuyết minh; nhận nhắc hạn; gia hạn không cần công văn.'],
        ['Khoa', 'Xem xét, trả bổ sung, xác nhận nhanh; số liệu đề tài của khoa luôn sẵn.'],
        ['Hội đồng', 'Chấm trực tuyến, điểm tự tính, AI dự thảo biên bản.'],
        ['Phòng QLKH', 'Một hệ thống cho đợt, hồ sơ, hội đồng, hợp đồng, tiến độ, nghiệm thu, HEMIS; giảm mạnh việc giấy tờ, tổng hợp.'],
        ['Lãnh đạo', 'Duyệt điện tử có đủ căn cứ; điều hành bằng số liệu tức thì; truy vết đầy đủ; dữ liệu và AI nằm tại trường.'],
      ],
      pitch: [
        'Mở **Điều hành & báo cáo**: số đề xuất, đề tài, công bố theo trạng thái, theo đơn vị (30 giây).',
        'Hỏi một câu ở **Hỏi đáp số liệu** — số liệu có ngay, có định nghĩa (30 giây).',
        'Mở đề tài vừa thực hành → **Lịch sử xử lý**: toàn bộ vòng đời từ đề xuất đến lưu trữ (1 phút).',
        'Mở hội đồng → điểm tự tính, biên bản AI dự thảo, chủ tịch xác nhận (1 phút).',
        'Chỉ ra các điểm kiểm soát: trả bổ sung có lý do; xung đột lợi ích; người trình không tự duyệt; chưa đủ sản phẩm không nghiệm thu (1 phút).',
        '**✨ Tạo dự thảo** báo cáo; nhấn mạnh AI nội bộ, con người quyết định; đề xuất lộ trình triển khai (1 phút).',
      ],
      questions: [
        'Khi khoa "Trả bổ sung", hồ sơ nộp lại sẽ quay về bước nào?',
        'Bật "Có bước thẩm định / phản biện" khi mở đợt thì quy trình thay đổi thế nào?',
        'Vì sao người ghi nhận kết quả thẩm định không được tự phê duyệt?',
        'Hai điều kiện nào phải có trước khi "Giao nhiệm vụ"?',
        'Chủ nhiệm xin gia hạn ở đâu? Ai chấp thuận?',
        'Khi nào không thể "Xác nhận hoàn thành" đề tài?',
        'AI làm gì và không làm gì trong "Hỏi đáp số liệu"?',
        'Nêu 3 giá trị của quy trình này mà bạn sẽ báo cáo với lãnh đạo đơn vị.',
      ],
      states: [
        ['Nháp', 'Chủ nhiệm đang khai', 'Chủ nhiệm'],
        ['Đơn vị xem xét', 'Đã nộp, chờ khoa', 'Trưởng khoa / đầu mối KH'],
        ['Cần bổ sung', 'Bị trả lại kèm yêu cầu', 'Chủ nhiệm sửa, nộp lại'],
        ['Phòng KH xử lý', 'Khoa đã xác nhận', 'Phòng QLKH'],
        ['Thẩm định / phản biện', 'Đang qua hội đồng xét chọn', 'Hội đồng; Phòng QLKH ghi nhận'],
        ['Chờ phê duyệt', 'Đã trình', 'Phó Hiệu trưởng / Hiệu trưởng'],
        ['Chờ giao nhiệm vụ', 'Đề tài mới lập', 'Phòng QLKH: hợp đồng, mốc'],
        ['Đang thực hiện', 'Theo mốc', 'Chủ nhiệm; Phòng QLKH duyệt sản phẩm'],
        ['Đề nghị nghiệm thu / Đang nghiệm thu', 'Chờ hội đồng nghiệm thu', 'Phòng QLKH, hội đồng'],
        ['Hoàn thiện sau nghiệm thu', 'Sửa theo góp ý hội đồng', 'Chủ nhiệm'],
        ['Đã hoàn thành / Đã lưu trữ', 'Kết thúc', 'Phòng QLKH lưu trữ, báo cáo'],
      ],
      issues: [
        ['Không nộp được hồ sơ', 'Xem khung "Kiểm tra trước khi nộp": thiếu mục bắt buộc, thiếu tài liệu, hết hạn nộp.'],
        ['Báo "Đề tài đã được cập nhật bởi người khác"', 'Tải lại trang (F5) rồi thao tác lại (thường gặp sau khi vừa nhập hợp đồng).'],
        ['Không thấy nút Phê duyệt', 'Đúng tài khoản lãnh đạo chưa? Người đã trình / ghi nhận thẩm định không được tự phê duyệt.'],
        ['Không giao nhiệm vụ được', 'Cập nhật thời gian thực hiện và thêm ít nhất một mốc.'],
        ['AI chạy lâu, báo hết thời gian chờ', 'Chờ 1–3 phút rồi bấm lại; quản trị bấm "Làm nóng" trong AI Center.'],
        ['Hỏi đáp số liệu trả "chưa có truy vấn phù hợp"', 'Bấm một câu gợi ý hoặc chọn truy vấn trong danh sách hiện ra.'],
      ],
    }),
  );
  await k.save(body, { fileName: 'AI-SRM_THUC_HANH_QUY_TRINH_DE_TAI_CAP_TRUONG.docx', title: 'AI-SRM — Thực hành quy trình đề tài cấp trường', header: 'AI-SRM · Thực hành quy trình đề tài KH&CN cấp trường · Khóa 24', outDir });
}

(async () => {
  await buildSV();
  await buildDT();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
