# Nâng cấp: chép bộ cài mới (images\, docker-compose.yml) đè lên thư mục này (giữ .env), rồi chạy .\nang-cap.ps1.
# CSDL tự nâng cấp lược đồ khi API khởi động. Script tự sao lưu trước.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
& (Join-Path $PSScriptRoot 'sao-luu.ps1')
# Phiên bản mới lấy từ .env.example của bộ cài mới; .env giữ nguyên mật khẩu, khóa.
$moi = ((Get-Content .env.example | Where-Object { $_ -match '^AISRM_VERSION=' }) -replace 'AISRM_VERSION=', '').Trim()
if ($moi) {
  $env_ = Get-Content .env
  if ($env_ -match '^AISRM_VERSION=') { $env_ = $env_ -replace '^AISRM_VERSION=.*$', "AISRM_VERSION=$moi" } else { $env_ = @("AISRM_VERSION=$moi") + $env_ }
  [IO.File]::WriteAllText((Join-Path $PSScriptRoot '.env'), (($env_ -join "`n") + "`n"), (New-Object Text.UTF8Encoding $false))
  Write-Host "Phiên bản: $moi"
}
Get-ChildItem images -Filter '*.tar*' -ErrorAction SilentlyContinue | ForEach-Object { docker load -i $_.FullName }
docker compose up -d
Write-Host 'Đã nâng cấp. Kiểm tra: docker compose ps'
