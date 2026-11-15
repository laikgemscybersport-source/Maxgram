# Поднимает cloudflared как ПОЛНОСТЬЮ отвязанный процесс (не убивается вместе с shell-сессией).
# Сервер на :3000 должен уже работать (start-server.ps1).
$root = 'C:\Users\01\Downloads\Telegram Desktop\messenger'
$cf   = Join-Path $root 'bin\cloudflared.exe'
if (-not (Test-Path $cf)) { Write-Output 'NO_CLOUFLARED'; exit 1 }

# снять старые cloudflared
Get-Process cloudflared -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
Remove-Item "$root\cf.out","$root\cf.err" -ErrorAction SilentlyContinue

$p = Start-Process -FilePath $cf `
  -ArgumentList 'tunnel','--url','http://localhost:3000','--no-autoupdate','--protocol','http2' `
  -WorkingDirectory $root -WindowStyle Hidden `
  -RedirectStandardOutput "$root\cf.out" -RedirectStandardError "$root\cf.err" `
  -PassThru
Write-Output ("CF_PID=" + $p.Id)
