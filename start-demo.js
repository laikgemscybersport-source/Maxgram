// ВРЕМЕННО (удаляю после проверки): поднимает MAXgram-сервер detached-процессом
// с нужными env и пишет его порт в файл, чтобы тесты могли к нему обратиться.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const env = { ...process.env, SMS_PROVIDER: 'demo', PORT: '3000' };
delete env.ELECTRON_RUN_AS_NODE;
delete env.SMS_GATE_KEY;
delete env.MAXGRAM_SECRETS;

const out = fs.openSync(path.join(__dirname, 'messenger', 'server-live.log'), 'a');
const child = spawn(process.execPath, [path.join(__dirname, 'messenger', 'server.js')], {
  env, detached: true, stdio: ['ignore', out, out], cwd: path.join(__dirname, 'messenger'),
});
child.unref();
fs.writeFileSync(path.join(__dirname, 'server.pid'), String(child.pid));
console.log('сервер запущен, pid=' + child.pid);
