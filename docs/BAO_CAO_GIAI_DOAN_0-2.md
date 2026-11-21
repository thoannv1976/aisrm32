# Báo cáo Giai đoạn 0–2 — AI-SRM

Ngày 21/11/2026 · Phạm vi đã duyệt: Giai đoạn 0 (khởi tạo), 1 (nền tảng), 2 (MVP nghiệp vụ), chạy local, chưa phát sinh chi phí cloud.

## 1. Đã làm

| Phân hệ | Nội dung đã chạy được |
|---|---|
| M01 Tổ chức và định danh | Đăng nhập Firebase Auth; trường/cơ sở/đơn vị phân cấp; nhiều vai trò trên một tài khoản; vai trò theo phạm vi đơn vị; ủy quyền có thời hạn (mô hình dữ liệu + kiểm tra hiệu lực); chuyển vai trò làm việc; nhiều trường (tenant) |
| M02 Hồ sơ nhà khoa học | Tự khai học hàm, học vị, ORCID, chuyên môn, hướng nghiên cứu; tự tổng hợp đề tài đã duyệt + công bố đã xác nhận; in/lưu PDF |
| M03 Đợt đăng ký và biểu mẫu | Mở đợt, thời hạn, điều kiện, biểu mẫu có phiên bản (trường động + danh mục tài liệu bắt buộc), cấu hình có/không bước thẩm định; mở/đóng đợt |
| M04 Hồ sơ và đề tài | Nháp → Đơn vị xem xét → Phòng KH → (Thẩm định) → Chờ phê duyệt → Phê duyệt/Không phê duyệt; trả bổ sung quay đúng bước; rút hồ sơ; snapshot bất biến mỗi lần nộp; kiểm tra hồ sơ theo quy tắc trước khi nộp |
| M05 Không gian dự án (cơ bản) | Tự lập đề tài khi phê duyệt; thời gian thực hiện; mốc/sản phẩm; nộp – chấp nhận – trả lại sản phẩm; yêu cầu gia hạn/thay đổi; đề nghị nghiệm thu → nghiệm thu → hoàn thiện → hoàn thành → lưu trữ; tạm dừng/hủy có lý do |
| M06 Công bố và sản phẩm | Khai báo, tác giả theo thứ tự (trong/ngoài trường), DOI chuẩn hóa, gợi ý trùng DOI/tiêu đề (không tự gộp), minh chứng; Đã nộp → Xác minh → Xác nhận (người khác người xác minh) → Đã xuất; xuất CSV công bố đã xác nhận |
| M15/M18 cơ bản | Trang làm việc theo vai trò (việc cần xử lý, mốc sắp/đã quá hạn); dashboard điều hành theo phạm vi quyền, chỉ số có định nghĩa và phiên bản công thức; xuất CSV |
| Dùng chung | Thông báo trong ứng dụng, tài liệu đính kèm có kiểm tra quyền, lịch sử xử lý, nhật ký kiểm toán, tài liệu API (OpenAPI tại /api/docs) |

## 2. Kết quả kiểm thử (đã chạy thật trên máy, 21/11/2026)

- **Unit (13/13 đạt)** — `packages/shared`: phân quyền theo phạm vi, ủy quyền hết hạn, chống tự duyệt, phân tách nhiệm vụ, bỏ bước thẩm định theo cấu hình, trả bổ sung/nộp lại, DOI, kiểm tra hồ sơ.
- **Tích hợp API trên Firebase Emulator (15/15 đạt)** — các kịch bản bắt buộc của đặc tả §12.1–12.2 không phụ thuộc AI/UNI:
  1. Đề xuất đi xuyên suốt đến lưu trữ đề tài, có lịch sử từng bước.
  2. Trả bổ sung giữ bản nộp cũ, quay đúng bước khi nộp lại.
  3. Trùng DOI được gợi ý, không tự gộp; công bố chưa xác nhận không xuất.
  4. *(Kịch bản bàn giao khi chuyên viên nghỉ: chưa làm — cần giao diện ủy quyền, P1.)*
  5. Hai người duyệt cùng phiên bản: một thành công, một nhận 409; chỉ một sự kiện, một đề tài.
  - Idempotency-Key; đầu mối khoa A không đọc hồ sơ/tài liệu khoa B (kể cả qua ID); không tự duyệt; cách ly tenant; sinh viên không thấy hồ sơ người khác; tệp giả mạo định dạng bị từ chối; dashboard theo phạm vi.
- **E2E Playwright (3/3 đạt)** — qua giao diện: giảng viên tạo, điền, đính kèm, nộp → đầu mối khoa xác nhận → chuyên viên trình → Phó HT phê duyệt → đề tài được lập; người ngoài phạm vi bị chặn; sinh viên không thấy menu điều hành/quản trị.
- Kiểm tra thủ công trên trình duyệt: desktop và điện thoại (375px, không tràn ngang).

## 3. Hạn chế đã biết

- Danh sách trả tối đa 500–1000 bản ghi/truy vấn, chưa phân trang cursor đầy đủ (đủ cho pilot; cần bổ sung trước khi dữ liệu lớn).
- Tìm kiếm là lọc trên trang; chưa có full-text search.
- Tải tệp qua API (≤ 15 MB/tệp) thay vì signed URL — xem ADR-0002. Chưa quét malware (cần dịch vụ quét khi lên cloud).
- Phê duyệt điện tử có danh tính, thời gian, nội dung; **không phải chữ ký số**.
- Chưa có giao diện cấp/thu hồi quyền và ủy quyền (đang quản lý bằng dữ liệu); chưa có bàn giao hồ sơ giữa chuyên viên.
- Thông báo chỉ trong ứng dụng; chưa gửi email.
- Biểu mẫu đợt nhập dạng JSON (đúng phạm vi MVP của đặc tả, chưa có trình thiết kế trực quan).
- Xuất báo cáo CSV (mở được bằng Excel); chưa có XLSX/DOCX theo mẫu (P1).
- Outbox đã ghi sự kiện nhưng chưa có bộ gửi (Giai đoạn 3).

## 4. Việc cần anh/chị cung cấp / quyết định cho giai đoạn sau

1. Region cho Firestore/Cloud Run (đề xuất `asia-southeast1`; không đổi được sau khi tạo Firestore).
2. Thêm Firebase vào project `aisrm32` bằng đúng tài khoản sở hữu project.
3. GitHub repo giữ public hay chuyển private.
4. Quy trình phê duyệt, biểu mẫu, định mức thực tế của trường (để thay cấu hình mẫu).
5. Nhà cung cấp AI dùng trước (Vertex AI Gemini hoặc Anthropic Claude) và ngân sách.
6. Tài liệu API UNI-DATA360 (nếu có) để thay hợp đồng đề xuất.

## 5. Giai đoạn tiếp theo (3 — AI và tích hợp)

AI Gateway (provider/model/prompt/quota/usage, chạy mock không cần khóa), 4 chức năng AI P0 (hỏi đáp quy chế có trích nguồn, trích xuất hồ sơ, kiểm tra hồ sơ, dự thảo báo cáo), pipeline tài liệu RAG, UNI-DATA360 mock với outbox/inbox, retry, replay, đối soát.
