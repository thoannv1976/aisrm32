<#
  Bật / đổi / tắt AI nội bộ cho AI-SRM trên PC (bấm đúp CAU_HINH_AI.bat).
    -DiaChiAI <url>  địa chỉ máy chủ AI (mặc định tự tìm LocalAI :8080, Ollama :11434 trên máy này)
    -ModelAI <mã>    model hội thoại (mặc định tự chọn; xem danh sách in ra)
    -KhoaAI <khóa>   khóa truy cập LocalAI nếu có
    -GiaLap          trở lại AI giả lập
#>
param([string]$DiaChiAI, [string]$ModelAI, [string]$KhoaAI, [switch]$GiaLap)
. (Join-Path $PSScriptRoot 'chung.ps1')
if (-not (Test-Path .env)) { throw 'Chưa cài AI-SRM trên máy này — chạy CAI_DAT.bat trước.' }
DamBaoDocker
Thu { docker compose up -d } | Out-Null
if (-not (ChoSanSang (Cong))) { throw 'AI-SRM chưa chạy. Bấm đúp KIEM_TRA.bat để xem lỗi.' }
if ($GiaLap) {
  GoiCliMa ai --mock | Select-Object -SkipLast 1 | ForEach-Object { Write-Host $_ }
  return
}
Buoc 'Tìm máy chủ AI nội bộ'
$ai = TimMayChuAI $DiaChiAI $KhoaAI
if (-not $ai) { throw 'Không kết nối được LocalAI / Ollama. Kiểm tra LocalAI đã chạy (mở http://localhost:8080 trên trình duyệt) rồi chạy lại.' }
Write-Host "Máy chủ AI: $($ai.DiaChi)"
Write-Host 'Model hội thoại có sẵn:'
$ai.HoiThoai | ForEach-Object { Write-Host "  - $_" }
$model = ChonModel $ai $ModelAI
if (-not $model) { throw 'Máy chủ AI chưa có model hội thoại nào.' }
Write-Host "Chọn: $model   (đổi model: CAU_HINH_AI.bat -ModelAI <mã>)"
Buoc 'Bật AI nội bộ cho AI-SRM'
BatAI $ai $model $KhoaAI
Tot "Xong. Vào AI Center để xem; mọi chức năng AI dùng $model."
