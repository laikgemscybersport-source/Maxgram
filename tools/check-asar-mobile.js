// Проверяет, что свежие фичи попали в собранный Electron asar.
const asar = require('@electron/asar');
const path = require('path');

const archive = path.join(__dirname, '..', 'desktop-out', 'win-unpacked', 'resources', 'app.asar');
const list = asar.listPackage(archive);
const js = list.find((p) => /assets[\\/].*\.js$/.test(p));
const css = list.find((p) => /assets[\\/].*\.css$/.test(p));
const src = asar.extractFile(archive, js.slice(1)).toString('utf8');
const cssSrc = asar.extractFile(archive, css.slice(1)).toString('utf8');

const checks = [
  ['soft.jpg в архиве', list.some((p) => p.includes('soft.jpg'))],
  // display_name отдаёт сервер; клиент оперирует полем prefix.
  ['префикс в клиенте', /\.prefix/.test(src)],
  ['обои Розовое', src.includes('Розовое')],
  ['камера ideal 480', src.includes('ideal')],
  ['OnlineStrip стили', cssSrc.includes('online-strip')],
  ['msg-sender-name стили', cssSrc.includes('msg-sender-name')],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? '[OK]  ' : '[FAIL]'} ${name}`);
  if (!ok) failed += 1;
}
console.log(`\n=== ${checks.length - failed}/${checks.length} проверок пройдено ===`);
process.exit(failed ? 1 : 0);
