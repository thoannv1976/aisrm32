# Mở AI-SRM (bấm đúp MO_AI-SRM.bat): bật Docker Desktop nếu cần, khởi động dịch vụ, mở trình duyệt.
. (Join-Path $PSScriptRoot 'chung.ps1')
if (-not (Test-Path .env)) { throw 'Chưa cài AI-SRM trên máy này — chạy CAI_DAT.bat trước.' }
DamBaoDocker
docker compose up -d | Out-Host
$port = Cong
Write-Host 'Đang chờ hệ thống sẵn sàng…'
if (-not (ChoSanSang $port)) { throw 'Hệ thống chưa sẵn sàng sau 4 phút. Bấm đúp KIEM_TRA.bat để xem lỗi.' }
Tot "AI-SRM đang chạy: http://localhost:$port"
foreach ($ip in @(DiaChiLAN)) { if ((DocEnv 'HTTP_BIND') -ne '127.0.0.1') { Tot "Máy khác trong LAN: http://${ip}:$port" } }
if (-not $KhongMoTrinhDuyet) { Start-Process "http://localhost:$port/" }
