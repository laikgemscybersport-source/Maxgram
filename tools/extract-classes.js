// Собирает все CSS-классы из className в JSX и печатает те, которых нет в styles.css
const fs = require('fs')
const path = require('path')

const cssFile = path.join(__dirname, '..', 'client', 'src', 'styles.css')
const css = fs.readFileSync(cssFile, 'utf8')
const defined = new Set()
css.replace(/\.(-?[_a-zA-Z][\w-]*)/g, (_, c) => defined.add(c))

const used = new Set()
const add = (s) => s.split(/\s+/).filter(Boolean).forEach((c) => { if (/^-?[_a-zA-Z][\w-]*$/.test(c)) used.add(c) })

process.argv.slice(2).forEach((f) => {
  const src = fs.readFileSync(f, 'utf8')
  // className="a b"
  src.replace(/className\s*=\s*"([^"]*)"/g, (_, s) => add(s))
  // className={`a b ${x ? 'c' : ''}`}
  src.replace(/className\s*=\s*\{`([^`]*)`\}/g, (_, s) => add(s.replace(/\$\{[^}]*\}/g, ' ')))
  // className={cond ? 'a b' : 'c d'}  — ловим все строковые литералы внутри
  src.replace(/className\s*=\s*\{([^}]*)\}/g, (_, s) => {
    const strs = s.match(/'[^']*'|"[^"]*"/g) || []
    strs.forEach((q) => add(q.slice(1, -1)))
  })
})

const missing = [...used].filter((c) => !defined.has(c)).sort()
console.log('USED=' + used.size + ' DEFINED=' + defined.size + ' MISSING=' + missing.length)
console.log(missing.join('\n'))
