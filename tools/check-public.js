/* Проверяет два режима запуска сервера без ручных команд:
   1) локальный (SEED_DEMO=1) — демо-код выдаётся, сайт считается локальным;
   2) публичный (PUBLIC_URL на внешний домен) — демо-код не выдаётся (503),
      клиент получает sms_disabled и показывает предупреждение.
   Запуск: npm run check:public */
const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let failed = 0;

function ok(name, cond, extra) {
  console.log(`${cond ? '[OK]  ' : '[FAIL]'} ${name}${cond || !extra ? '' : ' -> ' + extra}`);
  if (!cond) failed += 1;
}

function startServer(port, env) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), HTTPS: '0', ...env },
    stdio: 'ignore',
    windowsHide: true,
  });
  return child;
}

async function waitReady(port, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) return true;
    } catch { /* сервер ещё поднимается */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function stop(child) {
  if (!child || child.killed) return;
  child.kill();
  await new Promise((r) => setTimeout(r, 800));
}

async function scenario(name, port, env, checks) {
  console.log(`\n=== ${name} ===`);
  const child = startServer(port, env);
  try {
    const ready = await waitReady(port);
    if (!ready) {
      ok(`${name}: сервер поднялся`, false, 'нет ответа /api/health');
      return;
    }
    const base = `http://127.0.0.1:${port}`;
    const providers = await fetch(`${base}/api/auth/providers`).then((r) => r.json());
    const send = await fetch(`${base}/api/auth/send-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+79990000001' }),
    });
    const sendBody = await send.json().catch(() => null);
    const health = await fetch(`${base}/api/health`).then((r) => r.json());
    checks({ providers, send, sendBody, health });
  } finally {
    await stop(child);
  }
}

(async () => {
  await scenario('Локальный режим (SEED_DEMO=1)', 3398,
    { SEED_DEMO: '1', SMS_PROVIDER: 'demo' },
    ({ providers, send, sendBody, health }) => {
      ok('локально: public_site=false', providers.public_site === false, JSON.stringify(providers.public_site));
      ok('локально: sms_disabled=false', providers.sms_disabled === false, JSON.stringify(providers.sms_disabled));
      ok('локально: демо-код выдаётся', send.status === 200 && !!sendBody?.demo_code, `${send.status} ${JSON.stringify(sendBody)}`);
      ok('локально: демо-аккаунты засеяны', health.users >= 5, `users=${health.users}`);
    });

  await scenario('Публичный режим (внешний домен, без флага)', 3399,
    { SEED_DEMO: '0', SMS_PROVIDER: 'demo', PUBLIC_URL: 'https://maxgram.example.com' },
    ({ providers, send, sendBody, health }) => {
      ok('публично: public_site=true', providers.public_site === true, JSON.stringify(providers.public_site));
      ok('публично: sms_disabled=true', providers.sms_disabled === true, JSON.stringify(providers.sms_disabled));
      ok('публично: send-code отвечает 503', send.status === 503, String(send.status));
      ok('публично: причина sms_setup_required', sendBody?.sms_setup_required === true, JSON.stringify(sendBody));
      ok('публично: демо-кода в ответе нет', !sendBody?.demo_code, JSON.stringify(sendBody?.demo_code));
      ok('публично: база пустая', health.users === 0 && health.chats === 0, JSON.stringify(health));
    });

  console.log(`\n=== ${failed ? failed + ' проверок не прошло' : 'все проверки пройдены'} ===\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('ОШИБКА: ' + e.message);
  process.exit(1);
});
