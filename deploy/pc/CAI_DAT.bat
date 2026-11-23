@echo off
chcp 65001 >nul
rem Cai dat AI-SRM tren PC (du lieu mau, tu noi LocalAI)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0he-thong\cai-dat-pc.ps1" %*
set KQ=%errorlevel%
echo.
if not defined AISRM_KHONG_DUNG pause
exit /b %KQ%
