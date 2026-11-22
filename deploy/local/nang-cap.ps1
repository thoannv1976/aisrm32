# Nâng cấp: chép bộ cài mới (images\, docker-compose.yml) đè lên thư mục này (giữ .env), rồi chạy .\nang-cap.ps1.
# CSDL tự nâng cấp lược đồ khi API khởi động. Script tự sao lưu trước.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
& (Join-Path $PSScriptRoot 'sao-luu.ps1')
Get-ChildItem images -Filter '*.tar*' -ErrorAction SilentlyContinue | ForEach-Object { docker load -i $_.FullName }
docker compose up -d
Write-Host 'Đã nâng cấp. Kiểm tra: docker compose ps'
