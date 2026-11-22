/**
 * Dựng "Tài liệu thực hành AI-SRM — Khóa 24" (tập huấn 23–24/11/2026) theo 04 buổi của Thư mời,
 * dùng ảnh và ghi chú từ tests/guide/capture.spec.ts.
 *
 *   node tests/guide/build-training.cjs
 */
const { createKit } = require('./docx-kit.cjs');

const k = createKit();
const { p, h1, h2, h3, label, bullet, check, steps, note, tip, discuss, figure, ref, table, spacer, pageBreak, toc, centered } = k;
const body = [];
const add = (...xs) => body.push(...xs.flat());

/** Khung một bài thực hành. */
function lesson(code, title, { goal, account, time }) {
  return [
    h2(`Bài ${code}. ${title}`),
    table(
      ['Mục tiêu', 'Tài khoản thực hành', 'Thời lượng'],
      [[goal, account, time]],
      [5, 3, 1.4],
    ),
    spacer(),
  ];
}

// ---------------------------------------------------------------- Bìa
add(
  centered('KHÓA 24', { bold: true, size: 28, color: '1F3A5F' }, { spacing: { before: 1600 } }),
  centered('ỨNG DỤNG TRÍ TUỆ NHÂN TẠO VÀ CHUYỂN GIAO CÔNG NGHỆ', { bold: true, size: 30 }, { spacing: { before: 200 } }),
  centered('TRONG QUẢN LÝ KHOA HỌC VÀ NGHIÊN CỨU', { bold: true, size: 30 }),
  centered('TÀI LIỆU THỰC HÀNH', { bold: true, size: 52, color: '1F3A5F' }, { spacing: { before: 900, after: 120 } }),
  centered('Hệ thống quản lý khoa học tích hợp AI — AI-SRM', { size: 28 }),
  centered('Bài thực hành theo 04 buổi, có hình minh họa và ghi chú từng bước', { size: 22, color: '555555' }, { spacing: { after: 900 } }),
  centered('Hà Nội, 23 – 24/11/2026', { size: 24 }),
  centered('Thực hành trên dữ liệu mẫu (giả lập). Không nhập dữ liệu thật, thông tin cá nhân hoặc mật khẩu thật.', { italics: true, size: 20, color: '777777' }, { spacing: { before: 200 } }),
  centered('Họ tên học viên: ....................................................   Đơn vị: ..........................................', { size: 22 }, { spacing: { before: 1000 } }),
  pageBreak(),
  ...toc(),
);

// ---------------------------------------------------------------- Chuẩn bị
add(
  h1('Hướng dẫn chung'),
  h2('Lịch thực hành'),
  table(
    ['Buổi', 'Nội dung thực hành trên AI-SRM', 'Kết quả đầu ra'],
    [
      ['Buổi 1\nSáng 23/11', 'Làm quen hệ thống; hồ sơ nhà khoa học; đăng ký đề tài; AI kiểm tra, tóm tắt thuyết minh; theo dõi tiến độ, cảnh báo chậm tiến độ; hỏi đáp quy chế bằng AI', '01 hồ sơ đề xuất đề tài, 01 hồ sơ nhà khoa học mẫu'],
      ['Buổi 2\nChiều 23/11', 'Xét duyệt nhiều cấp; hội đồng trực tuyến (AI gợi ý phản biện, kiểm soát xung đột lợi ích, chấm phiếu, biên bản); phê duyệt, giao nhiệm vụ; NCKH sinh viên', '01 quy trình xét duyệt mẫu đi hết các bước; 01 hội đồng đã chấm và có biên bản'],
      ['Buổi 3\nSáng 24/11', 'Khai báo công bố; kiểm chứng DOI với Crossref; phát hiện trùng; xác minh – xác nhận; hồ sơ khoa học số, lý lịch khoa học', '01 công bố đã kiểm chứng và xác nhận; 01 lý lịch khoa học (PDF)'],
      ['Buổi 4\nChiều 24/11', 'Dashboard điều hành; AI dự thảo báo cáo; xuất dữ liệu, xem trước chuẩn HEMIS; quản trị tài khoản và AI nội bộ; lập kế hoạch triển khai', '01 dự thảo báo cáo điều hành; 01 kế hoạch triển khai thử nghiệm 3 – 6 tháng'],
    ],
    [1.4, 5.6, 3],
  ),
  h2('Thông tin truy cập'),
  p('Giảng viên cung cấp tại lớp; học viên ghi lại vào bảng dưới đây:'),
  table(
    ['Thông tin', 'Giá trị'],
    [
      ['Địa chỉ truy cập AI-SRM', '\n'],
      ['Mật khẩu chung của tài khoản mẫu', '\n'],
      ['Nhóm thực hành / mã học viên (vd HV05)', '\n'],
    ],
    [4, 6],
    { tall: true },
  ),
  p('Trình duyệt khuyến nghị: Chrome hoặc Edge bản mới. Nếu mở trang thấy "Đang khởi động…" lâu, chờ 1 – 2 phút rồi tải lại (F5).'),
  h2('Tài khoản mẫu theo vai trò'),
  p('Mỗi tài khoản mô phỏng một người trong quy trình. Khi bài yêu cầu đổi vai trò, **Đăng xuất** rồi đăng nhập bằng tài khoản tương ứng.'),
  table(
    ['Vai trò', 'Tài khoản (email)', 'Người mẫu'],
    [
      ['Giảng viên, chủ nhiệm đề tài; người hướng dẫn', 'gv.binh@demo.aisrm.test', 'TS. Trần Thị Bình — Khoa Kinh tế quốc tế'],
      ['Giảng viên (thành viên hội đồng)', 'gv.dung@demo.aisrm.test\ngv.chi@demo.aisrm.test', 'TS. Phạm Quốc Dũng\nThS. Lê Minh Chí'],
      ['Sinh viên', 'sv.an@demo.aisrm.test', 'Nguyễn Văn An'],
      ['Đầu mối khoa học Khoa KTQT', 'dm.ktqt@demo.aisrm.test', 'ThS. Hoàng Thu Hà'],
      ['Trưởng khoa KTQT', 'tk.ktqt@demo.aisrm.test', 'PGS.TS. Vũ Đức Khang'],
      ['Chuyên viên Phòng QLKH', 'cv.linh@demo.aisrm.test\ncv.minh@demo.aisrm.test', 'Ngô Thùy Linh\nĐặng Quang Minh'],
      ['Trưởng phòng QLKH', 'tp.hung@demo.aisrm.test', 'TS. Lý Văn Hùng'],
      ['Phó Hiệu trưởng', 'pht.nam@demo.aisrm.test', 'PGS.TS. Trịnh Hoài Nam'],
      ['Hiệu trưởng', 'ht.quang@demo.aisrm.test', 'GS.TS. Mai Đình Quang'],
      ['Quản trị hệ thống, AI, tích hợp', 'admin@demo.aisrm.test', 'Quản trị hệ thống'],
    ],
    [3.4, 3.6, 3],
  ),
  h2('Quy ước khi thực hành'),
  bullet('Nhiều học viên dùng chung tài khoản mẫu. **Đặt tên hồ sơ, hội đồng, công bố có tiền tố mã học viên**, ví dụ "[HV05] Ứng dụng AI trong dự báo…", để tìm đúng hồ sơ của mình.'),
  bullet('Chỉ thao tác trên hồ sơ của mình hoặc nhóm mình. Không phê duyệt, trả lại, xóa hồ sơ của học viên khác.'),
  bullet('**Không nhập dữ liệu thật**, thông tin cá nhân hay mật khẩu thật. Tệp đính kèm dùng tệp mẫu do giảng viên cung cấp.'),
  bullet('Thực hành theo nhóm 2 – 3 người là thuận tiện nhất: một người làm chủ nhiệm, người khác lần lượt đóng vai đơn vị, Phòng QLKH, hội đồng, lãnh đạo.'),
  h2('Cách đọc hình minh họa'),
  p('Trên mỗi hình, vùng cần thao tác được khoanh **ô đỏ có đánh số**. Ghi chú ①, ②, ③… ngay dưới hình ứng với ô số 1, 2, 3… Làm theo thứ tự số khi đó là các bước. Hình chụp trên dữ liệu mẫu nên tên người, mã hồ sơ, số liệu có thể khác màn hình của bạn.'),
  h2('Nguyên tắc "AI hỗ trợ – con người quyết định"'),
  bullet('AI chỉ **tóm tắt, góp ý, dự thảo, gợi ý**; mọi kết quả AI ghi rõ mô hình và thời điểm tạo, kèm lời nhắc kiểm tra.'),
  bullet('Xét duyệt, chấm điểm, kết luận, xác nhận công bố do **người có thẩm quyền** thực hiện, có ghi lịch sử.'),
  bullet('Bản cài tại trường (Local) dùng **máy chủ AI nội bộ**: dữ liệu không gửi ra ngoài trường.'),
);

// ---------------------------------------------------------------- Buổi 1
add(
  h1('Buổi 1. AI trong quản lý khoa học — AI-SRM Local'),
  p('**Sáng 23/11/2026.** Từ hồ sơ rời rạc đến dữ liệu khoa học tập trung: hồ sơ nhà khoa học, đề tài, tiến độ, sản phẩm; AI kiểm tra hồ sơ, tóm tắt thuyết minh, cảnh báo chậm tiến độ.'),

  ...lesson('1.1', 'Đăng nhập và làm quen giao diện', { goal: 'Đăng nhập, nhận biết menu theo vai trò, việc cần xử lý, thông báo, đổi mật khẩu.', account: 'gv.binh@demo.aisrm.test', time: '15 phút' }),
  label('Các bước'),
  ...steps([
    'Mở địa chỉ AI-SRM, nhập email và mật khẩu, bấm **Đăng nhập** (Hình 1).',
    'Quan sát **Trang làm việc**: menu bên trái, ô **Vai trò**, chuông thông báo, khung "Việc cần tôi xử lý" và "Thời hạn trong 30 ngày".',
    'Đổi ô **Vai trò** từ "Người hướng dẫn / cố vấn" sang "Giảng viên / nhà khoa học" và xem menu thay đổi.',
    'Bấm chuông 🔔 để xem thông báo; mở trang **Đổi mật khẩu** để biết vị trí (không cần đổi).',
  ]),
  ...figure('01-01-dang-nhap'),
  ...figure('01-02-trang-lam-viec'),
  ...figure('01-03-thong-bao'),
  ...figure('01-04-doi-mat-khau'),
  note('Nhập sai mật khẩu 5 lần, tài khoản bị khóa tạm 15 phút. Phiên đăng nhập tự hết hạn sau 2 giờ không thao tác.'),
  label('Tự kiểm tra'),
  check('Tôi biết vị trí việc cần xử lý, thông báo, đổi vai trò, đổi mật khẩu, đăng xuất.'),

  ...lesson('1.2', 'Cập nhật hồ sơ nhà khoa học', { goal: 'Cập nhật học hàm, học vị, ORCID, chuyên môn, hướng nghiên cứu.', account: 'gv.binh@demo.aisrm.test', time: '10 phút' }),
  label('Các bước'),
  ...steps([
    'Chọn **Hồ sơ khoa học** trên menu.',
    'Bấm **✎ Cập nhật thông tin**, điền **Chuyên môn** và **Hướng nghiên cứu** (thêm mã học viên vào cuối, ví dụ "… (HV05)").',
    'Bấm **Lưu**. Quan sát mục đề tài, công bố được hệ thống tự tổng hợp.',
  ]),
  ...figure('01-08-ho-so-khoa-hoc'),
  ...figure('01-09-cap-nhat-ho-so'),
  tip('Chuyên môn, hướng nghiên cứu được dùng để **gợi ý phản biện đúng lĩnh vực** ở Buổi 2 — khai càng cụ thể, gợi ý càng sát.'),
  label('Tự kiểm tra'),
  check('Lý lịch khoa học hiển thị chuyên môn và hướng nghiên cứu vừa cập nhật.'),

  ...lesson('1.3', 'Đăng ký đề tài: lập hồ sơ đề xuất', { goal: 'Tạo hồ sơ từ đợt đang mở, khai thuyết minh theo biểu mẫu, đính kèm tài liệu bắt buộc.', account: 'gv.binh@demo.aisrm.test', time: '25 phút' }),
  label('Các bước'),
  ...steps([
    'Chọn **Đợt đăng ký**. Ở đợt "Đợt đăng ký đề tài KH&CN cấp trường", bấm **Xem chi tiết** để đọc điều kiện, biểu mẫu, tài liệu yêu cầu.',
    'Quay lại, bấm **+ Tạo hồ sơ đề xuất**. Hệ thống tạo hồ sơ nháp mã DX-….',
    'Khai **Tên đề tài** (có tiền tố mã học viên), kinh phí, thời gian, lĩnh vực, tính cấp thiết, mục tiêu, phương pháp, sản phẩm dự kiến. Bấm **💾 Lưu nháp**.',
    'Xem khung **Kiểm tra trước khi nộp**: hệ thống liệt kê mục còn thiếu.',
    'Chọn tab **Tài liệu**, tải tệp mẫu cho "Thuyết minh đề tài" và "Dự toán kinh phí" cho đến khi khung kiểm tra báo **✓ Hồ sơ đã đủ thông tin**.',
  ]),
  ...figure('02-01-dot-dang-ky'),
  ...figure('02-02-chi-tiet-dot'),
  ...figure('02-03-thuyet-minh'),
  note('Dòng chữ đỏ dưới ô nhập là kết quả kiểm tra của lần lưu trước, sẽ mất sau khi lưu với đủ thông tin.'),
  ...figure('02-04-kiem-tra-truoc-khi-nop'),
  ...figure('02-05-dinh-kem-tai-lieu'),
  label('Tự kiểm tra'),
  check('Hồ sơ của tôi có mã DX-…, đủ thông tin và tài liệu bắt buộc (khung kiểm tra màu xanh).'),

  ...lesson('1.4', 'AI kiểm tra và tóm tắt thuyết minh', { goal: 'Dùng Trợ lý AI rà soát thuyết minh, tóm tắt; đánh giá chất lượng góp ý.', account: 'gv.binh@demo.aisrm.test', time: '20 phút' }),
  label('Các bước'),
  ...steps([
    'Trên hồ sơ vừa lập, ở khung **Trợ lý AI** bấm **✨ Kiểm tra thuyết minh**; chờ AI xử lý (vài giây đến 1 phút).',
    'Đọc từng góp ý: nhãn **Quy tắc** (kiểm tra theo biểu mẫu) hay **AI** (nhận xét của mô hình).',
    'Bấm **✨ Tóm tắt thuyết minh** và đọc bản tóm tắt.',
    'Sửa một mục thuyết minh theo góp ý, lưu nháp, chạy kiểm tra lại và so sánh.',
  ]),
  ...figure('02-06-ai-kiem-tra'),
  ...figure('02-06b-ai-tom-tat'),
  discuss('Góp ý nào của AI hữu ích, góp ý nào chưa chính xác? Ở trường bạn, ai nên dùng chức năng này và vào thời điểm nào (trước khi nộp, khi đơn vị xem xét, khi hội đồng đọc)?'),
  label('Tự kiểm tra'),
  check('Tôi phân biệt được góp ý theo quy tắc và góp ý của AI; biết rằng AI chỉ gợi ý.'),

  ...lesson('1.5', 'Nộp hồ sơ và theo dõi trạng thái', { goal: 'Nộp hồ sơ, xem trạng thái, lịch sử xử lý, danh sách đề xuất.', account: 'gv.binh@demo.aisrm.test', time: '10 phút' }),
  label('Các bước'),
  ...steps([
    'Bấm **Nộp hồ sơ** → **Xác nhận: Nộp hồ sơ**. Hồ sơ chuyển sang **Đơn vị xem xét** và được khóa, lưu bản nộp bất biến.',
    'Mở tab **Lịch sử xử lý** để xem ai làm gì, lúc nào.',
    'Chọn **Đề xuất** trên menu để xem danh sách hồ sơ của mình; thử **⬇ Xuất CSV**.',
  ]),
  ...figure('02-07-nop-ho-so'),
  ...figure('02-08-trang-thai'),
  ...figure('02-09-danh-sach-de-xuat'),
  label('Tự kiểm tra'),
  check('Hồ sơ của tôi ở trạng thái "Đơn vị xem xét"; Lịch sử xử lý có bước "Nộp hồ sơ".'),

  ...lesson('1.6', 'Theo dõi tiến độ đề tài, cảnh báo chậm tiến độ', { goal: 'Xem mốc tiến độ, cảnh báo quá hạn; nộp sản phẩm; gửi yêu cầu gia hạn.', account: 'gv.binh@demo.aisrm.test (đề tài mẫu DT-2026-0001)', time: '20 phút' }),
  label('Các bước'),
  ...steps([
    'Chọn **Đề tài**. Đề tài có mốc quá hạn được đánh dấu đỏ; Trang làm việc cũng hiển thị hạn đã quá.',
    'Mở đề tài **DT-2026-0001**. Ở mốc đang mở, bấm **⬆ Tải sản phẩm** để tải tệp mẫu, rồi **Nộp sản phẩm** và ghi chú.',
    'Ở mục **Yêu cầu thay đổi / gia hạn**, bấm **+ Gửi yêu cầu**, chọn **Gia hạn**, nhập ngày kết thúc mới và lý do, bấm **Gửi**.',
  ]),
  ...figure('02-10-danh-sach-de-tai'),
  ...figure('02-11-chi-tiet-de-tai'),
  ...figure('02-12-yeu-cau-gia-han'),
  note('Hệ thống tự nhắc qua thông báo khi mốc còn 7 ngày, còn 1 ngày và khi đã quá hạn (tác vụ nền chạy 7:00 hằng ngày).'),
  label('Tự kiểm tra'),
  check('Tôi đã nộp sản phẩm cho một mốc và gửi một yêu cầu gia hạn.'),

  ...lesson('1.7', 'Hỏi đáp quy chế bằng AI', { goal: 'Tra cứu quy chế bằng câu hỏi tự nhiên; kiểm tra căn cứ điều, khoản.', account: 'Bất kỳ tài khoản nào', time: '15 phút' }),
  label('Các bước'),
  ...steps([
    'Chọn **Hỏi đáp quy chế**. Bấm một câu gợi ý hoặc gõ câu hỏi, bấm **Hỏi**.',
    'Bấm vào từng căn cứ (khoản, điều) dưới câu trả lời để xem nguyên văn điều khoản và đối chiếu.',
    'Thử thêm: "Thuyết minh cần bao nhiêu điểm thì được đề nghị phê duyệt?", "Bài báo Q1 được thưởng bao nhiêu, chia cho tác giả thế nào?", và một câu **ngoài phạm vi** như "Học phí năm nay bao nhiêu?" để thấy hệ thống trả lời "không tìm thấy" thay vì suy đoán.',
    'Chọn tab **Văn bản quy chế** để xem văn bản đang được dùng để tra cứu.',
  ]),
  ...figure('01-05-hoi-dap-quy-che'),
  ...figure('01-06-cau-tra-loi'),
  ...figure('01-07-van-ban-quy-che'),
  discuss('Câu trả lời có dẫn đúng điều, khoản không? Trường bạn cần nạp những văn bản nào để trợ lý trả lời được các câu cán bộ hay hỏi?'),
  label('Kết quả đầu ra Buổi 1'),
  check('01 hồ sơ đề xuất đề tài đã nộp (mã DX-…, tên có mã học viên).'),
  check('01 hồ sơ nhà khoa học đã cập nhật.'),
);

// ---------------------------------------------------------------- Buổi 2
add(
  h1('Buổi 2. Xét duyệt, hội đồng trực tuyến và NCKH sinh viên'),
  p('**Chiều 23/11/2026.** Quy trình số nhiều cấp: khoa → Phòng Quản lý khoa học → hội đồng → lãnh đạo; AI gợi ý phản biện, kiểm soát xung đột lợi ích; chấm điểm, biên bản trực tuyến. Dùng hồ sơ đã nộp ở Bài 1.5.'),
  p('Quy trình đề xuất đề tài: **Nháp → Đơn vị xem xét → Phòng KH xử lý → (hội đồng) → Chờ phê duyệt → Đã phê duyệt** (tự lập đề tài). Ở mỗi bước có thể **Trả bổ sung** kèm lý do; chủ nhiệm nộp lại thì hồ sơ quay về đúng bước đó.'),

  ...lesson('2.1', 'Đơn vị xem xét và xác nhận', { goal: 'Xem hồ sơ của đơn vị, xác nhận hoặc trả bổ sung.', account: 'dm.ktqt@demo.aisrm.test', time: '10 phút' }),
  label('Các bước'),
  ...steps([
    'Đăng nhập tài khoản đầu mối khoa. Trên **Trang làm việc**, tìm hồ sơ của nhóm mình trong "Việc cần tôi xử lý", bấm mã hồ sơ.',
    'Đọc thuyết minh, tài liệu. Bấm **Đơn vị xác nhận** → **Xác nhận**.',
    '(Tùy chọn) Thử **Trả bổ sung** với lý do, rồi đăng nhập lại chủ nhiệm để **Nộp lại**.',
  ]),
  ...figure('04-01-viec-cho-xu-ly'),
  ...figure('04-02-xem-ho-so'),
  ...figure('04-03-xac-nhan'),
  note('Không ai tự xét duyệt được hồ sơ do chính mình làm chủ nhiệm; người trình và người phê duyệt phải khác nhau. Mọi thao tác được ghi nhật ký.'),

  ...lesson('2.2', 'Thành lập hội đồng — AI gợi ý phản biện, kiểm soát xung đột lợi ích', { goal: 'Lập hội đồng xét duyệt, mời thành viên theo gợi ý chuyên môn, mở chấm.', account: 'cv.linh@demo.aisrm.test', time: '20 phút' }),
  label('Các bước'),
  ...steps([
    'Đăng nhập chuyên viên Phòng QLKH. Chọn **Hội đồng** → **+ Thành lập hội đồng**.',
    'Đặt tên (có mã học viên), chọn loại **Xét duyệt thuyết minh**, phiếu chấm, hạn chấm; tick hồ sơ của nhóm; bấm **Thành lập**.',
    'Tab **Thành viên**: xem danh sách **gợi ý phản biện** (điểm phù hợp chuyên môn; ⚠ cùng đơn vị; ⛔ xung đột không được mời).',
    'Chọn **Vai trò khi mời** và mời: Chủ tịch (TS. Phạm Quốc Dũng), Thư ký (Đặng Quang Minh), Phản biện (ThS. Lê Minh Chí).',
    'Khi chủ tịch và thư ký đã nhận lời (Bài 2.3, bước 1), quay lại bấm **Mở chấm**.',
  ]),
  ...figure('05-02-thanh-lap-hoi-dong'),
  ...figure('05-03-moi-thanh-vien'),
  ...figure('05-04-mo-cham'),
  discuss('Gợi ý phản biện dựa trên chuyên môn, hướng nghiên cứu, công bố đã xác nhận. Trường bạn cần thêm quy tắc loại trừ xung đột nào (cùng nhóm nghiên cứu, đồng tác giả gần đây…)?'),

  ...lesson('2.3', 'Thành viên hội đồng nhận lời, khai báo xung đột lợi ích, chấm phiếu', { goal: 'Chấm điểm độc lập theo tiêu chí trên phiếu điện tử.', account: 'gv.dung@demo.aisrm.test, gv.chi@demo.aisrm.test, cv.minh@demo.aisrm.test', time: '20 phút' }),
  label('Các bước'),
  ...steps([
    'Đăng nhập từng thành viên, chọn **Hội đồng**, mở hội đồng của nhóm, bấm **Nhận lời** (làm với cả chủ tịch và thư ký trước khi Phòng QLKH mở chấm).',
    'Sau khi hội đồng được mở chấm: khai báo **Tôi không có xung đột lợi ích** (hoặc mô tả xung đột — khi đó không xem, không chấm hồ sơ).',
    'Chấm từng tiêu chí, ghi **Nhận xét**, bấm **Lưu nháp** hoặc **Nộp phiếu** (phiếu đã nộp không sửa được).',
  ]),
  ...figure('06-01-danh-sach-hoi-dong'),
  ...figure('06-02-nhan-loi'),
  ...figure('06-03-xung-dot-loi-ich'),
  ...figure('06-04-cham-diem'),
  ...figure('06-05-da-nop-phieu'),

  ...lesson('2.4', 'Chủ tịch khóa phiếu, kết luận, AI dự thảo biên bản', { goal: 'Tổng hợp điểm, chọn kết luận, dự thảo và xác nhận biên bản.', account: 'gv.dung@demo.aisrm.test (chủ tịch)', time: '15 phút' }),
  label('Các bước'),
  ...steps([
    'Đăng nhập chủ tịch, mở hội đồng, bấm **Khóa phiếu & tổng hợp**.',
    'Tab **Kết quả & biên bản**: xem điểm trung bình, thấp – cao, đề nghị theo ngưỡng; chọn **Kết luận hội đồng**.',
    'Bấm **✨ AI dự thảo biên bản**, đọc và sửa nội dung; bấm **Lưu biên bản và kết luận**, rồi **Chủ tịch xác nhận biên bản**.',
  ]),
  ...figure('06-06-khoa-phieu'),
  ...figure('06-07-ket-qua-bien-ban'),
  note('"Đề nghị theo ngưỡng" chỉ là phép tính; kết luận do hội đồng quyết định. Biên bản đã xác nhận không sửa được.'),

  ...lesson('2.5', 'Trình, phê duyệt và giao nhiệm vụ', { goal: 'Đi hết quy trình đến khi đề tài được lập và bắt đầu thực hiện.', account: 'cv.linh → pht.nam → cv.linh', time: '20 phút' }),
  label('Các bước'),
  ...steps([
    '**Chuyên viên** (cv.linh) mở hồ sơ ở bước "Phòng KH xử lý", bấm **Trình phê duyệt**, ghi ý kiến (ví dụ: hội đồng đã thông qua).',
    '**Phó Hiệu trưởng** (pht.nam) mở hồ sơ từ Trang làm việc, bấm **Phê duyệt**, ghi ý kiến. Hệ thống tự lập đề tài; bấm **Mở đề tài →**.',
    '**Chuyên viên** mở đề tài mới: nhập ngày bắt đầu, kết thúc, bấm **Cập nhật thời gian**; **+ Thêm mốc** (ít nhất 1 mốc); bấm **Giao nhiệm vụ / bắt đầu**.',
    '(Tùy chọn) Ở đề tài mẫu DT-2026-0001, chuyên viên **Chấp nhận** sản phẩm mốc và **Chấp thuận** yêu cầu gia hạn đã gửi ở Bài 1.6.',
  ]),
  ...figure('05-05-xu-ly-ho-so'),
  ...figure('05-06-trinh-phe-duyet'),
  ...figure('07-01-viec-cho-phe-duyet'),
  ...figure('07-02-phe-duyet'),
  ...figure('07-03-da-lap-de-tai'),
  ...figure('05-07-de-tai-moi'),
  ...figure('05-08-them-moc'),
  ...figure('05-09-giao-nhiem-vu'),
  ...figure('05-10-duyet-san-pham'),

  ...lesson('2.6', 'Đề tài nghiên cứu khoa học của sinh viên', { goal: 'Mở đợt, sinh viên đăng ký; đánh giá bằng hội đồng loại "Đánh giá NCKH sinh viên".', account: 'cv.linh, sv.an', time: '15 phút' }),
  label('Các bước'),
  ...steps([
    '**Chuyên viên** chọn **Đợt đăng ký** → **+ Mở đợt mới**: chọn cấp phù hợp, thời gian nhận hồ sơ, biểu mẫu, tài liệu bắt buộc; bấm **Tạo đợt** rồi **Mở nhận hồ sơ**.',
    '**Sinh viên** (sv.an) chọn **Đợt đăng ký**, ở đợt dành cho sinh viên bấm **+ Tạo hồ sơ đề xuất**; khai, đính kèm, nộp như Bài 1.3 – 1.5.',
    'Phòng QLKH lập hội đồng loại **Đánh giá NCKH sinh viên** (phiếu chấm sinh viên: ý tưởng, phương pháp, kết quả, trình bày) và làm như Bài 2.2 – 2.4.',
  ]),
  ...figure('05-14-mo-dot-moi'),
  ...figure('05-15-mo-nhan-ho-so'),
  ...figure('03-01-dot-sinh-vien'),
  ...figure('03-02-de-tai-sinh-vien'),
  note('Xếp giải, tổng hợp giải thưởng NCKH sinh viên theo khoa, ngành, khóa thuộc phân hệ AI Student Research — sẽ trình diễn riêng, chưa có trong bản thực hành này.'),
  label('Kết quả đầu ra Buổi 2'),
  check('01 hồ sơ của nhóm đi hết quy trình: đơn vị → Phòng QLKH → hội đồng → phê duyệt → đề tài đang thực hiện.'),
  check('01 hội đồng có phiếu chấm và biên bản đã xác nhận.'),
);

// ---------------------------------------------------------------- Buổi 3
add(
  h1('Buổi 3. Kiểm chứng công bố và hồ sơ khoa học số'),
  p('**Sáng 24/11/2026.** Từ khai báo công bố đến hồ sơ khoa học số: kiểm chứng DOI, phát hiện trùng, quy trình xác minh – xác nhận; công bố được xác nhận tự vào lý lịch khoa học.'),
  p('Quy trình công bố: **Nháp → Đã nộp → Đã xác minh (chuyên viên) → Đã xác nhận (Trưởng phòng QLKH)**. Người xác minh và người xác nhận phải khác nhau.'),

  ...lesson('3.1', 'Khai báo công bố và đính kèm minh chứng', { goal: 'Khai báo bài báo, đính kèm minh chứng, nộp xác nhận.', account: 'gv.binh@demo.aisrm.test', time: '15 phút' }),
  label('Các bước'),
  ...steps([
    'Chọn **Công bố** → **+ Khai báo công bố**.',
    'Nhập tiêu đề (có mã học viên), loại, năm, chỉ mục, tạp chí; danh sách tác giả theo thứ tự (tác giả trong trường / ngoài trường). Bấm **Lưu nháp**.',
    'Ở khung **Minh chứng**, tải tệp mẫu (bản in, trang bìa…). Bấm **Nộp xác nhận**.',
  ]),
  ...figure('02-13-khai-bao-cong-bo'),
  ...figure('02-14-minh-chung'),

  ...lesson('3.2', 'Kiểm chứng DOI với Crossref', { goal: 'Đối chiếu thông tin khai báo với dữ liệu Crossref theo DOI; nhận biết sai lệch.', account: 'gv.binh@demo.aisrm.test', time: '15 phút' }),
  label('Các bước'),
  ...steps([
    'Khai báo một công bố mới, điền **DOI** (ví dụ do giảng viên cung cấp, hoặc DOI một bài của bạn), lưu nháp.',
    'Ở khung **Kiểm chứng với Crossref**, bấm **Kiểm chứng DOI**.',
    'Đọc bảng đối chiếu: trường nào **khớp**, trường nào **lệch** (tiêu đề, tạp chí, năm, tác giả). Sửa khai báo nếu sai và kiểm chứng lại.',
  ]),
  ...figure('02-15-kiem-chung-doi'),
  note('Kiểm chứng DOI cần máy chủ có Internet để truy cập Crossref. Công bố không có DOI được xác minh thủ công bằng minh chứng tệp hoặc đường dẫn.'),
  discuss('Ví dụ trong hình lệch tác giả: người khai không có trong danh sách tác giả của bài. Ở trường bạn, sai lệch nào thường gặp nhất khi kê khai công bố để xét khen thưởng, kiểm định?'),

  ...lesson('3.3', 'Xác minh, phát hiện trùng và xác nhận công bố', { goal: 'Chuyên viên xác minh minh chứng; Trưởng phòng xác nhận; xuất danh mục công bố đã xác nhận.', account: 'cv.linh → tp.hung', time: '15 phút' }),
  label('Các bước'),
  ...steps([
    '**Chuyên viên** chọn **Công bố**, lọc trạng thái "Đã nộp", mở công bố của nhóm. Chú ý cảnh báo **⚠ nghi trùng** (nếu có) — hệ thống không tự gộp, xóa.',
    'Kiểm tra minh chứng, kết quả DOI; bấm **Xác minh minh chứng** (hoặc **Trả bổ sung** / **Không xác nhận** kèm lý do).',
    '**Trưởng phòng QLKH** mở công bố, bấm **Xác nhận công bố**.',
    'Ở danh sách Công bố, bấm **⬇ Xuất công bố đã xác nhận** để lấy danh mục phục vụ báo cáo.',
  ]),
  ...figure('05-11-danh-sach-cong-bo'),
  ...figure('05-12-xac-minh-cong-bo'),
  ...figure('05-13-xac-nhan-cong-bo'),

  ...lesson('3.4', 'Hồ sơ khoa học số và lý lịch khoa học', { goal: 'Xem hồ sơ tổng hợp đề tài, công bố đã xác nhận; in lý lịch khoa học.', account: 'gv.binh@demo.aisrm.test', time: '10 phút' }),
  label('Các bước'),
  ...steps([
    `Chọn **Hồ sơ khoa học** (${ref('01-08-ho-so-khoa-hoc')}). Kiểm tra công bố vừa được xác nhận đã xuất hiện trong lý lịch.`,
    'Bấm **🖨 In / Lưu PDF**, chọn máy in "Lưu thành PDF" để có lý lịch khoa học dạng PDF.',
  ]),
  note('Liên kết ORCID tự động, bản đồ năng lực, mạng lưới hợp tác, AI tạo lý lịch song ngữ thuộc phân hệ AI Researcher 360 Profile — sẽ trình diễn riêng.'),
  label('Kết quả đầu ra Buổi 3'),
  check('01 công bố đã kiểm chứng DOI và được xác nhận.'),
  check('01 lý lịch khoa học xuất PDF có công bố vừa xác nhận.'),
);

// ---------------------------------------------------------------- Buổi 4
add(
  h1('Buổi 4. Điều hành dựa trên dữ liệu và chuẩn bị triển khai'),
  p('**Chiều 24/11/2026.** Dashboard chỉ số khoa học; AI dự thảo báo cáo điều hành; xuất dữ liệu, chuẩn HEMIS; quản trị hệ thống và AI nội bộ; xây dựng kế hoạch triển khai tại trường.'),

  ...lesson('4.1', 'Dashboard điều hành', { goal: 'Đọc chỉ số theo trạng thái, đơn vị; nhận diện đề tài chậm tiến độ.', account: 'pht.nam (toàn trường), dm.ktqt (phạm vi khoa)', time: '15 phút' }),
  label('Các bước'),
  ...steps([
    'Đăng nhập Phó Hiệu trưởng, chọn **Điều hành & báo cáo**. Đọc các ô chỉ số, biểu đồ theo trạng thái, bảng theo đơn vị, danh sách đề tài có mốc quá hạn.',
    'Đăng nhập đầu mối khoa, mở cùng trang và so sánh: số liệu chỉ trong **phạm vi khoa**.',
    'Tải **⬇ Đề xuất / Đề tài / Công bố (CSV)** để mở bằng Excel.',
  ]),
  ...figure('07-04-dieu-hanh'),
  ...figure('04-04-bao-cao-don-vi'),

  ...lesson('4.2', 'AI dự thảo báo cáo hoạt động khoa học', { goal: 'Tạo dự thảo báo cáo từ số liệu; kiểm tra số liệu trước khi dùng.', account: 'pht.nam@demo.aisrm.test', time: '15 phút' }),
  label('Các bước'),
  ...steps([
    'Trên trang **Điều hành & báo cáo**, ở khung "Dự thảo báo cáo hoạt động khoa học (AI)", bấm **✨ Tạo dự thảo**.',
    'Đọc bản dự thảo: mỗi con số kèm **mã chỉ số** trong ngoặc vuông, ví dụ [projects_active]. Đối chiếu với ô chỉ số trên trang.',
    'Sao chép dự thảo sang Word để biên tập thành báo cáo chính thức.',
  ]),
  ...figure('07-05-du-thao-bao-cao'),
  discuss('Báo cáo nào trường bạn phải lập định kỳ (báo cáo Bộ, kiểm định Tiêu chuẩn 7 và 13 theo Thông tư 20/2026/TT-BGDĐT)? Chỉ số nào cần bổ sung vào dashboard?'),
  note('Hỏi đáp số liệu bằng tiếng Việt và AI tự tạo biểu đồ thuộc phân hệ AI Research Executive Dashboard — sẽ trình diễn riêng.'),

  ...lesson('4.3', 'Kết nối dữ liệu: UNI-DATA360 và chuẩn HEMIS', { goal: 'Hiểu luồng đồng bộ dữ liệu và xem trước bản ghi theo chuẩn HEMIS.', account: 'admin@demo.aisrm.test', time: '10 phút' }),
  label('Các bước'),
  ...steps([
    'Đăng nhập quản trị, chọn **Integration Center**. Xem tab **Đồng bộ UNI-DATA360** (chế độ giả lập).',
    'Chọn tab **Xem trước chuẩn HEMIS** → **Nhiệm vụ KHCN (đề tài)** / **Bài báo / sách**; mở một bản ghi để xem trường dữ liệu và cảnh báo thiếu.',
  ]),
  ...figure('08-11-tich-hop'),
  ...figure('08-12-hemis'),

  ...lesson('4.4', 'Quản trị hệ thống và AI nội bộ (dành cho cán bộ CNTT, quản trị)', { goal: 'Nhập tài khoản hàng loạt, phân quyền; cấu hình AI nội bộ, theo dõi chi phí; tác vụ nền, nhật ký.', account: 'admin@demo.aisrm.test', time: '20 phút' }),
  label('Các bước'),
  ...steps([
    'Chọn **Quản trị** → tab **Tài khoản**. Dán nội dung CSV mẫu, bấm **Kiểm tra** để xem trước (không cần bấm Nhập).',
    'Xem tab **Phân quyền**, **Tác vụ nền** (nhắc hạn 7:00 hằng ngày), **Nhật ký** (mọi thao tác quan trọng).',
    'Chọn **AI Center**: khung **Máy chủ AI nội bộ** (kiểm tra kết nối, làm nóng); tab **Cấu hình & hạn mức**: chọn model cho từng chức năng; tab **Sử dụng & chi phí**.',
  ]),
  ...figure('08-01-don-vi'),
  ...figure('08-02-nhap-tai-khoan'),
  ...figure('08-03-danh-sach-tai-khoan'),
  ...figure('08-04-phan-quyen'),
  ...figure('08-05-tac-vu-nen'),
  ...figure('08-06-nhat-ky'),
  ...figure('08-07-ai-nha-cung-cap'),
  ...figure('08-08-ai-model'),
  ...figure('08-09-ai-cau-hinh'),
  ...figure('08-10-ai-su-dung'),
  ...figure('05-16-nap-quy-che', { lead: 'Phòng QLKH nạp văn bản quy chế của trường để dùng cho Hỏi đáp quy chế (Bài 1.7): **Hỏi đáp quy chế** → tab **Văn bản quy chế** → **+ Nạp văn bản**.' }),
  tip('Bản cài tại trường: dữ liệu, tệp, mô hình AI đều nằm trên máy chủ của trường; có thể chạy không cần Internet (trừ kiểm chứng DOI). Máy chủ AI nội bộ cần GPU từ 8 GB; mô hình khuyến nghị đạt 52/52 câu trong bộ đánh giá hỏi đáp quy chế.'),

  ...lesson('4.5', 'Xây dựng kế hoạch triển khai thử nghiệm 3 – 6 tháng', { goal: 'Lập kế hoạch tiếp nhận AI-SRM tại đơn vị.', account: 'Làm theo nhóm trường', time: '30 phút' }),
  p('Điền phiếu dưới đây theo nhóm, trình bày 3 phút/nhóm.'),
  table(
    ['Nội dung', 'Kế hoạch của trường'],
    [
      ['Phiên bản lựa chọn (Local cài tại trường / Online) và lý do', '\n'],
      ['Phân hệ triển khai trước (đề tài, hội đồng, NCKH sinh viên, công bố, hồ sơ khoa học, dashboard)', '\n'],
      ['Đơn vị thí điểm (khoa / viện) và số người dùng dự kiến', '\n'],
      ['Dữ liệu cần chuẩn bị (danh mục đơn vị, cán bộ, đề tài đang thực hiện, công bố có DOI, quy chế)', '\n'],
      ['Hạ tầng (máy chủ, GPU cho AI nội bộ, sao lưu, đăng nhập một lần)', '\n'],
      ['Nhân sự phụ trách (Phòng QLKH, CNTT, đầu mối khoa)', '\n'],
      ['Tháng 1 – 2', '\n'],
      ['Tháng 3 – 4', '\n'],
      ['Tháng 5 – 6', '\n'],
      ['Chỉ số đánh giá thành công', '\n'],
    ],
    [4, 6],
    { tall: true },
  ),
  label('Kết quả đầu ra Buổi 4'),
  check('01 dự thảo báo cáo điều hành do AI tạo, đã đối chiếu số liệu.'),
  check('01 kế hoạch triển khai thử nghiệm 3 – 6 tháng.'),
);

// ---------------------------------------------------------------- Phụ lục
add(
  h1('Phụ lục. Tra cứu nhanh'),
  h2('Trạng thái hồ sơ'),
  table(
    ['Hồ sơ', 'Trạng thái theo thứ tự'],
    [
      ['Đề xuất đề tài', 'Nháp → Đơn vị xem xét → Phòng KH xử lý → (Thẩm định / phản biện) → Chờ phê duyệt → Đã phê duyệt. Nhánh: Cần bổ sung, Không phê duyệt, Đã rút.'],
      ['Đề tài', 'Chờ ký hợp đồng / giao nhiệm vụ → Đang thực hiện → Đề nghị nghiệm thu → Đang nghiệm thu → (Hoàn thiện sau nghiệm thu) → Đã hoàn thành → Đã lưu trữ. Nhánh: Tạm dừng, Đã hủy.'],
      ['Công bố', 'Nháp → Đã nộp → Đã xác minh → Đã xác nhận → Đã xuất dữ liệu. Nhánh: Cần bổ sung, Không xác nhận.'],
      ['Hội đồng', 'Đang thành lập → Đang chấm → Đã khóa phiếu → Đã xác nhận biên bản.'],
    ],
    [2, 8],
  ),
  h2('Xử lý tình huống thường gặp'),
  table(
    ['Tình huống', 'Cách xử lý'],
    [
      ['Không thấy nút thao tác trên hồ sơ', 'Hồ sơ chưa đến bước của bạn hoặc sai vai trò. Kiểm tra ô **Vai trò** ở thanh trên và trạng thái hồ sơ.'],
      ['Báo "Không được tự xét duyệt hồ sơ của chính mình"', 'Đăng nhập tài khoản khác (người xét duyệt phải khác chủ nhiệm).'],
      ['Báo "dữ liệu đã thay đổi"', 'Người khác vừa cập nhật hồ sơ. Tải lại trang (F5) rồi thao tác lại.'],
      ['AI báo "đang bận" hoặc chờ lâu', 'Máy chủ AI xử lý lần lượt từng yêu cầu. Chờ 1 – 2 phút rồi thử lại.'],
      ['Kiểm chứng DOI báo lỗi kết nối', 'Máy chủ không có Internet hoặc Crossref tạm lỗi; dùng minh chứng tệp.'],
      ['Tài khoản bị khóa', 'Sai mật khẩu 5 lần: chờ 15 phút hoặc báo giảng viên đặt lại.'],
      ['Mở trang thấy "Đang khởi động…" lâu', 'Máy chủ đang khởi động; chờ 1 – 2 phút, tải lại trang.'],
    ],
    [3.5, 6.5],
  ),
  h2('Chức năng sẽ bổ sung (chưa có trong bản thực hành)'),
  bullet('Kinh phí và hợp đồng đề tài; nhóm nghiên cứu; sở hữu trí tuệ; hội thảo khoa học; kho minh chứng có phiên bản.'),
  bullet('Xuất Word / Excel / PDF theo mẫu biểu của trường; đăng nhập một lần (SSO).'),
  bullet('Phân hệ trên UniAIplatform: xếp giải NCKH sinh viên, trích xuất thông tin từ PDF bài báo, ORCID, bản đồ năng lực, hỏi đáp số liệu và biểu đồ AI.'),
  h2('Ghi chú của học viên'),
  ...Array.from({ length: 14 }, () => p('..............................................................................................................................................')),
);

k.save(body, { fileName: 'TAI_LIEU_THUC_HANH_KHOA_24.docx', title: 'Tài liệu thực hành AI-SRM — Khóa 24', header: 'Khóa 24 — Tài liệu thực hành AI-SRM' });
