@echo off
chcp 65001 >nul
rem Mo cong AI-SRM tren tuong lua de may khac trong LAN truy cap (can quyen quan tri)
net session >nul 2>&1
if errorlevel 1 (
  powershell -NoProfile -Command "Start-Process -FilePath \"%~f0\" -Verb RunAs"
  exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0he-thong\mo-mang-lan.ps1" %*
echo.
if not defined AISRM_KHONG_DUNG pause
