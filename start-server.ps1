$dir = 'C:\Users\01\Downloads\Telegram Desktop\messenger'
$log = Join-Path $dir 'server.log'
$bat = Join-Path $dir 'run.cmd'

# Останавливаем всё, что сейчас держит порт 3000
$conns = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
foreach ($c in $conns) {
  Write-Output ('stop PID=' + $c.OwningProcess)
  Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 1

if (Test-Path $log) { Remove-Item $log -Force }

$cmdLine = 'cmd.exe /c ""' + $bat + '""'

$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine      = $cmdLine
    CurrentDirectory = $dir
}

Write-Output ('ReturnValue=' + $r.ReturnValue + ' PID=' + $r.ProcessId)
Start-Sleep -Seconds 3

Write-Output '--- listen :3000 ---'
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -First 3 -Property LocalAddress, LocalPort, OwningProcess | Format-Table -AutoSize
Write-Output '--- log ---'
if (Test-Path $log) { Get-Content $log } else { Write-Output 'NO LOG FILE' }
