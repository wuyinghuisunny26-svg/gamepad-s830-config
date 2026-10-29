@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo   手柄控制 - 本地服务启动中...
echo.

start "" /min powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0server.ps1"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8765/"

echo   浏览器已打开： http://127.0.0.1:8765/
echo   如果没有自动打开，请手动在 Edge / Chrome 里访问上面这个地址。
echo.
echo   关闭本窗口不会停止服务，要停止请关掉后台的 PowerShell 窗口，
echo   或在任务管理器里结束 powershell.exe。
echo.
timeout /t 8 /nobreak >nul
