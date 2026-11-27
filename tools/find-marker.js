// Ищет строку-маркер в собранном бандле внутри asar: node tools/find-marker.js <asar> <строка…>
const asar = require('@electron/asar');
const path = require('path');

const archive = process.argv[2] || path.join(__dirname, '..', 'desktop', 'win-unpacked', 'resources', 'app.asar');
const markers = process.argv.slice(3);
if (!markers.length) {
  console.error('Укажите строки для поиска');
  process.exit(1);
}
const list = asar.listPackage(archive);
const js = list.find((p) => /assets[\\/].*\.js$/.test(p));
const src = asar.extractFile(archive, js.slice(1)).toString('utf8');
for (const m of markers) console.log(`${src.includes(m) ? '[есть] ' : '[нет]  '}${m}`);
