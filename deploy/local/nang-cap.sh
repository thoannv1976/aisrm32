#!/usr/bin/env bash
# Nâng cấp: chép bộ cài mới (images/, docker-compose.yml) đè lên thư mục này (giữ .env), rồi chạy ./nang-cap.sh.
# CSDL tự nâng cấp lược đồ khi API khởi động. Nên sao lưu trước.
set -euo pipefail
cd "$(dirname "$0")"
./sao-luu.sh
for f in images/*.tar*; do [ -f "$f" ] && docker load -i "$f"; done
docker compose up -d
echo 'Đã nâng cấp. Kiểm tra: docker compose ps'
