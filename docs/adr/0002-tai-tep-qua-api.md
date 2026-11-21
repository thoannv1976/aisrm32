# ADR-0002 — Tải tệp qua API thay cho signed URL ở MVP

Trạng thái: Chấp nhận (tạm thời) · 21/11/2026

## Bối cảnh
Đặc tả đề xuất upload intent + URL ngắn hạn. Storage Emulator không ký được signed URL nếu không có khóa service account, và không đóng gói khóa JSON là yêu cầu bảo mật.

## Quyết định
- Tải lên: `POST /api/v1/documents` (multipart, ≤ 15 MB) — kiểm tra quyền trên hồ sơ cha và trạng thái, danh sách loại tệp, chữ ký tệp (magic bytes), SHA-256; lưu vào bucket riêng tư theo đường dẫn tenant.
- Tải xuống: `GET /api/v1/documents/{id}/download` — kiểm tra lại quyền tại thời điểm tải, ghi audit, `Cache-Control: private, no-store`.
- Thu hồi: đánh dấu REVOKED, xóa bản lưu; không cho thu hồi tệp đã nằm trong bản nộp (snapshot).

## Hệ quả / việc sau
- Giới hạn bởi request size của Cloud Run (32 MB) — đủ cho hồ sơ thông thường.
- Khi lên cloud: chuyển sang signed URL ký bằng IAM `signBlob` của service account Cloud Run (không cần khóa JSON) cho tệp lớn; thêm quét malware trước khi tài liệu được dùng cho RAG.
