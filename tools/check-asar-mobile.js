// Проверяет, что свежие фичи попали в собранный Electron asar.
// Путь к архиву можно передать аргументом (по умолчанию desktop/win-unpacked).
const asar = require('@electron/asar');
const path = require('path');

const archive = process.argv[2]
  || path.join(__dirname, '..', 'desktop', 'win-unpacked', 'resources', 'app.asar');
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
  ['OnlineStrip стили', cssSrc.includes('online-strip')],
  ['msg-sender-name стили', cssSrc.includes('msg-sender-name')],
  ['видеокружок: камера 640 ideal', src.includes('640')],
  ['видеокружок: зеркало фронтальной камеры', cssSrc.includes('scaleX(-1)')],
  ['видеокружок: подсказка про https', src.includes('isSecureContext')],
  // Выбор микрофона/наушников/камеры (devices.js + DeviceSelector.jsx)
  ['выбор устройств: ключ localStorage', src.includes('mg_mic_deviceId')],
  ['выбор устройств: стрелка списка', cssSrc.includes('device-picker-btn')],
  ['выбор устройств: констрейнты аудио', src.includes('audioinput')],
  ['выбор устройств: вывод в наушники', src.includes('setSinkId')],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? '[OK]  ' : '[FAIL]'} ${name}`);
  if (!ok) failed += 1;
}
console.log(`\n=== ${checks.length - failed}/${checks.length} проверок пройдено ===`);
process.exit(failed ? 1 : 0);
