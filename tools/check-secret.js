// Убеждается, что в собранный asar не попал реальный ключ, и печатает шаблон sms-секции
const path = require('path')
const asar = require('@electron/asar')

const asarPath = path.join(__dirname, '..', 'desktop', 'win-unpacked', 'resources', 'app.asar')
const targets = ['config.js', 'server.js', 'electron/main.js']

for (const rel of targets) {
  const src = asar.extractFile(asarPath, rel).toString('utf8')
  const leaks = src.match(/txb_[A-Za-z0-9]+/g) || []
  const sbox = src.match(/sboxk_[A-Za-z0-9]+/g) || []
  console.log(rel.padEnd(16), 'txb_ leaks:', leaks.length, 'sboxk leaks:', sbox.length)
}

const main = asar.extractFile(asarPath, 'electron/main.js').toString('utf8')
const i = main.indexOf('textbee')
console.log('--- main.js around textbee ---')
console.log(main.slice(Math.max(0, i - 400), i + 400))
