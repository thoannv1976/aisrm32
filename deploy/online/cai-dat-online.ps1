<#
  Cài đặt AI-SRM bản Online lên project Google Cloud / Firebase CỦA TRƯỜNG.
  Chạy trên máy quản trị (Windows) đã cài: Google Cloud SDK (gcloud), Firebase CLI (firebase), Node.js 22+, pnpm (corepack).
  Tài khoản chạy script cần quyền Owner trên project; project đã gắn tài khoản thanh toán (Billing).

    .\cai-dat-online.ps1 -ProjectId aisrm-abc -MaTruong abc -TenTruong "Trường Đại học ABC" -EmailQuanTri admin@abc.edu.vn [-TepDonVi ..\local\don-vi.mau.csv]

  Chạy lại được (idempotent): bước nào đã có thì bỏ qua; dữ liệu đã có không bị xóa.
#>
param(
  [Parameter(Mandatory = $true)][string]$ProjectId,
  [Parameter(Mandatory = $true)][string]$MaTruong,
  [Parameter(Mandatory = $true)][string]$TenTruong,
  [Parameter(Mandatory = $true)][string]$EmailQuanTri,
  [string]$TenQuanTri = 'Quản trị hệ thống',
  [string]$TepDonVi,
  [string]$Region = 'asia-southeast1',
  [string]$TaiKhoan,  # tài khoản gcloud/firebase dùng để cài (mặc định: tài khoản đang đăng nhập)
  [switch]$BoQuaKhoiTao  # chỉ dựng hạ tầng + triển khai; không khởi tạo trường (vd: bản tập huấn dùng bootstrap-training)
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $root
function Buoc($t) { Write-Host "`n=== $t" -ForegroundColor Cyan }
function Chay([string]$cmd) { Write-Host "> $cmd" -ForegroundColor DarkGray; Invoke-Expression $cmd; if ($LASTEXITCODE -ne 0) { throw "Lệnh thất bại: $cmd" } }
function Thu([scriptblock]$b) { $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'; try { & $b 2>&1 | Where-Object { $_ -isnot [System.Management.Automation.ErrorRecord] } } catch { $null } finally { $ErrorActionPreference = $old } }  # lệnh kiểm tra: lỗi / không tìm thấy -> rỗng
if ($TaiKhoan) { $env:CLOUDSDK_CORE_ACCOUNT = $TaiKhoan }
$env:CLOUDSDK_CORE_PROJECT = $ProjectId
$fbAcc = if ($TaiKhoan) { @('--account', $TaiKhoan) } else { @() }  # mảng; gọi trực tiếp dùng @fbAcc (firebase là script .ps1 — truyền mảng sẽ thành 1 tham số)
$sa = "aisrm-api@$ProjectId.iam.gserviceaccount.com"
$bucket = "$ProjectId-documents"

Buoc '1. Kiểm tra công cụ'
foreach ($c in 'gcloud', 'firebase', 'node', 'pnpm') { if (-not (Get-Command $c -ErrorAction SilentlyContinue)) { throw "Thiếu công cụ: $c" } }
gcloud projects describe $ProjectId --format='value(projectId)' | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Không truy cập được project $ProjectId (kiểm tra tên project, quyền Owner)." }

Buoc '2. Bật các dịch vụ Google Cloud'
Chay 'gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com firestore.googleapis.com firebase.googleapis.com identitytoolkit.googleapis.com secretmanager.googleapis.com storage.googleapis.com iam.googleapis.com'

Buoc '3. Firestore, kho tệp, tài khoản dịch vụ'
$dbs = Thu { gcloud firestore databases list --format='value(name)' }
if (-not ($dbs -match '\(default\)')) { Chay "gcloud firestore databases create --location=$Region --type=firestore-native" } else { Write-Host 'Firestore đã có.' }
$hasBucket = Thu { gcloud storage buckets describe "gs://$bucket" --format='value(name)' }
if (-not $hasBucket) { Chay "gcloud storage buckets create gs://$bucket --location=$Region --uniform-bucket-level-access --public-access-prevention" } else { Write-Host 'Bucket đã có.' }
$hasSa = Thu { gcloud iam service-accounts describe $sa --format='value(email)' }
if (-not $hasSa) { Chay "gcloud iam service-accounts create aisrm-api --display-name=""AI-SRM API""" }
foreach ($r in 'roles/datastore.user', 'roles/firebaseauth.admin') {
  Chay "gcloud projects add-iam-policy-binding $ProjectId --member=serviceAccount:$sa --role=$r --condition=None --quiet --format=none"
}
Chay "gcloud storage buckets add-iam-policy-binding gs://$bucket --member=serviceAccount:$sa --role=roles/storage.objectAdmin --format=none"
# Khóa API AI (OpenAI / Claude / Gemini) của trường: mỗi nhà cung cấp một secret; API chỉ có quyền trên đúng các secret này.
# -MaTruong có thể là danh sách "ftu,ump" — mỗi trường một bộ secret.
foreach ($mt in ($MaTruong -split ',')) { foreach ($p in 'openai', 'anthropic', 'gemini') {
  $s = "aisrm-$($mt.Trim())-$p-api-key"
  $has = Thu { gcloud secrets describe $s --format='value(name)' }
  if (-not $has) { Chay "gcloud secrets create $s --replication-policy=user-managed --locations=$Region" }
  foreach ($r in 'roles/secretmanager.secretVersionAdder', 'roles/secretmanager.secretAccessor', 'roles/secretmanager.secretVersionManager', 'roles/secretmanager.viewer') {
    Chay "gcloud secrets add-iam-policy-binding $s --member=serviceAccount:$sa --role=$r --format=none"
  }
} }

Buoc '4. Firebase và đăng nhập Email/Mật khẩu'
$fbList = Thu { firebase projects:list --json @fbAcc } | Out-String
if ($fbList -notmatch """projectId"": ""$ProjectId""") { Chay "firebase projects:addfirebase $ProjectId $fbAcc" } else { Write-Host 'Firebase đã bật cho project.' }
$apps = firebase apps:list WEB --project $ProjectId --json @fbAcc | ConvertFrom-Json
$app = $apps.result | Where-Object { $_.displayName -eq 'aisrm-web' } | Select-Object -First 1
if (-not $app) { Chay "firebase apps:create WEB aisrm-web --project $ProjectId $fbAcc"; $apps = firebase apps:list WEB --project $ProjectId --json @fbAcc | ConvertFrom-Json; $app = $apps.result | Where-Object { $_.displayName -eq 'aisrm-web' } | Select-Object -First 1 }
$cfg = (firebase apps:sdkconfig WEB $app.appId --project $ProjectId --json @fbAcc | ConvertFrom-Json).result.sdkConfig
if (-not $cfg.apiKey) { throw 'Không lấy được cấu hình ứng dụng web Firebase (apiKey) — kiểm tra quyền tài khoản trên Firebase.' }
$tok = (gcloud auth print-access-token).Trim()
$h = @{ Authorization = "Bearer $tok"; 'x-goog-user-project' = $ProjectId; 'Content-Type' = 'application/json' }
try { Invoke-RestMethod -Method Post -Headers $h -Uri "https://identitytoolkit.googleapis.com/v2/projects/$ProjectId/identityPlatform:initializeAuth" -Body '{}' | Out-Null } catch { }
try {
  Invoke-RestMethod -Method Patch -Headers $h -Uri "https://identitytoolkit.googleapis.com/admin/v2/projects/$ProjectId/config?updateMask=signIn.email" -Body '{"signIn":{"email":{"enabled":true,"passwordRequired":true}}}' | Out-Null
  Write-Host 'Đã bật đăng nhập Email/Mật khẩu.'
} catch { Write-Warning 'Chưa bật được đăng nhập Email/Mật khẩu tự động — vào Firebase Console → Authentication → Sign-in method → Email/Password → Enable.' }

Buoc '5. Triển khai API lên Cloud Run'
# Project mới: Cloud Build dùng tài khoản dịch vụ Compute mặc định để build mã nguồn — cần quyền đọc nguồn, ghi image, ghi log.
$projNum = (gcloud projects describe $ProjectId --format='value(projectNumber)').Trim()
Chay "gcloud projects add-iam-policy-binding $ProjectId --member=serviceAccount:$projNum-compute@developer.gserviceaccount.com --role=roles/run.builder --condition=None --quiet --format=none"
$envVars = "APP_ENV=production,FIREBASE_PROJECT_ID=$ProjectId,GCP_PROJECT_ID=$ProjectId,STORAGE_BUCKET=$bucket,AI_MODE=mock,UNI_DATA360_MODE=disabled,PUBLIC_BASE_URL=https://$ProjectId.web.app,DEFAULT_TIMEZONE=Asia/Ho_Chi_Minh,CORS_ORIGINS=https://$ProjectId.web.app;https://$ProjectId.firebaseapp.com"
Chay "gcloud run deploy aisrm-api --source . --region $Region --service-account $sa --allow-unauthenticated --memory 1Gi --min-instances 0 --max-instances 3 --set-env-vars=""$envVars"" --quiet"

Buoc '6. Build và triển khai giao diện web'
$envFile = "VITE_FIREBASE_API_KEY=$($cfg.apiKey)`nVITE_FIREBASE_AUTH_DOMAIN=$($cfg.authDomain)`nVITE_FIREBASE_PROJECT_ID=$ProjectId`nVITE_USE_EMULATORS=false`n"
[IO.File]::WriteAllText((Join-Path $root 'apps\web\.env.production.local'), $envFile, (New-Object Text.UTF8Encoding $false))
Chay 'pnpm install --frozen-lockfile'
Chay 'pnpm --filter @aisrm/shared build'
Chay 'pnpm --filter @aisrm/web build'
$fbJson = Get-Content firebase.json -Raw
if ($Region -ne 'asia-southeast1') { [IO.File]::WriteAllText((Join-Path $root 'firebase.json'), ($fbJson -replace '"region": "asia-southeast1"', """region"": ""$Region"""), (New-Object Text.UTF8Encoding $false)) }
Chay "firebase deploy --only hosting,firestore:rules,firestore:indexes --project $ProjectId $fbAcc --non-interactive"

if ($BoQuaKhoiTao) { Buoc 'Hoàn tất (bỏ qua khởi tạo trường)'; Write-Host "Địa chỉ: https://$ProjectId.web.app" -ForegroundColor Green; return }
Buoc '7. Khởi tạo trường và tài khoản quản trị'
Write-Host 'Cần Application Default Credentials của tài khoản quản trị (mở trình duyệt nếu chưa có).'
$adc = Thu { gcloud auth application-default print-access-token }
if (-not $adc) { Chay 'gcloud auth application-default login' }
foreach ($k in 'FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST', 'DEPLOY_TARGET', 'DATABASE_URL') { Remove-Item "env:$k" -ErrorAction SilentlyContinue }
$env:APP_ENV = 'production'; $env:FIREBASE_PROJECT_ID = $ProjectId; $env:GCP_PROJECT_ID = $ProjectId; $env:GOOGLE_CLOUD_PROJECT = $ProjectId; $env:GOOGLE_CLOUD_QUOTA_PROJECT = $ProjectId; $env:STORAGE_BUCKET = $bucket
$extra = ''
if ($TepDonVi) { $extra = "--units ""$((Resolve-Path $TepDonVi).Path)""" }
Push-Location apps\api
try {
  $st = npx tsx scripts/local-cli.ts status | Out-String
  if ($st -notmatch "(?m)^$MaTruong\t") {
    Chay "npx tsx scripts/local-cli.ts init --tenant-id $(($MaTruong -split ',')[0]) --tenant-name ""$TenTruong"" --admin-email $EmailQuanTri --admin-name ""$TenQuanTri"" $extra"
  } else { Write-Host "Trường $MaTruong đã có — bỏ qua." }
} finally { Pop-Location }

Buoc 'Hoàn tất'
Write-Host "Địa chỉ: https://$ProjectId.web.app" -ForegroundColor Green
Write-Host 'Việc nên làm tiếp: đặt Budget alert (Billing → Budgets), bật sao lưu Firestore (xem HUONG_DAN_CAI_DAT), gắn tên miền riêng (Firebase Hosting → Add custom domain).'
