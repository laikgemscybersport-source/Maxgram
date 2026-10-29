@echo off
REM Служебный запуск туннеля для планировщика Windows (путь без пробелов через C:\mg)
set PATH=C:\PROGRA~1\nodejs;%PATH%
cd /d C:\mg
echo ===== %DATE% %TIME% запуск туннеля =====>> C:\mg\tunnel.log
node tools\tunnel.js >> C:\mg\tunnel.log 2>&1
