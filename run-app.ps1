$exe = 'C:\Users\01\Downloads\Telegram Desktop\messenger\desktop\win-unpacked\MAXgram.exe'
'dir exists: ' + (Test-Path $exe)
$dir = Join-Path $env:APPDATA 'maxgram-desktop'
if (Test-Path $dir) {
  Get-ChildItem $dir -Recurse -Depth 1 | ForEach-Object { '  ' + $_.FullName.Replace($dir, '') + ' ' + $_.Length }
} else { 'no userData dir yet: ' + $dir }
$log = Join-Path $dir 'desktop-error.log'
if (Test-Path $log) { '--- desktop-error.log ---'; Get-Content $log } else { 'no error log' }
$p = Start-Process -FilePath $exe -PassThru -WindowStyle Normal
'launched pid=' + $p.Id
Start-Sleep -Seconds 12
$alive = Get-Process -Id $p.Id -ErrorAction SilentlyContinue
'alive: ' + [bool]$alive
$all = Get-Process MAXgram -ErrorAction SilentlyContinue
'count: ' + @($all).Count
if (Test-Path $log) { '--- log after start ---'; Get-Content $log }
if ($all) {
  foreach ($c in Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue) {
    if (@($all).OwningProcess -contains $c.OwningProcess) { 'listen pid=' + $c.OwningProcess + ' port=' + $c.LocalPort }
  }
}
