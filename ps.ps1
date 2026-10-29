@echo off
for %%A in ("C:\Users\01\Downloads\Telegram Desktop") do echo SHORT=%%~sA
powershell -NoProfile -Command "Get-Process | Where-Object { $_.Name -match 'node|cloudflared' } | Select-Object Name,Id | Out-File -Encoding ascii 'C:\Users\01\Downloads\Telegram Desktop\messenger\proc.txt'"
type "C:\Users\01\Downloads\Telegram Desktop\messenger\proc.txt"
