#!/usr/bin/env bash
# Khôi phục từ một bản sao lưu: ./khoi-phuc.sh sao-luu/20261122-210000
# CẢNH BÁO: ghi đè toàn bộ dữ liệu hiện tại.
set -euo pipefail
cd "$(dirname "$0")"
D="${1:?Cần đường dẫn thư mục sao lưu}"
[ -f "$D/csdl.dump" ] || { echo "Không thấy $D/csdl.dump"; exit 1; }
read -r -p "Ghi đè toàn bộ dữ liệu hiện tại bằng bản $D? Gõ KHOIPHUC để tiếp tục: " X; [ "$X" = "KHOIPHUC" ] || exit 1
docker compose stop api web
docker compose exec -T db pg_restore -U aisrm -d aisrm --clean --if-exists < "$D/csdl.dump"
docker compose run --rm --no-deps -T --user root --entrypoint sh -v "$PWD/$D:/backup" api -c 'rm -rf /data/files/* && tar xzf /backup/tep.tgz -C /data/files && chown -R node:node /data/files'
docker compose up -d
echo 'Đã khôi phục.'
