<#
  Cài đặt AI-SRM bản Local trên Windows (Docker Desktop) hoặc Windows Server có Docker.

  Tập huấn / dùng thử với dữ liệu mẫu:
    .\cai-dat.ps1 -CheDo demo

  Cài cho trường (dữ liệu thật):
    .\cai-dat.ps1 -CheDo truong -MaTruong abc -TenTruong "Trường Đại học ABC" -EmailQuanTri admin@abc.edu.vn -TepDonVi .\don-vi.csv

  Tùy chọn: -Cong 8088 (cổng web, mặc định 80), -AI (bật container Ollama, cần GPU NVIDIA).
#>
param(
  [ValidateSet('demo', 'truong')][string]$CheDo = 'demo',
  [string]$MaTruong,
  [string]$TenTruong,
  [string]$EmailQuanTri,
  [string]$TenQuanTri = 'Quản trị hệ thống',
  [string]$TepDonVi,
  [int]$Cong = 0,
  [switch]$AI
)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
function Buoc($t) { Write-Host "`n=== $t" -ForegroundColor Cyan }

Buoc '1. Kiểm tra Docker'
try { $v = docker version --format '{{.Server.Version}}' 2>$null } catch { $v = $null }
if (-not $v) { throw 'Chưa có Docker hoặc Docker chưa chạy. Cài Docker Desktop (https://www.docker.com/products/docker-desktop) rồi chạy lại.' }
docker compose version | Out-Null
if (-not $?) { throw 'Thiếu Docker Compose v2 (docker compose).' }
Write-Host "Docker $v — OK"

Buoc '2. Tạo cấu hình .env'
if (Test-Path .env) {
  Write-Host '.env đã có — giữ nguyên (không đổi mật khẩu CSDL, khóa mã hóa).'
} else {
  $chars = [char[]]'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  function NgauNhien([int]$n) { $b = New-Object byte[] $n; $rng.GetBytes($b); -join ($b | ForEach-Object { $chars[$_ % $chars.Length] }) }
  $cfg = [IO.File]::ReadAllText((Join-Path $PSScriptRoot '.env.example'))
  $cfg = $cfg -replace 'POSTGRES_PASSWORD=__RANDOM__', ('POSTGRES_PASSWORD=' + (NgauNhien 32))
  $cfg = $cfg -replace 'LOCAL_SECRET_KEY=__RANDOM__', ('LOCAL_SECRET_KEY=' + (NgauNhien 48))
  if ($Cong -gt 0) { $cfg = $cfg -replace 'HTTP_PORT=80', "HTTP_PORT=$Cong" }
  if ($AI) { $cfg = $cfg -replace 'LOCAL_AI_BASE_URL=\r?\n', "LOCAL_AI_BASE_URL=http://ollama:11434`n" }
  [IO.File]::WriteAllText((Join-Path $PSScriptRoot '.env'), $cfg, (New-Object Text.UTF8Encoding $false))
  Write-Host 'Đã tạo .env với mật khẩu ngẫu nhiên. Hãy sao lưu tệp này ở nơi an toàn.'
}
$port = ((Get-Content .env | Where-Object { $_ -match '^HTTP_PORT=' }) -replace 'HTTP_PORT=', '').Trim()
if (-not $port) { $port = '80' }

Buoc '3. Nạp image'
$img = Get-ChildItem -Path (Join-Path $PSScriptRoot 'images') -Filter '*.tar*' -ErrorAction SilentlyContinue
if ($img) { foreach ($f in $img) { Write-Host "docker load $($f.Name) …"; docker load -i $f.FullName } }
else { Write-Host 'Không có thư mục images\ — dùng image đã có trên máy (hoặc tải từ registry).' }

Buoc '4. Khởi động dịch vụ'
if ($AI) { docker compose --profile ai up -d } else { docker compose up -d }
if (-not $?) { throw 'docker compose up thất bại.' }

Buoc '5. Chờ hệ thống sẵn sàng'
$ok = $false
for ($i = 0; $i -lt 90; $i++) {
  try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 "http://localhost:$port/api/v1/health"; if ($r.StatusCode -eq 200) { $ok = $true; break } } catch { }
  Start-Sleep -Seconds 2
}
if (-not $ok) { throw "Hệ thống chưa sẵn sàng sau 3 phút. Xem nhật ký: docker compose logs api" }
Write-Host 'API sẵn sàng.'

Buoc '6. Khởi tạo dữ liệu'
$status = docker compose exec -T api node dist-cli/scripts/local-cli.js status
if ($status -match 'Chưa có trường nào') {
  if ($CheDo -eq 'demo') {
    docker compose exec -T api node dist-cli/scripts/local-cli.js demo
  } else {
    if (-not $MaTruong -or -not $TenTruong -or -not $EmailQuanTri) { throw 'Chế độ "truong" cần -MaTruong, -TenTruong, -EmailQuanTri.' }
    $extra = @()
    if ($TepDonVi) {
      if (-not (Test-Path $TepDonVi)) { throw "Không thấy tệp đơn vị: $TepDonVi" }
      docker compose cp $TepDonVi api:/tmp/don-vi.csv
      $extra = @('--units', '/tmp/don-vi.csv')
    }
    docker compose exec -T api node dist-cli/scripts/local-cli.js init --tenant-id $MaTruong --tenant-name $TenTruong --admin-email $EmailQuanTri --admin-name $TenQuanTri @extra
  }
  if (-not $?) { throw 'Khởi tạo dữ liệu thất bại.' }
} else {
  Write-Host 'Đã có dữ liệu — bỏ qua bước khởi tạo:'
  $status
}

Buoc 'Hoàn tất'
Write-Host "Mở trình duyệt: http://localhost:$port  (máy khác trong mạng trường: http://<địa chỉ IP máy chủ>:$port)" -ForegroundColor Green
Write-Host 'Sao lưu hằng ngày: .\sao-luu.ps1   ·   Nhật ký: docker compose logs -f api'
