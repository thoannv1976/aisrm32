@echo off
chcp 65001 >nul
rem Sao luu du lieu AI-SRM
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0he-thong\sao-luu.ps1" %*
echo.
if not defined AISRM_KHONG_DUNG pause
