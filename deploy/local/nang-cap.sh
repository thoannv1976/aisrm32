#!/usr/bin/env bash
# Nâng cấp: chép bộ cài mới (images/, docker-compose.yml, .env.example, script) đè lên thư mục này (giữ .env), rồi chạy ./nang-cap.sh.
# CSDL tự nâng cấp lược đồ khi API khởi động. Nên sao lưu trước.
set -euo pipefail
cd "$(dirname "$0")"
./sao-luu.sh
# Phiên bản mới lấy từ .env.example của bộ cài mới; .env giữ nguyên mật khẩu, khóa.
moi=$(grep -E '^AISRM_VERSION=' .env.example | cut -d= -f2 || true)
if [ -n "$moi" ]; then
  if grep -qE '^AISRM_VERSION=' .env; then sed -i "s/^AISRM_VERSION=.*/AISRM_VERSION=$moi/" .env; else sed -i "1i AISRM_VERSION=$moi" .env; fi
  echo "Phiên bản: $moi"
fi
for f in images/*.tar*; do [ -f "$f" ] && docker load -i "$f"; done
docker compose up -d
echo 'Đã nâng cấp. Kiểm tra: docker compose ps'
