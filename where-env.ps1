'--- где определена ELECTRON_RUN_AS_NODE ---'
'user:  ' + [Environment]::GetEnvironmentVariable('ELECTRON_RUN_AS_NODE','User')
'machine: ' + [Environment]::GetEnvironmentVariable('ELECTRON_RUN_AS_NODE','Machine')
'process: ' + [Environment]::GetEnvironmentVariable('ELECTRON_RUN_AS_NODE','Process')

'--- папки профиля, похожие на MAXgram ---'
foreach ($root in $env:APPDATA, $env:LOCALAPPDATA) {
  Get-ChildItem $root -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match 'maxgram' } |
    ForEach-Object { '  ' + $_.FullName }
}

'--- содержимое ---'
foreach ($root in $env:APPDATA, $env:LOCALAPPDATA) {
  Get-ChildItem $root -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'maxgram' } | ForEach-Object {
    Get-ChildItem $_.FullName -ErrorAction SilentlyContinue | ForEach-Object { '  ' + $_.Name + ' ' + $_.Length }
  }
}
