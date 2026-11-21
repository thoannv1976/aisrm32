# Triển khai staging trên GCP — project `aisrm32`

Triển khai lần đầu: 21/11/2026. Môi trường **staging, dữ liệu giả lập**, chưa dùng cho dữ liệu thật.

## Thành phần đang chạy

| Thành phần | Giá trị |
|---|---|
| Web (Firebase Hosting) | https://aisrm32.web.app |
| API (Cloud Run) | service `aisrm-api`, region `asia-southeast1`, gọi qua `https://aisrm32.web.app/api/**` |
| Firestore | `(default)`, Native, `asia-southeast1` (không đổi được vùng) |
| Tệp tài liệu | bucket `gs://aisrm32-documents` (`asia-southeast1`, chặn truy cập công khai, uniform access) |
| Auth | Firebase Auth / Identity Platform, đăng nhập Email/Mật khẩu |
| Service account API | `aisrm-api@aisrm32.iam.gserviceaccount.com`: `datastore.user`, `firebaseauth.viewer`, `storage.objectAdmin` chỉ trên bucket tài liệu |
| Cấu hình API | `APP_ENV=staging`, `AI_MODE=mock`, `UNI_DATA360_MODE=disabled`, min 0 / max 3 instance, 512 MiB |

Firestore Security Rules chặn toàn bộ truy cập trực tiếp từ client; mọi dữ liệu đi qua API.

## Triển khai lại

Tài khoản gcloud/Firebase có quyền Owner trên `aisrm32` (hiện là tài khoản quản trị project).

```powershell
$env:CLOUDSDK_CORE_ACCOUNT="<tài khoản quản trị>"; $env:CLOUDSDK_CORE_PROJECT="aisrm32"
gcloud run deploy aisrm-api --source . --region asia-southeast1 --service-account aisrm-api@aisrm32.iam.gserviceaccount.com --allow-unauthenticated --memory 512Mi --min-instances 0 --max-instances 3
```

(Biến môi trường của service được giữ nguyên giữa các lần deploy.)

```powershell
pnpm --filter @aisrm/web build:staging
firebase --project aisrm32 deploy --only hosting,firestore:rules,firestore:indexes
```

## Dữ liệu và tài khoản staging

Đã chạy `pnpm --filter @aisrm/api bootstrap:staging -- --project aisrm32 --confirm`: 2 trường giả lập, đơn vị, tài khoản cho từng vai trò, hồ sơ mẫu. Mỗi tài khoản có **mật khẩu ngẫu nhiên**, lưu ở `.staging-accounts.local.txt` trên máy đã chạy lệnh (đã gitignore, không commit). Script từ chối chạy nếu dữ liệu đã tồn tại.

## Chi phí và giới hạn

- Cloud Run scale về 0 khi không dùng; Firestore/Storage/Hosting tính theo dung lượng và lượt dùng. Nên đặt **budget alert** trên billing account (Billing → Budgets & alerts).
- Identity Platform miễn phí dưới 50.000 người dùng hoạt động/tháng với đăng nhập email.

## Việc nên làm trước khi dùng dữ liệu thật

- Tách project production riêng; chỉ dùng `aisrm32` cho staging.
- Đặt budget alert; bật sao lưu Firestore (PITR / scheduled backup) và diễn tập phục hồi.
- Kết nối SSO của trường; tắt tài khoản giả lập.
- Giới hạn `/api/docs` (Swagger) chỉ cho quản trị; rate limit dùng chung; App Check.
- Quét malware tệp tải lên; tên miền riêng.
- CI/CD tự động deploy bằng Workload Identity Federation (chưa cấu hình — hiện deploy thủ công).
