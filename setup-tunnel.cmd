@echo off
REM Настраивает короткую ссылку C:\mg и отвязанно запускает туннель (чтобы жил после закрытия сессии)
if exist C:\mg rmdir C:\mg
mklink /J C:\mg "C:\Users\01\Downloads\Telegram Desktop\messenger"
if not exist C:\mg\tools\tunnel.js echo JUNCTION_BAD & exit /b 1
wmic process call create "C:\mg\tunnel-run.cmd","C:\mg"
