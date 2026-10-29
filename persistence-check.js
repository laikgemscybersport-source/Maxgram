/*
 * Проверка персистентности: поднимает сервер с DATA_FILE, пишет сообщение,
 * убивает процесс, поднимает заново и читает то же сообщение.
 *   node tools/persistence-check.js
 */
const { spawn } = require('child_process')
const path = require('path')
const os = require('os')
const fs = require('fs')

const ROOT = path.join(__dirname, '..')
const PORT = 3999
const DATA = path.join(os.tmpdir(), 'maxgram-persist-test.json')
const BASE = `http://127.0.0.1:${PORT}`

let failed = 0
const ok = (name, cond, extra) => {
  console.log((cond ? '  [OK]   ' : '  [FAIL] ') + name + (extra ? ' -> ' + extra : ''))
  if (!cond) failed++
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const start = () =>
  spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_FILE: DATA, PERSIST_MS: '500' },
    stdio: 'ignore',
  })

const waitForUp = async () => {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE + '/api/health')
      if (r.ok) return true
    } catch { /* сервер ещё не поднялся */ }
    await wait(300)
  }
  throw new Error('server did not start')
}

const login = async (phone) => {
  const c = await (await fetch(BASE + '/api/auth/send-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  })).json()
  const v = await (await fetch(BASE + '/api/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code: c.demo_code }),
  })).json()
  return v.token
}

const stop = async (proc) => {
  proc.kill('SIGTERM')
  await new Promise((r) => proc.once('exit', r))
  await wait(300)
}

;(async () => {
  fs.rmSync(DATA, { force: true })

  console.log('1) первый запуск — пишем сообщение')
  let proc = start()
  await waitForUp()
  const token = await login('+79991234567')
  const marker = 'persist-marker-' + Date.now()
  const sent = await (await fetch(BASE + '/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ chat_key: 's:u1', content: marker }),
  })).json()
  ok('сообщение отправлено', !!sent.id)

  await wait(1200) // ждём цикла автосохранения (PERSIST_MS=500)
  ok('файл данных создан', fs.existsSync(DATA), DATA)
  const size = fs.existsSync(DATA) ? fs.statSync(DATA).size : 0
  ok('файл непустой', size > 500, size + ' байт')

  console.log('2) убиваем сервер')
  await stop(proc)

  console.log('3) второй запуск на том же файле')
  proc = start()
  await waitForUp()
  const hist = await (await fetch(BASE + '/api/chats/' + encodeURIComponent('s:u1') + '/messages', {
    headers: { Authorization: 'Bearer ' + token },
  })).json()
  ok('история восстановлена после рестарта', Array.isArray(hist) && hist.some((m) => m.content === marker),
    Array.isArray(hist) ? hist.length + ' сообщений' : JSON.stringify(hist).slice(0, 120))
  ok('токен пережил рестарт', Array.isArray(hist))

  console.log('4) очистка')
  await stop(proc)
  fs.rmSync(DATA, { force: true })

  console.log(failed ? `\nПРОВАЛ: ${failed}` : '\nПерсистентность работает')
  process.exit(failed ? 1 : 0)
})().catch((e) => {
  console.error('ERR', e)
  process.exit(1)
})
