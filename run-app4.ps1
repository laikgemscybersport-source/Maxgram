$exe = 'C:\Users\01\Downloads\Telegram Desktop\messenger\desktop\win-unpacked\MAXgram.exe'
$log = Join-Path $env:TEMP 'maxgram-desktop.log'
Remove-Item $log -ErrorAction SilentlyContinue

# ELECTRON_RUN_AS_NODE=1 превращает приложение в обычный Node-интерпретатор,
# поэтому для запуска десктопа её нужно снять.
Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

$p = Start-Process -FilePath $exe -PassThru -WindowStyle Normal
'launched pid=' + $p.Id
Start-Sleep -Seconds 14
$all = @(Get-Process MAXgram -ErrorAction SilentlyContinue)
'processes: ' + $all.Count
foreach ($c in $all) { '  pid=' + $c.Id + ' mem=' + [math]::Round($c.WorkingSet64/1MB) + 'MB' }
foreach ($c in $all) {
  foreach ($l in (Get-NetTCPConnection -State Listen -OwningProcess $c.Id -ErrorAction SilentlyContinue)) {
    '  listen pid=' + $c.Id + ' port=' + $l.LocalPort
  }
}
'--- temp log ---'
if (Test-Path $log) { Get-Content $log } else { 'NO_TEMP_LOG' }
$dir = Join-Path $env:APPDATA 'maxgram-desktop'
'userData exists: ' + (Test-Path $dir)
if (Test-Path $dir) { Get-ChildItem $dir | ForEach-Object { '  ' + $_.Name + ' ' + $_.Length } }
