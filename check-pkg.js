// Проверка, что package.json читается и конфиг сборки на месте
const pkg = require('../package.json')
console.log('PKG_OK', 'main=' + pkg.main, 'build=' + !!pkg.build, 'win=' + !!pkg.build.win, 'deps=' + Object.keys(pkg.dependencies).length)
