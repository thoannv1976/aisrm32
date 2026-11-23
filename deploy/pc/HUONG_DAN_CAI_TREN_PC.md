# Hướng dẫn cài AI-SRM trên PC

Bộ cài dành cho học viên khóa tập huấn: cài AI-SRM với **dữ liệu mẫu** lên PC Windows, dùng **LocalAI có sẵn trên máy** để chạy các chức năng AI. Dữ liệu và AI đều nằm trên máy, không cần Internet. Các máy khác trong cùng mạng LAN cũng truy cập được.

## 1. Yêu cầu

| Hạng mục | Yêu cầu |
|---|---|
| Hệ điều hành | Windows 10 (22H2) hoặc Windows 11, 64-bit; bật ảo hóa (Virtualization) trong BIOS |
| RAM | Từ 16 GB (AI-SRM khoảng 1 GB, phần còn lại cho LocalAI và Windows) |
| Ổ đĩa | Còn trống từ 10 GB |
| GPU | NVIDIA từ 8 GB VRAM (ví dụ RTX 4060), đã cài LocalAI |
| Phần mềm | Docker Desktop (mục 2); LocalAI đang chạy (cổng 8080) với ít nhất một model hội thoại |

Bộ cài đã thử trên máy: Core i9-14900HX, RAM 32 GB, RTX 4060 Laptop 8 GB, Windows 11, Docker Desktop 29, LocalAI (container `localai/localai:latest-gpu-nvidia-cuda-12`).

## 2. Chuẩn bị (làm một lần)

1. Docker Desktop: nếu máy đã chạy LocalAI bằng Docker thì đã có, bỏ qua bước này. Nếu chưa: tải tại docker.com/products/docker-desktop, cài với tùy chọn mặc định (WSL 2), khởi động lại máy, mở Docker Desktop và chờ báo "Engine running".
2. LocalAI: kiểm tra bằng cách mở http://localhost:8080 trên trình duyệt. Trang LocalAI hiện ra là được.
3. Chuẩn bị bộ cài: tệp `AI-SRM_PC_Setup_v1.0.1.exe` (cách cài chính, mục 3.1) hoặc `Bo_cai_AI-SRM_PC_v1.0.1.zip` (dự phòng, mục 3.2).

## 3. Cài đặt

### 3.1. Cài bằng tệp .exe (khuyến nghị)

1. Bấm đúp `AI-SRM_PC_Setup_v1.0.1.exe`.
2. Nếu Windows báo "Windows protected your PC" (tệp chưa có chữ ký số): bấm **More info** → **Run anyway**.
3. Bấm **Tiếp** qua các bước:
   - Thông tin: đọc yêu cầu trước khi cài.
   - Thư mục cài: giữ mặc định (`C:\Users\<tên>\AppData\Local\Programs\AI-SRM`) hoặc chọn thư mục khác.
   - Tùy chọn: **Tạo biểu tượng trên màn hình**; **Cho máy khác trong mạng LAN truy cập** (bỏ chọn nếu chỉ dùng trên máy mình).
4. Bấm **Cài đặt**. Một cửa sổ đen hiện tiến trình (3–5 phút): kiểm tra Docker Desktop (tự mở nếu đang tắt), tìm LocalAI và chọn model, nạp phần mềm, nạp dữ liệu mẫu, bật AI nội bộ và nạp sẵn model vào GPU.
5. Cuối cửa sổ đen có **danh sách tài khoản mẫu** (giống tài liệu Bài tập thực hành, ví dụ gv.binh@demo.aisrm.test). Đọc xong nhấn phím bất kỳ; trình duyệt tự mở AI-SRM.
6. Nếu đã chọn mở LAN: Windows hỏi quyền quản trị, bấm **Yes**.
7. Bấm **Xong**.

Bộ cài không cần quyền quản trị (trừ bước mở LAN). Bộ cài tự kiểm tra trước: chưa có Docker Desktop thì dừng và báo cách cài; không thấy LocalAI thì hỏi có cài với AI giả lập không.

Sau khi cài: biểu tượng **AI-SRM** trên màn hình (mở hệ thống); nhóm **AI-SRM** trong Start menu gồm Mở, Tắt, Kiểm tra, Cấu hình AI nội bộ, Sao lưu, Mở cổng mạng LAN, Hướng dẫn, Tài liệu tập huấn, Gỡ AI-SRM.

Gỡ: Settings → Apps → **AI-SRM 1.0.1 (bản tập huấn trên PC)** → Uninstall (hoặc Start menu → AI-SRM → Gỡ AI-SRM). Gỡ sẽ xóa dữ liệu trong bản cài; thư mục sao lưu được giữ lại.

Chạy lại tệp .exe lên bản đang cài: dữ liệu và mật khẩu được giữ nguyên.

### 3.2. Cài từ tệp zip (dự phòng)

Dùng khi máy chặn tệp .exe.

1. Giải nén `Bo_cai_AI-SRM_PC_v1.0.1.zip` vào một thư mục, ví dụ `D:\AI-SRM` (đường dẫn ngắn, không nằm trong OneDrive).
2. Bấm đúp `CAI_DAT.bat`, chờ 3–5 phút (các bước như mục 3.1).
3. Đăng nhập bằng tài khoản mẫu in ở cuối cửa sổ cài đặt.

Mỗi máy chỉ cài **một** bản AI-SRM: đã cài bằng .exe thì không cài thêm từ zip (và ngược lại). Bộ cài phát hiện và báo nếu máy đã có bản cài ở thư mục khác.

### 3.3. Lưu ý chung

Địa chỉ mặc định: http://localhost:8088. Nếu cổng 8088 đang bận, bộ cài tự chọn cổng kế tiếp và in ra.

Không thấy LocalAI (chưa chạy) thì AI-SRM vẫn cài, dùng AI giả lập. Khi LocalAI chạy: Start menu → AI-SRM → Cấu hình AI nội bộ (bản zip: `CAU_HINH_AI.bat`).

Nhật ký cài đặt: `he-thong\cai-dat.log` trong thư mục cài — gửi kèm khi báo lỗi.

## 4. Dùng hằng ngày

Cài bằng .exe: dùng các mục trong Start menu → AI-SRM (cùng chức năng). Cài từ zip: bấm đúp các tệp trong thư mục cài.

| Tệp (bấm đúp) | Việc |
|---|---|
| `MO_AI-SRM.bat` | Mở AI-SRM: bật Docker Desktop nếu cần, khởi động, mở trình duyệt |
| `TAT_AI-SRM.bat` | Tắt AI-SRM, giữ nguyên dữ liệu |
| `KIEM_TRA.bat` | Kiểm tra tình trạng: dịch vụ, địa chỉ LAN, kết nối LocalAI, lỗi gần nhất |
| `CAU_HINH_AI.bat` | Bật lại / đổi model AI nội bộ |
| `SAO_LUU.bat` | Sao lưu dữ liệu vào `he-thong\sao-luu\<thời điểm>` |
| `KHOI_PHUC.bat` | Khôi phục: kéo thả thư mục sao lưu vào tệp này (ghi đè dữ liệu hiện tại) |
| `MO_MANG_LAN.bat` | Mở cổng trên tường lửa Windows để máy khác trong LAN truy cập (cần quyền quản trị) |
| `GO_CAI_DAT.bat` | Gỡ AI-SRM, xóa dữ liệu (hỏi xác nhận, cho sao lưu trước). Không gỡ Docker Desktop, LocalAI |

AI-SRM tự chạy lại khi bật máy nếu Docker Desktop được đặt "Start when you sign in" (mặc định của Docker Desktop).

## 5. Dùng chung qua mạng LAN

Một máy cài AI-SRM, các máy khác trong cùng mạng dùng trình duyệt truy cập.

1. Trên máy cài: bấm đúp `MO_MANG_LAN.bat`, chọn Yes khi Windows hỏi quyền quản trị. Script in địa chỉ LAN, ví dụ http://192.168.1.20:8088.
2. Mạng đang dùng phải để chế độ Private: Settings → Network & internet → (mạng đang dùng) → Network profile type: Private network.
3. Máy khác mở địa chỉ LAN trên trình duyệt và đăng nhập.

Năng lực AI khi dùng chung: một GPU trả lời lần lượt từng câu, mỗi câu khoảng 10–35 giây tùy chức năng. Đo trên máy thử với 6 người hỏi cùng lúc: câu nhanh nhất 10 giây, câu chậm nhất 55 giây. Quá 10 yêu cầu chờ cùng lúc, hệ thống báo "AI đang bận, thử lại sau". Vì vậy mỗi máy có GPU nên tự cài AI-SRM; dùng chung qua LAN phù hợp nhóm khoảng 5 người.

Chỉ muốn dùng trên chính máy mình (không mở cho LAN): cài bằng PowerShell `.\he-thong\cai-dat-pc.ps1 -ChiMayNay`.

## 6. AI nội bộ

- Script tự chọn model theo thứ tự: qwen3.8-4b-q4 (nhanh nhất, phù hợp GPU 8 GB), granite-4.2-8b-q4, ornith-1.5-9b-q4; nếu không có, chọn model hội thoại đầu tiên. Các model nhúng (embedding), xếp hạng (reranker), giọng nói không được chọn.
- Đổi model: mở PowerShell trong thư mục bộ cài, chạy `.\CAU_HINH_AI.bat -ModelAI granite-4.2-8b-q4`.
- Trở lại AI giả lập: `.\CAU_HINH_AI.bat -GiaLap`.
- LocalAI có đặt khóa truy cập (API_KEY): thêm `-KhoaAI <khóa>`.
- LocalAI / Ollama ở máy khác trong LAN: `.\CAU_HINH_AI.bat -DiaChiAI http://192.168.1.30:8080`.
- Tất cả chức năng AI của AI-SRM (hỏi đáp quy chế, tóm tắt và kiểm tra đề xuất, dự thảo báo cáo, biên bản hội đồng, hỏi đáp số liệu…) dùng model đã chọn; chi phí tính 0 đ. Xem và điều chỉnh tại AI Center (tài khoản admin@demo.aisrm.test).
- LocalAI tự nhả GPU sau một thời gian không dùng; câu hỏi đầu tiên sau đó chậm hơn (nạp lại model). Có thể bấm Làm nóng trong AI Center trước buổi học.

## 7. Lưu ý an toàn

- Bản cài chỉ chứa dữ liệu mẫu, các tài khoản mẫu dùng chung một mật khẩu công bố trong tài liệu. Không nhập dữ liệu thật; không mở AI-SRM ra Internet.
- Chỉ mở LAN trong mạng tin cậy (phòng học, mạng nội bộ trường); MO_MANG_LAN.bat chỉ mở cho mạng Private / Domain, không mở trên mạng Public.
- Tệp `he-thong\.env` chứa mật khẩu CSDL và khóa mã hóa của bản cài: không chia sẻ.

## 8. Xử lý sự cố

| Hiện tượng | Cách xử lý |
|---|---|
| "Chưa cài Docker Desktop" | Cài Docker Desktop (mục 2), khởi động lại máy, chạy lại CAI_DAT.bat |
| Docker Desktop báo lỗi WSL / Virtualization | Bật ảo hóa trong BIOS; mở PowerShell quyền quản trị chạy `wsl --update`, khởi động lại |
| "Không thấy LocalAI" | Mở Docker Desktop kiểm tra container localai đang chạy; mở http://localhost:8080; rồi bấm CAU_HINH_AI.bat |
| Nút AI báo "không kết nối được máy chủ AI nội bộ" | Bấm KIEM_TRA.bat xem dòng "Kết nối"; khởi động lại LocalAI; bấm CAU_HINH_AI.bat |
| AI trả lời chậm / báo hết thời gian chờ | Lần đầu nạp model mất 1–2 phút: bấm Làm nóng trong AI Center; đóng các phần mềm dùng GPU khác |
| Máy khác trong LAN không vào được | Bấm MO_MANG_LAN.bat; đặt mạng Private; kiểm tra hai máy cùng mạng (ping địa chỉ LAN) |
| Quên mật khẩu tài khoản mẫu | Xem tài liệu Bài tập thực hành hoặc màn hình cài đặt; tài khoản admin cấp mật khẩu tạm tại Quản trị → Tài khoản |
| Bộ cài .exe báo "bước cài đặt chưa thành công" | Đọc thông báo đỏ trong cửa sổ đen hoặc tệp he-thong\cai-dat.log; sửa (mở Docker Desktop, gỡ bản cài cũ…) rồi chạy lại tệp .exe |
| Windows chặn tệp .exe | More info → Run anyway; nếu phần mềm diệt virus vẫn chặn: cài từ zip (mục 3.2) |
| Muốn cài lại từ đầu | Gỡ (Settings → Apps, hoặc GO_CAI_DAT.bat) rồi cài lại |

Khi báo lỗi cho Ban tổ chức: chụp màn hình KIEM_TRA.bat.
