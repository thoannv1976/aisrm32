# ADR-0001 — Kiến trúc tổng thể giai đoạn đầu

Trạng thái: Chấp nhận · 21/11/2026

## Bối cảnh
Đặc tả `AI_SRM_BUILD_SPEC.md` chọn React/Vite, NestJS, Firebase Auth, Firestore, Cloud Storage, Cloud Run, Firebase Hosting; modular monolith.

## Quyết định
- Monorepo pnpm: `packages/shared` (vai trò, phân quyền, workflow engine thuần, kiểu dữ liệu), `apps/api`, `apps/web`.
- **NestJS 11 (CommonJS)** thay vì 12: bản 12 chỉ hỗ trợ ESM tại thời điểm xây dựng; dùng 11 để ổn định với công cụ build/test hiện có. Nâng cấp khi cần.
- Workflow định nghĩa bằng cấu hình có version trong `packages/shared/src/workflows.ts`; web dùng cùng định nghĩa để hiển thị, nhưng **server luôn quyết định** (`availableActions` trả về từ API).
- Firestore: dữ liệu dưới `tenants/{tenantId}`; Security Rules chặn toàn bộ client; Admin SDK + kiểm tra quyền tại API.
- Local: Firebase Emulator Suite với project `demo-aisrm` (tiền tố `demo-` bảo đảm không gọi dịch vụ thật). Seed chỉ chạy khi có biến emulator và project `demo-*`.
- Web dev proxy `/api` → API, giống rewrite Firebase Hosting `/api/**` → Cloud Run ở production.

## Hệ quả
- Một nơi định nghĩa quy tắc; unit test bao phủ quy tắc mà không cần DB.
- Chưa có microservice; tách worker khi làm AI/đồng bộ (Giai đoạn 3).
