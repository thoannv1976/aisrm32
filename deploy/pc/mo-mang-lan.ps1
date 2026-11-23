# Mở cổng AI-SRM trên tường lửa Windows để máy khác trong LAN truy cập (MO_MANG_LAN.bat — cần quyền quản trị).
#   -Dong   xóa quy tắc đã mở
param([switch]$Dong)
. (Join-Path $PSScriptRoot 'chung.ps1')
if (-not (LaQuanTri)) { throw 'Cần chạy bằng quyền quản trị (chuột phải MO_MANG_LAN.bat → Run as administrator).' }
$port = Cong
$ten = "AI-SRM (cổng $port)"
Get-NetFirewallRule -DisplayName $ten -ErrorAction SilentlyContinue | Remove-NetFirewallRule
if ($Dong) { Tot "Đã đóng cổng $port."; return }
# Chỉ mạng riêng / miền (Private, Domain) — không mở trên mạng công cộng (Public).
New-NetFirewallRule -DisplayName $ten -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow -Profile Private, Domain | Out-Null
Tot "Đã mở cổng $port cho mạng riêng / miền."
$pub = Get-NetConnectionProfile -ErrorAction SilentlyContinue | Where-Object { $_.NetworkCategory -eq 'Public' }
if ($pub) { CanhBao "Mạng ""$($pub.Name -join ', ')"" đang để Public — máy khác chưa vào được. Đổi sang Private: Settings → Network → (mạng đang dùng) → Private network." }
foreach ($ip in @(DiaChiLAN)) { Tot "Máy khác trong LAN: http://${ip}:$port" }
