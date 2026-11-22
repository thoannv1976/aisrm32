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
  [string]$TaiKhoan  # tài khoản gcloud/firebase dùng để cài (mặc định: tài khoản đang đăng nhập)
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $root
function Buoc($t) { Write-Host "`n=== $t" -ForegroundColor Cyan }
function Chay([string]$cmd) { Write-Host "> $cmd" -ForegroundColor DarkGray; Invoke-Expression $cmd; if ($LASTEXITCODE -ne 0) { throw "Lệnh thất bại: $cmd" } }
if ($TaiKhoan) { $env:CLOUDSDK_CORE_ACCOUNT = $TaiKhoan }
$env:CLOUDSDK_CORE_PROJECT = $ProjectId
$fbAcc = if ($TaiKhoan) { "--account $TaiKhoan" } else { '' }
$sa = "aisrm-api@$ProjectId.iam.gserviceaccount.com"
$bucket = "$ProjectId-documents"

Buoc '1. Kiểm tra công cụ'
foreach ($c in 'gcloud', 'firebase', 'node', 'pnpm') { if (-not (Get-Command $c -ErrorAction SilentlyContinue)) { throw "Thiếu công cụ: $c" } }
gcloud projects describe $ProjectId --format='value(projectId)' | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Không truy cập được project $ProjectId (kiểm tra tên project, quyền Owner)." }

Buoc '2. Bật các dịch vụ Google Cloud'
Chay 'gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com firestore.googleapis.com firebase.googleapis.com identitytoolkit.googleapis.com secretmanager.googleapis.com storage.googleapis.com iam.googleapis.com'

Buoc '3. Firestore, kho tệp, tài khoản dịch vụ'
$dbs = gcloud firestore databases list --format='value(name)' 2>$null
if (-not ($dbs -match '\(default\)')) { Chay "gcloud firestore databases create --location=$Region --type=firestore-native" } else { Write-Host 'Firestore đã có.' }
$hasBucket = gcloud storage buckets describe "gs://$bucket" --format='value(name)' 2>$null
if (-not $hasBucket) { Chay "gcloud storage buckets create gs://$bucket --location=$Region --uniform-bucket-level-access --public-access-prevention" } else { Write-Host 'Bucket đã có.' }
$hasSa = gcloud iam service-accounts describe $sa --format='value(email)' 2>$null
if (-not $hasSa) { Chay "gcloud iam service-accounts create aisrm-api --display-name=""AI-SRM API""" }
foreach ($r in 'roles/datastore.user', 'roles/firebaseauth.admin') {
  Chay "gcloud projects add-iam-policy-binding $ProjectId --member=serviceAccount:$sa --role=$r --condition=None --quiet --format=none"
}
Chay "gcloud storage buckets add-iam-policy-binding gs://$bucket --member=serviceAccount:$sa --role=roles/storage.objectAdmin --format=none"
# Khóa API AI (OpenAI / Claude / Gemini) của trường: mỗi nhà cung cấp một secret; API chỉ có quyền trên đúng các secret này.
foreach ($p in 'openai', 'anthropic', 'gemini') {
  $s = "aisrm-$MaTruong-$p-api-key"
  $has = gcloud secrets describe $s --format='value(name)' 2>$null
  if (-not $has) { Chay "gcloud secrets create $s --replication-policy=user-managed --locations=$Region" }
  foreach ($r in 'roles/secretmanager.secretVersionAdder', 'roles/secretmanager.secretAccessor', 'roles/secretmanager.secretVersionManager', 'roles/secretmanager.viewer') {
    Chay "gcloud secrets add-iam-policy-binding $s --member=serviceAccount:$sa --role=$r --format=none"
  }
}

Buoc '4. Firebase và đăng nhập Email/Mật khẩu'
$fbList = firebase projects:list --json $fbAcc 2>$null | Out-String
if ($fbList -notmatch """projectId"": ""$ProjectId""") { Chay "firebase projects:addfirebase $ProjectId $fbAcc" } else { Write-Host 'Firebase đã bật cho project.' }
$apps = firebase apps:list WEB --project $ProjectId --json $fbAcc | ConvertFrom-Json
$app = $apps.result | Where-Object { $_.displayName -eq 'aisrm-web' } | Select-Object -First 1
if (-not $app) { Chay "firebase apps:create WEB aisrm-web --project $ProjectId $fbAcc"; $apps = firebase apps:list WEB --project $ProjectId --json $fbAcc | ConvertFrom-Json; $app = $apps.result | Where-Object { $_.displayName -eq 'aisrm-web' } | Select-Object -First 1 }
$cfg = (firebase apps:sdkconfig WEB $app.appId --project $ProjectId --json $fbAcc | ConvertFrom-Json).result.sdkConfig
$tok = (gcloud auth print-access-token).Trim()
$h = @{ Authorization = "Bearer $tok"; 'x-goog-user-project' = $ProjectId; 'Content-Type' = 'application/json' }
try { Invoke-RestMethod -Method Post -Headers $h -Uri "https://identitytoolkit.googleapis.com/v2/projects/$ProjectId/identityPlatform:initializeAuth" -Body '{}' | Out-Null } catch { }
try {
  Invoke-RestMethod -Method Patch -Headers $h -Uri "https://identitytoolkit.googleapis.com/admin/v2/projects/$ProjectId/config?updateMask=signIn.email" -Body '{"signIn":{"email":{"enabled":true,"passwordRequired":true}}}' | Out-Null
  Write-Host 'Đã bật đăng nhập Email/Mật khẩu.'
} catch { Write-Warning 'Chưa bật được đăng nhập Email/Mật khẩu tự động — vào Firebase Console → Authentication → Sign-in method → Email/Password → Enable.' }

Buoc '5. Triển khai API lên Cloud Run'
$envVars = "APP_ENV=production,FIREBASE_PROJECT_ID=$ProjectId,GCP_PROJECT_ID=$ProjectId,STORAGE_BUCKET=$bucket,AI_MODE=mock,UNI_DATA360_MODE=disabled,PUBLIC_BASE_URL=https://$ProjectId.web.app"
Chay "gcloud run deploy aisrm-api --source . --region $Region --service-account $sa --allow-unauthenticated --memory 1Gi --min-instances 0 --max-instances 3 --set-env-vars=$envVars --quiet"

Buoc '6. Build và triển khai giao diện web'
$envFile = "VITE_FIREBASE_API_KEY=$($cfg.apiKey)`nVITE_FIREBASE_AUTH_DOMAIN=$($cfg.authDomain)`nVITE_FIREBASE_PROJECT_ID=$ProjectId`nVITE_USE_EMULATORS=false`n"
[IO.File]::WriteAllText((Join-Path $root 'apps\web\.env.production.local'), $envFile, (New-Object Text.UTF8Encoding $false))
Chay 'pnpm install --frozen-lockfile'
Chay 'pnpm --filter @aisrm/shared build'
Chay 'pnpm --filter @aisrm/web build'
$fbJson = Get-Content firebase.json -Raw
if ($Region -ne 'asia-southeast1') { ($fbJson -replace '"region": "asia-southeast1"', """region"": ""$Region""") | Set-Content firebase.json -Encoding utf8 }
Chay "firebase deploy --only hosting,firestore:rules,firestore:indexes --project $ProjectId $fbAcc --non-interactive"

Buoc '7. Khởi tạo trường và tài khoản quản trị'
Write-Host 'Cần Application Default Credentials của tài khoản quản trị (mở trình duyệt nếu chưa có).'
$adc = gcloud auth application-default print-access-token 2>$null
if (-not $adc) { Chay 'gcloud auth application-default login' }
foreach ($k in 'FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST', 'DEPLOY_TARGET', 'DATABASE_URL') { Remove-Item "env:$k" -ErrorAction SilentlyContinue }
$env:APP_ENV = 'production'; $env:FIREBASE_PROJECT_ID = $ProjectId; $env:GCP_PROJECT_ID = $ProjectId; $env:GOOGLE_CLOUD_PROJECT = $ProjectId; $env:GOOGLE_CLOUD_QUOTA_PROJECT = $ProjectId; $env:STORAGE_BUCKET = $bucket
$extra = ''
if ($TepDonVi) { $extra = "--units ""$((Resolve-Path $TepDonVi).Path)""" }
Push-Location apps\api
try {
  $st = npx tsx scripts/local-cli.ts status | Out-String
  if ($st -notmatch "(?m)^$MaTruong\t") {
    Chay "npx tsx scripts/local-cli.ts init --tenant-id $MaTruong --tenant-name ""$TenTruong"" --admin-email $EmailQuanTri --admin-name ""$TenQuanTri"" $extra"
  } else { Write-Host "Trường $MaTruong đã có — bỏ qua." }
} finally { Pop-Location }

Buoc 'Hoàn tất'
Write-Host "Địa chỉ: https://$ProjectId.web.app" -ForegroundColor Green
Write-Host 'Việc nên làm tiếp: đặt Budget alert (Billing → Budgets), bật sao lưu Firestore (xem HUONG_DAN_CAI_DAT), gắn tên miền riêng (Firebase Hosting → Add custom domain).'
