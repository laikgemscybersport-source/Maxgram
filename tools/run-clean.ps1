param([string]$Exe = 'C:\Users\01\Downloads\Telegram Desktop\messenger\desktop\MAXgram-1.0.0-x64.exe')

# ASCII-only: PowerShell 5.1 читает файлы без BOM в OEM-кодировке и ломает кириллицу.
# ELECTRON_RUN_AS_NODE=1 стоит только в окружении агентской сессии (не в User/Machine),
# поэтому для честной проверки его нужно снять — у пользователя его нет.
Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

$log = Join-Path $env:TEMP 'maxgram-desktop.log'
$old = @(Get-Process MAXgram -ErrorAction SilentlyContinue)
'found old: ' + $old.Count
$old | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 4
Remove-Item $log -ErrorAction SilentlyContinue

'env after clean: [' + [Environment]::GetEnvironmentVariable('ELECTRON_RUN_AS_NODE', 'Process') + ']'
$p = Start-Process -FilePath $Exe -PassThru -WindowStyle Normal
'launched pid=' + $p.Id
Start-Sleep -Seconds 25

$all = @(Get-Process MAXgram -ErrorAction SilentlyContinue)
'processes: ' + $all.Count
$ports = @()
foreach ($c in $all) {
  foreach ($l in (Get-NetTCPConnection -State Listen -OwningProcess $c.Id -ErrorAction SilentlyContinue)) {
    $ports += $l.LocalPort
    'listen pid=' + $c.Id + ' port=' + $l.LocalPort
  }
}
'--- temp log ---'
if (Test-Path $log) { Get-Content $log } else { 'NO_TEMP_LOG' }
if ($ports.Count) {
  $port = $ports[0]
  'health: ' + ((Invoke-WebRequest -Uri ('http://127.0.0.1:' + $port + '/api/health') -UseBasicParsing -TimeoutSec 10).Content)
  'index: ' + ((Invoke-WebRequest -Uri ('http://127.0.0.1:' + $port + '/') -UseBasicParsing -TimeoutSec 10).StatusCode)
} else { 'NO_PORT' }
