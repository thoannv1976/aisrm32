# Rà soát AI-SRM so với cam kết Thư mời K24 và kế hoạch build

Ngày 21/11/2026 · Căn cứ: Thư mời số 24/2026/TM-TH (Phụ lục 01–03), tài liệu API HEMIS v1.0 (mục 12 — dữ liệu NCKH), hiện trạng AI-SRM sau Giai đoạn 0–2.

> **Cập nhật tiến độ (đêm 21/11/2026, đã chạy trên staging https://aisrm32.web.app):**
> - ✅ **Sprint 0 xong** — xem [BAO_CAO_SPRINT_0.md](BAO_CAO_SPRINT_0.md):
>   - AI Center: khóa OpenAI / Claude / Gemini, giá, chi phí, hạn mức;
>   - AI tóm tắt / kiểm tra thuyết minh, AI dự thảo báo cáo;
>   - kiểm chứng DOI qua Crossref;
>   - UNI-DATA360 giả lập, xem trước chuẩn HEMIS;
>   - dữ liệu mẫu NCKH sinh viên.
> - ✅ **Từ Sprint 1, xong M07 Hội đồng và phản biện** (đáp ứng Buổi 2):
>   - gợi ý phản biện theo chuyên môn, cờ xung đột lợi ích;
>   - khai báo xung đột trước khi xem hồ sơ;
>   - chấm độc lập theo phiếu có phiên bản, khóa phiếu, tổng hợp;
>   - AI dự thảo biên bản, chủ tịch xác nhận, thu hồi quyền xem hồ sơ.
> - ⏳ **Còn lại của Sprint 1–2:**
>   - trợ lý hỏi đáp quy chế (RAG) — cần văn bản quy chế thật của trường;
>   - nhắc hạn tự động + email — cần chọn dịch vụ gửi email;
>   - xuất Word / Excel / PDF theo mẫu — cần mẫu của trường;
>   - màn hình phân quyền / ủy quyền;
>   - trường dữ liệu HEMIS cho đề tài.

Ký hiệu: ✅ đã có · 🟡 có một phần · ❌ chưa có

## 1. Đối chiếu 6 phần mềm cam kết chuyển giao

### 01. AI-SRM Local — cài tại trường (Buổi 1)

| Cam kết | Hiện trạng |
|---|---|
| Hồ sơ nhà khoa học | ✅ |
| Nhóm nghiên cứu | ❌ |
| Đề tài các cấp: đăng ký → xét duyệt → thực hiện → nghiệm thu → lưu trữ | ✅ (chưa phân loại cấp đề tài theo danh mục) |
| Kinh phí, hợp đồng | ❌ (chỉ có kinh phí đề xuất) |
| Sản phẩm, công bố | ✅ |
| Sở hữu trí tuệ, hội thảo | ❌ |
| Kho minh chứng có phiên bản | 🟡 (có tài liệu, chưa quản lý phiên bản tệp) |
| AI kiểm tra hồ sơ, tóm tắt thuyết minh | ✅ |
| Cảnh báo chậm tiến độ | 🟡 (cảnh báo theo quy tắc trên dashboard, chưa nhắc tự động) |
| Xuất báo cáo Word, Excel, PDF | 🟡 (CSV, in PDF lý lịch) |
| **Cài trên máy chủ của trường, dữ liệu lưu tại trường** | ❌ **Kiến trúc hiện tại phụ thuộc Firebase/GCP** |

### 02. AI-SRM Online — Google Cloud (Buổi 2)

| Cam kết | Hiện trạng |
|---|---|
| Chạy trên Google Cloud, truy cập qua trình duyệt | ✅ (staging aisrm32) |
| Phê duyệt nhiều cấp, nhật ký xử lý | ✅ |
| Hội đồng chấm điểm trực tuyến, biên bản | ✅ (M07) |
| Nhắc hạn tự động | ❌ |
| AI gợi ý phản biện theo chuyên môn, kiểm soát xung đột lợi ích | ✅ gợi ý theo chuyên môn + cờ / khai báo xung đột |
| Trợ lý hỏi đáp quy chế | ❌ |
| Phản biện ngoài trường | ❌ |

### 03. AI Student Research — NCKH sinh viên (Buổi 2)

| Cam kết | Hiện trạng |
|---|---|
| Mở đợt, sinh viên đăng ký đề tài | 🟡 (dùng chung đợt/đề xuất, chưa có luồng riêng cho sinh viên) |
| Phân công giảng viên hướng dẫn | ❌ (mới là trường nhập tự do) |
| Theo dõi tiến độ, nộp sản phẩm | 🟡 (dùng chung mốc đề tài) |
| Hội đồng đánh giá theo tiêu chí | ✅ (dùng M07, phiếu NCKH sinh viên) |
| AI kiểm tra thuyết minh, gợi ý nhận xét sơ bộ | 🟡 kiểm tra thuyết minh xong; nhận xét theo tiêu chí chưa có |
| Tổng hợp, xếp giải, lưu trữ, thống kê theo khoa/ngành/khóa | ❌ |

### 04. AI Publication Verification — kiểm chứng công bố (Buổi 3)

| Cam kết | Hiện trạng |
|---|---|
| Chuẩn hóa DOI, phát hiện bản ghi trùng | ✅ |
| Quy trình xác minh – phê duyệt (tách người) | ✅ |
| Kiểm chứng DOI, tên bài, tác giả, tạp chí, năm với Crossref, ORCID | 🟡 Crossref xong; ORCID chưa |
| Phát hiện sai lệch so với nguồn mở | ❌ |
| AI trích xuất từ PDF, giải thích kết quả kiểm chứng | ❌ |
| AI không tự kết luận Scopus/WoS/Q1 | Nguyên tắc thiết kế: hiển thị nguồn, cán bộ xác nhận |

### 05. AI Researcher 360 Profile — hồ sơ khoa học số (Buổi 3)

| Cam kết | Hiện trạng |
|---|---|
| Tổng hợp công bố, đề tài, sách | ✅ |
| Lĩnh vực nghiên cứu | ✅ |
| Giải thưởng | ❌ |
| Liên kết ORCID | 🟡 (có trường ORCID, chưa nhập dữ liệu từ ORCID) |
| Bản đồ năng lực, mạng lưới hợp tác | ❌ (dữ liệu đồng tác giả đã có) |
| Tìm chuyên gia | ❌ |
| AI tạo lý lịch khoa học, giới thiệu song ngữ Việt – Anh | ❌ (có in lý lịch, chưa có AI) |

### 06. AI Research Executive Dashboard — điều hành (Buổi 4)

| Cam kết | Hiện trạng |
|---|---|
| Chỉ số theo khoa | ✅ |
| Chỉ số theo lĩnh vực, năm | ❌ |
| Kinh phí | 🟡 |
| Chỉ số NCKH sinh viên | ❌ |
| Phân quyền theo vai trò | ✅ |
| Hỏi đáp số liệu bằng tiếng Việt | ❌ |
| AI tạo biểu đồ, dự thảo báo cáo có dẫn nguồn số liệu | 🟡 dự thảo báo cáo có mã chỉ số xong; biểu đồ do AI chưa có |
| Xuất báo cáo điều hành, báo cáo cấp trên | 🟡 (CSV) |

### Nền tảng dùng chung (Buổi 4)

| Cam kết | Hiện trạng |
|---|---|
| Kết nối dịch vụ AI (ChatGPT, Claude, Gemini) do trường tự trả phí | ❌ → **đang build** (quản lý khóa API, tính chi phí) |
| Đăng nhập một lần (UniAIplatform) | ❌ |
| Kết nối hệ thống nhân sự, thư viện qua API | ❌ → UNI-DATA360 giả lập **đang build** |

**Tóm tắt:** phần lõi quy trình (đề tài, công bố, hồ sơ, dashboard cơ bản, phân quyền) đã vững. Phần còn thiếu nhiều nhất:
- các tính năng AI;
- hội đồng chấm điểm;
- luồng NCKH sinh viên;
- kiểm chứng với nguồn mở;
- kinh phí, sở hữu trí tuệ;
- **bản Local cài tại trường**.

## 2. Các vấn đề cần quyết định sớm

1. **Khóa 24 diễn ra 23–24/11/2026 (2 ngày nữa).** Bản hiện tại đủ để trình diễn Buổi 1 (quy trình đề tài), Buổi 3 (khai báo, xác minh công bố, hồ sơ khoa học) và Buổi 4 (dashboard cơ bản). Đến ngày học, các phần sau chưa có:
   - AI (tóm tắt, kiểm tra hồ sơ, hỏi đáp, dự thảo báo cáo);
   - hội đồng chấm điểm;
   - xếp giải NCKH sinh viên;
   - kiểm chứng Crossref.

   Đề xuất Sprint 0 (xem mục 3) để có tối thiểu **AI tóm tắt / kiểm tra thuyết minh, dự thảo báo cáo, kiểm chứng DOI qua Crossref, bộ dữ liệu mẫu có đề tài sinh viên**. Phần còn lại trình bày ở mức "lộ trình", không demo như đã xong.
2. **AI-SRM Local.** Hiện dùng Firestore, Firebase Auth, Cloud Storage. Cài tại trường cần tách lớp dữ liệu. Đề xuất (cần anh/chị chọn):
   - **(A) Khuyến nghị:** thêm lớp repository với 2 bản cài đặt Firestore / PostgreSQL. Tệp lưu Cloud Storage hoặc MinIO. Đăng nhập Firebase Auth hoặc tài khoản nội bộ (Keycloak / OIDC của trường). Đóng gói Docker Compose. Một mã nguồn, hai cách triển khai.
   - (B) Bản Local chạy Firebase Emulator: **không khuyến nghị**, vì emulator không dành cho production.
3. **6 phần mềm là 6 "module" của một mã nguồn.** Bật/tắt theo từng trường (feature flag theo tenant), dùng chung đăng nhập, dữ liệu, AI Gateway. Cách này tránh trùng dữ liệu và đúng hướng UniAIplatform.
4. **HEMIS.** Mục 12 yêu cầu dữ liệu NCKH theo danh mục HEMIS:
   - Nhiệm vụ KHCN: mã, tên, phân loại, phân cấp, lĩnh vực, nguồn kinh phí, tổng kinh phí, tình trạng, đánh giá, sản phẩm, thời gian.
   - Bài báo: tạp chí quốc tế / trong nước, xếp hạng Q, tập/số, trang, năm.
   - Sách: ISBN, NXB, số trang, năm.
   - Giải thưởng, nhóm nghiên cứu mạnh, sáng chế, chuyển giao, cán bộ tham gia và vai trò.

   **Nên bổ sung các trường này vào mô hình dữ liệu AI-SRM ngay từ các phân hệ sắp làm**, để sau này xuất qua UNI-DATA360 → HEMIS không phải nhập lại. Lưu ý: HEMIS yêu cầu mã phiên ký số (`t_k`) — phần ký số thuộc UNI-DATA360 / hệ thống ký số của trường, không làm trong AI-SRM.

## 3. Kế hoạch build

Mỗi sprint kết thúc bằng: chạy local + staging, test tự động, báo cáo ngắn, anh/chị duyệt trước khi sang sprint sau.

### Sprint 0 — Chuẩn bị Khóa 24 (21–22/11/2026) · ưu tiên khẩn

| Hạng mục | Phần mềm |
|---|---|
| AI Center: nạp khóa OpenAI / Claude / Gemini, chọn model, cấu hình giá, tính chi phí, hạn mức tháng — **đang làm** | Nền tảng |
| UNI-DATA360 giả lập: outbox, nhận đơn vị/cán bộ, xuất đề tài/công bố, đối soát — **đang làm** | Nền tảng |
| AI tóm tắt thuyết minh + kiểm tra hồ sơ (nút trên trang đề xuất, kết quả là dự thảo, người dùng xác nhận) | 01, 03 |
| AI dự thảo báo cáo hoạt động khoa học từ số liệu dashboard (dẫn nguồn số liệu) | 06 |
| Kiểm chứng DOI qua Crossref (so sánh tên bài, tạp chí, năm, tác giả; hiển thị sai lệch) | 04 |
| Bộ dữ liệu mẫu bổ sung: đề tài NCKH sinh viên, công bố có DOI thật đã được phép dùng | Tất cả |

### Sprint 1–2 (12/2026) — Hoàn thiện AI-SRM Online cho chuyển giao Quý I/2027

- **Hội đồng và phản biện (M07):**
  - mời thành viên, khai báo xung đột lợi ích;
  - phiếu chấm theo rubric có phiên bản, chấm độc lập, khóa phiếu;
  - tổng hợp, biên bản;
  - tài khoản phản biện ngoài trường có thời hạn.
- **AI gợi ý phản biện:** dựa trên chuyên môn và công bố; loại trừ người có quan hệ (đồng tác giả, cùng đơn vị). Hội đồng quyết định.
- **Trợ lý hỏi đáp quy chế (RAG):** nạp văn bản quy chế, trả lời có trích nguồn, từ chối khi thiếu căn cứ.
- **Nhắc hạn tự động** (Cloud Scheduler) và **gửi email thông báo**.
- **Xuất Word / Excel / PDF theo mẫu:** thuyết minh, biên bản, danh mục đề tài, báo cáo.
- Màn hình phân quyền, ủy quyền, bàn giao hồ sơ.
- **Bổ sung trường dữ liệu theo HEMIS** cho đề tài (phân loại, phân cấp, lĩnh vực, nguồn kinh phí, tình trạng, đánh giá).

### Sprint 3–4 (01–02/2027) — AI-SRM Local + Kinh phí

- Lớp repository + bản PostgreSQL. Lưu tệp MinIO. Đăng nhập nội bộ / OIDC trường. Docker Compose, hướng dẫn cài đặt, sao lưu.
- **Kinh phí và hợp đồng (M08):**
  - dự toán, đề nghị chi;
  - trạng thái giải ngân / quyết toán (nhập từ tài chính, không tự suy ra);
  - hợp đồng đề tài.
- **Nhóm nghiên cứu**, nhóm nghiên cứu mạnh (theo HEMIS).
- Kho minh chứng có phiên bản.

### Sprint 5–6 (03–05/2027) — AI Student Research + AI Publication Verification

- Luồng NCKH sinh viên:
  - đợt riêng, giảng viên hướng dẫn xác nhận, nhật ký hướng dẫn;
  - hội đồng đánh giá theo tiêu chí;
  - xếp giải;
  - thống kê theo khoa / ngành / khóa.
- AI kiểm tra thuyết minh sinh viên, gợi ý nhận xét sơ bộ theo tiêu chí.
- Kiểm chứng công bố đầy đủ:
  - Crossref, ORCID;
  - trích xuất thông tin từ PDF bằng AI, giải thích kết quả;
  - trường HEMIS cho bài báo / sách.

### Sprint 7–8 (06–08/2027) — AI Researcher 360 + Sở hữu trí tuệ, hội thảo

- Nhập công bố từ ORCID. Giải thưởng. Bản đồ năng lực, mạng lưới đồng tác giả, tìm chuyên gia.
- AI tạo lý lịch khoa học và giới thiệu học thuật song ngữ Việt – Anh (người dùng duyệt trước khi công khai).
- Sở hữu trí tuệ / sáng chế, chuyển giao (M13); hội thảo (M12) — theo trường HEMIS.

### Sprint 9–10 (09–11/2027) — AI Research Executive Dashboard + tích hợp

- Chỉ số theo lĩnh vực, năm, NCKH sinh viên, kinh phí. Chốt kỳ số liệu.
- Hỏi đáp số liệu tiếng Việt: AI chuyển câu hỏi thành truy vấn đã kiểm soát, không tự sinh số.
- AI tạo biểu đồ, dự thảo báo cáo điều hành / báo cáo cấp trên có dẫn nguồn số liệu.
- Kết nối UNI-DATA360 thật khi có hợp đồng API. Lập kế hoạch UNI-DATA360 → HEMIS (mục 12).

### Cuối 2027

Tổng kết, đánh giá hiệu quả, tích hợp UniAIplatform (đăng nhập một lần, dùng chung AI Gateway).

## 4. Đối chiếu với lộ trình trong Thư mời (Phụ lục 03)

| Thư mời | Phần mềm | Kế hoạch build | Đáp ứng |
|---|---|---|---|
| 11–12/2026 | Tập huấn, khảo sát | Sprint 0–2 | Demo phần đã có + AI cơ bản |
| Quý I–II/2027 | AI-SRM Local, Online | Online: Sprint 1–2 (12/2026). Local: Sprint 3–4 (02/2027) | Kịp |
| Quý II–III/2027 | Student Research, Publication Verification, Researcher 360 | Sprint 5–8 (03–08/2027) | Kịp |
| Quý III–IV/2027 | Executive Dashboard | Sprint 9–10 (09–11/2027) | Kịp |

## 5. Cần anh/chị quyết định

1. Duyệt Sprint 0 cho Khóa 24 (phạm vi ở mục 3)?
2. Phương án AI-SRM Local: (A) lớp repository + PostgreSQL (khuyến nghị) hay phương án khác?
3. Dùng mô hình "1 mã nguồn – 6 module bật/tắt theo trường"?
4. Nhà cung cấp AI dùng để demo Khóa 24, và ai nhập khóa API (khóa sẽ nhập qua màn hình quản trị, lưu ở Secret Manager)?
