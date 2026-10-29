/*
 * ВРЕМЕННО (удаляю после проверки). Мок cloud/self-hosted API sms-gateway + прогоны
 * реального server.js против него. Проверяет, что правки формата payload и определения
 * успеха работают. Реальное облако не затрагивается, SMS не отправляются.
 */
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');

let passed = 0, failed = 0;
const ok = (name, cond, extra) => {
  if (cond) { passed++; console.log('  [OK]   ' + name); }
  else { failed++; console.log('  [FAIL] ' + name + (extra ? ' -> ' + extra : '')); }
};

// ---------- мок sms-gateway ----------
const received = [];
let mode = 'cloud'; // cloud = ждёт {to,text}; self = ждёт {phoneNumbers,textMessage}

const mock = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    if (req.method === 'GET' && req.url === '/api/v1/devices') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ data: [{ id: 11489, name: 'MOCK', enabled: true }] }));
    }
    if (req.url.endsWith('/messages') && req.method === 'POST') {
      const json = (() => { try { return JSON.parse(body); } catch { return null; } })();
      received.push({ auth: req.headers.authorization, url: req.url, json, raw: body });

      if (!/^Bearer /.test(req.headers.authorization || '')) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: { type: 'unauthorized', message: 'no token' } }));
      }
      const selfHosted = mode === 'self';
      const hasCloud = json && typeof json.to === 'string' && typeof json.text === 'string';
      const hasSelf = json && Array.isArray(json.phoneNumbers) && json.textMessage && typeof json.textMessage.text === 'string';
      if (selfHosted ? !hasSelf : !hasCloud) {
        const missing = selfHosted ? 'phoneNumbers' : 'to';
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: { type: 'invalid_request', code: 'missing_parameter', message: `The \`${missing}\` parameter is required.`, param: missing } }));
      }
      // Как облако: 202, accepted, messages[].id — id НЕТ на верхнем уровне
      res.writeHead(202, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        campaignId: 1, accepted: 1, scheduledAt: null,
        messages: [{ id: 90000001, number: selfHosted ? json.phoneNumbers[0] : json.to, status: 'Pending' }],
        warnings: [],
      }));
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { type: 'not_found', code: 'unknown_endpoint' } }));
  });
});

const listen = (server) => new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port)));

// ---------- запуск сервера MAXgram с указанными env ----------
function startApp(env) {
  const { spawn } = require('child_process');
  const dataFile = path.join(os.tmpdir(), 'probe-smsgate-data.json');
  try { fs.unlinkSync(dataFile); } catch {}
  const child = spawn(process.execPath, [path.join(__dirname, 'messenger', 'server.js')], {
    env: { ...process.env, PORT: '0', DATA_FILE: dataFile, UPLOAD_DIR: path.join(os.tmpdir(), 'probe-smsgate-uploads'), SMSRU_API_ID: '', SMSAERO_EMAIL: '', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const lines = [];
  child.stdout.on('data', (d) => lines.push(d.toString()));
  child.stderr.on('data', (d) => lines.push(d.toString()));
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('сервер не поднялся: ' + lines.join(''))), 15000);
    const timer = setInterval(() => {
      const m = lines.join('').match(/http:\/\/localhost:(\d+)/) || lines.join('').match(/порт\S*\s+(\d+)/);
      if (m) { clearInterval(timer); clearTimeout(to); resolve({ child, port: Number(m[1]), lines: lines.join('') }); }
    }, 120);
  });
}

const stop = (child) => new Promise((r) => { child.on('exit', r); child.kill(); setTimeout(r, 3000); });

async function api(port, p, opts = {}) {
  const res = await fetch(`http://127.0.0.1:${port}${p}`, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

(async () => {
  const mockPort = await listen(mock);
  const cloudUrl = `http://127.0.0.1:${mockPort}/api/v1`;
  const selfUrl = `http://127.0.0.1:${mockPort}/3rdparty/v1`;
  console.log(`мок sms-gateway: порт ${mockPort}\n`);

  // ---- 1. cloud API: сервер должен слать плоский {to,text} ----
  console.log('=== cloud API (…/api/v1) ===');
  mode = 'cloud';
  received.length = 0;
  let app = await startApp({ SMS_PROVIDER: 'smsgate', SMS_GATE_URL: cloudUrl, SMS_GATE_KEY: 'sboxk_live_mock' });
  const sent1 = await api(app.port, '/api/auth/send-code', { method: 'POST', body: { phone: '+79000001111' } });
  ok('send-code -> 200', sent1.status === 200, JSON.stringify(sent1.body));
  ok('sent:true', sent1.body?.sent === true);
  ok('не демо (код НЕ показан)', sent1.body?.demo === false && sent1.body?.demo_code === undefined);
  ok('мок получил ровно 1 запрос', received.length === 1, received.length);
  const p1 = received[0];
  ok('POST на /api/v1/messages', p1 && /\/api\/v1\/messages$/.test(p1.url), p1 && p1.url);
  ok('Bearer-ключ в заголовке', p1 && p1.auth === 'Bearer sboxk_live_mock', p1 && p1.auth);
  ok('плоский to = номер', p1 && p1.json.to === '+79000001111', p1 && JSON.stringify(p1.json));
  ok('плоский text содержит код', p1 && /\d{5}/.test(p1.json.text || ''), p1 && p1.json.text);
  ok('НЕТ phoneNumbers/textMessage', p1 && !p1.json.phoneNumbers && !p1.json.textMessage);
  const prov1 = await api(app.port, '/api/auth/providers');
  ok('providers: smsgate + ready', prov1.body.sms_provider === 'smsgate' && prov1.body.sms_ready === true);
  await stop(app.child);

  // ---- 2. cloud API: 4xx превращается в понятную ошибку, не в [object Object] ----
  console.log('\n=== cloud API: ошибки провайдера ===');
  mode = 'self'; // мок начнёт требовать вложенный формат -> наш cloud-запрос получит 400
  received.length = 0;
  app = await startApp({ SMS_PROVIDER: 'smsgate', SMS_GATE_URL: cloudUrl, SMS_GATE_KEY: 'sboxk_live_mock' });
  const bad400 = await api(app.port, '/api/auth/send-code', { method: 'POST', body: { phone: '+79000002222' } });
  ok('400 от шлюза -> 502 для клиента', bad400.status === 502, bad400.status + ' ' + JSON.stringify(bad400.body));
  ok('текст ошибки человеческий (message из error-объекта)', /`phoneNumbers`|missing_parameter|required/.test(bad400.body?.error || ''), bad400.body?.error);
  ok('в ошибке нет [object Object]', !/\[object Object\]/.test(bad400.body?.error || ''));
  await stop(app.child);

  // ---- 3. self-hosted: сервер должен слать вложенный {phoneNumbers,textMessage} ----
  console.log('\n=== self-hosted API (…/3rdparty/v1) ===');
  mode = 'self';
  received.length = 0;
  app = await startApp({ SMS_PROVIDER: 'smsgate', SMS_GATE_URL: selfUrl, SMS_GATE_KEY: 'sboxk_live_mock' });
  const sent3 = await api(app.port, '/api/auth/send-code', { method: 'POST', body: { phone: '+79000003333' } });
  ok('send-code -> 200', sent3.status === 200, JSON.stringify(sent3.body));
  ok('sent:true', sent3.body?.sent === true);
  const p3 = received[0];
  ok('POST на /3rdparty/v1/messages', p3 && /\/3rdparty\/v1\/messages$/.test(p3.url), p3 && p3.url);
  ok('вложенный phoneNumbers', p3 && Array.isArray(p3.json.phoneNumbers) && p3.json.phoneNumbers[0] === '+79000003333', p3 && JSON.stringify(p3.json));
  ok('вложенный textMessage.text', p3 && typeof p3.json.textMessage?.text === 'string' && /\d{5}/.test(p3.json.textMessage.text));
  await stop(app.child);

  // ---- 4. device_id прокидывается в обоих форматах ----
  console.log('\n=== device_id ===');
  mode = 'cloud'; received.length = 0;
  app = await startApp({ SMS_PROVIDER: 'smsgate', SMS_GATE_URL: cloudUrl, SMS_GATE_KEY: 'k', SMS_GATE_DEVICE: '11489' });
  await api(app.port, '/api/auth/send-code', { method: 'POST', body: { phone: '+79000004444' } });
  ok('cloud: deviceId в теле', received[0]?.json.deviceId === '11489', JSON.stringify(received[0]?.json));
  await stop(app.child);

  mode = 'self'; received.length = 0;
  app = await startApp({ SMS_PROVIDER: 'smsgate', SMS_GATE_URL: selfUrl, SMS_GATE_KEY: 'k', SMS_GATE_DEVICE: '11489' });
  await api(app.port, '/api/auth/send-code', { method: 'POST', body: { phone: '+79000005555' } });
  ok('self-hosted: deviceId в теле', received[0]?.json.deviceId === '11489', JSON.stringify(received[0]?.json));
  await stop(app.child);

  mock.close();
  console.log(`\n=== Итог: ${passed} passed, ${failed} failed ===`);
  process.exit(failed ? 1 : 0);
})().catch(async (e) => {
  console.error('\nОШИБКА ПРОБЕРА:', e.message);
  process.exit(1);
});
