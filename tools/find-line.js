const fs = require('fs')
const lines = fs.readFileSync(process.argv[2], 'utf8').split(/\r?\n/)
const needle = process.argv[3] || ''
const hits = lines.filter((l) => l.includes(needle))
console.log(hits.join('\n'))
console.log('total_lines=' + lines.length)
