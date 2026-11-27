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
// Серверный код тоже внутри asar: OAuth-флоу и PKCE живут именно там.
const serverSrc = asar.extractFile(archive, 'server.js').toString('utf8');
const configSrc = asar.extractFile(archive, 'config.js').toString('utf8');

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
  // OAuth: остался только Google, desktop-клиент требует PKCE
  ['oauth: PKCE на сервере', serverSrc.includes('code_challenge_method') && serverSrc.includes('code_verifier')],
  ['oauth: Яндекс/VK/OK убраны', !/oauth\.yandex|oauth\.vk|oauth\.ok/.test(configSrc)],
  // Секреты не должны попасть в сборку: их читает только secrets.js вне asar
  ['oauth: секретных ключей в архиве нет', !serverSrc.includes('GOCSPX-') && !configSrc.includes('GOCSPX-')],
  // Поиск по @username (эндпоинт + модалка)
  ['поиск по username: эндпоинт', serverSrc.includes('lookup-username')],
  ['поиск по username: модалка в бандле', src.includes('lookup-username')],
  // Список чатов: демо-аккаунты больше не добавляются автоматически
  ['чаты: автодиалоги по всем юзерам убраны', !serverSrc.includes('keys.add(pairKey(meId, id))')],
  ['чаты: /api/direct на сервере', serverSrc.includes('/api/direct')],
  ['чаты: /api/direct в клиенте', src.includes('/direct')],
  // Управление группами и каналами
  ['сообщества: аватар группы', serverSrc.includes('/api/groups/:id/avatar')],
  ['сообщества: выход из группы', serverSrc.includes('/api/groups/:id/leave')],
  ['сообщества: модалка настроек', src.includes('community-modal')],
  ['сообщества: пункты настроек', src.includes('Настройки канала') && src.includes('Настройки группы')],
  // Лента историй: у каждого автора своё цветное кольцо, просмотренные гаснут.
  // Имя функции минификатор сокращает, поэтому ищем сами цвета палитры.
  ['истории: палитра колец в клиенте', src.includes('#ff516a') && src.includes('#c86bff')],
  ['истории: кольцо-градиент', cssSrc.includes('--ring-a') && cssSrc.includes('linear-gradient(140deg')],
  ['истории: просмотренное гаснет', cssSrc.includes('.story.seen')],
  ['истории: демо-авторы на сервере', /stories\.u3\s*=/.test(serverSrc) && /stories\.u5\s*=/.test(serverSrc)],
  // Скрытие номера телефона: флаг в профиле, маскировка для чужих, запрет поиска
  ['телефон: флаг hide_phone на сервере', serverSrc.includes('hide_phone')],
  ['телефон: маскировка phone_hidden', serverSrc.includes('phone_hidden')],
  ['телефон: тумблер в клиенте', src.includes('hide_phone')],
  // HTTPS для камеры и звонков на других устройствах
  ['https: генератор сертификата', serverSrc.includes('ensureCert') && serverSrc.includes("require('./tools/cert')")],
  ['https: адреса сети на сервере', serverSrc.includes('/api/netinfo')],
  ['https: экран «Доступ по сети»', src.includes('netinfo') && cssSrc.includes('net-card')],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? '[OK]  ' : '[FAIL]'} ${name}`);
  if (!ok) failed += 1;
}
console.log(`\n=== ${checks.length - failed}/${checks.length} проверок пройдено ===`);
process.exit(failed ? 1 : 0);
