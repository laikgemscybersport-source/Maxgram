/* Проверяет, что все JSX-компоненты (<Foo ...) определены или импортированы в файле */
const fs = require('fs')
process.argv.slice(2).forEach((f) => {
  const src = fs.readFileSync(f, 'utf8')
  const defined = new Set()
  // импорты: import { A, B as C } from '...'
  ;(src.match(/import\s*\{([^}]*)\}\s*from/gs) || []).forEach((m) => {
    m.replace(/import\s*\{([^}]*)\}\s*from/gs, (_, inner) => {
      inner.split(',').forEach((p) => {
        const parts = p.trim().split(/\s+as\s+/)
        const name = (parts[1] || parts[0] || '').trim()
        if (name) defined.add(name)
      })
    })
  })
  // импорты по умолчанию
  ;(src.match(/import\s+(\w+)\s+from/g) || []).forEach((m) => defined.add(m.match(/import\s+(\w+)/)[1]))
  // локальные объявления
  ;(src.match(/(?:function|const|let|class)\s+([A-Z]\w*)/g) || []).forEach((m) => defined.add(m.split(/\s+/)[1]))
  // деструктуризация const { A, B } = ...
  ;(src.match(/const\s*\{([^}]*)\}\s*=/g) || []).forEach((m) => {
    m.replace(/const\s*\{([^}]*)\}=/, (_, inner) => {
      inner.split(',').forEach((p) => {
        const n = p.trim().split(':').pop().trim()
        if (/^[A-Z]/.test(n)) defined.add(n)
      })
    })
  })

  const usedTags = new Set()
  ;(src.match(/<([A-Z][A-Za-z0-9_]*)[\s/>]/g) || []).forEach((m) => usedTags.add(m.slice(1).replace(/[\s/>]/g, '')))
  const missing = [...usedTags].filter((t) => !defined.has(t))
  console.log(f + ': defined=' + defined.size + ' usedTags=' + usedTags.size + (missing.length ? '  MISSING: ' + missing.join(', ') : '  OK'))
})
