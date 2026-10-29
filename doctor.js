/*
 * Диагностика внешних сервисов: показывает, какие ключи видит сервер, работает ли
 * SMS-шлюз (с балансом) и готовы ли OAuth-провайдеры. Сами ключи не печатает.
 *
 *   npm run doctor
 *   npm run doctor -- --test +79991234567     отправить реальное SMS с кодом-заглушкой
 */
const crypto = require('crypto')
const config = require('../config')

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const DIM = '\x1b[2m'
const BOLD = '\x1b[1m'
const OFF = '\x1b[0m'

const ok = (s) => GREEN + '✓ ' + s + OFF
const bad = (s) => RED + '✗ ' + s + OFF
const warn = (s) => YELLOW + '! ' + s + OFF
const hint = (s) => DIM + '  ' + s + OFF

// Маскируем секрет: видна только длина — этого достаточно, чтобы понять, что значение попало
const shown = (v) => (v ? `${GREEN}задан (${String(v).length} симв.)` : RED + 'не задан')

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts)
  const text = await res.text()
  try { return { status: res.status, json: JSON.parse(text), text } }
  catch { return { status: res.status, json: null, text } }
}

function checkHttp() {
  const g = config.sms.http
  console.log('  url:       ' + (g.url ? GREEN + 'задан' + DIM + ' ' + g.url + OFF : RED + 'не задан (SMS_HTTP_URL)' + OFF))
  console.log('  method:    ' + g.method + ', формат: ' + g.format)
  console.log('  поля:      номер → ' + g.phone_field + ', текст → ' + g.text_field + (g.from ? ', from → from' : ''))
  console.log('  токен:     ' + (g.token ? 'задан (Authorization: Bearer …)' : 'не задан'))
  if (g.expect) console.log('  успех, если в ответе есть: ' + JSON.stringify(g.expect))
  if (g.extra) console.log('  доп. поля: ' + (g.extra.slice(0, 60)))
  console.log(hint('Шлюз — приложение на телефоне с SIM в вашей сети. Проверка доставки: npm run doctor -- --test +7…'))
  return !!g.url
}

/*
 * SMS Gateway for Android (sms-gateway.app).
 * Заголовок Authorization собираем так же, как в server.js: готовый ключ из
 * дашборда либо JWT из логина/пароля self-hosted сервера.
 */
async function gateAuthHeader(g) {
  if (g.key) return 'Bearer ' + g.key
  const basic = Buffer.from(`${g.username}:${g.password}`).toString('base64')
  const res = await fetch(g.base_url + '/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + basic },
    body: JSON.stringify({ ttl: 600, scopes: ['messages:send'] }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.access_token) {
    throw new Error('токен не выдан: ' + (data.error || data.message || 'HTTP ' + res.status))
  }
  return 'Bearer ' + data.access_token
}

async function checkSmsgate(probe) {
  const g = config.sms.smsgate
  console.log('  api:       ' + (g.base_url ? DIM + g.base_url + OFF : RED + 'не задан' + OFF))
  console.log('  key:       ' + (g.key ? shown(g.key) : RED + 'не задан (SMS_GATE_KEY)' + OFF))
  console.log('  login:     ' + (g.username ? 'задан, пароль ' + shown(g.password) : 'не задан (SMS_GATE_USERNAME/SMS_GATE_PASSWORD)'))
  console.log('  device_id: ' + (g.device_id || 'не задан — берётся любое устройство'))

  const authorized = !!g.key || (g.username && g.password)
  if (!authorized) {
    console.log(hint('Ключ: дашборд https://app.sms-gateway.app → Settings / API → Create key (вид sboxk_live_…)'))
    return false
  }
  if (!probe) return true

  // GET /devices ничего не отправляет и не стоит денег, но проверяет и ключ,
  // и то, что телефон с SIM на связи с облаком шлюза.
  try {
    const r = await fetchJson(g.base_url + '/devices', {
      headers: { Authorization: await gateAuthHeader(g) },
      signal: AbortSignal.timeout(10000),
    })
    if (r.status === 401 || r.status === 403) {
      console.log('  ' + bad(`ключ не принят (HTTP ${r.status}) — проверьте ключ в дашборде Settings / API`))
      return true
    }
    // Облако отдаёт список внутри {"data":[…]}; self-hosted/эмулятор может вернуть голый массив
    const devices = Array.isArray(r.json) ? r.json : (r.json && Array.isArray(r.json.data) ? r.json.data : null)
    if (!devices) {
      console.log('  ' + warn(`API ответил HTTP ${r.status}: ${r.text.slice(0, 120)}`))
      console.log(hint('Для облака из дашборда base_url должен быть https://app.sms-gateway.app/api/v1'))
      return true
    }
    if (!devices.length) {
      console.log('  ' + warn('ключ подходит, но устройств не зарегистрировано'))
      console.log(hint('Установите приложение SMS Gateway на телефон с SIM и привяжите его к аккаунту'))
      return true
    }
    devices.forEach((d) => {
      const name = d.name || d.model || ('устройство ' + d.id)
      const num = d.phoneNumber ? ' → ' + d.phoneNumber : ''
      const live = d.enabled === false || d.online === false ? warn('не в сети') : ok('на связи')
      console.log('  ' + ok(`устройство «${name}»${num}`) + ' ' + live)
    })
  } catch (e) {
    console.log('  ' + bad('нет связи с ' + g.base_url + ': ' + e.message))
  }
  return true
}

async function checkSmsru(showBalance) {
  const { api_id, api_key, from } = config.sms.smsru
  console.log('  api_id:    ' + shown(api_id))
  console.log('  api_key:   ' + shown(api_key))
  console.log('  from:      ' + (from || warn('не задан — будет отправитель по умолчанию')))
  if (!api_id) return false
  if (!showBalance) return true
  try {
    const r = await fetchJson(`https://sms.ru/sms/status?api_id=${encodeURIComponent(api_id)}&json=1`)
    if (r.json?.status === 'OK') console.log('  ' + ok(`шлюз отвечает, баланс ${r.json.balance} руб.`))
    else console.log('  ' + bad(`sms.ru: ${r.json?.status_text || 'код ' + r.json?.status_code || r.text.slice(0, 100)}`))
  } catch (e) {
    console.log('  ' + bad('нет связи с sms.ru: ' + e.message))
  }
  return true
}

async function checkSmsAero(showBalance) {
  const { email, api_key, from } = config.sms.smsaero
  console.log('  email:     ' + shown(email))
  console.log('  api_key:   ' + shown(api_key))
  console.log('  from:      ' + (from || warn('не задан')))
  if (!email || !api_key) return false
  if (!showBalance) return true
  try {
    const r = await fetchJson('https://gate.smsaero.ru/v2/balance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email, apiSign: api_key }).toString(),
    })
    if (r.json?.success) console.log('  ' + ok(`шлюз отвечает, баланс ${r.json.data} руб.`))
    else console.log('  ' + bad(`SMS Aero: ${r.json?.message || r.text.slice(0, 100)}`))
  } catch (e) {
    console.log('  ' + bad('нет связи с gate.smsaero.ru: ' + e.message))
  }
  return true
}

async function checkTwilio(showBalance) {
  const { accountSid, authToken, from, serviceSid } = config.sms.twilio
  console.log('  account_sid: ' + shown(accountSid))
  console.log('  auth_token:  ' + shown(authToken))
  console.log('  from:        ' + (from || serviceSid || RED + 'не задан'))
  if (!accountSid || !authToken) return false
  if (!showBalance) return true
  try {
    const basic = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
    const r = await fetchJson(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Balance.json`, {
      headers: { Authorization: 'Basic ' + basic },
    })
    if (r.json?.balance) console.log('  ' + ok(`шлюз отвечает, баланс ${r.json.balance} ${r.json.currency}`))
    else console.log('  ' + bad(`Twilio: ${r.json?.message || 'HTTP ' + r.status}`))
  } catch (e) {
    console.log('  ' + bad('нет связи с api.twilio.com: ' + e.message))
  }
  return true
}

/*
 * Запрос, который MAXgram отправит на ваш шлюз. Нужен, чтобы за минуту подобрать
 * имена полей под конкретное приложение: сравните вывод с документацией шлюза и
 * поправьте phone_field/text_field/format в secrets.js.
 */
const SMS_TEXT_SAMPLE = 'Код подтверждения MAXgram: 12345. Не передавайте его никому.'

function httpPlan(g, phone, body) {
  const fields = { [g.phone_field]: phone, [g.text_field]: body }
  if (g.from) fields.from = g.from
  if (g.extra) { try { Object.assign(fields, JSON.parse(g.extra)) } catch { /* покажем как есть */ } }

  const headers = {}
  if (g.token) headers.Authorization = 'Bearer ' + (g.token.slice(0, 4) + '…')
  let url = g.url
  let payload
  if (g.method === 'GET') {
    url += (url.includes('?') ? '&' : '?') + new URLSearchParams(fields).toString()
  } else if (g.format === 'json') {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(fields, null, 0)
  } else {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    payload = new URLSearchParams(fields).toString()
  }
  return { url, method: g.method, headers, payload }
}

// Доступность телефона без отправки SMS: HEAD на адрес шлюза
async function pingGateway(g) {
  if (!g.url) return console.log(bad('SMS_HTTP_URL не задан'))
  try {
    const res = await fetch(g.url, { method: 'HEAD', signal: AbortSignal.timeout(6000) })
    console.log(ok(`телефон отвечает: HTTP ${res.status} — шлюз достижим`))
  } catch (e) {
    console.log(bad('шлюз не отвечает: ' + e.message))
    console.log(hint('Приложение на телефоне должно быть открыто, а телефон и сервер — в одной Wi-Fi сети'))
  }
}

async function sendTestSms(phone) {
  const { provider } = config.sms
  const body = `Код подтверждения MAXgram: ${crypto.randomInt(10000, 99999)}. Это тестовое сообщение.`

  if (provider === 'http') {
    const g = config.sms.http
    if (!g.url) return console.log(bad('SMS_HTTP_URL не задан'))
    const fields = { [g.phone_field]: phone, [g.text_field]: body }
    if (g.from) fields.from = g.from
    if (g.extra) { try { Object.assign(fields, JSON.parse(g.extra)) } catch { return console.log(bad('SMS_HTTP_EXTRA — не корректный JSON')) } }
    const headers = {}
    if (g.token) headers.Authorization = 'Bearer ' + g.token
    let url = g.url
    let reqBody
    if (g.method === 'GET') url += (url.includes('?') ? '&' : '?') + new URLSearchParams(fields)
    else if (g.format === 'json') { headers['Content-Type'] = 'application/json'; reqBody = JSON.stringify(fields) }
    else { headers['Content-Type'] = 'application/x-www-form-urlencoded'; reqBody = new URLSearchParams(fields).toString() }
    try {
      const res = await fetch(url, { method: g.method, headers, body: reqBody })
      const text = await res.text()
      const good = res.ok && (!g.expect || text.includes(g.expect))
      console.log(good ? ok(`шлюз принял: HTTP ${res.status} ${text.slice(0, 80)}`) : bad(`шлюз: HTTP ${res.status} ${text.slice(0, 120)}`))
    } catch (e) {
      console.log(bad('шлюз недоступен: ' + e.message))
      console.log(hint('Проверьте, что приложение-шлюз запущено и телефон с сервером в одной сети'))
    }
    return
  }

  if (provider === 'smsgate') {
    const g = config.sms.smsgate
    if (!g.key && !(g.username && g.password)) return console.log(bad('не задан ни SMS_GATE_KEY, ни SMS_GATE_USERNAME/PASSWORD'))
    // Формат тела зависит от типа эндпоинта — как в server.js: облако (…/api/v1)
    // принимает плоский {"to","text"}, self-hosted (…/3rdparty/v1) — вложенный.
    const payload = /\/3rdparty\//.test(g.base_url)
      ? { phoneNumbers: [phone], textMessage: { text: body } }
      : { to: phone, text: body }
    if (g.device_id) payload.deviceId = g.device_id
    try {
      const res = await fetch(g.base_url + '/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: await gateAuthHeader(g) },
        body: JSON.stringify(payload),
      })
      const text = await res.text()
      if (res.ok) console.log(ok(`шлюз принял: HTTP ${res.status} ${text.slice(0, 100)}`))
      else {
        // Облако отдаёт error объектом {"error":{"message":…}}, self-hosted — строкой.
        let errText = text;
        try {
          const j = JSON.parse(text);
          const e = j && j.error;
          errText = e && (typeof e === 'string' ? e : e.message || e.code)
            || j && (j.message || j.detail) || text;
        } catch { /* не JSON */ }
        console.log(bad(`sms-gateway: HTTP ${res.status} ${errText.slice(0, 200)}`))
      }
      console.log(hint('Телефон забирает задачу из облака примерно за 10 секунд — SMS придёт с задержкой'))
    } catch (e) {
      console.log(bad('нет связи с ' + g.base_url + ': ' + e.message))
    }
    return
  }

  if (provider === 'smsru') {
    const { api_id, api_key, from } = config.sms.smsru
    const fields = { api_id, to: phone.replace('+', ''), msg: body, json: '1' }
    if (api_key) fields.api_key = api_key
    if (from) fields.from = from
    const r = await fetchJson('https://sms.ru/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
    })
    if (r.json?.status === 'OK') console.log(ok(`SMS принята шлюзом, баланс ${r.json.balance} руб.`))
    else console.log(bad(`sms.ru: ${r.json?.status_text || 'код ' + r.json?.status_code}`))
    return
  }

  if (provider === 'smsaero') {
    const { email, api_key, from } = config.sms.smsaero
    const r = await fetchJson('https://gate.smsaero.ru/v2/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email, apiSign: api_key, number: phone.replace('+', ''), text: body, from }).toString(),
    })
    console.log(r.json?.success ? ok('SMS принята шлюзом') : bad(`SMS Aero: ${r.json?.message || r.text.slice(0, 150)}`))
    return
  }

  if (provider === 'twilio') {
    const { accountSid, authToken, from, serviceSid } = config.sms.twilio
    const fields = { To: phone, Body: body }
    if (serviceSid) fields.MessagingServiceSid = serviceSid; else fields.From = from
    const r = await fetchJson(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(fields).toString(),
    })
    console.log(r.json?.sid ? ok('SMS отправлена, id ' + r.json.sid) : bad(`Twilio: ${r.json?.message || r.text.slice(0, 150)}`))
    return
  }

  console.log(warn('SMS_PROVIDER=demo — реальная отправка выключена. Поставьте smsru, smsaero или twilio в secrets.js'))
}

;(async () => {
  const argv = process.argv
  const testArg = argv.indexOf('--test')
  const testPhone = testArg > -1 ? argv[testArg + 1] : null
  const showPlan = argv.includes('--show')
  const ping = argv.includes('--ping')
  const secretsFound = (() => {
    try { require('../secrets'); return true } catch { return false }
  })()

  console.log('\n' + BOLD + 'MAXgram — проверка внешних сервисов' + OFF)
  if (!secretsFound) {
    console.log(warn('secrets.js не найден — ключи берутся только из переменных окружения.'))
    console.log(hint('Создайте: copy secrets.example.js secrets.js  и впишите ключи.'))
  }

  console.log('\n' + BOLD + 'SMS-провайдер: ' + config.sms.provider + OFF)
  let ready = false
  if (config.sms.provider === 'demo') {
    console.log('  ' + warn('демо-режим: код показывается на экране и никуда не отправляется'))
    console.log(hint('Для настоящей доставки поставьте provider: smsgate | http | smsru | smsaero | twilio'))
    ready = true
  } else if (config.sms.provider === 'http') {
    ready = checkHttp()
  } else if (config.sms.provider === 'smsgate') {
    ready = await checkSmsgate(!testPhone)
  } else if (config.sms.provider === 'smsru') {
    ready = await checkSmsru(!testPhone)
  } else if (config.sms.provider === 'smsaero') {
    ready = await checkSmsAero(!testPhone)
  } else if (config.sms.provider === 'twilio') {
    ready = await checkTwilio(!testPhone)
  }
  if (!ready) {
    console.log('  ' + bad('ключей не хватает — вход по SMS вернёт 503'))
    console.log(hint('Значения берутся из secrets.js либо из переменных окружения (SMSRU_API_ID, SMSAERO_EMAIL, …)'))
  }

  if (config.sms.provider === 'http') {
    if (ping) {
      console.log('\n' + BOLD + 'Проверка доступности шлюза' + OFF)
      await pingGateway(config.sms.http)
    }
    if (showPlan) {
      const plan = httpPlan(config.sms.http, '+79991234567', SMS_TEXT_SAMPLE)
      console.log('\n' + BOLD + 'Запрос, который уйдёт на шлюз' + OFF)
      console.log('  ' + plan.method + ' ' + plan.url)
      Object.entries(plan.headers).forEach(([k, v]) => console.log('  ' + k + ': ' + v))
      if (plan.payload) console.log('  ' + plan.payload)
      console.log(hint('Сравните имена полей с документацией приложения-шлюза и поправьте'))
      console.log(hint('phone_field / text_field / format / expect в secrets.js'))
    }
  }

  console.log('\n' + BOLD + 'OAuth-провайдеры' + OFF)
  const rows = [
    ['Google', config.oauth.google.client_id, config.oauth.google.client_secret, 'console.cloud.google.com/apis/credentials'],
    ['Яндекс', config.oauth.yandex.client_id, config.oauth.yandex.client_secret, 'id.yandex.ru/developer/applications'],
    ['VK', config.oauth.vk.client_id, config.oauth.vk.client_secret, 'id.vk.com/about/business/go'],
    ['OK', config.oauth.ok.client_id, config.oauth.ok.api_secret, 'dev.ok.ru/create'],
  ]
  for (const [label, id, secret, where] of rows) {
    const good = !!id && !!secret
    console.log(`  ${label.padEnd(7)} ${good ? ok('готов') : warn('не настроен')}` + DIM + `   ${where}` + OFF)
    if (!good) console.log(hint('client_id: ' + (id ? 'задан' : 'нет') + ', secret: ' + (secret ? 'задан' : 'нет')))
  }

  console.log('\n' + BOLD + 'Адрес для OAuth-редиректов' + OFF)
  if (config.publicUrlExplicit) {
    console.log('  ' + ok(config.publicUrl) + DIM + '  (из PUBLIC_URL)' + OFF)
  } else {
    console.log('  ' + warn('PUBLIC_URL не задан — адрес берётся из запроса'))
    console.log(hint('Для localhost это правильно. Для продакшена задайте PUBLIC_URL=https://ваш-домен'))
  }
  console.log(hint(`redirect URI для провайдеров: ${config.publicUrl}/auth/<провайдер>/callback`))

  if (testPhone) {
    console.log('\n' + BOLD + `Тестовая SMS на ${testPhone}` + OFF)
    await sendTestSms(testPhone)
  }

  console.log('')
})().catch((e) => {
  console.error('\nОшибка диагностики:', e.message)
  console.error('Проверьте, что в secrets.js нет синтаксической ошибки (кавычки, запятые).\n')
  process.exit(1)
})
