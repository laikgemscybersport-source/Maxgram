$procs = Get-Process MAXgram -ErrorAction SilentlyContinue
if (-not $procs) { 'NO_MAXGRAM_PROCESS'; exit }
'PID count = ' + $procs.Count
$procs | ForEach-Object { 'pid=' + $_.Id + ' mem=' + [math]::Round($_.WorkingSet64/1MB) + 'MB' }
$dir = Join-Path $env:APPDATA 'maxgram-desktop'
'userData dir: ' + $dir + ' exists=' + (Test-Path $dir)
foreach ($f in 'maxgram-data.json','uploads') {
  $p = Join-Path $dir $f
  '  ' + $f + ' exists=' + (Test-Path $p)
}
$conns = Get-NetTCPConnection -State Listen -OwningProcess ($procs[0].Id) -ErrorAction SilentlyContinue
if ($conns) { $conns | ForEach-Object { 'listen port=' + $_.LocalPort } }
