# ADR-0003 — Tách lớp hạ tầng để chạy cả bản Online (Google) và bản Local (PostgreSQL)

Trạng thái: Chấp nhận · 22/11/2026 · Liên quan: [Kế hoạch bản Local](../KE_HOACH_BAN_LOCAL_POSTGRESQL.md) (đã duyệt)

## Bối cảnh
- Thư mời K24 cam kết hai phiên bản AI-SRM: Online (Google Cloud) và Local (cài trên máy chủ của trường, dữ liệu nằm tại trường).
- Mã API ban đầu gọi thẳng Firestore, Cloud Storage, Firebase Auth ở khoảng 200 chỗ (ADR-0001).

## Quyết định
1. **Port trong `apps/api/src/infra/`** — mã nghiệp vụ chỉ dùng các port này, không import `firebase-admin`:

   | Port | Online | Local |
   |---|---|---|
   | `DataStore` (`datastore.ts`) | `firestoreStore` | `postgresStore` (`postgres.ts`) ✅ |
   | `FileStore` (`filestore.ts`) | `gcsFileStore` | ổ đĩa / MinIO (L4) |
   | `IdentityProvider` (`identity.ts`) | `firebaseIdentity` | `LocalIdentity` (`local-identity.ts`) ✅; OIDC khi có IdP của trường |
   | `SecretStore` (`ai/secrets.ts`, đã có) | Secret Manager | tệp mã hóa AES-GCM |

   Bản cài đặt được chọn theo `DEPLOY_TARGET=online|local` trong `infra/index.ts`. Chỉ `infra/firebase.ts` được import `firebase-admin`.
2. **DataStore giữ ngữ nghĩa của Firestore**, ở đúng tập con đang dùng:
   - collection/doc lồng nhau;
   - `where` (`==`, `in`, `array-contains`, `array-contains-any`, `>=`…), `orderBy`, `limit`, `startAfter`, `count`;
   - `set` (có `merge`), `update` (khóa "a.b"), `create`, `delete`, `add`;
   - giao dịch đọc-trước-ghi-sau, `batch`, `increment`.

   Lý do: giữ nguyên mã nghiệp vụ, giảm rủi ro hai bản chạy khác nhau. Đây là phương án A2 trong kế hoạch: PostgreSQL lưu JSONB, kèm view quan hệ cho báo cáo.
3. **Tương đương hành vi được kiểm chứng bằng test**, không bằng hệ kiểu.
   - SDK Firestore có generic/overload khác port, nên adapter phải ép kiểu.
   - Từ L2, CI chạy cùng bộ test tích hợp trên cả hai bản. Không đạt trên bản nào thì không phát hành.
4. **Tác vụ định kỳ (`Scheduler`)** chưa có nghiệp vụ dùng. Port sẽ thêm ở L4 cùng chức năng nhắc hạn, tránh thiết kế trước khi có nhu cầu.

## Hệ quả
- Muốn thêm thao tác dữ liệu mới thì phải có trong port. Nếu chưa có, bổ sung vào port và **cả hai** bản cài đặt, kèm test.
- Bản Online không đổi hành vi. Ngày 22/11/2026 đã kiểm chứng lại: 24 unit test, 56 test tích hợp, E2E đều đạt.
- L2 (22/11/2026): `infra/postgres.ts` cài đặt DataStore trên PostgreSQL. `DATA_BACKEND=postgres` (mặc định khi `DEPLOY_TARGET=local`) chọn bản này. `test/datastore.spec.ts` kiểm tra ngữ nghĩa trên cả hai bản; 65/65 test tích hợp đạt trên cả hai.
- L3 (22/11/2026): `IDENTITY_BACKEND=local` (mặc định khi `DEPLOY_TARGET=local`) chọn đăng nhập nội bộ. Tài khoản và phiên lưu qua DataStore nên chạy được trên cả hai kho. Web lấy kiểu đăng nhập từ `/auth/config` lúc chạy, nên một bản build dùng chung cho cả hai bản.
- `DEPLOY_TARGET=local` vẫn báo lỗi rõ ràng "chưa cài đặt" cho FileStore cho đến khi xong L4.
