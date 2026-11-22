/**
 * Dựng 2 tài liệu cho các chức năng hoàn thiện theo Thư mời K24 (ảnh từ tests/guide/capture-new.spec.ts):
 *  - HUONG_DAN_CHUC_NANG_MOI.docx — hướng dẫn sử dụng theo phân hệ, vai trò;
 *  - BAI_TAP_CHUC_NANG_MOI.docx  — bài tập thực hành có bước làm, tự kiểm tra.
 *
 *   node tests/guide/build-new.cjs
 */
const { createKit } = require('./docx-kit.cjs');

// ============================================================================ HƯỚNG DẪN SỬ DỤNG
async function guide() {
  const k = createKit({ manifests: ['moi'] });
  const { p, h1, h2, bullet, steps, note, tip, figure, table, pageBreak, toc, centered } = k;
  const body = [];
  const add = (...xs) => body.push(...xs.flat());

  add(
    centered('AI-SRM', { bold: true, size: 40, color: '1F3A5F' }, { spacing: { before: 1800 } }),
    centered('HƯỚNG DẪN SỬ DỤNG', { bold: true, size: 52, color: '1F3A5F' }, { spacing: { before: 400 } }),
    centered('CÁC CHỨC NĂNG MỚI', { bold: true, size: 40 }, { spacing: { after: 300 } }),
    centered('Danh mục KH&CN · Kinh phí – hợp đồng · HEMIS · Kiểm chứng công bố · NCKH sinh viên', { size: 24 }),
    centered('Researcher 360 · Điều hành & báo cáo · Ủy quyền, phản biện ngoài trường, thư điện tử', { size: 24 }, { spacing: { after: 900 } }),
    centered('Bổ sung cho "Hướng dẫn sử dụng AI-SRM" — áp dụng cho cả bản Local và bản Online', { italics: true, size: 22, color: '555555' }),
    centered('Phiên bản 11/2026 · Hình chụp trên dữ liệu mẫu (giả lập)', { size: 22, color: '555555' }, { spacing: { before: 200 } }),
    pageBreak(),
    ...toc(),
  );

  add(
    h1('Giới thiệu'),
    p('Tài liệu hướng dẫn các chức năng được bổ sung để AI-SRM đáp ứng đầy đủ 6 phần mềm cam kết trong Thư mời K24. Các chức năng cũ (đăng ký đề tài, xét duyệt, hội đồng, công bố, dashboard…) xem trong "Hướng dẫn sử dụng AI-SRM".'),
    table(
      ['Phân hệ', 'Chức năng mới', 'Chương'],
      [
        ['01 AI-SRM Local', 'Danh mục KH&CN (nhóm nghiên cứu, SHTT, chuyển giao, hội thảo, giải thưởng); kinh phí – hợp đồng; thông tin HEMIS; kho minh chứng có phiên bản; xuất Word/Excel', '1, 2, 3'],
        ['02 AI-SRM Online', 'Ủy quyền có thời hạn; bàn giao hồ sơ; phản biện ngoài trường; thư điện tử thông báo', '7'],
        ['03 AI Student Research', 'Giảng viên hướng dẫn xác nhận; nhật ký hướng dẫn; AI gợi ý nhận xét theo tiêu chí; xếp giải; thống kê', '4'],
        ['04 AI Publication Verification', 'Điền thông tin từ PDF; kiểm chứng ORCID; AI giải thích kết quả; phân loại tạp chí, xếp hạng Q', '3'],
        ['05 AI Researcher 360', 'Tìm chuyên gia; mạng lưới đồng tác giả; bản đồ năng lực; nhập từ ORCID; giới thiệu song ngữ; lý lịch Word', '5'],
        ['06 Executive Dashboard', 'Chỉ số theo lĩnh vực, năm, cấp, sinh viên, kinh phí; hỏi đáp số liệu; xuất Word/Excel, báo cáo HEMIS; chốt kỳ', '6'],
      ],
      [2.4, 6.4, 1.2],
    ),
    h2('Menu mới'),
    bullet('**NCKH sinh viên**, **Danh mục KH&CN**, **Chuyên gia & mạng lưới**: mọi vai trò.'),
    bullet('**Phản biện ngoài trường**: Chuyên viên Phòng QLKH. **Ủy quyền**: lãnh đạo đơn vị, Phòng QLKH, Ban Giám hiệu.'),
    bullet('Quản trị → thêm các tab **Ủy quyền**, **Bàn giao hồ sơ**, **Phản biện ngoài trường**, **Thư điện tử**.'),
    h2('Cách đọc hình'),
    p('Vùng cần thao tác được khoanh **ô đỏ có đánh số**; ghi chú ①, ②, ③… dưới hình ứng với ô số 1, 2, 3…'),
    note('Nguyên tắc "AI hỗ trợ – con người quyết định" vẫn áp dụng: AI chỉ trích xuất, gợi ý, dự thảo, chọn truy vấn; xác nhận, duyệt chi, xếp giải, xếp hạng Q do người có thẩm quyền thực hiện.'),
  );

  add(
    h1('1. Danh mục KH&CN'),
    p('Năm danh mục dùng chung một quy trình **kê khai → nộp → Phòng QLKH xác nhận hoặc trả bổ sung**. Bản ghi đã xác nhận tự hiện trên hồ sơ khoa học của những người có tên và được đưa vào báo cáo HEMIS.'),
    table(
      ['Danh mục', 'Thông tin chính', 'Bảng HEMIS'],
      [
        ['Nhóm nghiên cứu', 'Trưởng nhóm, thành viên, lĩnh vực, hướng nghiên cứu, nhóm mạnh, quyết định', '_KHCN_NHOM_NGHIEN_CUU'],
        ['Sở hữu trí tuệ', 'Loại (sáng chế, GPHI, kiểu dáng, nhãn hiệu, quyền tác giả…), tác giả, số đơn, văn bằng', '_KHCN_SANG_CHE'],
        ['Chuyển giao công nghệ', 'Hình thức, bên nhận, số hợp đồng, giá trị', '_KHCN_CHUYEN_GIAO'],
        ['Hội thảo khoa học', 'Cấp, ngày, địa điểm, ban tổ chức, số bài, số đại biểu', '_KHCN_HOI_THAO'],
        ['Giải thưởng KH&CN', 'Cấp, hạng giải, cơ quan trao, năm, người nhận', '_KHCN_GIAI_THUONG'],
      ],
      [2.4, 5, 2.6],
    ),
    ...figure('N-A1-danh-muc'),
    ...figure('N-A2-shtt-danh-sach'),
    h2('Kê khai'),
    ...steps(['Vào danh mục, bấm **+ Kê khai …**.', 'Điền thông tin; với người liên quan, gõ tên để chọn người trong trường hoặc nhập tên người ngoài trường.', 'Bấm **Lưu nháp**, rồi tải minh chứng ở khung **Minh chứng**.', 'Bấm **Nộp để xác nhận**.']),
    ...figure('N-A3-shtt-ke-khai'),
    ...figure('N-A4-shtt-nop'),
    h2('Phòng QLKH xác nhận'),
    p('Chuyên viên mở bản ghi từ thông báo hoặc danh sách (lọc **Chờ xác nhận**), đối chiếu minh chứng, rồi **✓ Xác nhận** hoặc **↺ Trả bổ sung** (bắt buộc ghi nội dung cần bổ sung). Không tự xác nhận bản ghi của chính mình. Bản ghi đã xác nhận có thể **Mở lại để sửa** (ghi lý do).'),
    ...figure('N-A5-xac-nhan'),
  );

  add(
    h1('2. Kinh phí – hợp đồng và thông tin HEMIS của đề tài'),
    p('Tab **Kinh phí – hợp đồng** trong trang đề tài quản lý hợp đồng, dự toán, đề nghị chi, giải ngân và quyết toán. Số giải ngân, quyết toán do Phòng QLKH nhập **theo chứng từ của Phòng Tài chính** — hệ thống không tự suy ra.'),
    table(
      ['Bước', 'Ai làm', 'Ghi chú'],
      [
        ['Nhập hợp đồng', 'Phòng QLKH', 'Số hợp đồng, ngày ký, giá trị, nguồn kinh phí'],
        ['Lập dự toán theo mục chi', 'Chủ nhiệm (khi chưa chốt) hoặc Phòng QLKH', 'Tổng không vượt giá trị hợp đồng / kinh phí đã duyệt'],
        ['Chốt dự toán', 'Phòng QLKH', 'Sau khi chốt, chủ nhiệm không tự sửa'],
        ['Đề nghị chi', 'Thành viên đề tài', 'Không vượt phần còn lại của mục chi'],
        ['Duyệt / không duyệt chi', 'Phòng QLKH (không tự duyệt)', 'Không duyệt phải ghi lý do'],
        ['Ghi nhận giải ngân', 'Phòng QLKH', 'Số tiền ≤ số đã duyệt, ngày, số chứng từ'],
        ['Quyết toán', 'Phòng QLKH', 'Chỉ "Đã quyết toán" khi không còn đề nghị chi đang mở'],
      ],
      [2.6, 3.2, 4.2],
    ),
    ...figure('N-B1-kinh-phi'),
    ...figure('N-B2-de-nghi-chi'),
    ...figure('N-B3-duyet-chi'),
    ...figure('N-B4-giai-ngan'),
    h2('Thông tin HEMIS của đề tài'),
    p('Trong tab **Tổng quan & tiến độ**, khung **Thông tin HEMIS** ghi cấp đề tài, phân loại, lĩnh vực KH&CN, nguồn kinh phí, cơ quan chủ quản, kết quả và ngày nghiệm thu. Phòng QLKH cập nhật; dữ liệu được dùng cho chỉ số theo lĩnh vực / cấp và báo cáo HEMIS.'),
    ...figure('N-B5-hemis'),
    tip('Đề tài sinh viên có thêm tab **Nhật ký hướng dẫn** (Chương 4).'),
  );

  add(
    h1('3. Công bố: điền từ PDF, phiên bản minh chứng, ORCID, phân loại'),
    h2('Điền thông tin từ tệp PDF'),
    p('Ở màn hình **Khai báo công bố**, bấm **✨ Điền từ tệp PDF** và chọn bản PDF bài báo / sách. Hệ thống trích DOI, ISSN/ISBN, tập/số/trang, năm bằng quy tắc; AI bổ sung tiêu đề, tác giả, nơi công bố. DOI chỉ được nhận khi xuất hiện nguyên văn trong tệp. Tệp không được lưu. PDF dạng ảnh scan cần OCR trước.'),
    ...figure('N-C1-dien-tu-pdf'),
    h2('Kho minh chứng có phiên bản'),
    p('Ở mọi danh sách tài liệu (đề xuất, đề tài, công bố, danh mục), nút **⟳ Phiên bản mới** tải bản thay thế. Bản cũ chuyển "đã thay thế" nhưng vẫn lưu và tải lại được; bấm **Lịch sử phiên bản** để xem.'),
    ...figure('N-C2-phien-ban'),
    h2('Kiểm chứng ORCID và AI giải thích kết quả'),
    p('Trong trang công bố, khung **Kiểm chứng ORCID** đối chiếu công bố với hồ sơ ORCID công khai của từng tác giả trong trường (tác giả cần khai ORCID ở Hồ sơ khoa học). Nút **✨ Giải thích kết quả** cho AI tóm tắt kết quả Crossref + ORCID và việc cần kiểm tra thêm.'),
    ...figure('N-C3-orcid'),
    note('"Không thấy trong ORCID" không có nghĩa là công bố sai — tác giả có thể chưa cập nhật ORCID. Quyết định xác minh do chuyên viên.'),
    h2('Nhập công bố từ ORCID'),
    p('Công bố → **⇩ Nhập từ ORCID** (hoặc từ Hồ sơ khoa học). Chọn công trình chưa có; hệ thống tạo **bản nháp** để bạn bổ sung tác giả, minh chứng rồi nộp như thường lệ. Công trình trùng DOI được bỏ qua.'),
    ...figure('N-C4-nhap-orcid'),
    h2('Phân loại tạp chí, xếp hạng Q'),
    p('Phòng QLKH xác nhận phạm vi tạp chí (quốc tế / trong nước) và xếp hạng Q kèm **nguồn tra cứu bắt buộc**. Không xác nhận công bố của chính mình.'),
    ...figure('N-C5-phan-loai'),
  );

  add(
    h1('4. NCKH sinh viên'),
    h2('Đăng ký có giảng viên hướng dẫn xác nhận'),
    ...steps(['Sinh viên tạo hồ sơ trong đợt NCKH sinh viên như đề tài thường.', 'Ở khung **NCKH sinh viên — người hướng dẫn**, chọn giảng viên, khai ngành, khóa, bấm **Lưu thông tin**.', 'Giảng viên nhận thông báo, mở hồ sơ, bấm **✓ Xác nhận hướng dẫn** (hoặc **Từ chối** kèm lý do).', 'Sau khi giảng viên xác nhận, sinh viên mới **Nộp hồ sơ** được.']),
    ...figure('N-D1-chon-gvhd'),
    ...figure('N-D2-gv-xac-nhan'),
    h2('Nhật ký hướng dẫn'),
    p('Sau khi đề tài được giao, tab **Nhật ký hướng dẫn** cho giảng viên và nhóm sinh viên ghi từng buổi: ngày, nội dung trao đổi, việc tiếp theo.'),
    ...figure('N-D3-nhat-ky'),
    h2('AI gợi ý nhận xét theo tiêu chí'),
    p('Trong khung **Trợ lý AI** của hồ sơ, **✨ Gợi ý nhận xét theo tiêu chí** cho nhận xét sơ bộ theo từng tiêu chí của phiếu đánh giá (đề tài sinh viên dùng phiếu NCKH sinh viên). AI không chấm điểm, không kết luận.'),
    ...figure('N-D4-ai-tieu-chi'),
    h2('Thống kê và xếp giải'),
    p('Menu **NCKH sinh viên**: tab **Thống kê** (theo khoa, ngành, khóa, năm, cơ cấu giải), **Danh sách đề tài**, **Xếp giải** (cán bộ quản lý). Bảng xếp giải sắp theo điểm trung bình của hội đồng "Đánh giá NCKH sinh viên"; Phòng QLKH chọn mức giải theo quyết định. Nút **⬇ Xuất Excel** xuất danh sách.'),
    ...figure('N-D5-thong-ke'),
    ...figure('N-D6-xep-giai'),
  );

  add(
    h1('5. Researcher 360: chuyên gia, mạng lưới, năng lực, hồ sơ song ngữ'),
    p('Menu **Chuyên gia & mạng lưới** có ba tab. Dữ liệu lấy từ hồ sơ khoa học tự khai và kết quả **đã xác nhận**.'),
    ...figure('N-E1-tim-chuyen-gia'),
    p('Cách tính điểm phù hợp được ghi dưới kết quả (không dùng AI): chuyên môn khớp ×5, hướng nghiên cứu ×2, công bố ×3, đề tài ×3 cho mỗi từ khóa.'),
    ...figure('N-E2-mang-luoi'),
    ...figure('N-E3-nang-luc'),
    h2('Giới thiệu học thuật song ngữ và lý lịch Word'),
    ...steps(['Mở **Hồ sơ khoa học** của mình, bấm **✨ AI dự thảo giới thiệu**.', 'Sửa hai đoạn tiếng Việt, tiếng Anh cho đúng.', 'Bấm **✓ Duyệt và công khai** — chỉ bản đã duyệt hiển thị.', 'Bấm **⬇ Lý lịch (Word)** để tải lý lịch khoa học theo mẫu.']),
    ...figure('N-E4-gioi-thieu'),
    ...figure('N-E5-ho-so-360'),
    ...figure('N-E6-ho-so-danh-muc'),
  );

  add(
    h1('6. Điều hành & báo cáo'),
    p('Trang **Điều hành & báo cáo** có bốn tab: Tổng quan (như trước), **Lĩnh vực, năm, sinh viên, kinh phí**, **Hỏi đáp số liệu**, **Báo cáo & chốt kỳ**.'),
    ...figure('N-F1-chi-so'),
    h2('Hỏi đáp số liệu bằng tiếng Việt'),
    p('Gõ câu hỏi (ví dụ "Khoa nào có nhiều đề tài nhất năm 2026?"). AI chỉ **chọn một truy vấn có sẵn** trong danh mục; số liệu do hệ thống tính, kèm bảng, biểu đồ và định nghĩa. Câu hỏi ngoài danh mục: hệ thống báo không có truy vấn phù hợp và gợi ý các truy vấn có thể chọn.'),
    ...figure('N-F2-hoi-dap'),
    h2('Xuất báo cáo, báo cáo cấp trên, chốt kỳ'),
    bullet('**Excel**: đề xuất, đề tài (kèm thông tin HEMIS), công bố, kinh phí; mỗi danh mục KH&CN; NCKH sinh viên.'),
    bullet('**Báo cáo HEMIS (Excel)**: các bảng nhiệm vụ KH&CN, bài báo, sách, nhóm nghiên cứu, sáng chế, chuyển giao, hội thảo, giải thưởng; cột THIẾU_BẮT_BUỘC chỉ ra trường cần bổ sung.'),
    bullet('**Word**: dự thảo báo cáo AI sau khi sửa được xuất thành văn bản có tiêu đề, nơi nhận, phụ lục bảng chỉ số; thuyết minh (trang đề xuất), biên bản hội đồng (trang hội đồng), lý lịch (hồ sơ khoa học).'),
    bullet('**Chốt kỳ**: lưu bất biến bộ số liệu tại thời điểm chốt để báo cáo kỳ luôn khớp.'),
    ...figure('N-F3-bao-cao'),
    ...figure('N-F4-chot-ky'),
    tip('PDF: dùng nút **In / Lưu PDF** của trình duyệt, hoặc mở tệp Word rồi lưu PDF.'),
  );

  add(
    h1('7. Ủy quyền, phản biện ngoài trường, bàn giao, thư điện tử'),
    h2('Ủy quyền có thời hạn'),
    p('Lãnh đạo đơn vị, Phòng QLKH, Ban Giám hiệu vào menu **Ủy quyền** để giao vai trò của mình cho người khác trong thời gian vắng mặt (tối đa 12 tháng). Ủy quyền tự hết hạn, có thể thu hồi sớm; nhật ký ghi rõ người ủy quyền. Quản trị có thể lập ủy quyền thay. Không ủy quyền vai trò quản trị hệ thống.'),
    ...figure('N-G1-uy-quyen'),
    h2('Tài khoản phản biện ngoài trường'),
    p('Phòng QLKH tạo tài khoản cho chuyên gia ngoài trường: chỉ có vai trò Phản biện, có thời hạn, chỉ xem hồ sơ được mời chấm sau khi khai báo không xung đột lợi ích. Mật khẩu tạm hiện một lần (bản Local buộc đổi ở lần đăng nhập đầu). Sau đó mời chuyên gia vào hội đồng như thành viên bình thường.'),
    ...figure('N-G2-phan-bien-ngoai'),
    h2('Bàn giao hồ sơ'),
    p('Khi cán bộ nghỉ việc / chuyển công tác, Quản trị → **Bàn giao hồ sơ**: chọn người bàn giao, hồ sơ chưa kết thúc, người nhận, lý do. Người nhận trở thành chủ hồ sơ; lịch sử giữ nguyên.'),
    ...figure('N-G3-ban-giao'),
    h2('Thư điện tử thông báo'),
    p('Quản trị hệ thống → **Thư điện tử**: bật gửi thư kèm thông báo trong ứng dụng, chọn phạm vi, gửi thư thử, xem nhật ký. Máy chủ thư (SMTP) khai báo khi cài đặt (biến SMTP_URL, MAIL_FROM — xem Hướng dẫn cài đặt). Khi chưa cấu hình, thư được ghi nhật ký "chưa cấu hình", thông báo trong ứng dụng vẫn chạy.'),
    ...figure('N-G4-thu-dien-tu'),
  );

  await k.save(body, { fileName: 'HUONG_DAN_CHUC_NANG_MOI.docx', title: 'AI-SRM — Hướng dẫn sử dụng các chức năng mới', header: 'AI-SRM · Hướng dẫn sử dụng các chức năng mới' });
}

// ============================================================================ BÀI TẬP THỰC HÀNH
async function exercises() {
  const k = createKit({ manifests: ['moi'] });
  const { p, h1, h2, label, bullet, check, steps, note, tip, discuss, figure, ref, table, spacer, pageBreak, toc, centered } = k;
  const body = [];
  const add = (...xs) => body.push(...xs.flat());
  const lesson = (code, title, { goal, account, time }) => [h2(`Bài ${code}. ${title}`), table(['Mục tiêu', 'Tài khoản thực hành', 'Thời lượng'], [[goal, account, time]], [5, 3, 1.4]), spacer()];
  const fig = (id) => figure(id, { heading: false });

  add(
    centered('AI-SRM', { bold: true, size: 40, color: '1F3A5F' }, { spacing: { before: 1800 } }),
    centered('BÀI TẬP THỰC HÀNH', { bold: true, size: 52, color: '1F3A5F' }, { spacing: { before: 400 } }),
    centered('CÁC CHỨC NĂNG MỚI', { bold: true, size: 40 }, { spacing: { after: 900 } }),
    centered('7 phần · 20 bài · có hình minh họa, bước làm, câu hỏi tự kiểm tra', { size: 24 }),
    centered('Thực hành trên dữ liệu mẫu. Không nhập dữ liệu thật, thông tin cá nhân hoặc mật khẩu thật.', { italics: true, size: 20, color: '777777' }, { spacing: { before: 300 } }),
    centered('Họ tên học viên: ....................................................   Đơn vị: ..........................................', { size: 22 }, { spacing: { before: 1200 } }),
    pageBreak(),
    ...toc(),
  );

  add(
    h1('Hướng dẫn chung'),
    h2('Thông tin truy cập'),
    table(['Thông tin', 'Giá trị'], [['Địa chỉ AI-SRM', '\n'], ['Mật khẩu chung tài khoản mẫu', '\n'], ['Mã học viên (vd HV05)', '\n']], [4, 6], { tall: true }),
    h2('Tài khoản dùng trong bài tập'),
    table(
      ['Vai trò', 'Email'],
      [
        ['Giảng viên, chủ nhiệm, người hướng dẫn', 'gv.binh@demo.aisrm.test'],
        ['Sinh viên', 'sv.an@demo.aisrm.test'],
        ['Đầu mối KH Khoa KTQT (hướng dẫn đề tài SV mẫu)', 'dm.ktqt@demo.aisrm.test'],
        ['Trưởng khoa KTQT', 'tk.ktqt@demo.aisrm.test'],
        ['Chuyên viên Phòng QLKH', 'cv.linh@demo.aisrm.test'],
        ['Trưởng phòng QLKH', 'tp.hung@demo.aisrm.test'],
        ['Quản trị hệ thống', 'admin@demo.aisrm.test'],
      ],
      [5, 5],
    ),
    h2('Quy ước'),
    bullet('Đặt tên bản ghi có **tiền tố mã học viên**, ví dụ "[HV05] Phương pháp dự báo…".'),
    bullet('Chỉ thao tác trên bản ghi của mình / nhóm mình. Làm theo nhóm 2 – 3 người để đóng các vai khác nhau.'),
    bullet('Ô đỏ đánh số trên hình ứng với ghi chú ①②③ dưới hình.'),
    h2('Kế hoạch thực hành gợi ý (khoảng 4 giờ)'),
    table(
      ['Phần', 'Nội dung', 'Thời lượng'],
      [
        ['1', 'Danh mục KH&CN: kê khai – xác nhận', '30 phút'],
        ['2', 'Kinh phí – hợp đồng, thông tin HEMIS', '35 phút'],
        ['3', 'Công bố: PDF, phiên bản, ORCID, phân loại', '40 phút'],
        ['4', 'NCKH sinh viên', '40 phút'],
        ['5', 'Researcher 360', '30 phút'],
        ['6', 'Điều hành & báo cáo', '35 phút'],
        ['7', 'Ủy quyền, phản biện ngoài trường, bàn giao, thư điện tử', '30 phút'],
      ],
      [1, 7, 2],
    ),
  );

  // Phần 1
  add(
    h1('Phần 1. Danh mục KH&CN'),
    ...lesson('1.1', 'Kê khai một tài sản trí tuệ', { goal: 'Kê khai, đính kèm minh chứng, nộp xác nhận.', account: 'gv.binh@demo.aisrm.test', time: '15 phút' }),
    label('Các bước'),
    ...steps([
      'Mở menu **Danh mục KH&CN**, chọn **Sở hữu trí tuệ**.',
      'Bấm **+ Kê khai tài sản trí tuệ**. Tên: "[HVxx] Giải pháp …"; Loại: Giải pháp hữu ích; Tình trạng: Đã nộp đơn; số đơn, ngày nộp đơn tùy chọn.',
      'Ở **Tác giả**, gõ "Trần Thị Bình" để chọn người trong trường; thêm một tác giả ngoài trường bằng cách gõ tên rồi chọn dòng "+ Dùng …".',
      'Bấm **Lưu nháp**. Ở khung **Minh chứng**, tải tệp PDF mẫu.',
      'Bấm **Nộp để xác nhận**.',
    ]),
    ...fig('N-A3-shtt-ke-khai'),
    ...fig('N-A4-shtt-nop'),
    label('Tự kiểm tra'),
    check('Trạng thái chuyển "Chờ xác nhận"; mã bản ghi dạng SHTT-năm-số.'),
    check('Thử bỏ trống "Loại" khi lưu: hệ thống báo lỗi trường bắt buộc.'),
    ...lesson('1.2', 'Phòng QLKH xác nhận / trả bổ sung', { goal: 'Đối chiếu minh chứng, xác nhận hoặc trả bổ sung.', account: 'cv.linh@demo.aisrm.test', time: '10 phút' }),
    ...steps(['Mở thông báo "Tài sản trí tuệ chờ xác nhận" (chuông) hoặc lọc danh sách **Chờ xác nhận**.', 'Mở bản ghi [HVxx] của nhóm, tải minh chứng để đối chiếu.', 'Lần 1: ghi "Bổ sung số đơn" và bấm **↺ Trả bổ sung**. Đăng nhập lại giảng viên, sửa, nộp lại.', 'Lần 2: ghi chú và bấm **✓ Xác nhận**.']),
    ...fig('N-A5-xac-nhan'),
    check('Không bấm được "Trả bổ sung" khi ô ghi chú trống.'),
    check('Mở Hồ sơ khoa học của TS. Trần Thị Bình: bản ghi vừa xác nhận xuất hiện ở mục Sở hữu trí tuệ.'),
    ...lesson('1.3', 'Kê khai nhóm nghiên cứu', { goal: 'Tự làm một danh mục khác.', account: 'gv.binh@demo.aisrm.test', time: '5 phút' }),
    p('Tự kê khai "[HVxx] Nhóm nghiên cứu …" với trưởng nhóm, 2 thành viên, đánh dấu (hoặc không) **Nhóm nghiên cứu mạnh**, rồi nộp. Cùng nhóm, đổi vai chuyên viên để xác nhận.'),
    discuss('Ở trường anh/chị, ai đang giữ danh sách nhóm nghiên cứu, sáng chế, hội thảo? Bao lâu cập nhật một lần?'),
  );

  // Phần 2
  add(
    h1('Phần 2. Kinh phí – hợp đồng và HEMIS'),
    ...lesson('2.1', 'Xem kinh phí và lập đề nghị chi', { goal: 'Đọc tình hình kinh phí, lập đề nghị chi trong dự toán.', account: 'gv.binh@demo.aisrm.test', time: '10 phút' }),
    ...steps(['Mở **Đề tài** → đề tài "Mức độ tham gia chuỗi giá trị toàn cầu…" → tab **Kinh phí – hợp đồng**.', 'Đọc 5 ô tổng hợp, hợp đồng, bảng dự toán (đã chốt).', 'Bấm **+ Lập đề nghị chi**: mục "Thuê khoán chuyên môn", nội dung "[HVxx] …", số tiền 5.000.000 → **Gửi đề nghị**.', 'Thử lập đề nghị 100.000.000 đ cho mục "Hội thảo, hội nghị" và đọc thông báo lỗi.']),
    ...fig('N-B1-kinh-phi'),
    ...fig('N-B2-de-nghi-chi'),
    check('Đề nghị vượt dự toán bị chặn, báo số tiền còn lại của mục.'),
    ...lesson('2.2', 'Duyệt chi và ghi nhận giải ngân', { goal: 'Phòng QLKH duyệt chi, nhập giải ngân theo chứng từ.', account: 'cv.linh@demo.aisrm.test', time: '10 phút' }),
    ...steps(['Mở cùng đề tài, tab **Kinh phí – hợp đồng**.', 'Ở dòng đề nghị [HVxx], bấm **Duyệt**.', 'Bấm **Ghi nhận giải ngân**: số tiền, ngày, số chứng từ "PC-HVxx" → **Ghi nhận**.', 'Thử chọn **Quyết toán** → "Đã quyết toán" và đọc thông báo.']),
    ...fig('N-B3-duyet-chi'),
    ...fig('N-B4-giai-ngan'),
    check('Ô "Đã giải ngân" tăng đúng số vừa nhập.'),
    check('Không quyết toán được khi còn đề nghị chi chưa xử lý.'),
    ...lesson('2.3', 'Cập nhật thông tin HEMIS của đề tài', { goal: 'Phân loại đề tài theo danh mục HEMIS.', account: 'cv.linh@demo.aisrm.test', time: '5 phút' }),
    ...steps(['Tab **Tổng quan & tiến độ** → khung **Thông tin HEMIS** → **✎ Cập nhật**.', 'Chọn cấp, phân loại, lĩnh vực, nguồn kinh phí → **Lưu**.']),
    ...fig('N-B5-hemis'),
    discuss('Kinh phí đề tài ở trường anh/chị đang theo dõi ở đâu? Ai sẽ nhập số giải ngân vào AI-SRM?'),
  );

  // Phần 3
  add(
    h1('Phần 3. Công bố: PDF, phiên bản, ORCID, phân loại'),
    ...lesson('3.1', 'Khai báo công bố từ tệp PDF', { goal: 'Dùng trích xuất PDF + AI, kiểm tra lại trước khi lưu.', account: 'gv.binh@demo.aisrm.test', time: '10 phút' }),
    ...steps(['Công bố → **+ Khai báo công bố** → **✨ Điền từ tệp PDF**, chọn PDF bài báo mẫu (giảng viên cung cấp).', 'So các trường được điền với PDF; sửa tiêu đề thêm "[HVxx]".', 'Kiểm tra nhóm **Thông tin theo HEMIS** (tập, số, trang, ISSN).', 'Bấm **Lưu nháp**.']),
    ...fig('N-C1-dien-tu-pdf'),
    check('Trả lời: trường nào do quy tắc trích, trường nào do AI? Vì sao DOI phải có nguyên văn trong tệp?'),
    ...lesson('3.2', 'Thay phiên bản minh chứng', { goal: 'Tải bản mới, xem lịch sử phiên bản.', account: 'gv.binh@demo.aisrm.test', time: '5 phút' }),
    ...steps(['Trong công bố vừa tạo, tải "ban-thao.pdf" ở khung Minh chứng.', 'Bấm **⟳ Phiên bản mới**, chọn "ban-chinh-thuc.pdf", ghi chú thay đổi.', 'Bấm **Lịch sử phiên bản**, tải lại bản v1.']),
    ...fig('N-C2-phien-ban'),
    ...lesson('3.3', 'Kiểm chứng ORCID và nhập từ ORCID', { goal: 'Đối chiếu công bố với ORCID; nhập công trình ORCID thành nháp.', account: 'gv.binh@demo.aisrm.test', time: '15 phút' }),
    ...steps(['Hồ sơ khoa học → **✎ Cập nhật thông tin**: ORCID **0000-0002-1825-0097** (hồ sơ mẫu chính thức của ORCID) → Lưu.', 'Mở công bố đã xác nhận "Global value chain participation…" → **🔎 Kiểm chứng ORCID** → **✨ Giải thích kết quả**.', 'Công bố → **⇩ Nhập từ ORCID**: chọn 1 công trình → **Tạo 1 bản nháp**.']),
    ...fig('N-C3-orcid'),
    ...fig('N-C4-nhap-orcid'),
    note('Cần Internet để tra ORCID / Crossref. Bản Local không có Internet thì hai nút này báo không kết nối được — các chức năng khác vẫn chạy.'),
    ...lesson('3.4', 'Xác nhận phân loại tạp chí', { goal: 'Xác nhận phạm vi tạp chí, xếp hạng Q có nguồn.', account: 'cv.linh@demo.aisrm.test', time: '5 phút' }),
    ...steps(['Mở công bố → **✎ Xác nhận phân loại**.', 'Chọn xếp hạng Q2 nhưng để trống nguồn → Lưu (đọc lỗi).', 'Ghi nguồn tra cứu → Lưu.']),
    ...fig('N-C5-phan-loai'),
  );

  // Phần 4
  add(
    h1('Phần 4. NCKH sinh viên'),
    ...lesson('4.1', 'Sinh viên đăng ký, chọn giảng viên hướng dẫn', { goal: 'Tạo hồ sơ, chọn GVHD, ngành, khóa.', account: 'sv.an@demo.aisrm.test', time: '10 phút' }),
    ...steps(['Đợt đăng ký → đợt NCKH sinh viên → **+ Tạo hồ sơ đề xuất**; tên "[HVxx] …".', 'Ở khung **NCKH sinh viên — người hướng dẫn**: chọn TS. Trần Thị Bình, ngành, khóa → **Lưu thông tin**.', 'Điền thuyết minh, kinh phí, thời gian, tải đề cương; thử **Nộp hồ sơ** và đọc thông báo.']),
    ...fig('N-D1-chon-gvhd'),
    check('Hồ sơ chưa nộp được khi giảng viên chưa xác nhận (thông báo "cần giảng viên hướng dẫn xác nhận").'),
    ...lesson('4.2', 'Giảng viên xác nhận; sinh viên nộp', { goal: 'Hoàn tất điều kiện nộp.', account: 'gv.binh@demo.aisrm.test → sv.an@demo.aisrm.test', time: '5 phút' }),
    ...steps(['Giảng viên mở thông báo, bấm **✓ Xác nhận hướng dẫn**.', 'Sinh viên đăng nhập lại, bấm **Nộp hồ sơ**.']),
    ...fig('N-D2-gv-xac-nhan'),
    ...lesson('4.3', 'Nhật ký hướng dẫn', { goal: 'Ghi buổi hướng dẫn cho đề tài sinh viên đang thực hiện.', account: 'dm.ktqt@demo.aisrm.test', time: '5 phút' }),
    ...steps(['Đề tài → "Ứng dụng mô hình học máy dự báo giá nông sản…" → tab **Nhật ký hướng dẫn**.', 'Ghi buổi mới "[HVxx] …" → **Lưu**.']),
    ...fig('N-D3-nhat-ky'),
    ...lesson('4.4', 'AI gợi ý nhận xét theo tiêu chí', { goal: 'Dùng AI chuẩn bị nhận xét, không thay hội đồng.', account: 'cv.linh@demo.aisrm.test', time: '10 phút' }),
    ...steps(['Mở hồ sơ sinh viên "Hành vi mua sắm trực tuyến…" → **✨ Gợi ý nhận xét theo tiêu chí**.', 'Đọc nhận xét từng tiêu chí, đối chiếu với thuyết minh.']),
    ...fig('N-D4-ai-tieu-chi'),
    discuss('Nhận xét nào của AI hợp lý, nhận xét nào cần sửa? Có nên cho phản biện dùng chức năng này không, với điều kiện gì?'),
    ...lesson('4.5', 'Thống kê và xếp giải', { goal: 'Đọc thống kê, ghi nhận giải.', account: 'cv.linh@demo.aisrm.test', time: '10 phút' }),
    ...steps(['Menu **NCKH sinh viên** → tab **Thống kê**: đọc theo khoa, ngành, khóa.', 'Tab **Xếp giải** → chọn đợt → chọn mức giải cho hồ sơ [HVxx].', 'Quay lại **Thống kê**: cơ cấu giải thay đổi. Bấm **⬇ Xuất Excel**.']),
    ...fig('N-D5-thong-ke'),
    ...fig('N-D6-xep-giai'),
  );

  // Phần 5
  add(
    h1('Phần 5. Researcher 360'),
    ...lesson('5.1', 'Tìm chuyên gia, mạng lưới, năng lực', { goal: 'Tìm người phù hợp làm phản biện / hợp tác.', account: 'cv.linh@demo.aisrm.test', time: '15 phút' }),
    ...steps(['Menu **Chuyên gia & mạng lưới** → tìm "xuất khẩu nông sản"; đọc minh chứng khớp của 3 người đầu.', 'Tab **Mạng lưới hợp tác**: ai hợp tác liên đơn vị?', 'Tab **Bản đồ năng lực**: đơn vị nào mạnh về công bố, đơn vị nào có nhóm nghiên cứu mạnh?']),
    ...fig('N-E1-tim-chuyen-gia'),
    ...fig('N-E2-mang-luoi'),
    ...fig('N-E3-nang-luc'),
    ...lesson('5.2', 'Giới thiệu song ngữ và lý lịch Word', { goal: 'Dùng AI dự thảo, duyệt rồi công khai; xuất lý lịch.', account: 'gv.binh@demo.aisrm.test', time: '15 phút' }),
    ...steps(['Hồ sơ khoa học → **✨ AI dự thảo giới thiệu**.', 'Sửa nội dung không chính xác → **✓ Duyệt và công khai**.', 'Bấm **⬇ Lý lịch (Word)**, mở tệp kiểm tra.']),
    ...fig('N-E4-gioi-thieu'),
    ...fig('N-E5-ho-so-360'),
    check('Đoạn giới thiệu chỉ nêu thông tin có trong hồ sơ; lý lịch chỉ gồm công bố đã xác nhận.'),
  );

  // Phần 6
  add(
    h1('Phần 6. Điều hành & báo cáo'),
    ...lesson('6.1', 'Chỉ số mở rộng và hỏi đáp số liệu', { goal: 'Đọc chỉ số; hỏi số liệu bằng tiếng Việt.', account: 'tp.hung@demo.aisrm.test', time: '15 phút' }),
    ...steps(['Điều hành & báo cáo → tab **Lĩnh vực, năm, sinh viên, kinh phí**.', 'Tab **Hỏi đáp số liệu**: hỏi lần lượt "Khoa nào có nhiều đề tài nhất?", "Kinh phí giải ngân theo đơn vị", "Thời tiết hôm nay thế nào?".', 'Đọc dòng "Truy vấn", "Định nghĩa" của mỗi câu trả lời.']),
    ...fig('N-F1-chi-so'),
    ...fig('N-F2-hoi-dap'),
    check('Câu hỏi ngoài danh mục không có số liệu bịa, chỉ gợi ý truy vấn có sẵn.'),
    ...lesson('6.2', 'Báo cáo Word, báo cáo HEMIS, chốt kỳ', { goal: 'Ra văn bản báo cáo và bộ số liệu kỳ.', account: 'tp.hung@demo.aisrm.test', time: '20 phút' }),
    ...steps(['Tab **Báo cáo & chốt kỳ** → **⬇ Báo cáo HEMIS (Excel)**; mở tệp, đọc cột THIẾU_BẮT_BUỘC.', '**✨ Tạo dự thảo** → sửa nội dung, ghi tiêu đề, nơi nhận → **⬇ Xuất Word (kèm bảng chỉ số)**.', '**🔒 Chốt kỳ**: "[HVxx] Báo cáo thử", kỳ "2026" → **Chốt** → **Xem** lại.']),
    ...fig('N-F3-bao-cao'),
    ...fig('N-F4-chot-ky'),
    discuss('Báo cáo nào trường đang làm thủ công hằng kỳ có thể chuyển sang AI-SRM? Ai chịu trách nhiệm chốt kỳ?'),
  );

  // Phần 7
  add(
    h1('Phần 7. Ủy quyền, phản biện ngoài trường, bàn giao, thư điện tử'),
    ...lesson('7.1', 'Ủy quyền có thời hạn', { goal: 'Trưởng khoa ủy quyền khi đi công tác; thu hồi.', account: 'tk.ktqt@demo.aisrm.test', time: '10 phút' }),
    ...steps(['Menu **Ủy quyền**: chọn vai trò "Lãnh đạo khoa…", người nhận ThS. Hoàng Thu Hà, 7 ngày, lý do → **Ủy quyền**.', 'Đăng nhập dm.ktqt: ô **Vai trò** có thêm vai trò được ủy quyền.', 'Trưởng khoa bấm **Thu hồi**.']),
    ...fig('N-G1-uy-quyen'),
    ...lesson('7.2', 'Tài khoản phản biện ngoài trường', { goal: 'Tạo tài khoản phản biện có thời hạn.', account: 'cv.linh@demo.aisrm.test', time: '10 phút' }),
    ...steps(['Menu **Phản biện ngoài trường**: email "hvxx.phanbien@example.test", họ tên, cơ quan, chuyên môn, thời hạn → **Tạo tài khoản**.', 'Ghi lại mật khẩu tạm (chỉ hiện một lần); đăng nhập thử bằng tài khoản này: chỉ có vai trò Phản biện.']),
    ...fig('N-G2-phan-bien-ngoai'),
    ...lesson('7.3', 'Bàn giao hồ sơ và thư điện tử (quan sát)', { goal: 'Biết quy trình bàn giao và cấu hình thư.', account: 'tp.hung@demo.aisrm.test, admin@demo.aisrm.test', time: '10 phút' }),
    p('Giảng viên trình diễn: Quản trị → **Bàn giao hồ sơ** (chọn người bàn giao, xem danh sách hồ sơ chưa kết thúc) và **Thư điện tử** (trạng thái máy chủ thư, bật / tắt, nhật ký). Học viên không bấm bàn giao trên dữ liệu chung.'),
    ...fig('N-G3-ban-giao'),
    ...fig('N-G4-thu-dien-tu'),
  );

  add(
    h1('Phiếu tổng kết'),
    table(
      ['Chức năng', 'Đã làm được', 'Cần hỗ trợ thêm', 'Áp dụng ở đơn vị (ưu tiên 1–3)'],
      ['Danh mục KH&CN', 'Kinh phí – hợp đồng', 'HEMIS, báo cáo cấp trên', 'Công bố: PDF, ORCID', 'NCKH sinh viên', 'Researcher 360', 'Hỏi đáp số liệu, chốt kỳ', 'Ủy quyền, phản biện ngoài'].map((x) => [x, '☐', '☐', '']),
      [4, 2, 2, 2.4],
    ),
    h2('Ghi chú'),
    ...Array.from({ length: 10 }, () => p('.......................................................................................................................................................')),
  );

  await k.save(body, { fileName: 'BAI_TAP_CHUC_NANG_MOI.docx', title: 'AI-SRM — Bài tập thực hành các chức năng mới', header: 'AI-SRM · Bài tập thực hành các chức năng mới' });
}

(async () => {
  await guide();
  await exercises();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
