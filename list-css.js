const fs = require('fs')
const src = fs.readFileSync(process.argv[2], 'utf8').split(/\r?\n/)
src.forEach((l, i) => {
  if (/^[.#a-zA-Z@:\-]/.test(l) && /[{,]/.test(l)) console.log(i + 1 + ': ' + l.trim())
})
