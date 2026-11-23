# Hướng dẫn cài đặt AI-SRM bản Local

Bản Local cài trên máy chủ của trường; dữ liệu (CSDL, tệp tài liệu, khóa AI) lưu hoàn toàn tại trường. Hệ thống chạy được không cần Internet (trừ kiểm chứng DOI/ORCID và AI thương mại).

Bộ cài: `Bo_cai_AI-SRM_Local_v1.0.1.zip`. Học viên cài trên PC cá nhân để tập huấn: dùng bộ cài riêng `Bo_cai_AI-SRM_PC_v1.0.1.zip` (hướng dẫn cài trên PC).

## 1. Yêu cầu

- Máy chủ: 4 vCPU, 8 GB RAM, 50 GB ổ đĩa trở lên (chưa tính AI nội bộ). AI nội bộ: thêm GPU NVIDIA ≥ 12 GB VRAM.
- Hệ điều hành: Ubuntu 22.04/24.04, Debian 12, RHEL 9; hoặc Windows Server 2022 / Windows 11 có Docker Desktop.
- Docker Engine 24+ và Docker Compose v2.
- Mạng: một cổng web (mặc định 80) mở trong mạng trường. Nên đặt sau reverse proxy có HTTPS của trường.

## 2. Nội dung bộ cài

- `images/aisrm-images-1.0.1.tar.gz` — image đã đóng gói: aisrm-api, aisrm-web, postgres (cài được không cần Internet).
- `docker-compose.yml`, `.env.example` — cấu hình dịch vụ.
- `cai-dat.ps1` / `cai-dat.sh` — cài đặt (Windows / Linux).
- `sao-luu`, `khoi-phuc`, `nang-cap` (.ps1 / .sh) — vận hành.
- `don-vi.mau.csv`, `tai-khoan.mau.csv` — mẫu danh sách đơn vị, tài khoản.
- Tài liệu: hướng dẫn cài đặt (tệp này), hướng dẫn sử dụng, bài tập thực hành.

## 3. Cài đặt

Giải nén `Bo_cai_AI-SRM_Local_v1.0.1.zip` vào thư mục cài đặt (Windows: ví dụ `D:\AI-SRM`; Linux: ví dụ `/opt/aisrm`). Các lệnh dưới đây chạy trong thư mục đó.

### 3.1. Dùng thử / tập huấn với dữ liệu mẫu

Windows (PowerShell, chạy với quyền quản trị):

```
cd <thư mục bộ cài>
powershell -ExecutionPolicy Bypass -File .\cai-dat.ps1 -CheDo demo
```

Linux:

```
cd <thư mục bộ cài>
sudo ./cai-dat.sh demo
```

Script tự: kiểm tra Docker → tạo `.env` với mật khẩu ngẫu nhiên → nạp image → khởi động → nạp dữ liệu mẫu và in danh sách tài khoản mẫu. Mở trình duyệt tại `http://<địa chỉ máy chủ>`.

Bản dữ liệu mẫu chỉ dùng cho tập huấn: tất cả tài khoản mẫu dùng chung một mật khẩu; không nhập dữ liệu thật.

### 3.2. Cài cho trường (dữ liệu thật)

1. Sửa `don-vi.mau.csv` theo cơ cấu tổ chức của trường (cột: `id,code,name,type,parentId`; đúng một đơn vị gốc; `type` thuộc UNIVERSITY, CAMPUS, FACULTY, INSTITUTE, OFFICE, DEPARTMENT).
2. Chạy:

```
.\cai-dat.ps1 -CheDo truong -MaTruong abc -TenTruong "Trường Đại học ABC" -EmailQuanTri admin@abc.edu.vn -TepDonVi .\don-vi.mau.csv
```

hoặc trên Linux:

```
sudo ./cai-dat.sh truong abc "Trường Đại học ABC" admin@abc.edu.vn "Quản trị hệ thống" don-vi.mau.csv
```

3. Script in **mật khẩu tạm** của tài khoản quản trị (chỉ hiện một lần). Đăng nhập, đổi mật khẩu theo yêu cầu.
4. Quản trị → Tài khoản → **Nhập tài khoản từ CSV** (theo mẫu `tai-khoan.mau.csv`); mật khẩu tạm của từng người hiện một lần để gửi qua kênh an toàn.

Tùy chọn: `-Cong 8088` (Linux: `HTTP_PORT=8088 ./cai-dat.sh …`) đổi cổng web; `-AI` (Linux: `AI=1`) bật container Ollama.

## 4. Cấu hình sau cài đặt (tệp `.env`)

| Biến | Ý nghĩa |
|---|---|
| `HTTP_PORT` | Cổng web |
| `POSTGRES_PASSWORD`, `LOCAL_SECRET_KEY` | Sinh tự động. **Không đổi** sau khi có dữ liệu (khóa AI đã lưu được mã hóa bằng `LOCAL_SECRET_KEY`). Sao lưu `.env` ở nơi an toàn. |
| `HTTP_BIND` | `0.0.0.0` (mặc định): mọi máy trong mạng truy cập; `127.0.0.1`: chỉ máy chủ (khi đặt sau reverse proxy cùng máy) |
| `LOCAL_AI_BASE_URL`, `LOCAL_AI_API_KEY` | Máy chủ AI nội bộ, xem mục "AI nội bộ" |
| `SMTP_URL`, `MAIL_FROM` | Máy chủ thư của trường để gửi thông báo, nhắc hạn |
| `PUBLIC_BASE_URL` | Địa chỉ web dùng trong liên kết trong thư |

Sau khi sửa `.env`: `docker compose up -d`. Bật gửi thư tại Quản trị → Thư điện tử.

### AI nội bộ (tùy chọn)

AI-SRM gọi máy chủ AI theo chuẩn API tương thích OpenAI: LocalAI, Ollama, vLLM. Ba cách:

| Máy chủ AI | `LOCAL_AI_BASE_URL` |
|---|---|
| LocalAI / Ollama đã chạy trên chính máy cài AI-SRM | `http://host.docker.internal:8080` (Ollama: `:11434`) |
| Máy chủ AI riêng trong mạng trường | `http://<địa chỉ>:<cổng>`, ví dụ `http://10.0.0.5:8080` |
| Container Ollama đi kèm bộ cài (cần GPU NVIDIA + NVIDIA Container Toolkit) | `http://ollama:11434` — cài với `-AI` (Linux: `AI=1`) |

Sửa `.env` (nếu LocalAI có khóa truy cập: thêm `LOCAL_AI_API_KEY`), rồi:

```
docker compose up -d
docker compose exec api node dist-cli/scripts/local-cli.js ai --list
docker compose exec api node dist-cli/scripts/local-cli.js ai --model <mã model> --warmup
```

Lệnh `ai --model` khai báo model (chi phí 0 đ), đặt làm model mặc định, chuyển chế độ **Chạy thật** cho mọi trường trong bản cài và nạp sẵn model vào GPU. Trở lại giả lập: `ai --mock`. Có thể làm các bước này trên giao diện tại **AI Center**.

Dùng container Ollama đi kèm: tải model trước, ví dụ `docker compose exec ollama ollama pull qwen3:8b` (cần Internet lần đầu).

Tham khảo GPU 8 GB (RTX 4060): qwen3.8-4b-q4 trả lời khoảng 10 giây mỗi câu hỏi quy chế, 30–35 giây mỗi dự thảo báo cáo; một GPU xử lý lần lượt từng yêu cầu (tối đa 10 yêu cầu chờ). Trường có nhiều người dùng AI đồng thời nên dùng máy chủ AI riêng có GPU mạnh hơn.

### HTTPS

Đặt AI-SRM sau reverse proxy của trường (nginx, Apache, F5…) có chứng chỉ HTTPS, chuyển tiếp tới `http://<máy chủ>:<HTTP_PORT>`; tăng thời gian chờ đọc lên 300 giây cho chức năng AI.

### Nâng cấp từ bản 1.0

1. Sao lưu: `.\sao-luu.ps1` (Linux: `./sao-luu.sh`).
2. Giải nén bộ cài 1.0.1 đè lên thư mục đang cài. Giữ nguyên tệp `.env`.
3. Chạy `.\nang-cap.ps1` (Linux: `./nang-cap.sh`): tự sao lưu, nạp image mới, đổi `AISRM_VERSION=1.0.1`, khởi động lại. Dữ liệu giữ nguyên.

## 5. Vận hành

| Việc | Windows | Linux |
|---|---|---|
| Xem trạng thái | `docker compose ps` | như bên trái |
| Nhật ký | `docker compose logs -f api` | như bên trái |
| Sao lưu (CSDL + tệp + .env) | `.\sao-luu.ps1` | `./sao-luu.sh` |
| Khôi phục | `.\khoi-phuc.ps1 sao-luu\<thời điểm>` | `./khoi-phuc.sh sao-luu/<thời điểm>` |
| Nâng cấp | chép bộ cài mới đè lên (giữ `.env`), `.\nang-cap.ps1` — tự sao lưu, nạp image, đổi phiên bản | `./nang-cap.sh` |
| Dừng / chạy lại | `docker compose stop` / `docker compose up -d` | như bên trái |

- Nên đặt sao lưu tự động hằng ngày (Task Scheduler / cron) và chép thư mục `sao-luu` sang máy khác hoặc ổ lưu trữ của trường.
- Diễn tập khôi phục định kỳ trên một máy thử.
- Nâng cấp tự sao lưu trước; CSDL tự nâng cấp lược đồ khi API khởi động.
- Tác vụ nền (nhắc hạn 7:00 hằng ngày) chạy sẵn trong container api; xem tại Quản trị → Tác vụ nền.

## 6. Xử lý sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| Trang báo "Đang khởi động…" lâu | API chưa sẵn sàng: `docker compose ps`, `docker compose logs api` |
| Không đăng nhập được, báo khóa tạm | Sai mật khẩu 5 lần: chờ 15 phút hoặc quản trị cấp mật khẩu tạm |
| Quên mật khẩu quản trị | Một quản trị khác cấp mật khẩu tạm; nếu chỉ có một quản trị: liên hệ đơn vị hỗ trợ |
| Nút AI báo lỗi máy chủ AI nội bộ | Kiểm tra `LOCAL_AI_BASE_URL`, container ollama, model đã tải; bấm Làm nóng trong AI Center |
| Kiểm chứng DOI / ORCID báo không kết nối | Máy chủ không có Internet — chức năng khác vẫn chạy bình thường |
| Hết dung lượng | Dọn bản sao lưu cũ; `docker system df` |
