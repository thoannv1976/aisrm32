# Hoàn thiện chức năng theo Thư mời K24

Ngày 22/11/2026. Căn cứ: [KE_HOACH_DAP_UNG_THU_MOI_K24.md](KE_HOACH_DAP_UNG_THU_MOI_K24.md) (đối chiếu 6 phần mềm cam kết), kế hoạch P1–P5 đã duyệt.

Ký hiệu: ✅ đã có · 🟡 có, phụ thuộc thông tin / dịch vụ của trường · ❌ chưa có

## 1. Đối chiếu sau khi hoàn thiện

### 01. AI-SRM Local — cài tại trường

| Cam kết | Hiện trạng | Ở đâu |
|---|---|---|
| Hồ sơ nhà khoa học | ✅ | Hồ sơ khoa học |
| Nhóm nghiên cứu, nhóm nghiên cứu mạnh | ✅ kê khai – Phòng KH xác nhận, trưởng nhóm, thành viên, lĩnh vực, quyết định | Danh mục KH&CN → Nhóm nghiên cứu |
| Đề tài các cấp (đăng ký → xét duyệt → thực hiện → nghiệm thu → lưu trữ) | ✅ thêm cấp, phân loại, lĩnh vực, nguồn kinh phí, kết quả nghiệm thu theo HEMIS | Đề tài → Thông tin HEMIS |
| Kinh phí, hợp đồng | ✅ hợp đồng, dự toán theo mục chi (Phòng KH chốt), đề nghị chi, duyệt chi, giải ngân theo chứng từ, quyết toán | Đề tài → tab Kinh phí – hợp đồng |
| Sản phẩm, công bố | ✅ thêm tập/số/trang, ISSN/ISBN, NXB; phạm vi tạp chí và xếp hạng Q do Phòng KH xác nhận theo nguồn | Công bố |
| Sở hữu trí tuệ, chuyển giao, hội thảo | ✅ | Danh mục KH&CN |
| Kho minh chứng có phiên bản | ✅ tải phiên bản mới, giữ bản cũ, xem lịch sử phiên bản | Mọi danh sách tài liệu |
| AI kiểm tra hồ sơ, tóm tắt thuyết minh | ✅ | Đề xuất → Trợ lý AI |
| Cảnh báo chậm tiến độ, nhắc hạn tự động | ✅ hằng ngày 7:00, kèm thư điện tử khi bật | Quản trị → Tác vụ nền, Thư điện tử |
| Xuất Word, Excel, PDF | ✅ Word: thuyết minh, biên bản, lý lịch, báo cáo điều hành; Excel: mọi danh mục, kinh phí, NCKH sinh viên, HEMIS; PDF: In / Lưu PDF của trình duyệt | Nút “⬇ Word / Excel” |
| Cài trên máy chủ của trường | ✅ bản Local (PostgreSQL, tài khoản nội bộ, tệp trên ổ đĩa, AI nội bộ, không cần Internet) | — |

### 02. AI-SRM Online

| Cam kết | Hiện trạng |
|---|---|
| Phê duyệt nhiều cấp, nhật ký | ✅ |
| Hội đồng chấm trực tuyến, biên bản (xuất Word) | ✅ |
| Nhắc hạn tự động + thư điện tử | ✅ (🟡 cần cấu hình máy chủ thư — mục 3) |
| AI gợi ý phản biện, kiểm soát xung đột lợi ích | ✅ |
| Trợ lý hỏi đáp quy chế | ✅ (đang dùng quy chế mẫu) |
| Phản biện ngoài trường | ✅ tài khoản có thời hạn, chỉ vai trò Phản biện |
| Ủy quyền, bàn giao hồ sơ | ✅ |

### 03. AI Student Research

| Cam kết | Hiện trạng |
|---|---|
| Mở đợt, sinh viên đăng ký | ✅ |
| Phân công giảng viên hướng dẫn | ✅ sinh viên chọn GV, GV xác nhận trước khi nộp được |
| Theo dõi tiến độ, nhật ký hướng dẫn | ✅ |
| Hội đồng đánh giá theo tiêu chí | ✅ |
| AI kiểm tra thuyết minh, gợi ý nhận xét theo tiêu chí | ✅ (không chấm điểm) |
| Xếp giải, thống kê theo khoa / ngành / khóa / năm | ✅ xếp theo điểm hội đồng, Phòng KH ghi giải |

### 04. AI Publication Verification

| Cam kết | Hiện trạng |
|---|---|
| Chuẩn hóa DOI, phát hiện trùng | ✅ |
| Xác minh – phê duyệt tách người | ✅ |
| Kiểm chứng Crossref, ORCID | ✅ ORCID: đối chiếu công bố với hồ sơ ORCID công khai của tác giả trong trường |
| AI trích xuất từ PDF, giải thích kết quả kiểm chứng | ✅ quy tắc + AI; DOI chỉ nhận khi có nguyên văn trong tệp |
| Không tự kết luận Scopus/WoS/Q | ✅ Q chỉ do cán bộ xác nhận, bắt buộc ghi nguồn |

### 05. AI Researcher 360

| Cam kết | Hiện trạng |
|---|---|
| Tổng hợp công bố, đề tài, sách, giải thưởng, SHTT, nhóm | ✅ |
| Nhập công bố từ ORCID | ✅ thành bản nháp, bỏ qua bản đã có |
| Bản đồ năng lực, mạng lưới hợp tác | ✅ |
| Tìm chuyên gia | ✅ công thức điểm công khai, có minh chứng khớp |
| AI lý lịch / giới thiệu song ngữ Việt – Anh | ✅ người dùng sửa và duyệt trước khi công khai; lý lịch xuất Word |

### 06. AI Research Executive Dashboard

| Cam kết | Hiện trạng |
|---|---|
| Chỉ số theo khoa, lĩnh vực, năm, cấp | ✅ |
| Kinh phí (hợp đồng, giải ngân) | ✅ |
| Chỉ số NCKH sinh viên | ✅ |
| Hỏi đáp số liệu tiếng Việt | ✅ AI chỉ chọn truy vấn trong danh mục; số do hệ thống tính |
| AI tạo biểu đồ, dự thảo báo cáo có dẫn nguồn | ✅ |
| Xuất báo cáo điều hành, báo cáo cấp trên | ✅ Word kèm bảng chỉ số; Excel theo cấu trúc bảng HEMIS |
| Chốt kỳ số liệu | ✅ lưu bất biến bộ số liệu tại thời điểm chốt |

## 2. Kiểm thử

- Test tích hợp: **bản Online (Firestore emulator) 97 đạt** (10 test chỉ dành cho bản Local được bỏ qua); **bản Local (PostgreSQL + đăng nhập nội bộ) 107/107 đạt**. Trong đó 19 test mới cho các phân hệ bổ sung (`apps/api/test/extensions.spec.ts`).
- Kiểm tra kiểu (API, web), 25 unit test gói dùng chung, build web: đạt.

## 3. Còn phụ thuộc thông tin / quyết định của trường

| Hạng mục | Cần gì |
|---|---|
| Gửi thư điện tử thật | Bản Local: máy chủ thư (SMTP) của trường. Bản Online: chọn dịch vụ gửi thư. Đặt `SMTP_URL`, `MAIL_FROM`; bật tại Quản trị → Thư điện tử. Chưa cấu hình thì thư được ghi nhật ký “chưa cấu hình”, thông báo trong ứng dụng vẫn chạy. |
| Mẫu Word / Excel riêng của trường | Đang dùng mẫu chuẩn của AI-SRM; thay khi có mẫu. |
| Đăng nhập một lần (OIDC / SSO, UniAIplatform) | Thông tin máy chủ định danh của trường thí điểm (câu Q7). |
| Kết nối UNI-DATA360 thật, gửi HEMIS | Hợp đồng / tài liệu API thật; bảng ánh xạ mã danh mục HEMIS chính thức; ký số `t_k` thuộc UNI-DATA360. |
| Quy chế KHCN thật | Thay quy chế mẫu trong Hỏi đáp quy chế. |
| Đóng gói bộ cài bản Local (L5) | Đã hoãn theo chỉ đạo. |
