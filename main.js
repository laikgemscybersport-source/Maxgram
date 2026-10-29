/*
 * Десктоп-обёртка MAXgram (Electron).
 *
 * Идея: сервер из server.js поднимается внутри приложения на свободном порту,
 * а окно показывает http://127.0.0.1:<порт>. Данные и загрузки лежат в папке
 * профиля Windows (%APPDATA%\maxgram), поэтому переписка не теряется после
 * закрытия программы, а обычный веб-сервер на :3000 остаётся нетронутым.
 */
const { app, BrowserWindow, shell, session, Menu } = require('electron')
const path = require('path')
const fs = require('fs')

// ELECTRON_RUN_AS_NODE превращает исполняемый файл в обычный интерпретатор Node:
// окно не появляется, процесс сразу завершается с кодом 0. Встречается в CI и
// агентских оболочках. Перезапускаем себя без этой переменной.
if (process.env.ELECTRON_RUN_AS_NODE) {
  delete process.env.ELECTRON_RUN_AS_NODE
  require('child_process').spawn(process.execPath, process.argv.slice(1), {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  }).unref()
  process.exit(0)
}

// В GUI-режиме консоль недоступна, поэтому все фатальные ошибки пишутся в файл.
// Пишем в temp: папка userData может ещё не существовать в момент старта.
const LOG_FILE = path.join(require('os').tmpdir(), 'maxgram-desktop.log')
const log = (msg) => {
  try {
    fs.appendFileSync(LOG_FILE, new Date().toISOString() + ' ' + msg + '\n')
  } catch { /* диск недоступен — остаётся только молча упасть */ }
}
process.on('uncaughtException', (e) => log('uncaughtException: ' + (e && e.stack ? e.stack : e)))
process.on('unhandledRejection', (e) => log('unhandledRejection: ' + (e && e.stack ? e.stack : e)))

// Порядок важен: переменные должны вступить в силу до require('../server.js')
const DATA_DIR = app.getPath('userData')
process.env.DATA_FILE = path.join(DATA_DIR, 'maxgram-data.json')
process.env.UPLOAD_DIR = path.join(DATA_DIR, 'uploads')
process.env.PORT = '0' // пусть ОС выдаст свободный порт — несколько окон/аккаунтов не конфликтуют

// Ключи внешних сервисов в собранном приложении не могут лежать в asar (он только
// для чтения), поэтому им отведено место рядом с данными. Файл создаётся при первом
// запуске: пользователю не нужно ничего копировать из папки установки.
const SECRETS_FILE = path.join(DATA_DIR, 'secrets.js')
process.env.MAXGRAM_SECRETS = SECRETS_FILE
if (!fs.existsSync(SECRETS_FILE)) {
  const template = `/*
 * Ключи внешних сервисов приложения MAXgram.
 * Сохраните файл и перезапустите приложение.
 * Полный образец с пояснениями: messenger/secrets.example.js в исходниках.
 */
module.exports = {
  sms: {
    // 'demo' — код показывается на экране; 'smsgate' — приложение SMS Gateway for
    // Android + облако sms-gateway.app; 'http' — свой шлюз на телефоне с SIM;
    // 'smsru' | 'smsaero' | 'twilio' — коммерческий шлюз (ключи в кабинете провайдера)
    provider: 'demo',

    // SMS Gateway for Android: приложение на телефоне с SIM само опрашивает облако
    // шлюза, поэтому телефон может быть в любой сети. Ключ — в дашборде
    // https://app.sms-gateway.app → Settings / API. Расход — SMS вашего тарифа.
    smsgate: {
      base_url: 'https://app.sms-gateway.app/api/v1',
      key: '',                 // вид: sboxk_live_…
      username: '',            // альтернатива ключу для self-hosted сервера шлюза
      password: '',
      device_id: '',           // если телефонов несколько — id нужного
    },

    // Свой шлюз: приложение на Android поднимает HTTP-сервер в домашней сети,
    // здесь — его адрес и имена полей. Расход — SMS вашего тарифа.
    http: {
      url: '',                 // например http://192.168.1.50:8080/send
      method: 'POST',          // POST или GET
      format: 'form',          // form или json
      phone_field: 'to',
      text_field: 'message',
      token: '',               // → Authorization: Bearer …
      expect: '',              // подстрока успеха, если шлюз всегда отвечает 200
      extra: '',               // {"password":"1234"}
    },

    smsru: { api_id: '', api_key: '', from: 'sms-RU' },
    smsaero: { email: '', api_key: '', from: 'MAXgram' },
    twilio: { account_sid: '', auth_token: '', from: '', service_sid: '' },
  },

  oauth: {
    google: { client_id: '', client_secret: '' },
    yandex: { client_id: '', client_secret: '' },
    vk: { client_id: '', client_secret: '' },
    ok: { client_id: '', api_secret: '' },
  },

  public_url: '',
};
`;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(SECRETS_FILE, template, 'utf8')
    log('создан файл ключей: ' + SECRETS_FILE)
  } catch (e) {
    log('не удалось создать ' + SECRETS_FILE + ': ' + e.message)
  }
}

let win = null
let server = null

const startServer = () =>
  new Promise((resolve, reject) => {
    try {
      ;({ server } = require('../server.js'))
    } catch (e) {
      return reject(e)
    }
    const ready = () => resolve(server.address().port)
    server.listening ? ready() : server.once('listening', ready)
    server.once('error', reject)
  })

async function createWindow() {
  // Микрофон и камера нужны для звонков и видеокружков
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(['media', 'mediaKeySystem', 'notifications'].includes(permission))
  })

  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 560,
    backgroundColor: '#0e1621',
    autoHideMenuBar: true,
    title: 'MAXgram',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: { spellcheck: false },
  })

  // Ссылки вне приложения открываем в обычном браузере
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  let port
  try {
    port = await startServer()
    log('сервер поднялся на порту ' + port)
  } catch (e) {
    log('сервер не поднялся: ' + (e && e.stack ? e.stack : e))
    const { dialog } = require('electron')
    dialog.showErrorBox('MAXgram не запустился', String(e && e.message ? e.message : e))
    app.quit()
    return
  }

  await win.loadURL(`http://127.0.0.1:${port}/`)
  win.on('closed', () => { win = null })
}

// Один экземпляр: повторный запуск поднимает уже открытое окно
if (!app.requestSingleInstanceLock()) app.quit()
app.on('second-instance', () => {
  if (win) win.isMinimized() ? win.restore() : win.focus()
})

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => {
  if (server) { try { server.close() } catch { /* уже закрыт */ } }
  if (process.platform !== 'darwin') app.quit()
})
