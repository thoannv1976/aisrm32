# Hướng dẫn sử dụng AI-SRM (bản Local)

- `HUONG_DAN_SU_DUNG.docx`: bản Word để chỉnh sửa và gửi cho trường.
- `HUONG_DAN_SU_DUNG.pdf`: bản PDF để in.
- `anh/`: ảnh chụp màn hình đã đánh số.
- `manifest-all.json`: ghi chú cho từng ảnh.

Mọi ảnh đều chụp trên **dữ liệu mẫu (giả lập)**.

## Tạo lại tài liệu khi giao diện thay đổi

1. Chạy bản Local trên máy phát triển, gồm PostgreSQL (container `aisrm-pg`) và máy chủ AI nội bộ ở cổng 8080:

   ```
   node scripts/dev-local.mjs api      # API, cổng 8092
   node scripts/dev-local.mjs web      # Web, cổng 5174
   ```

2. Chụp lại màn hình:

   ```
   pnpm exec playwright test -c tests/guide/playwright.config.ts
   ```

   - Script nạp lại dữ liệu mẫu vào CSDL `aisrm_dev`.
   - Script mở cửa sổ Chrome và thao tác chậm từng bước.
   - Muốn chạy ẩn thì đặt `GUIDE_HEADLESS=1`.

3. Dựng file Word:

   ```
   node tests/guide/build-docx.cjs
   ```

   - Nội dung diễn giải nằm trong `tests/guide/build-docx.cjs`.
   - Ghi chú ①②③ dưới mỗi hình lấy từ kịch bản chụp, nên luôn khớp với ô đỏ trên ảnh.

4. Mở file `.docx` bằng Word, cập nhật mục lục (bấm chuột phải vào mục lục → Update Field), rồi lưu thành PDF.

## Chức năng mới (hoàn thiện theo Thư mời K24) và hướng dẫn cài đặt

```
GUIDE_HEADLESS=1 pnpm exec playwright test -c tests/guide/playwright.config.ts capture-new   # ảnh N-*.jpg, manifest-moi.json
node tests/guide/build-new.cjs       # HUONG_DAN_CHUC_NANG_MOI.docx, BAI_TAP_CHUC_NANG_MOI.docx
node tests/guide/build-install.cjs   # HUONG_DAN_CAI_DAT_LOCAL.docx, HUONG_DAN_CAI_DAT_ONLINE.docx (từ deploy/*/HUONG_DAN*.md)
```
