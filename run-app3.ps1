$exe = 'C:\Users\01\Downloads\Telegram Desktop\messenger\desktop\win-unpacked\MAXgram.exe'
$log = Join-Path $env:TEMP 'maxgram-desktop.log'
Remove-Item $log -ErrorAction SilentlyContinue
$p = Start-Process -FilePath $exe -PassThru -WindowStyle Normal
'launched pid=' + $p.Id
Start-Sleep -Seconds 12
$alive = Get-Process -Id $p.Id -ErrorAction SilentlyContinue
'alive: ' + [bool]$alive
if (-not $alive) {
  try { $p.WaitForExit(); 'exit_code=0x' + ('{0:X}' -f $p.ExitCode) + ' (' + $p.ExitCode + ')' } catch { 'exit_code: unknown' }
}
'--- temp log ---'
if (Test-Path $log) { Get-Content $log } else { 'NO_TEMP_LOG' }
