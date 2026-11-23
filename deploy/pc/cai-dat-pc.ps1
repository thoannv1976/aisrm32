<#
  Cài AI-SRM trên PC (Windows 10/11 + Docker Desktop) với dữ liệu mẫu tập huấn, tự nối LocalAI / Ollama có sẵn trên máy.
  Thường chạy bằng cách bấm đúp CAI_DAT.bat. Tùy chọn (chạy từ PowerShell):
    -Cong 8088          cổng web (mặc định 8088; bận thì tự chọn cổng trống kế tiếp)
    -DiaChiAI <url>     địa chỉ máy chủ AI (mặc định tự tìm http://localhost:8080 rồi http://localhost:11434)
    -ModelAI <mã>       model hội thoại dùng cho AI-SRM (mặc định tự chọn)
    -KhoaAI <khóa>      khóa truy cập LocalAI nếu có bật API_KEY
    -KhongAI            không nối AI nội bộ (AI giả lập)
    -ChiMayNay          chỉ truy cập trên chính máy này (không mở cho máy khác trong LAN)
    -KhongMoTrinhDuyet  không tự mở trình duyệt khi xong
    -KhongTaoLoiTat     không tạo biểu tượng trên màn hình (bộ cài .exe tự tạo)
#>
param(
  [int]$Cong = 8088,
  [string]$DiaChiAI,
  [string]$ModelAI,
  [string]$KhoaAI,
  [switch]$KhongAI,
  [switch]$ChiMayNay,
  [switch]$KhongMoTrinhDuyet,
  [switch]$KhongTaoLoiTat
)
. (Join-Path $PSScriptRoot 'chung.ps1')
try { Start-Transcript -Path (Join-Path $PSScriptRoot 'cai-dat.log') -Force | Out-Null } catch { }
Write-Host "AI-SRM $PhienBan — cài đặt trên PC" -ForegroundColor White

Buoc '1. Kiểm tra máy'
if (-not [Environment]::Is64BitOperatingSystem) { throw 'Cần Windows 64-bit.' }
$ramGb = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)
$o = (Get-Item $PSScriptRoot).PSDrive
$trongGb = [math]::Round((Get-PSDrive $o.Name).Free / 1GB)
Write-Host "Windows $([Environment]::OSVersion.Version) · RAM $ramGb GB · ổ $($o.Name): còn trống $trongGb GB"
if ($ramGb -lt 8) { CanhBao 'RAM dưới 8 GB — hệ thống có thể chạy chậm.' }
if ($trongGb -lt 5) { throw "Ổ $($o.Name): còn dưới 5 GB trống." }

Buoc '2. Kiểm tra Docker Desktop'
DamBaoDocker
Write-Host "Docker $(Thu { docker version --format '{{.Server.Version}}' }) — OK"

Buoc '3. Tìm máy chủ AI nội bộ (LocalAI / Ollama)'
$ai = $null; $model = $null
if ($KhongAI) { Write-Host 'Bỏ qua theo yêu cầu (-KhongAI): dùng AI giả lập.' }
else {
  $ai = TimMayChuAI $DiaChiAI $KhoaAI
  if (-not $ai) {
    CanhBao 'Không thấy LocalAI / Ollama đang chạy trên máy này. AI-SRM vẫn cài với AI giả lập; khi LocalAI chạy, bấm đúp CAU_HINH_AI.bat.'
  } else {
    $model = ChonModel $ai $ModelAI
    Write-Host "Máy chủ AI: $($ai.DiaChi) — $($ai.HoiThoai.Count) model hội thoại: $($ai.HoiThoai -join ', ')"
    if ($model) { Tot "Dùng model: $model" } else { CanhBao 'Máy chủ AI không có model hội thoại — dùng AI giả lập.'; $ai = $null }
  }
}

Buoc '4. Tạo cấu hình .env'
if (Test-Path .env) {
  Write-Host '.env đã có — giữ nguyên mật khẩu CSDL và khóa mã hóa.'
} else {
  # Bản cài khác (thư mục khác) đang giữ dữ liệu: không tạo .env mới (mật khẩu CSDL sẽ không khớp).
  $khac = ThuMucBanCai
  if ($khac -and $khac -ne $PSScriptRoot) {
    throw "Máy đã có AI-SRM cài ở thư mục khác: $(Split-Path $khac -Parent). Gỡ bản đó trước (GO_CAI_DAT.bat trong thư mục đó, hoặc Settings → Apps), rồi cài lại."
  }
  if (Thu { docker volume ls -q --filter name=^aisrm_db$ }) {
    throw 'Máy còn dữ liệu AI-SRM của một bản cài trước (volume aisrm_db). Gỡ bản cũ bằng GO_CAI_DAT.bat của bản đó; hoặc nếu không cần dữ liệu cũ: docker volume rm aisrm_db aisrm_files'
  }
  # Chọn cổng trống
  $dangDung = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort)
  $p = $Cong
  while ($dangDung -contains $p -and $p -lt $Cong + 20) { $p++ }
  if ($p -ne $Cong) { CanhBao "Cổng $Cong đang bận — dùng cổng $p." }
  $chars = [char[]]'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  function NgauNhien([int]$n) { $b = New-Object byte[] $n; $rng.GetBytes($b); -join ($b | ForEach-Object { $chars[$_ % $chars.Length] }) }
  $cfg = [IO.File]::ReadAllText((Join-Path $PSScriptRoot '.env.example'))
  $cfg = $cfg -replace 'POSTGRES_PASSWORD=__RANDOM__', ('POSTGRES_PASSWORD=' + (NgauNhien 32))
  $cfg = $cfg -replace 'LOCAL_SECRET_KEY=__RANDOM__', ('LOCAL_SECRET_KEY=' + (NgauNhien 48))
  $cfg = $cfg -replace '(?m)^HTTP_PORT=.*$', "HTTP_PORT=$p"
  if ($ChiMayNay) { $cfg = $cfg -replace '(?m)^HTTP_BIND=.*$', 'HTTP_BIND=127.0.0.1' }
  if ($ai) { $cfg = $cfg -replace '(?m)^LOCAL_AI_BASE_URL=.*$', "LOCAL_AI_BASE_URL=$($ai.DiaChiTrongDocker)" }
  if ($KhoaAI) { $cfg = $cfg -replace '(?m)^LOCAL_AI_API_KEY=.*$', "LOCAL_AI_API_KEY=$KhoaAI" }
  [IO.File]::WriteAllText((Join-Path $PSScriptRoot '.env'), $cfg, (New-Object Text.UTF8Encoding $false))
  Write-Host 'Đã tạo .env (mật khẩu ngẫu nhiên). Không chia sẻ tệp này.'
}
$port = Cong

Buoc '5. Nạp phần mềm AI-SRM (image Docker)'
$co = (Thu { docker image inspect "aisrm-api:$PhienBan" --format '{{.Id}}' }) -and (Thu { docker image inspect "aisrm-web:$PhienBan" --format '{{.Id}}' }) -and (Thu { docker image inspect 'postgres:17-alpine' --format '{{.Id}}' })
if ($co) { Write-Host 'Image đã có trên máy — bỏ qua.' }
else {
  $img = Get-ChildItem -Path (Join-Path $PSScriptRoot 'images') -Filter '*.tar*' -ErrorAction SilentlyContinue
  if (-not $img) { throw 'Thiếu thư mục he-thong\images — hãy giải nén đầy đủ bộ cài.' }
  foreach ($f in $img) { Write-Host "Đang nạp $($f.Name) (1–3 phút)…"; docker load -i $f.FullName | Out-Host; if ($LASTEXITCODE -ne 0) { throw 'Nạp image thất bại.' } }
}

Buoc '6. Khởi động AI-SRM'
docker compose up -d | Out-Host
if ($LASTEXITCODE -ne 0) { throw 'Khởi động thất bại. Xem: docker compose logs' }
Write-Host 'Đang chờ hệ thống sẵn sàng…'
if (-not (ChoSanSang $port)) { throw 'Hệ thống chưa sẵn sàng sau 4 phút. Bấm đúp KIEM_TRA.bat để xem lỗi.' }
Tot 'Hệ thống đã chạy.'

Buoc '7. Nạp dữ liệu mẫu tập huấn'
$st = GoiCli status
if ($st -match 'Chưa có trường nào') {
  $out = GoiCliMa demo
  $out | Select-Object -SkipLast 1 | ForEach-Object { Write-Host $_ }
  if ($out[-1] -ne 0) { throw 'Nạp dữ liệu mẫu thất bại.' }
} else {
  Write-Host 'Đã có dữ liệu — giữ nguyên:'; $st | ForEach-Object { Write-Host "  $_" }
}

Buoc '8. Bật AI nội bộ'
if ($ai -and $model) {
  try { BatAI $ai $model $KhoaAI; Tot "AI-SRM dùng AI nội bộ: $model ($($ai.DiaChi))." }
  catch { CanhBao "$($_.Exception.Message) — tạm dùng AI giả lập; sửa xong bấm đúp CAU_HINH_AI.bat." }
} else { Write-Host 'AI giả lập (không tốn tài nguyên). Bật AI nội bộ sau: bấm đúp CAU_HINH_AI.bat.' }

Buoc '9. Mạng LAN'
$lan = @(DiaChiLAN)
if ($ChiMayNay -or (DocEnv 'HTTP_BIND') -eq '127.0.0.1') { Write-Host 'Chỉ truy cập trên máy này (-ChiMayNay).' }
else {
  $luat = Get-NetFirewallRule -DisplayName "AI-SRM (cổng $port)" -ErrorAction SilentlyContinue
  if ($luat) { Write-Host 'Tường lửa Windows đã mở cổng cho LAN.' }
  else { CanhBao "Để máy khác trong LAN truy cập: bấm đúp MO_MANG_LAN.bat (cần quyền quản trị) để mở cổng $port trên tường lửa." }
}
if (-not $KhongTaoLoiTat) { TaoLoiTat $port }

Buoc 'Hoàn tất'
Tot "Trên máy này:     http://localhost:$port"
if (-not $ChiMayNay) { foreach ($ip in $lan) { Tot "Máy khác trong LAN: http://${ip}:$port" } }
Write-Host 'Đăng nhập bằng tài khoản mẫu ở trên (giống tài liệu Bài tập thực hành).'
Write-Host 'Hằng ngày: MO_AI-SRM.bat (mở) · TAT_AI-SRM.bat (tắt) · KIEM_TRA.bat (kiểm tra) · SAO_LUU.bat (sao lưu).'
if (-not $KhongMoTrinhDuyet) { Start-Process "http://localhost:$port/" }
