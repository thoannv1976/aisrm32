# AI-SRM — Hệ thống quản lý khoa học và đổi mới sáng tạo tích hợp AI

AI-powered Scientific Research Management System. Monorepo TypeScript: React + NestJS + Firebase (Auth, Firestore, Storage), triển khai mục tiêu trên GCP project `aisrm32`.

> **Trạng thái:** Đã xong Giai đoạn 0–2 (nền tảng + nghiệp vụ tối thiểu). **Staging đang chạy tại https://aisrm32.web.app** (dữ liệu giả lập; xem [docs/TRIEN_KHAI_STAGING.md](docs/TRIEN_KHAI_STAGING.md)). Sprint 0: AI Center (khóa OpenAI/Claude/Gemini, giá, chi phí), AI tóm tắt/kiểm tra thuyết minh, dự thảo báo cáo, kiểm chứng DOI Crossref, UNI-DATA360 giả lập + xem trước chuẩn HEMIS — xem [docs/BAO_CAO_SPRINT_0.md](docs/BAO_CAO_SPRINT_0.md). Chi tiết: [docs/BAO_CAO_GIAI_DOAN_0-2.md](docs/BAO_CAO_GIAI_DOAN_0-2.md).

## Chạy thử trên máy

Yêu cầu: Node ≥ 22, pnpm 10, Java 21 (cho Firebase Emulator), Firebase CLI (`npm i -g firebase-tools`).

```powershell
pnpm install
pnpm build:shared
```

Mở 3 terminal:

```powershell
pnpm emulators:fresh     # 1. Firebase Emulator (Auth 9099, Firestore 8180, Storage 9199, UI 4000)
```

```powershell
pnpm seed                # 2. Nạp dữ liệu giả lập (chạy khi emulator đã lên; chạy lại để làm sạch dữ liệu)
pnpm dev:api             #    API: http://localhost:8090/api/v1  — tài liệu API: http://localhost:8090/api/docs
```

```powershell
pnpm dev:web             # 3. Web: http://localhost:5173
```

Trang đăng nhập có sẵn nút đăng nhập nhanh cho từng vai trò (chỉ hiện khi chạy với emulator). Mật khẩu chung của mọi tài khoản giả lập: xem `apps/api/scripts/seed-data.ts`.

| Vai trò | Email |
|---|---|
| Giảng viên / chủ nhiệm đề tài | gv.binh@demo.aisrm.test |
| Đầu mối KH Khoa KTQT / QTKD | dm.ktqt@demo.aisrm.test / dm.qtkd@demo.aisrm.test |
| Trưởng khoa KTQT | tk.ktqt@demo.aisrm.test |
| Chuyên viên Phòng QLKH | cv.linh@demo.aisrm.test, cv.minh@demo.aisrm.test |
| Trưởng phòng QLKH | tp.hung@demo.aisrm.test |
| Phó Hiệu trưởng / Hiệu trưởng | pht.nam@demo.aisrm.test / ht.quang@demo.aisrm.test |
| Sinh viên | sv.an@demo.aisrm.test |
| Quản trị hệ thống | admin@demo.aisrm.test |
| Giảng viên trường thứ 2 (test cách ly) | gv.xuan@demo2.aisrm.test |

## Kiểm thử

```powershell
pnpm --filter @aisrm/shared test   # Unit: phân quyền, workflow, kiểm tra hồ sơ, DOI
pnpm test:integration              # Tích hợp API trên emulator (tự bật/tắt emulator; tắt emulator đang chạy trước)
pnpm test:e2e                      # E2E Playwright (cần emulator đang chạy + pnpm seed; dùng Chrome đã cài)
pnpm typecheck
```

## Cấu trúc

```text
packages/shared      Vai trò, phân quyền, workflow engine, kiểu dữ liệu, kiểm tra biểu mẫu — dùng chung API & web
apps/api             NestJS REST /api/v1 (Firebase Admin, kiểm tra quyền tại server), scripts/seed, test tích hợp
apps/web             React + Vite + Tailwind + React Query, giao diện tiếng Việt theo vai trò
firebase/            Security Rules (chặn toàn bộ client), indexes
tests/e2e            Playwright
docs/                Báo cáo giai đoạn, ADR
```

## Nguyên tắc đã áp dụng

- Mọi đọc/ghi nghiệp vụ đi qua API; Firestore/Storage rules chặn toàn bộ truy cập trực tiếp từ client.
- Quyền = vai trò + phạm vi (toàn trường / đơn vị và cấp dưới) + trạng thái hồ sơ; kiểm tra ở server, không tin vai trò do trình duyệt gửi.
- Không tự duyệt hồ sơ của mình; phân tách người xác minh/xác nhận.
- Chuyển trạng thái trong transaction: kiểm tra `expectedVersion` (chống duyệt đồng thời) → ghi trạng thái + lịch sử + audit + outbox; hỗ trợ `Idempotency-Key`.
- Bản nộp đề xuất là snapshot bất biến; trả bổ sung quay đúng bước.
- Tệp: kiểm tra loại, dung lượng, chữ ký tệp; lưu bucket riêng tư; tải xuống qua API có kiểm tra quyền và ghi audit.
- Dữ liệu theo tenant (`tenants/{tenantId}/…`), kiểm tra membership; seed 2 trường để test cách ly.
- Phân hệ chưa làm hiển thị rõ "Chưa triển khai", không có nút giả.
