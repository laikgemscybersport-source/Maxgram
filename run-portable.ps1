param([string]$Exe = 'C:\Users\01\Downloads\Telegram Desktop\messenger\desktop\MAXgram-1.0.0-x64.exe')

# ASCII-only: PowerShell 5.1 читает файлы без BOM в OEM-кодировке и ломает кириллицу
$log = Join-Path $env:TEMP 'maxgram-desktop.log'

'--- stopping old instances ---'
$old = @(Get-Process MAXgram -ErrorAction SilentlyContinue)
'found: ' + $old.Count
$old | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 4
'after stop: ' + @(Get-Process MAXgram -ErrorAction SilentlyContinue).Count

Remove-Item $log -ErrorAction SilentlyContinue
'env ELECTRON_RUN_AS_NODE=' + [Environment]::GetEnvironmentVariable('ELECTRON_RUN_AS_NODE', 'Process')

'--- launching ---'
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
