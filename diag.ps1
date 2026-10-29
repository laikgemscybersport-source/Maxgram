$root = 'C:\Users\01\Downloads\Telegram Desktop\messenger'
$out = @()
$out += '--- processes ---'
$ps = Get-Process | Where-Object { $_.Name -match 'node|cloudflared' }
if ($ps) { foreach ($p in $ps) { $out += ('' + $p.Name + ' pid=' + $p.Id + ' start=' + $p.StartTime) } }
else { $out += 'NONE' }
$out += '--- files ---'
foreach ($f in 'cf.log','cf.err','tunnel.log','tunnel.err') {
  $fp = Join-Path $root $f
  if (Test-Path $fp) { $i = Get-Item $fp; $out += ($f + ' size=' + $i.Length + ' mtime=' + $i.LastWriteTime) }
  else { $out += ($f + ' MISSING') }
}
$out += '--- ports ---'
$conns = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -eq 3000 }
if ($conns) { foreach ($c in $conns) { $out += ('3000 owned by pid=' + $c.OwningProcess) } } else { $out += 'port 3000 not listening' }
$out | Set-Content -Encoding UTF8 (Join-Path $root 'diag.txt')
Get-Content (Join-Path $root 'diag.txt')
