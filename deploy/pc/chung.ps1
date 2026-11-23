# Hàm dùng chung cho bộ cài AI-SRM trên PC (Windows 10/11 + Docker Desktop). Các script khác nạp tệp này bằng ". .\chung.ps1".
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }

$PhienBan = '1.0.1'
$KhongPhaiHoiThoai = 'embed|rerank|whisper|wav2vec|piper|vits|tts|stable-?diffusion|sdxl|flux|bark|clip|asr'
# Thứ tự ưu tiên theo kết quả đo 22/11/2026 (bộ câu hỏi quy chế 52 câu) trên GPU 8 GB.
$ModelUuTien = @('qwen3.8-4b-q4', 'granite-4.2-8b-q4', 'ornith-1.5-9b-q4', 'qwen3:8b', 'qwen3:4b', 'gemma3:4b')

function Buoc($t) { Write-Host "`n=== $t" -ForegroundColor Cyan }
function Tot($t) { Write-Host $t -ForegroundColor Green }
function CanhBao($t) { Write-Host "Lưu ý: $t" -ForegroundColor Yellow }

# Chạy lệnh ngoài (docker…) mà không dừng script khi lệnh ghi ra stderr; trả về stdout.
function Thu([scriptblock]$b) {
  $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { & $b 2>&1 | Where-Object { $_ -isnot [System.Management.Automation.ErrorRecord] } } catch { $null } finally { $ErrorActionPreference = $old }
}

function DocEnv([string]$ten) {
  if (-not (Test-Path .env)) { return $null }
  $l = Get-Content .env -Encoding UTF8 | Where-Object { $_ -match "^$ten=" } | Select-Object -First 1
  if ($l) { return ($l -replace "^$ten=", '').Trim() }
  return $null
}

function GhiEnv([string]$ten, [string]$giaTri) {
  $lines = @(Get-Content .env -Encoding UTF8)
  $co = $false
  $lines = $lines | ForEach-Object { if ($_ -match "^$ten=") { $co = $true; "$ten=$giaTri" } else { $_ } }
  if (-not $co) { $lines += "$ten=$giaTri" }
  [IO.File]::WriteAllText((Join-Path $PSScriptRoot '.env'), (($lines -join "`n") + "`n"), (New-Object Text.UTF8Encoding $false))
}

function DockerChay { [bool](Thu { docker version --format '{{.Server.Version}}' }) }

function DamBaoDocker {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Chưa cài Docker Desktop. Cài theo Hướng dẫn cài trên PC (mục 2), khởi động lại máy rồi chạy lại.'
  }
  if (DockerChay) { return }
  $exe = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
  if (-not (Test-Path $exe)) { throw 'Không tìm thấy Docker Desktop. Hãy mở Docker Desktop bằng tay rồi chạy lại.' }
  Write-Host 'Đang mở Docker Desktop (có thể mất 1–3 phút)…'
  Start-Process $exe
  for ($i = 0; $i -lt 120; $i++) {
    Start-Sleep -Seconds 2
    if (DockerChay) { Tot 'Docker đã sẵn sàng.'; return }
  }
  throw 'Docker Desktop chưa sẵn sàng sau 4 phút. Mở Docker Desktop, chờ báo "Engine running" rồi chạy lại.'
}

function Cong { $p = DocEnv 'HTTP_PORT'; if ($p) { return $p } else { return '8088' } }

function ChoSanSang([string]$port, [int]$giay = 240) {
  for ($i = 0; $i -lt ($giay / 2); $i++) {
    try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 "http://localhost:$port/api/v1/health"; if ($r.StatusCode -eq 200) { return $true } } catch { }
    Start-Sleep -Seconds 2
  }
  return $false
}

# Lệnh quản trị trong container api (init / demo / status / ai).
function GoiCli { $a = $args; Thu { docker compose exec -T api node dist-cli/scripts/local-cli.js @a } }
function GoiCliMa {
  $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { docker compose exec -T api node dist-cli/scripts/local-cli.js @args 2>&1 | ForEach-Object { "$_" } } finally { $ErrorActionPreference = $old }
  return $LASTEXITCODE
}

# Tìm máy chủ AI (LocalAI cổng 8080, Ollama cổng 11434) đang chạy trên máy này hoặc theo địa chỉ chỉ định.
function TimMayChuAI([string]$diaChi, [string]$khoa) {
  $ds = if ($diaChi) { @($diaChi) } else { @('http://localhost:8080', 'http://localhost:11434') }
  $h = @{}
  if ($khoa) { $h['Authorization'] = "Bearer $khoa" }
  foreach ($u in $ds) {
    $u = ($u.Trim().TrimEnd('/')) -replace '/v1$', ''
    try {
      $r = Invoke-RestMethod -TimeoutSec 8 -Headers $h "$u/v1/models"
      $ids = @($r.data | ForEach-Object { $_.id } | Where-Object { $_ })
      if ($ids.Count -gt 0) {
        return [pscustomobject]@{
          DiaChi       = $u
          # Container api gọi máy chủ AI trên chính PC qua host.docker.internal
          DiaChiTrongDocker = ($u -replace '//(localhost|127\.0\.0\.1)(?=[:/]|$)', '//host.docker.internal')
          Models       = $ids
          HoiThoai     = @($ids | Where-Object { $_ -notmatch $KhongPhaiHoiThoai })
        }
      }
    } catch { }
  }
  return $null
}

function ChonModel($ai, [string]$yeuCau) {
  if ($yeuCau) {
    if ($ai.Models -contains $yeuCau) { return $yeuCau }
    throw "Máy chủ AI không có model ""$yeuCau"". Có: $($ai.HoiThoai -join ', ')"
  }
  foreach ($m in $ModelUuTien) { if ($ai.HoiThoai -contains $m) { return $m } }
  if ($ai.HoiThoai.Count -gt 0) { return $ai.HoiThoai[0] }
  return $null
}

# Bật AI thật cho mọi trường trong bản cài: ghi địa chỉ vào .env, khởi động lại api, khai báo model, làm nóng.
function BatAI($ai, [string]$model, [string]$khoa) {
  $cu = DocEnv 'LOCAL_AI_BASE_URL'
  $khoaCu = DocEnv 'LOCAL_AI_API_KEY'
  if ($cu -ne $ai.DiaChiTrongDocker -or ($khoa -and $khoa -ne $khoaCu)) {
    GhiEnv 'LOCAL_AI_BASE_URL' $ai.DiaChiTrongDocker
    if ($khoa) { GhiEnv 'LOCAL_AI_API_KEY' $khoa }
    Write-Host 'Áp dụng địa chỉ máy chủ AI mới (khởi động lại api)…'
    Thu { docker compose up -d } | Out-Null
    if (-not (ChoSanSang (Cong))) { throw 'API chưa sẵn sàng sau khi khởi động lại. Xem: docker compose logs api' }
  }
  $out = GoiCliMa ai --model $model --warmup
  $ma = $out[-1]; $out | Select-Object -SkipLast 1 | ForEach-Object { Write-Host $_ }
  if ($ma -ne 0) { throw 'Không bật được AI nội bộ (xem thông báo ở trên).' }
}

function DiaChiLAN {
  try {
    Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
      Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and $_.InterfaceAlias -notmatch 'vEthernet|WSL|Loopback|Docker|VirtualBox|VMware' -and $_.PrefixOrigin -ne 'WellKnown' } |
      Select-Object -ExpandProperty IPAddress
  } catch { @() }
}

function LaQuanTri { ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) }

function TaoLoiTat([string]$port) {
  try {
    $desk = [Environment]::GetFolderPath('Desktop')
    [IO.File]::WriteAllText((Join-Path $desk 'AI-SRM.url'), "[InternetShortcut]`r`nURL=http://localhost:$port/`r`n", [Text.Encoding]::ASCII)
  } catch { CanhBao 'Không tạo được biểu tượng trên màn hình.' }
}
