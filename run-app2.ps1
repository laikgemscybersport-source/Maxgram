$exe = 'C:\Users\01\Downloads\Telegram Desktop\messenger\desktop\win-unpacked\MAXgram.exe'
$out = 'C:\Users\01\Downloads\Telegram Desktop\messenger\app-out.txt'
$err = 'C:\Users\01\Downloads\Telegram Desktop\messenger\app-err.txt'
Remove-Item $out,$err -ErrorAction SilentlyContinue

# --enable-logging=stderr заставляет Chromium/Electron писать console.* и ошибки в stderr
$p = Start-Process -FilePath $exe -ArgumentList '--enable-logging=stderr','--no-sandbox' `
  -PassThru -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err
'launched pid=' + $p.Id
Start-Sleep -Seconds 10
'alive: ' + [bool](Get-Process -Id $p.Id -ErrorAction SilentlyContinue)
'--- stderr (' + (Get-Item $err -ErrorAction SilentlyContinue).Length + ' bytes) ---'
if (Test-Path $err) { Get-Content $err -Tail 40 }
'--- stdout ---'
if (Test-Path $out) { Get-Content $out -Tail 20 }
'--- userData ---'
foreach ($d in (Join-Path $env:APPDATA 'maxgram-desktop'), (Join-Path $env:APPDATA 'MAXgram')) {
  if (Test-Path $d) { 'DIR ' + $d; Get-ChildItem $d | ForEach-Object { '   ' + $_.Name + ' ' + $_.Length } }
  else { 'MISSING ' + $d }
}
