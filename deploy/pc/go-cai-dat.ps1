# Gỡ AI-SRM khỏi PC (GO_CAI_DAT.bat): XÓA toàn bộ dữ liệu trong bản cài này. Không gỡ Docker Desktop và LocalAI.
param([switch]$DongY)
. (Join-Path $PSScriptRoot 'chung.ps1')
Write-Host 'Gỡ AI-SRM sẽ XÓA toàn bộ dữ liệu của bản cài trên máy này (đề tài, tài khoản, tệp đã tải lên).' -ForegroundColor Yellow
if (-not $DongY) {
  $tl = Read-Host 'Gõ XOA (chữ in hoa) để đồng ý gỡ, hoặc Enter để hủy'
  if ($tl -cne 'XOA') { Write-Host 'Đã hủy.'; return }
  $sl = Read-Host 'Sao lưu trước khi gỡ? (C = có / K = không)'
  if ($sl -match '^[cC]') { & (Join-Path $PSScriptRoot 'sao-luu.ps1') }
}
# Chỉ xóa dữ liệu Docker của CHÍNH bản cài này (có .env ở đây và dự án "aisrm" đăng ký tại thư mục này).
$xoaDocker = $false
if (-not (Test-Path .env)) { Write-Host 'Bản cài này chưa chạy (không có .env) — không đụng tới dữ liệu Docker.' }
else {
  try { DamBaoDocker } catch { CanhBao "Docker Desktop không chạy — chưa xóa được dữ liệu AI-SRM trong Docker. Mở Docker Desktop rồi chạy lại GO_CAI_DAT.bat." }
  if (DockerChay) {
    $chu = ThuMucBanCai
    if ($chu -and $chu -ne $PSScriptRoot) { CanhBao "Dữ liệu AI-SRM trên máy thuộc bản cài khác ($(Split-Path $chu -Parent)) — giữ nguyên." }
    else { $xoaDocker = $true }
  }
}
if ($xoaDocker) {
  $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  docker compose down -v --remove-orphans 2>&1 | Out-Host
  docker image rm "aisrm-api:$PhienBan" "aisrm-web:$PhienBan" 2>&1 | Out-Null
  $ErrorActionPreference = $old
}
$port = Cong
Remove-Item .env -ErrorAction SilentlyContinue
try { Remove-Item (Join-Path ([Environment]::GetFolderPath('Desktop')) 'AI-SRM.url') -ErrorAction SilentlyContinue } catch { }
$luat = Get-NetFirewallRule -DisplayName "AI-SRM (cổng $port)" -ErrorAction SilentlyContinue
if ($luat) { if (LaQuanTri) { $luat | Remove-NetFirewallRule } else { CanhBao 'Còn quy tắc tường lửa AI-SRM — xóa bằng: MO_MANG_LAN.bat -Dong (quyền quản trị).' } }
Tot 'Đã gỡ AI-SRM. Có thể xóa thư mục bộ cài.'
