// Проверяет, что в собранном app.asar есть нужные маркеры (textbee, TLS-фикс и т.п.)
const fs = require('fs')
const path = require('path')
const asar = require('@electron/asar')

const asarPath = path.join(__dirname, '..', 'desktop', 'win-unpacked', 'resources', 'app.asar')
const stat = fs.statSync(asarPath)
console.log('asar:', asarPath)
console.log('size:', stat.size, 'mtime:', stat.mtime.toISOString())

const list = asar.listPackage(asarPath)
const files = list.filter((e) => !e.endsWith(path.sep))
console.log('entries:', list.length, 'files:', files.length)

const targets = files.filter((e) => /(^|[\\/])(server|config|main)\.js$/.test(e))
console.log('targets:', targets.join(', '))

const markers = [
  'sendViaTextbee',
  'textbeeDeviceId',
  'gateway/devices',
  'send-sms',
  'x-api-key',
  'isDefault',
  'createSecureContext',
  'X25519:prime256v1',
  'sendViaSmsgate',
  "provider:\\s*.textbee."
]

const found = new Map(markers.map((m) => [m, []]))
for (const rel of targets) {
  let src = ''
  try {
    src = asar.extractFile(asarPath, rel.replace(/^[\\/]+/, '').replace(/\\/g, '/')).toString('utf8')
  } catch (e) {
    console.log('read fail', rel, e.message)
    continue
  }
  console.log('---', rel, src.length, 'bytes')
  for (const m of markers) {
    const re = new RegExp(m, 'g')
    const hits = src.match(re)
    if (hits) found.get(m).push(rel + ' x' + hits.length)
  }
}

let missing = 0
for (const [m, where] of found) {
  if (where.length) console.log('[OK]    ', m.padEnd(22), where.join(', '))
  else {
    console.log('[MISS]  ', m)
    missing++
  }
}
console.log(missing ? 'MISSING=' + missing : 'ALL MARKERS PRESENT')
