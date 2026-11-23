@echo off
chcp 65001 >nul
rem Go AI-SRM khoi may (xoa du lieu)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0he-thong\go-cai-dat.ps1" %*
echo.
if not defined AISRM_KHONG_DUNG pause
