/*
 * Публичный URL без покупки домена и без деплоя: поднимает Cloudflare quick-tunnel
 * на локальный сервер, затем перезапускает server.js с PUBLIC_URL = адрес туннеля,
 * чтобы OAuth-редиректы и ссылки в сообщениях вели на публичный HTTPS-домен.
 *
 * Запуск:  cd messenger && node tools/tunnel.js   (или просто tunnel.cmd)
 * cloudflared.exe tunnel.cmd скачивает сам в messenger\bin.
 * Остановка: Ctrl+C.
 *
 * Quick-tunnel у Cloudflare живёт недолго и рвётся. Поэтому здесь автопереподключение:
 * при смерти cloudflared или при недоступности URL скрипт поднимает новый туннель
 * и сам перезапускает сервер с новым PUBLIC_URL. Максимум попыток — RECONNECT_MAX.
 */
const { spawn, execSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const http = require('http')
const https = require('https')

const ROOT = path.join(__dirname, '..')
const CF = path.join(ROOT, 'bin', 'cloudflared.exe')
const PORT = process.env.PORT || 3000
const RECONNECT_MAX = Number(process.env.RECONNECT_MAX || 50)
const PROBE_EVERY_MS = 20000

if (!fs.existsSync(CF)) {
  console.error('cloudflared.exe не найден в bin\\ — запустите tunnel.cmd, он скачает его сам.')
  process.exit(1)
}

const freePort = () => {
  try {
    const out = execSync(
      `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess"`,
      { encoding: 'utf8' }
    )
    for (const pid of out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)) {
      if (String(pid) === String(process.pid)) continue
      console.log('Освобождаю порт ' + PORT + ': снимаю PID ' + pid)
      try { execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' }) } catch { /* уже снят */ }
    }
  } catch { /* порт свободен */ }
}

let app = null
let attempts = 0
let currentUrl = null
let cf = null
let probe = null
let shuttingDown = false

const killApp = () => { try { app && app.kill() } catch {} ; app = null }

const startApp = (publicUrl) => {
  killApp()
  freePort()
  app = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: { ...process.env, PUBLIC_URL: publicUrl, PORT },
    stdio: 'inherit',
  })
}

// Проверка, что туннель действительно ходит до сервера (а не отдаёт ошибку Cloudflare).
const probeTunnel = (url) =>
  new Promise((resolve) => {
    const req = https.get(url + '/api/health', { timeout: 8000 }, (res) => {
      let body = ''
      res.on('data', (c) => (body += c))
      res.on('end', () => resolve(res.statusCode === 200 && !/error 1033/i.test(body)))
    })
    req.on('timeout', () => { req.destroy(); resolve(false) })
    req.on('error', () => resolve(false))
  })

const reconnect = (reason) => {
  if (shuttingDown) return
  clearInterval(probe)
  try { cf && cf.kill() } catch {}
  if (attempts >= RECONNECT_MAX) {
    console.error('\nТуннель не поднимается после ' + attempts + ' попыток (' + reason + ').')
    console.error('Для стабильного публичного адреса используйте деплой: messenger\\render.yaml (Render) или VPS.')
    killApp()
    process.exit(1)
  }
  attempts += 1
  console.log('\n[' + attempts + '/' + RECONNECT_MAX + '] ' + reason + ' — поднимаю новый туннель…')
  setTimeout(openTunnel, 3000)
}

function openTunnel() {
  if (shuttingDown) return
  currentUrl = null
  let reported = false
  cf = spawn(CF, ['tunnel', '--url', 'http://localhost:' + PORT, '--no-autoupdate'], { cwd: ROOT })

  const feed = (chunk) => {
    const m = String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i)
    if (!m || reported) return
    reported = true
    currentUrl = m[0]
    console.log('\n  ════════════════════════════════════════════')
    console.log('  ПУБЛИЧНЫЙ САЙТ: ' + currentUrl)
    console.log('  ════════════════════════════════════════════')
    console.log('  Открывайте этот адрес с любого устройства.\n')
    startApp(currentUrl)
    probe = setInterval(async () => {
      const ok = await probeTunnel(currentUrl)
      if (!ok) reconnect('туннель перестал отвечать')
    }, PROBE_EVERY_MS)
  }
  cf.stdout.on('data', feed)
  cf.stderr.on('data', feed)
  cf.on('exit', () => reconnect('cloudflared завершился'))
}

console.log('Поднимаю туннель на http://localhost:' + PORT + ' …')
console.log('(первый запрос занимает 5–15 секунд; обрывы переподключаются автоматически)')
openTunnel()

const stop = () => {
  shuttingDown = true
  clearInterval(probe)
  try { cf && cf.kill() } catch {}
  killApp()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
