# Khôi phục: .\khoi-phuc.ps1 sao-luu\20261122-210000   — CẢNH BÁO: ghi đè toàn bộ dữ liệu hiện tại.
param([Parameter(Mandatory = $true)][string]$ThuMuc)
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }
Set-Location $PSScriptRoot
$full = (Resolve-Path $ThuMuc).Path
if (-not (Test-Path (Join-Path $full 'csdl.dump'))) { throw "Không thấy $ThuMuc\csdl.dump" }
$x = Read-Host "Ghi đè toàn bộ dữ liệu hiện tại bằng bản $ThuMuc? Gõ KHOIPHUC để tiếp tục"
if ($x -ne 'KHOIPHUC') { exit 1 }
docker compose stop api web
docker compose cp (Join-Path $full 'csdl.dump') db:/tmp/csdl.dump
docker compose exec -T db pg_restore -U aisrm -d aisrm --clean --if-exists /tmp/csdl.dump
docker compose run --rm --no-deps -T --user root --entrypoint sh -v "${full}:/backup" api -c 'rm -rf /data/files/* && tar xzf /backup/tep.tgz -C /data/files && chown -R node:node /data/files'
docker compose up -d
Write-Host 'Đã khôi phục.'
