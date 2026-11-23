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
if (DockerChay) {
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
