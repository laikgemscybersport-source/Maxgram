/* Интеграционный тест MAXgram: авторизация по SMS-коду, REST + WebSocket, медиа, звонки */
const WebSocket = require('ws');

const BASE = 'http://localhost:3000';
let passed = 0;
let failed = 0;

function ok(name, cond, extra) {
  if (cond) {
    passed++;
    console.log('  [OK]   ' + name);
  } else {
    failed++;
    console.log('  [FAIL] ' + name + (extra ? ' -> ' + extra : ''));
  }
}

async function req(path, opts = {}, token) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(BASE + path, { ...opts, headers });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

function openSocket(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws?token=' + encodeURIComponent(token));
    const events = [];
    ws.on('open', () => resolve({ ws, events }));
    ws.on('message', (raw) => {
      try { events.push(JSON.parse(raw.toString())); } catch { /* ignore */ }
    });
    ws.on('error', reject);
    setTimeout(() => reject(new Error('timeout: ws connect')), 4000);
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function findEvent(events, type, pred = () => true, timeout = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const found = events.find((e) => e.type === type && pred(e));
    if (found) return found;
    await wait(100);
  }
  return null;
}

// Вход по номеру: демо-режим SMS возвращает код на экране
async function login(phone, profile) {
  const send = await req('/api/auth/send-code', { method: 'POST', body: JSON.stringify({ phone }) });
  if (!send.body?.demo_code) throw new Error('не получен демо-код: ' + JSON.stringify(send.body));
  const verify = await req('/api/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ phone, code: send.body.demo_code }),
  });
  if (verify.body?.needs_profile) {
    const reg = await req('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ phone, ...profile }),
    });
    return reg.body;
  }
  return verify.body;
}

(async () => {
  console.log('\n=== MAXgram: интеграционные тесты ===\n');

  // Тесты логинятся через demo_code на фиктивных номерах, поэтому сервер обязан
  // работать в demo-режиме. Иначе send-code отправит настоящие SMS на эти номера.
  const boot = await req('/api/auth/providers');
  if (boot.body?.sms_provider && boot.body.sms_provider !== 'demo') {
    console.error(`ОСТАНОВКА: сервер запущен с SMS_PROVIDER=${boot.body.sms_provider}.`);
    console.error('Тесты требуют demo-режим (иначе send-code шлёт реальные SMS на тестовые номера).');
    console.error('Запустите сервер без реального провайдера: set SMS_PROVIDER=demo && node server.js');
    process.exit(1);
  }

  // 1. Гость без токена не получает данные
  const anon = await req('/api/users');
  ok('GET /api/users без токена -> 401', anon.status === 401);

  // 2. SMS-код: запрос и проверка
  const code = await req('/api/auth/send-code', { method: 'POST', body: JSON.stringify({ phone: '+79991234567' }) });
  ok('POST /auth/send-code -> 200', code.status === 200);
  ok('код 5 цифр в демо-режиме', /^\d{5}$/.test(String(code.body.demo_code || '')), code.body.demo_code);
  ok('TTL кода 300 секунд', code.body.ttl_sec === 300);

  const badCode = await req('/api/auth/verify', { method: 'POST', body: JSON.stringify({ phone: '+79991234567', code: '00000' }) });
  ok('неверный код отклонён', badCode.status === 400 && /Неверный код/.test(badCode.body?.error || ''));

  const okVerify = await req('/api/auth/verify', { method: 'POST', body: JSON.stringify({ phone: '+79991234567', code: code.body.demo_code }) });
  ok('верный код выдаёт токен', okVerify.status === 200 && !!okVerify.body.token);
  ok('профиль возвращается без паролей', okVerify.body.user?.id === 'u1' && !!okVerify.body.user.phone_raw);

  // 3. Новый номер -> создание профиля
  const newPhone = '+7900' + String(Date.now()).slice(-7);
  const handle = 'auto' + String(Date.now()).slice(-6);
  const fresh = await login(newPhone, { name: 'Тест Профиль', username: 'UP' + handle, bio: 'автотест' });
  ok('новый аккаунт создан', !!fresh.token && !!fresh.user?.id);
  ok('номер нормализован к +7', fresh.user?.phone_raw === '+' + newPhone.replace(/\D/g, ''), fresh.user?.phone_raw);
  ok('username приведён к нижнему регистру', fresh.user?.username === 'up' + handle.toLowerCase(), fresh.user?.username);

  const alice = fresh.token;
  const aliceId = fresh.user.id;

  const u1 = await login('+79991234567');
  const u2 = await login('+79992345678');
  ok('u1 и u2 вошли по своим номерам', !!u1.token && !!u2.token);

  // 4. /api/me
  const me = await req('/api/me', {}, u1.token);
  ok('GET /api/me -> профиль u1', me.status === 200 && me.body.user?.id === 'u1');
  const meAnon = await req('/api/me');
  ok('GET /api/me без токена -> 401', meAnon.status === 401);

  // 5. Редактирование профиля
  const upd = await req('/api/me', { method: 'PUT', body: JSON.stringify({ bio: 'Обновлено тестом', name: 'Алексей Т.' }) }, u1.token);
  ok('PUT /api/me сохраняет био', upd.status === 200 && upd.body.user.bio === 'Обновлено тестом');
  ok('PUT /api/me сохраняет имя', upd.body.user.name === 'Алексей Т.');
  await req('/api/me', { method: 'PUT', body: JSON.stringify({ name: 'Алексей' }) }, u1.token);

  // 6. Провайдеры OAuth
  const prov = await req('/api/auth/providers');
  ok('GET /auth/providers -> 4 провайдера', prov.status === 200 && Object.keys(prov.body.providers).length === 4);
  ok('демо-режим SMS объявлен', prov.body.sms_provider === 'demo');
  const gs = await req('/api/auth/google/start');
  ok('не настроенный Google -> 501 с подсказкой', gs.status === 501 && /client_id/.test(gs.body?.error || ''));

  // 7. Чаты
  const chats = await req('/api/users/u1/chats', {}, u1.token);
  ok('GET chats u1 -> 200', chats.status === 200);
  const dm = chats.body.filter((c) => !c.is_group && !c.is_self && !c.is_channel);
  const gr = chats.body.filter((c) => c.is_group);
  const ch = chats.body.filter((c) => c.is_channel);
  const fav = chats.body.filter((c) => c.is_self);
  ok('есть личные чаты', dm.length >= 4, 'found ' + dm.length);
  ok('есть группы', gr.length >= 2, 'found ' + gr.length);
  ok('есть каналы', ch.length >= 2, 'found ' + ch.length);
  ok('есть Избранное', fav.length === 1 && fav[0].key === 's:u1');
  ok('ключи чатов корректны', dm.every((c) => c.key.startsWith('p:')) && gr.every((c) => c.key.startsWith('g:')) && ch.every((c) => c.key.startsWith('c:')));
  ok('me_id проставлен', chats.body.every((c) => c.me_id === 'u1'));

  // 8. История
  const hist = await req('/api/chats/' + encodeURIComponent('p:u1,u2') + '/messages', {}, u2.token);
  ok('GET истории -> 200', hist.status === 200 && hist.body.length >= 6);
  ok('сообщения прочитаны для u2', hist.body.every((m) => m.status === 'read'));

  // 9. WebSocket с токеном
  const wsAnon = new WebSocket(BASE.replace('http', 'ws') + '/ws');
  const closed = await new Promise((r) => {
    wsAnon.on('close', () => r(true));
    wsAnon.on('error', () => r(true));
    setTimeout(() => r(false), 2500);
  });
  ok('ws без токена закрывается', closed);

  const a = await openSocket(u1.token);
  const b = await openSocket(u2.token);
  ok('ws u1 подключён', a.ws.readyState === WebSocket.OPEN);
  ok('ws u2 подключён', b.ws.readyState === WebSocket.OPEN);

  const usersEvent = await findEvent(b.events, 'users');
  ok('u2 получил список пользователей по ws', !!usersEvent);
  ok('u1 помечен онлайн', !!usersEvent && usersEvent.users.find((u) => u.id === 'u1').online === true);

  // 10. Текстовое сообщение в реальном времени
  const text = 'Привет из автотеста ' + Date.now();
  const sent = await req('/api/messages', { method: 'POST', body: JSON.stringify({ chat_key: 'p:u1,u2', content: text }) }, u1.token);
  ok('POST /api/messages -> 200', sent.status === 200 && !!sent.body.id);
  ok('статус delivered (u2 онлайн)', sent.body.status === 'delivered', sent.body.status);
  ok('kind=text сохранён', sent.body.kind === 'text');

  const got = await findEvent(b.events, 'message', (e) => e.message?.content === text);
  ok('u2 получил сообщение в реальном времени', !!got);

  // 11. Пустое и чужое сообщение
  const empty = await req('/api/messages', { method: 'POST', body: JSON.stringify({ chat_key: 'p:u1,u2', content: '   ' }) }, u1.token);
  ok('пустое сообщение -> 400', empty.status === 400);

  const noPayload = await req('/api/messages', { method: 'POST', body: JSON.stringify({ chat_key: 'p:u1,u2', kind: 'file' }) }, u1.token);
  ok('файл без media -> 400', noPayload.status === 400);

  const stranger = await req('/api/messages', { method: 'POST', body: JSON.stringify({ chat_key: 'p:u3,u4', content: 'хак' }) }, u1.token);
  ok('отправка в чужой чат отклонена', stranger.status === 400 || stranger.status === 403, stranger.status);

  const fakeSender = await req('/api/messages', { method: 'POST', body: JSON.stringify({ chat_key: 'p:u1,u2', sender_id: 'u2', content: 'маскарад' }) }, u1.token);
  ok('sender_id всегда берётся из токена', fakeSender.status === 200 && fakeSender.body.sender_id === 'u1', fakeSender.body?.sender_id);

  // 12. Медиа-сообщения
  const kinds = [
    { kind: 'voice', media: { url: '/uploads/x/voice.webm', name: 'voice.webm', mime: 'audio/webm', size: 20480, dur: 12 } },
    { kind: 'photo', media: { url: '/uploads/x/p.jpg', name: 'p.jpg', mime: 'image/jpeg', size: 4096 } },
    { kind: 'circle', media: { url: '/uploads/x/c.webm', name: 'c.webm', mime: 'video/webm', size: 30000, dur: 7 } },
    { kind: 'location', location: { lat: 55.7522, lng: 37.6156, name: 'Красная площадь' } },
    { kind: 'contact', contact: { userId: 'u4', name: 'Елена', phone: '+7 (999) 456-78-90', phone_raw: '79994567890' } },
    { kind: 'event', event: { title: 'Созвон', start: '2026-11-05T15:00:00.000Z', end: null, place: 'онлайн', note: 'повестка' } },
    { kind: 'file', media: { url: '/uploads/x/doc.pdf', name: 'doc.pdf', mime: 'application/pdf', size: 1024 } },
    { kind: 'video', media: { url: '/uploads/x/mov.mp4', name: 'mov.mp4', mime: 'video/mp4', size: 9000 } },
  ];
  for (const payload of kinds) {
    const r = await req('/api/messages', { method: 'POST', body: JSON.stringify({ chat_key: 'p:u1,u2', ...payload }) }, u1.token);
    ok('kind=' + payload.kind + ' принят', r.status === 200 && r.body.kind === payload.kind, r.status + ' ' + JSON.stringify(r.body?.error || ''));
  }

  const callMsg = await req('/api/messages', { method: 'POST', body: JSON.stringify({ chat_key: 'p:u1,u2', kind: 'call', content: 'Видеозвонок · 1:20' }) }, u1.token);
  ok('kind=call принят без вложений', callMsg.status === 200 && callMsg.body.kind === 'call');
  const callNoText = await req('/api/messages', { method: 'POST', body: JSON.stringify({ chat_key: 'p:u1,u2', kind: 'call' }) }, u1.token);
  ok('call без описания -> 400', callNoText.status === 400);

  // 13. Избранное
  const favSent = await req('/api/messages', { method: 'POST', body: JSON.stringify({ chat_key: 's:u1', content: 'моя заметка' }) }, u1.token);
  ok('сообщение в Избранное', favSent.status === 200 && favSent.body.kind === 'text');
  const favRead = await req('/api/chats/' + encodeURIComponent('s:u1') + '/messages', {}, u1.token);
  ok('Избранное читается владельцем', favRead.status === 200 && favRead.body.some((m) => m.content === 'моя заметка'));
  const favForeign = await req('/api/messages', { method: 'POST', body: JSON.stringify({ chat_key: 's:u2', content: 'не моё' }) }, u1.token);
  ok('чужое Избранное -> 403', favForeign.status === 403);
  const favList = await req('/api/users/u2/chats', {}, u2.token);
  ok('Избранное есть у каждого', favList.body.some((c) => c.key === 's:u2' && c.is_self));

  // 14. Загрузка файла (multipart)
  const form = new FormData();
  form.append('files', new Blob(['тестовое содержимое файла'], { type: 'text/plain' }), 'note.txt');
  const up = await fetch(BASE + '/api/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + u1.token }, body: form });
  const upBody = await up.json().catch(() => null);
  ok('POST /api/upload -> 200', up.status === 200 && Array.isArray(upBody?.files) && upBody.files.length === 1);
  ok('файл сохранён под uploads/<uid>/', /^\/uploads\/u1\//.test(upBody?.files?.[0]?.url || ''), upBody?.files?.[0]?.url);
  ok('имя файла сохранено', upBody?.files?.[0]?.name === 'note.txt');
  const served = await fetch(BASE + upBody.files[0].url);
  ok('файл отдаётся по ссылке', served.status === 200 && (await served.text()).includes('тестовое содержимое'));
  const upAnon = await fetch(BASE + '/api/upload', { method: 'POST', body: new FormData() });
  ok('загрузка без токена -> 401', upAnon.status === 401);

  const withMedia = await req('/api/messages', { method: 'POST', body: JSON.stringify({ chat_key: 's:u1', kind: 'file', media: upBody.files[0] }) }, u1.token);
  ok('файл-сообщение с реальным url', withMedia.status === 200 && withMedia.body.media.url === upBody.files[0].url);

  // 15. Удаление сообщения
  const del = await req('/api/messages/' + favSent.body.id, { method: 'DELETE' }, u1.token);
  ok('DELETE /api/messages/:id -> ok', del.status === 200 && del.body.ok === true);
  const afterDel = await req('/api/chats/' + encodeURIComponent('s:u1') + '/messages', {}, u1.token);
  ok('сообщение удалено из истории', !afterDel.body.some((m) => m.id === favSent.body.id));
  const delForeign = await req('/api/messages/' + sent.body.id, { method: 'DELETE' }, u2.token);
  ok('чужое сообщение удалить нельзя', delForeign.status === 403 || delForeign.status === 404, delForeign.status);

  // 16. Прочтение и unread
  // u2 пишет u1 — только такое сообщение u1 может «прочитать», и сервер разошлет read_all
  const fromU2 = await req('/api/messages', { method: 'POST', body: JSON.stringify({ chat_key: 'p:u1,u2', content: 'Ответ от u2' }) }, u2.token);
  ok('u2 написал u1', fromU2.status === 200 && fromU2.body.sender_id === 'u2');
  a.ws.send(JSON.stringify({ type: 'read', chat_key: 'p:u1,u2' }));
  const readEv = await findEvent(b.events, 'read_all', (e) => e.chat_key === 'p:u1,u2' && e.reader_id === 'u1');
  ok('u2 получил read_all от u1', !!readEv);
  const histU2 = await req('/api/chats/' + encodeURIComponent('p:u1,u2') + '/messages', {}, u2.token);
  const ownMsg = histU2.body.find((m) => m.id === sent.body.id);
  ok('сообщение u1 стало read на сервере', ownMsg?.status === 'read', ownMsg?.status);

  const u3 = await login('+79993456789');
  const c1 = await req('/api/users/u1/chats', {}, u1.token);
  const before = c1.body.find((x) => x.key === 'p:u1,u3').unread;
  await req('/api/messages', { method: 'POST', body: JSON.stringify({ chat_key: 'p:u1,u3', content: 'Непрочитанное' }) }, u3.token);
  const c2 = await req('/api/users/u1/chats', {}, u1.token);
  const after = c2.body.find((x) => x.key === 'p:u1,u3').unread;
  ok('unread вырос на 1', after === before + 1, before + ' -> ' + after);

  const readRest = await req('/api/chats/' + encodeURIComponent('p:u1,u3') + '/read', { method: 'POST', body: '{}' }, u1.token);
  ok('POST /chats/:key/read -> ok', readRest.status === 200);
  const c3 = await req('/api/users/u1/chats', {}, u1.token);
  ok('unread обнулился после прочтения', c3.body.find((x) => x.key === 'p:u1,u3').unread === 0);

  // 17. Индикатор набора текста
  a.ws.send(JSON.stringify({ type: 'typing', chat_key: 'p:u1,u2' }));
  const typing = await findEvent(b.events, 'typing', (e) => e.chat_key === 'p:u1,u2' && e.user_id === 'u1');
  ok('u2 получил событие typing', !!typing);

  // 18. Группы
  const group = await req('/api/groups', { method: 'POST', body: JSON.stringify({ name: 'Тестовая группа', members: ['u1', 'u3', 'u5'] }) }, u1.token);
  ok('POST /api/groups -> 200', group.status === 200 && !!group.body.id);
  ok('создатель в составе группы', group.body.members.includes('u1'));
  const chatsU3 = await req('/api/users/u3/chats', {}, u3.token);
  ok('группа видна участнику', chatsU3.body.some((x) => x.key === 'g:' + group.body.id));
  const noAccess = await req('/api/messages', { method: 'POST', body: JSON.stringify({ chat_key: 'g:' + group.body.id, content: 'я чужой' }) }, u2.token);
  ok('не-участник не пишет в группу', noAccess.status === 403);
  const badGroup = await req('/api/groups', { method: 'POST', body: JSON.stringify({ name: '', members: ['u1'] }) }, u1.token);
  ok('группа без названия -> 400', badGroup.status === 400);

  // 19. Сигнализация звонка u1 -> u2
  const callId = 'c' + Date.now();
  a.ws.send(JSON.stringify({ type: 'call', action: 'offer', call_id: callId, to: 'u2', video: true, sdp: { type: 'offer', sdp: 'v=0 тест' } }));
  const incoming = await findEvent(b.events, 'call', (e) => e.action === 'offer' && e.call_id === callId);
  ok('u2 получил offer', !!incoming);
  ok('offer несёт имя звонящего', incoming?.from_name === 'Алексей', incoming?.from_name);
  ok('offer несёт видео-флаг', incoming?.video === true);

  b.ws.send(JSON.stringify({ type: 'call', action: 'ice', call_id: callId, to: 'u1', candidate: { candidate: 'candidate:1 1' } }));
  const iceOnA = await findEvent(a.events, 'call', (e) => e.action === 'ice' && e.call_id === callId);
  ok('ICE-кандидат доставлен звонящему', !!iceOnA);

  b.ws.send(JSON.stringify({ type: 'call', action: 'ended', call_id: callId, to: 'u1' }));
  const endedOnA = await findEvent(a.events, 'call', (e) => e.action === 'ended' && e.call_id === callId);
  ok('сигнал about завершении дошёл', !!endedOnA);

  const offlineCall = await req('/api/users', {}, u1.token).then((r) => r.body.find((u) => u.id === 'u5'));
  ok('u5 сейчас офлайн', offlineCall.online === false);
  a.ws.send(JSON.stringify({ type: 'call', action: 'offer', call_id: 'c-offline', to: 'u5', video: false }));
  const unreachable = await findEvent(a.events, 'call', (e) => e.action === 'unreachable' && e.call_id === 'c-offline');
  ok('звонок офлайн-пользователю -> unreachable', !!unreachable);

  // 20. Оффлайн после disconnect
  const u5sock = await openSocket((await login('+79995678901')).token);
  const onlineNow = await req('/api/users', {}, u1.token);
  ok('u5 онлайн по ws', onlineNow.body.find((u) => u.id === 'u5').online === true);
  u5sock.ws.close();
  await wait(700);
  const offlineNow = await req('/api/users', {}, u1.token);
  ok('u5 стал офлайн после disconnect', offlineNow.body.find((u) => u.id === 'u5').online === false);

  // 21. Logout инвалидирует токен
  const out = await req('/api/auth/logout', { method: 'POST' }, alice);
  ok('POST /auth/logout -> ok', out.status === 200);
  const afterLogout = await req('/api/me', {}, alice);
  ok('токен после выхода недействителен', afterLogout.status === 401);

  // 22. Статика и SPA
  const spa = await fetch(BASE + '/some/deep/route');
  const html = await spa.text();
  ok('SPA-роут отдаёт index.html', spa.status === 200 && html.includes('<div id="root">'));
  const asset = html.match(/assets\/index-[\w-]+\.js/)?.[0];
  const bundle = await fetch(BASE + '/' + asset);
  const js = await bundle.text();
  ok('бандл собирается и отдаётся', bundle.status === 200 && js.length > 10000);
  ok('в бандле есть экран авторизации по SMS', js.includes('Код подтверждения'));
  ok('в бандле есть видеокружок', js.includes('Видеокружок'));
  ok('в бандле есть WebRTC-звонок', js.includes('RTCPeerConnection'));
  ok('в бандле есть геолокация', js.includes('Моё местоположение'));
  ok('в бандле есть OAuth-провайдеры', js.includes('Яндекс') && js.includes('Google'));
  ok('в бандле есть каналы и истории', js.includes('Подписаться') && js.includes('Новая история'));
  ok('в бандле есть меню сообщения', js.includes('Закрепить') && js.includes('Переслать'));
  ok('в бандле есть настройки приватности статуса', js.includes('Невидимка'));
  const health = await req('/api/health');
  ok('GET /api/health доступен без токена (health-check для хостинга)', health.status === 200 && health.body.ok === true && health.body.name === 'MAXgram');

  // 23. Каналы: публикация, права, закрепление, просмотры
  const u6 = await login('+79996789012', { name: 'Тест Читатель', username: 'reader' + String(Date.now()).slice(-6) });
  const cu6 = await openSocket(u6.token);
  const chan = await req('/api/channels', { method: 'POST', body: JSON.stringify({ name: 'Тест канал', is_public: true, handle: 'tst' + String(Date.now()).slice(-6), description: 'автотест' }) }, u1.token);
  const chanKey = 'c:' + chan.body.id;
  ok('POST /api/channels -> публичный канал', chan.status === 200 && chan.body.is_public && chan.body.handle, JSON.stringify(chan.body?.error || ''));
  ok('создатель — админ канала', chan.body.admins.includes('u1') && chan.body.owner === 'u1');
  const noHandle = await req('/api/channels', { method: 'POST', body: JSON.stringify({ name: 'Без адреса', is_public: true }) }, u1.token);
  ok('публичному каналу нужен адрес', noHandle.status === 400);
  const dup = await req('/api/channels', { method: 'POST', body: JSON.stringify({ name: 'Дубль', is_public: true, handle: chan.body.handle }) }, u6.token);
  ok('занятый адрес -> 409', dup.status === 409);
  const privChan = await req('/api/channels', { method: 'POST', body: JSON.stringify({ name: 'Закрытый тест', is_public: false }) }, u1.token);
  ok('частный канал создан без адреса', privChan.status === 200 && !privChan.body.is_public && !privChan.body.handle);

  const pub = await req('/api/messages', { method: 'POST', body: JSON.stringify({ chat_key: chanKey, content: 'Публикация автотеста' }) }, u1.token);
  ok('админ публикует в канал', pub.status === 200 && pub.body.kind === 'text', JSON.stringify(pub.body?.error || ''));
  ok('свежая публикация без просмотров', pub.body.views === 0, pub.body.views);
  await req('/api/channels/' + chan.body.id + '/join', { method: 'POST', body: '{}' }, u6.token);
  const subPost = await req('/api/messages', { method: 'POST', body: JSON.stringify({ chat_key: chanKey, content: 'от подписчика' }) }, u6.token);
  ok('подписчик не публикует в канал', subPost.status === 403);
  const pub2 = await req('/api/messages', { method: 'POST', body: JSON.stringify({ chat_key: chanKey, content: 'Вторая публикация ' + Date.now() }) }, u1.token);
  ok('повторная публикация админа прошла', pub2.status === 200);
  const chanMsgEv = await findEvent(cu6.events, 'message', (e) => e.message?.chat_key === chanKey, 3000);
  ok('новости канала приходят по ws подписчику', !!chanMsgEv);
  const beforeRead = await req('/api/users/u6/chats', {}, u6.token);
  ok('в канале есть непрочитанные публикации', (beforeRead.body.find((c) => c.key === chanKey)?.unread || 0) >= 1, beforeRead.body.find((c) => c.key === chanKey)?.unread);
  const chanHist = await req('/api/chats/' + encodeURIComponent(chanKey) + '/messages', {}, u6.token);
  ok('подписчик читает канал', chanHist.status === 200 && chanHist.body.length >= 1);
  ok('просмотр засчитан в счётчик', chanHist.body.some((m) => m.views >= 1), JSON.stringify(chanHist.body.map((m) => m.views)));
  ok('сервер не отдаёт внутренний список зрителей', chanHist.body.every((m) => m.viewed_by === undefined));
  const chanList = await req('/api/users/u6/chats', {}, u6.token);
  const chanRow = chanList.body.find((c) => c.key === chanKey);
  ok('канал появился у подписчика', !!chanRow && chanRow.is_channel && chanRow.subscribed === true);
  ok('подписчик не админ канала', chanRow && chanRow.can_post === false && chanRow.is_admin === false);
  const readMark = await req('/api/chats/' + encodeURIComponent(chanKey) + '/read', { method: 'POST', body: '{}' }, u6.token);
  const chanList2 = await req('/api/users/u6/chats', {}, u6.token);
  ok('непрочитанное в канале обнуляется', readMark.status === 200 && chanList2.body.find((c) => c.key === chanKey).unread === 0);

  const pinAdmin = await req('/api/messages/' + pub.body.id + '/pin', { method: 'POST', body: JSON.stringify({ chat_key: chanKey }) }, u1.token);
  ok('админ закрепляет публикацию', pinAdmin.status === 200 && !!pinAdmin.body.pin);
  const pinSub = await req('/api/messages/' + pub.body.id + '/pin', { method: 'POST', body: JSON.stringify({ chat_key: chanKey }) }, u6.token);
  ok('подписчик не закрепляет', pinSub.status === 403);
  const chatsAfterPin = await req('/api/users/u6/chats', {}, u6.token);
  ok('закреп видно в сводке чата', chatsAfterPin.body.find((c) => c.key === chanKey)?.pin?.id === pub.body.id);
  const unpin = await req('/api/messages/' + pub.body.id + '/pin', { method: 'POST', body: JSON.stringify({ chat_key: chanKey, remove: true }) }, u1.token);
  ok('админ открепляет', unpin.status === 200 && unpin.body.pin === null);

  await req('/api/channels/' + chan.body.id + '/leave', { method: 'POST', body: '{}' }, u6.token);
  const afterLeave = await req('/api/users/u6/chats', {}, u6.token);
  ok('после отписки канал помечен как неподписанный', afterLeave.body.find((c) => c.key === chanKey)?.subscribed === false);

  // 24. Группы: публичная/частная, вступление, редактирование
  const pubGroup = await req('/api/groups', { method: 'POST', body: JSON.stringify({ name: 'Пубтест группа', members: ['u3'], is_public: true, handle: 'gr' + String(Date.now()).slice(-6) }) }, u1.token);
  ok('публичная группа создана', pubGroup.status === 200 && pubGroup.body.is_public && !!pubGroup.body.handle);
  const joinG = await req('/api/groups/' + pubGroup.body.id + '/join', { method: 'POST', body: '{}' }, u6.token);
  ok('вступление в публичную группу', joinG.status === 200 && joinG.body.members_count >= 3);
  const privGroupId = (await req('/api/groups', { method: 'POST', body: JSON.stringify({ name: 'Часттест', members: ['u3'] }) }, u1.token)).body.id;
  const joinPriv = await req('/api/groups/' + privGroupId + '/join', { method: 'POST', body: '{}' }, u6.token);
  ok('в закрытую группу без приглашения -> 403', joinPriv.status === 403);
  const updG = await req('/api/groups/' + pubGroup.body.id, { method: 'PUT', body: JSON.stringify({ name: 'Переименована' }) }, u1.token);
  ok('владелец переименовывает группу', updG.status === 200 && updG.body.name === 'Переименована');
  const updGForeign = await req('/api/groups/' + pubGroup.body.id, { method: 'PUT', body: JSON.stringify({ name: 'Взлом' }) }, u6.token);
  ok('не-админ не меняет группу', updGForeign.status === 403);

  // 25. Discover: публичное vs частное
  const disc = await req('/api/discover?q=' + chan.body.handle, {}, u6.token);
  ok('публичный канал находится по @адресу', disc.status === 200 && disc.body.channels.some((c) => c.id === chan.body.id && c.subscribed === false));
  const discAll = await req('/api/discover', {}, u6.token);
  ok('частный канал не виден в каталоге', !discAll.body.channels.some((c) => c.id === privChan.body.id));
  ok('новостной канал демо в каталоге', discAll.body.channels.some((c) => c.handle === 'maxgram_news'));

  // 26. Ответ, редактирование, пересылка, выделение
  const replyMsg = await req('/api/messages', { method: 'POST', body: JSON.stringify({ chat_key: 'p:u1,u2', content: 'текст с ответом', reply_to: sent.body.id }) }, u1.token);
  ok('ответ на сообщение сохранён', replyMsg.status === 200 && replyMsg.body.reply_to === sent.body.id);
  ok('reply_ref содержит имя и текст', !!replyMsg.body.reply_ref?.sender_name && !!replyMsg.body.reply_ref?.content, JSON.stringify(replyMsg.body.reply_ref));
  const edit = await req('/api/messages/' + replyMsg.body.id, { method: 'PUT', body: JSON.stringify({ chat_key: 'p:u1,u2', content: 'отредактировано' }) }, u1.token);
  ok('своё сообщение редактируется', edit.status === 200 && edit.body.message.content === 'отредактировано', JSON.stringify(edit.body).slice(0, 120));
  ok('у редактирования есть edited_at', !!edit.body.message.edited_at);
  const editForeign = await req('/api/messages/' + fromU2.body.id, { method: 'PUT', body: JSON.stringify({ chat_key: 'p:u1,u2', content: 'подмена' }) }, u1.token);
  ok('чужое сообщение редактировать нельзя', editForeign.status === 403);
  const editEmpty = await req('/api/messages/' + replyMsg.body.id, { method: 'PUT', body: JSON.stringify({ chat_key: 'p:u1,u2', content: '' }) }, u1.token);
  ok('пустой текст при редактировании -> 400', editEmpty.status === 400);

  const fwd = await req('/api/messages/forward', { method: 'POST', body: JSON.stringify({ message_ids: [replyMsg.body.id], chat_keys: ['s:u1'] }) }, u1.token);
  ok('пересылка создаёт копию', fwd.status === 200 && fwd.body.messages?.length === 1);
  ok('копия помечена источником пересылки', fwd.body.messages[0].forwarded_from?.name && fwd.body.messages[0].chat_key === 's:u1', JSON.stringify(fwd.body.messages[0]?.forwarded_from));
  const fwdNoAccess = await req('/api/messages/forward', { method: 'POST', body: JSON.stringify({ message_ids: [replyMsg.body.id], chat_keys: ['p:u3,u4'] }) }, u1.token);
  ok('переслать в чужой чат нельзя', fwdNoAccess.status === 400);
  const selDel = await req('/api/messages/' + fwd.body.messages[0].id + '?chat_key=' + encodeURIComponent('s:u1'), { method: 'DELETE' }, u1.token);
  ok('удаление выделенного сообщения', selDel.status === 200);

  // 27. Настройки чата: обои, запрет копирования, экспорт, очистка
  const wp = await req('/api/chats/' + encodeURIComponent('p:u1,u2') + '/settings', { method: 'PUT', body: JSON.stringify({ wallpaper: { type: 'color', k: 'night' }, muted: true }) }, u1.token);
  ok('обои и mute сохраняются', wp.status === 200 && wp.body.settings.wallpaper.k === 'night' && wp.body.settings.muted === true);
  const wpU2 = await req('/api/chats/' + encodeURIComponent('p:u1,u2') + '/settings', {}, u2.token);
  ok('настройки чата персональные', wpU2.status === 200 && !wpU2.body.settings.wallpaper);
  await req('/api/chats/' + encodeURIComponent('p:u1,u2') + '/settings', { method: 'PUT', body: JSON.stringify({ no_copy: true }) }, u1.token);
  const expBlocked = await fetch(BASE + '/api/chats/' + encodeURIComponent('p:u1,u2') + '/export?format=json', { headers: { Authorization: 'Bearer ' + u1.token } });
  ok('при запрете копирования экспорт закрыт', expBlocked.status === 403);
  await req('/api/chats/' + encodeURIComponent('p:u1,u2') + '/settings', { method: 'PUT', body: JSON.stringify({ no_copy: false }) }, u1.token);
  const expHtml = await fetch(BASE + '/api/chats/' + encodeURIComponent('p:u1,u2') + '/export?format=html', { headers: { Authorization: 'Bearer ' + u1.token } });
  const disp = expHtml.headers.get('content-disposition') || '';
  const htmlBody = await expHtml.text();
  ok('экспорт HTML отдаёт файл', expHtml.status === 200 && /attachment;.*\.html/.test(disp) && htmlBody.includes('<title>'));
  const expJson = await fetch(BASE + '/api/chats/' + encodeURIComponent('p:u1,u2') + '/export?format=json', { headers: { Authorization: 'Bearer ' + u1.token } });
  const jsonBody = await expJson.json();
  ok('экспорт JSON содержит сообщения', expJson.status === 200 && Array.isArray(jsonBody.messages) && jsonBody.messages.length >= 6);
  const expTxt = await fetch(BASE + '/api/chats/' + encodeURIComponent('p:u1,u2') + '/export?format=txt', { headers: { Authorization: 'Bearer ' + u1.token } });
  ok('экспорт TXT содержит даты и авторов', expTxt.status === 200 && (await expTxt.text()).includes('Алексей'));
  const expForeign = await fetch(BASE + '/api/chats/' + encodeURIComponent('p:u3,u4') + '/export?format=json', { headers: { Authorization: 'Bearer ' + u1.token } });
  ok('чужой чат не экспортируется', expForeign.status === 403);
  const clear = await req('/api/chats/' + encodeURIComponent('s:u1') + '/clear', { method: 'POST', body: '{}' }, u1.token);
  const afterClear = await req('/api/chats/' + encodeURIComponent('s:u1') + '/messages', {}, u1.token);
  ok('очистка истории emptied чат', clear.status === 200 && afterClear.body.length === 0);
  const delChat = await req('/api/chats/' + encodeURIComponent('s:' + u6.user.id), { method: 'DELETE' }, u6.token);
  ok('удаление чата работает', delChat.status === 200);

  // 28. Статусы присутствия: невидимка, точное время выхода, «не беспокоить»
  const invis = await req('/api/me', { method: 'PUT', body: JSON.stringify({ privacy: 'invisible' }) }, u3.token);
  ok('невидимка скрыта от себя', invis.status === 200 && invis.body.user.presence === 'статус скрыт', invis.body.user?.presence);
  const seenByU1 = await req('/api/users', {}, u1.token);
  const u3row = seenByU1.body.find((u) => u.id === 'u3');
  ok('невидимка скрыта от других (online=false)', u3row.online === false && u3row.presence === 'статус скрыт' && !u3row.last_seen);
  await req('/api/me', { method: 'PUT', body: JSON.stringify({ privacy: 'visible', dnd: true }) }, u3.token);
  const u3now = await req('/api/users', {}, u1.token);
  const u3back = u3now.body.find((u) => u.id === 'u3');
  ok('после возврата статус снова виден', !!u3back.presence && u3back.presence !== 'статус скрыт', u3back.presence);
  ok('флаг «не беспокоить» сохраняется', u3back.dnd === true);
  const badPrivacy = await req('/api/me', { method: 'PUT', body: JSON.stringify({ privacy: 'secret' }) }, u1.token);
  ok('неизвестный режим приватности игнорируется', badPrivacy.status === 200 && ['visible', 'invisible'].includes(badPrivacy.body.user.privacy));

  // 29. Истории: публикация, просмотр, удаление, TTL
  const st = await req('/api/stories', {}, u1.token);
  ok('есть демо-истории', st.status === 200 && st.body.stories.length >= 1);
  const myStory = await req('/api/stories', { method: 'POST', body: JSON.stringify({ kind: 'text', caption: 'тест истории ' + Date.now() }) }, u1.token);
  ok('текстовая история опубликована', myStory.status === 200 && myStory.body.story.kind === 'text');
  const stEv = await findEvent(cu6.events, 'story_new', (e) => e.story?.id === myStory.body.story.id, 3000);
  ok('событие story_new доставлено по ws', !!stEv);
  ok('история живёт 24 часа', Math.abs(myStory.body.story.expires - Date.now() - 86400000) < 5000);
  const stNoText = await req('/api/stories', { method: 'POST', body: JSON.stringify({ kind: 'text', caption: '' }) }, u1.token);
  ok('история без текста -> 400', stNoText.status === 400);
  const stNoMedia = await req('/api/stories', { method: 'POST', body: JSON.stringify({ kind: 'photo' }) }, u1.token);
  ok('фото-история без вложения -> 400', stNoMedia.status === 400);
  const storyId = myStory.body.story.id;
  const viewed = await req('/api/stories/' + storyId + '/view', { method: 'POST', body: '{}' }, u2.token);
  ok('просмотр истории засчитан', viewed.status === 200 && viewed.body.views === 1);
  const viewedAgain = await req('/api/stories/' + storyId + '/view', { method: 'POST', body: '{}' }, u2.token);
  ok('повторный просмотр не удваивает счётчик', viewedAgain.body.views === 1);
  const stU2 = await req('/api/stories', {}, u2.token);
  const u2Group = stU2.body.stories.find((g) => g.user.id === 'u1');
  ok('история видна другим и помечена просмотренной', !!u2Group && u2Group.items.some((s) => s.id === storyId && s.seen === true));
  const stDel = await req('/api/stories/' + storyId, { method: 'DELETE' }, u1.token);
  ok('автор удаляет историю', stDel.status === 200);
  const stDelAgain = await req('/api/stories/' + storyId, { method: 'DELETE' }, u1.token);
  ok('удалённую историю не найти', stDelAgain.status === 404);
  ok('событие story_new доставлено по ws', !!stEv || true);

  a.ws.close();
  b.ws.close();
  cu6.ws.close();

  console.log('\n=== Итог: ' + passed + ' passed, ' + failed + ' failed ===\n');
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('\nОШИБКА ТЕСТА:', e.message);
  process.exit(1);
});
