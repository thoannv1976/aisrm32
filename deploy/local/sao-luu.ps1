# Sao lưu CSDL + tệp tài liệu vào sao-luu\<thời điểm>. Nên đặt lịch hằng ngày (Task Scheduler) và chép ra máy khác.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$d = Join-Path 'sao-luu' (Get-Date -Format 'yyyyMMdd-HHmmss')
New-Item -ItemType Directory -Force $d | Out-Null
$full = (Resolve-Path $d).Path
# pg_dump ghi vào tệp trong container rồi chép ra (tránh PowerShell đổi mã hóa luồng nhị phân)
docker compose exec -T db sh -c 'pg_dump -U aisrm -Fc aisrm > /tmp/csdl.dump'
docker compose cp db:/tmp/csdl.dump (Join-Path $full 'csdl.dump')
docker compose run --rm --no-deps -T --user root --entrypoint tar -v "${full}:/backup" api czf /backup/tep.tgz -C /data/files .
Copy-Item .env (Join-Path $full 'env.bak')
Write-Host "Đã sao lưu vào $d (csdl.dump, tep.tgz, env.bak — giữ bí mật env.bak)."
