# Kiểm tra tình trạng AI-SRM trên PC (bấm đúp KIEM_TRA.bat) — dùng khi báo lỗi cho Ban tổ chức.
. (Join-Path $PSScriptRoot 'chung.ps1')
Buoc 'Docker'
if (-not (DockerChay)) { CanhBao 'Docker Desktop chưa chạy — bấm đúp MO_AI-SRM.bat.'; return }
Write-Host "Docker $(Thu { docker version --format '{{.Server.Version}}' })"
if (-not (Test-Path .env)) { CanhBao 'Chưa cài AI-SRM trên máy này.'; return }
Buoc 'Dịch vụ'
docker compose ps --format 'table {{.Service}}\t{{.State}}\t{{.Status}}' | Out-Host
$port = Cong
Buoc 'Truy cập'
if (ChoSanSang $port 6) { Tot "Web + API: OK — http://localhost:$port" } else { CanhBao "Không mở được http://localhost:$port/api/v1/health" }
if ((DocEnv 'HTTP_BIND') -eq '127.0.0.1') { Write-Host 'Chế độ: chỉ máy này.' }
else {
  foreach ($ip in @(DiaChiLAN)) { Write-Host "LAN: http://${ip}:$port" }
  $luat = Get-NetFirewallRule -DisplayName "AI-SRM (cổng $port)" -ErrorAction SilentlyContinue
  Write-Host ('Tường lửa: ' + $(if ($luat) { 'đã mở cổng cho LAN' } else { 'chưa mở (MO_MANG_LAN.bat)' }))
}
Buoc 'Dữ liệu'
GoiCli status | ForEach-Object { Write-Host "  $_" }
Buoc 'AI nội bộ'
$u = DocEnv 'LOCAL_AI_BASE_URL'
if (-not $u) { Write-Host 'Chưa cấu hình (AI giả lập). Bật: CAU_HINH_AI.bat' }
else {
  Write-Host "Địa chỉ (từ trong Docker): $u"
  $js = "fetch(process.env.LOCAL_AI_BASE_URL+'/v1/models',{headers:process.env.LOCAL_AI_API_KEY?{Authorization:'Bearer '+process.env.LOCAL_AI_API_KEY}:{}}).then(r=>r.json()).then(j=>console.log('OK, '+(j.data||[]).length+' model')).catch(e=>console.log('KHÔNG kết nối được: '+e.message))"
  Write-Host ('Kết nối: ' + (Thu { docker compose exec -T api node -e $js }))
}
Buoc 'Nhật ký lỗi gần nhất (api)'
Thu { docker compose logs --tail 15 api } | Select-String -Pattern 'error|lỗi|ERR' | Select-Object -Last 8 | ForEach-Object { Write-Host "  $_" }
