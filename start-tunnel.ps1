$root = 'C:\Users\01\Downloads\Telegram Desktop\messenger'
Remove-Item "$root\tunnel.log","$root\tunnel.err" -ErrorAction SilentlyContinue
$p = Start-Process -FilePath 'C:\PROGRA~1\nodejs\node.exe' -ArgumentList 'tools\tunnel.js' `
  -WorkingDirectory $root -WindowStyle Hidden `
  -RedirectStandardOutput "$root\tunnel.log" -RedirectStandardError "$root\tunnel.err" `
  -PassThru
Write-Output ("TUNNEL_PID=" + $p.Id)
