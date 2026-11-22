#!/usr/bin/env bash
# Sao lưu CSDL + tệp tài liệu vào thư mục sao-luu/<thời điểm>. Nên chạy hằng ngày (cron) và chép ra máy khác.
set -euo pipefail
cd "$(dirname "$0")"
D="sao-luu/$(date +%Y%m%d-%H%M%S)"; mkdir -p "$D"
docker compose exec -T db pg_dump -U aisrm -Fc aisrm > "$D/csdl.dump"
docker compose run --rm --no-deps -T --user root --entrypoint tar -v "$PWD/$D:/backup" api czf /backup/tep.tgz -C /data/files .
cp .env "$D/env.bak"
echo "Đã sao lưu vào $D (csdl.dump, tep.tgz, env.bak — giữ bí mật env.bak)."
