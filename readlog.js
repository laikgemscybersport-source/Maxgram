// Читаем лог, написанный cmd в OEM-кодировке (cp866) / UTF-16 / UTF-8
const fs = require('fs')
const p = process.argv[2] || 'app.log'
const b = fs.readFileSync(p)
console.log('bytes=' + b.length)
for (const enc of ['utf8', 'cp866', 'cp1251', 'utf16le', 'latin1']) {
  try {
    console.log('--- ' + enc + ' ---')
    console.log(new TextDecoder(enc).decode(b).replace(/\u0000/g, '').trim())
  } catch (e) {
    console.log('skip: ' + e.message)
  }
}
