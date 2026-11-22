# Hướng dẫn cài đặt AI-SRM bản Online (Google Cloud)

Bản Online chạy trên project Google Cloud / Firebase **của trường**: giao diện trên Firebase Hosting, API trên Cloud Run, dữ liệu trên Firestore, tệp trên Cloud Storage, đăng nhập bằng Firebase Authentication, khóa AI trên Secret Manager. Trường trả phí hạ tầng trực tiếp cho Google theo mức dùng.

## 1. Chuẩn bị

1. **Project Google Cloud** của trường, gắn **tài khoản thanh toán** (Billing). Nên tách 2 project: thử nghiệm và chính thức.
2. Tài khoản Google của cán bộ quản trị có quyền **Owner** trên project.
3. Máy quản trị Windows có:
   - Google Cloud SDK (`gcloud`) — https://cloud.google.com/sdk/docs/install
   - Node.js 22 LTS trở lên; bật pnpm: `corepack enable`
   - Firebase CLI: `npm install -g firebase-tools`
4. Đăng nhập:

```
gcloud auth login
firebase login
```

## 2. Nội dung bộ cài

Mã nguồn AI-SRM (API, web, gói dùng chung, cấu hình Firebase) và thư mục `deploy/online` (script `cai-dat-online.ps1`, tài liệu này). Bộ cài tự build trên Cloud Build khi triển khai.

## 3. Cài đặt

Mở PowerShell tại thư mục `deploy\online` của bộ cài:

```
powershell -ExecutionPolicy Bypass -File .\cai-dat-online.ps1 -ProjectId <id-project> -MaTruong abc -TenTruong "Trường Đại học ABC" -EmailQuanTri admin@abc.edu.vn -TepDonVi ..\local\don-vi.mau.csv
```

Tham số tùy chọn: `-Region` (mặc định `asia-southeast1`, Singapore), `-TaiKhoan` (tài khoản gcloud/firebase dùng để cài), `-TenQuanTri`.

Script thực hiện (chạy lại được, bước nào đã có thì bỏ qua):

1. Bật dịch vụ: Cloud Run, Cloud Build, Artifact Registry, Firestore, Firebase, Identity Toolkit, Secret Manager, Cloud Storage.
2. Tạo Firestore (Native), bucket tài liệu riêng tư (`<project>-documents`), tài khoản dịch vụ `aisrm-api` với quyền tối thiểu; tạo 3 secret cho khóa OpenAI / Claude / Gemini của trường.
3. Bật Firebase, tạo ứng dụng web, bật đăng nhập Email/Mật khẩu (nếu không bật tự động được, script nhắc làm trong Firebase Console).
4. Triển khai API lên Cloud Run (`aisrm-api`, scale về 0 khi không dùng).
5. Build giao diện với cấu hình Firebase của project, triển khai Hosting, Firestore rules / indexes.
6. Khởi tạo trường, đơn vị, tài khoản quản trị. **Mật khẩu tạm của quản trị in ra một lần.**

Địa chỉ sau khi cài: `https://<id-project>.web.app`.

## 4. Sau cài đặt

- Đăng nhập quản trị, đổi mật khẩu; Quản trị → Tài khoản → **Nhập tài khoản từ CSV** (mẫu `deploy/local/tai-khoan.mau.csv`).
- **AI Center**: nhập khóa API của nhà cung cấp AI trường đã ký (lưu vào Secret Manager, không hiện lại), kiểm tra bảng giá, đặt hạn mức tháng, chuyển chế độ **Chạy thật** khi sẵn sàng.
- **Budget alert**: Billing → Budgets & alerts, đặt ngưỡng chi phí tháng (cảnh báo qua email).
- **Sao lưu Firestore**: bật Point-in-time recovery và lịch sao lưu:

```
gcloud firestore databases update --database="(default)" --enable-pitr
gcloud firestore backups schedules create --database="(default)" --recurrence=daily --retention=14d
```

- **Thư điện tử**: đặt biến `SMTP_URL`, `MAIL_FROM` cho dịch vụ Cloud Run (nên lưu mật khẩu SMTP trong Secret Manager rồi gắn bằng `--set-secrets`), rồi bật tại Quản trị → Thư điện tử.
- **Tên miền riêng**: Firebase Console → Hosting → Add custom domain.
- **Đăng nhập một lần (SSO) của trường**: cần thông tin máy chủ định danh của trường — liên hệ đơn vị triển khai.

## 5. Nâng cấp

Chép mã nguồn phiên bản mới, chạy lại `cai-dat-online.ps1` với cùng tham số: script triển khai lại API và giao diện, giữ nguyên dữ liệu, không khởi tạo lại trường đã có.

## 6. Chi phí tham khảo

Cloud Run tính theo thời gian xử lý, scale về 0 khi không dùng; Firestore / Storage / Hosting theo dung lượng và lượt đọc ghi; Firebase Authentication miễn phí dưới 50.000 người dùng hoạt động / tháng (đăng nhập email). Chi phí AI tính theo khóa API của trường, theo dõi tại AI Center.
