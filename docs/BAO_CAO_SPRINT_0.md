# Báo cáo Sprint 0 — chuẩn bị Khóa 24 (21/11/2026)

Phạm vi theo [KE_HOACH_DAP_UNG_THU_MOI_K24.md](KE_HOACH_DAP_UNG_THU_MOI_K24.md) mục 3. Đã chạy trên local (emulator) và **staging https://aisrm32.web.app**.

## 1. Đã làm

| Hạng mục | Nội dung | Phần mềm (Thư mời) |
|---|---|---|
| **AI Center — quản trị** | Nạp khóa API OpenAI / Claude / Gemini theo từng trường (lưu Google Secret Manager; không hiển thị lại, không ghi log); kiểm tra kết nối (lấy danh sách model, không tốn token); bật/tắt nhà cung cấp; model + bảng giá USD/1M token có ngày hiệu lực và nguồn giá; tỷ giá VND; ngân sách tháng có chặn cứng; tắt AI khẩn cấp; chế độ giả lập / thật | Nền tảng |
| **Tính chi phí AI** | Chi phí từ token thực tế × giá × tỷ giá (số nguyên, làm tròn lên); model chưa có giá → "chưa xác định" (không hiện 0); báo cáo theo model / chức năng / người dùng / ngày; máy tính chi phí ước tính; chạy thử model | Nền tảng |
| **AI tóm tắt thuyết minh** | Nút trên hồ sơ đề xuất; dự thảo lưu kèm phiên bản hồ sơ, báo khi hồ sơ đã đổi | 01, 02, 03 |
| **AI kiểm tra thuyết minh** | Lỗi theo quy tắc biểu mẫu + nhận xét AI về tính nhất quán mục tiêu – phương pháp – sản phẩm – kinh phí | 01, 03 |
| **AI dự thảo báo cáo** | Trên dashboard; chỉ dùng số liệu đã tính, mỗi số kèm mã chỉ số [key]; tải .txt | 06 |
| **Kiểm chứng DOI (Crossref)** | So tên bài, tạp chí, năm, tác giả; chỉ ra trường lệch; lưu kết quả; không tự kết luận chỉ mục/xếp hạng | 04 |
| **UNI-DATA360 giả lập** | Gửi outbox (chỉ dữ liệu đã duyệt, chống trùng, chống phiên bản cũ), tiêm lỗi, thử lại/phát lại, đồng bộ ban đầu (backfill), nhận danh mục đơn vị/cán bộ và báo khác biệt (không ghi đè), đối soát ID/version, API xuất có cursor | Nền tảng |
| **Xem trước chuẩn HEMIS** | Ánh xạ đề tài → `_KHCN_NHIEM_VU_KHCN`, bài báo → `_KHCN_BAI_BAO_KHOA_HOC`, sách → `_KHCH_SACH_XUAT_BAN`; đánh dấu trường bắt buộc còn thiếu và danh mục HEMIS chưa ánh xạ | Chuẩn bị HEMIS |
| **Dữ liệu mẫu NCKH sinh viên** | Đợt sinh viên có bước thẩm định; 1 hồ sơ chờ đơn vị xét; 1 đề tài sinh viên đang thực hiện | 03 |

Nguyên tắc AI đã áp dụng: AI chỉ tạo **dự thảo** có nhãn rõ ràng; nội dung hồ sơ được đánh dấu là dữ liệu không tin cậy (chống prompt injection); không tự sinh số liệu; chế độ giả lập dựng kết quả từ chính dữ liệu và gắn nhãn **GIẢ LẬP**; AI lỗi hoặc tắt thì nghiệp vụ vẫn chạy.

## 2. Kiểm thử đã chạy

- Unit: **17/17**.
- Tích hợp trên Firebase Emulator: **43/43**. Bao gồm:
  - khóa không lộ qua API và nhật ký;
  - chi phí đúng;
  - chặn khi vượt ngân sách và khi tắt khẩn cấp (không gọi nhà cung cấp);
  - AI theo phân quyền hồ sơ;
  - Crossref khớp / lệch / không tìm thấy;
  - UNI: chống trùng, lỗi → phát lại, backfill → đối soát khớp.
- E2E Playwright: **3/3**.
- Smoke test trên staging thật:
  - lưu / xóa khóa qua Secret Manager;
  - gọi Anthropic với khóa giả bị từ chối đúng;
  - AI giả lập chạy;
  - gọi Crossref thật thành công;
  - UNI giả lập: backfill → gửi → đối soát khớp 4/4.
- Sửa lỗi phát hiện khi test: duyệt đồng thời trên Firestore có lúc trả 500. Nay trả 409; không có duyệt trùng trong mọi trường hợp.

## 3. Để dùng AI thật trong buổi tập huấn

1. Đăng nhập `admin@demo.aisrm.test` → **AI Center** → Nhà cung cấp & khóa API → dán khóa → Kiểm tra kết nối.
2. Tab **Model & bảng giá**: kiểm tra giá. Giá Claude đã nhập sẵn theo bảng giá Anthropic tham khảo 03/11/2026. OpenAI / Gemini: thêm model và giá theo trang giá của hãng.
3. Tab **Cấu hình & hạn mức**: chọn model mặc định, đặt tỷ giá, ngân sách tháng, chuyển chế độ sang **Thật**.

Chưa có khóa thì mọi chức năng AI chạy ở chế độ giả lập, không tốn phí.

## 4. Hạn chế còn lại

- Hội đồng chấm điểm trực tuyến, AI gợi ý phản biện, hỏi đáp quy chế (RAG) chưa có. Đây là phần tiếp theo (Sprint 1).
- Kiểm tra ngân sách trước khi gọi AI dựa trên ước lượng token. Nhiều người gọi cùng lúc có thể vượt nhẹ ngân sách trong một lượt.
- Kiểm chứng mới dùng Crossref. ORCID và trích xuất PDF bằng AI để sang Sprint 5–6.
- Bản AI-SRM Local (cài tại trường) và mô hình 6 module vẫn chờ anh/chị quyết định.
