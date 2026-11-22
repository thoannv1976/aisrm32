#!/usr/bin/env bash
# Cài đặt AI-SRM bản Local trên Linux (Ubuntu / Debian / RHEL có Docker Engine + Compose v2).
#
#   Dùng thử với dữ liệu mẫu:   ./cai-dat.sh demo
#   Cài cho trường:             ./cai-dat.sh truong <ma-truong> "<Tên trường>" <email-quan-tri> ["<Họ tên quản trị>"] [don-vi.csv]
#   Biến tùy chọn: HTTP_PORT=8088 ./cai-dat.sh demo · AI=1 (bật container Ollama, cần GPU NVIDIA)
set -euo pipefail
cd "$(dirname "$0")"
buoc() { printf '\n=== %s\n' "$1"; }
MODE="${1:-demo}"

buoc '1. Kiểm tra Docker'
docker version --format '{{.Server.Version}}' >/dev/null 2>&1 || { echo 'Chưa có Docker hoặc Docker chưa chạy (https://docs.docker.com/engine/install/).'; exit 1; }
docker compose version >/dev/null || { echo 'Thiếu Docker Compose v2.'; exit 1; }

buoc '2. Tạo cấu hình .env'
if [ -f .env ]; then
  echo '.env đã có — giữ nguyên.'
else
  rnd() { LC_ALL=C tr -dc 'A-HJ-NP-Za-km-z2-9' </dev/urandom | head -c "$1"; }
  sed -e "s/POSTGRES_PASSWORD=__RANDOM__/POSTGRES_PASSWORD=$(rnd 32)/" \
      -e "s/LOCAL_SECRET_KEY=__RANDOM__/LOCAL_SECRET_KEY=$(rnd 48)/" \
      -e "s/^HTTP_PORT=80$/HTTP_PORT=${HTTP_PORT:-80}/" .env.example > .env
  if [ "${AI:-0}" = "1" ]; then sed -i 's#^LOCAL_AI_BASE_URL=$#LOCAL_AI_BASE_URL=http://ollama:11434#' .env; fi
  chmod 600 .env
  echo 'Đã tạo .env với mật khẩu ngẫu nhiên. Hãy sao lưu tệp này ở nơi an toàn.'
fi
PORT=$(grep '^HTTP_PORT=' .env | cut -d= -f2); PORT=${PORT:-80}

buoc '3. Nạp image'
if ls images/*.tar* >/dev/null 2>&1; then for f in images/*.tar*; do echo "docker load $f"; docker load -i "$f"; done
else echo 'Không có thư mục images/ — dùng image đã có trên máy.'; fi

buoc '4. Khởi động dịch vụ'
if [ "${AI:-0}" = "1" ]; then docker compose --profile ai up -d; else docker compose up -d; fi

buoc '5. Chờ hệ thống sẵn sàng'
for i in $(seq 1 90); do
  if curl -fsS "http://localhost:$PORT/api/v1/health" >/dev/null 2>&1; then OK=1; break; fi
  sleep 2
done
[ "${OK:-0}" = "1" ] || { echo 'Chưa sẵn sàng sau 3 phút. Xem: docker compose logs api'; exit 1; }

buoc '6. Khởi tạo dữ liệu'
CLI="docker compose exec -T api node dist-cli/scripts/local-cli.js"
if $CLI status | grep -q 'Chưa có trường nào'; then
  if [ "$MODE" = "demo" ]; then
    $CLI demo
  else
    [ $# -ge 4 ] || { echo 'Dùng: ./cai-dat.sh truong <ma> "<Tên trường>" <email> ["<Họ tên>"] [don-vi.csv]'; exit 1; }
    EXTRA=()
    if [ -n "${6:-}" ]; then docker compose cp "$6" api:/tmp/don-vi.csv; EXTRA=(--units /tmp/don-vi.csv); fi
    $CLI init --tenant-id "$2" --tenant-name "$3" --admin-email "$4" --admin-name "${5:-Quản trị hệ thống}" "${EXTRA[@]}"
  fi
else
  echo 'Đã có dữ liệu — bỏ qua bước khởi tạo.'; $CLI status
fi

buoc 'Hoàn tất'
echo "Mở trình duyệt: http://<địa chỉ máy chủ>:$PORT   ·   Sao lưu: ./sao-luu.sh   ·   Nhật ký: docker compose logs -f api"
