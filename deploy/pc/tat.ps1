# Tắt AI-SRM (bấm đúp TAT_AI-SRM.bat). Dữ liệu được giữ nguyên; mở lại bằng MO_AI-SRM.bat.
. (Join-Path $PSScriptRoot 'chung.ps1')
if (-not (DockerChay)) { Write-Host 'Docker Desktop không chạy — AI-SRM đã tắt.'; return }
docker compose stop | Out-Host
Tot 'Đã tắt AI-SRM. Dữ liệu vẫn được giữ.'
