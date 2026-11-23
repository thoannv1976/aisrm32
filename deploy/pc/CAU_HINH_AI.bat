@echo off
chcp 65001 >nul
rem Bat / doi / tat AI noi bo (LocalAI)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0he-thong\cau-hinh-ai.ps1" %*
echo.
if not defined AISRM_KHONG_DUNG pause
