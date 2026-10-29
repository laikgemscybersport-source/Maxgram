const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const config = require('./config');

const app = express();
const server = http.createServer(app);

// Сервер почти всегда стоит за прокси (Nginx, Render, Cloudflare-туннель, десктоп).
// Без trust proxy req.ip отдаёт адрес прокси, а req.secure всегда false —
// из-за этого OAuth-редирект и rate-limit по IP работают неверно.
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Абсолютный UPLOAD_DIR используется как есть, относительный — от папки проекта
const UPLOAD_DIR = path.isAbsolute(config.upload.dir) ? config.upload.dir : path.join(__dirname, config.upload.dir);
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d' }));
app.use(express.static(path.join(__dirname, 'client', 'dist')));

/* ==================== ХРАНИЛИЩЕ ==================== */

const users = {};
const groups = {};            // g: — группы (бывают публичные и частные)
const channels = {};          // c: — каналы (публичные и частные)
const chats = {};             // chat_key -> [message]
const pins = {};              // chat_key -> { message_id, by_id, at }
const chatSettings = {};      // chat_key -> { userId: { wallpaper, no_copy, muted, last_read_at } }
const stories = {};           // userId -> [story]
const sockets = new Map();    // userId -> Set<ws>
const sessions = new Map();   // token -> userId
const otpCodes = new Map();   // phone -> { code, expires, attempts }
const oauthStates = new Map();

const STORY_TTL = 24 * 3600 * 1000;

const DEMO_ACCOUNTS = [
  { id: 'u1', name: 'Алексей', phone: '+79991234567', username: 'alexey', bio: 'Разработчик. Люблю код и кофе ☕' },
  { id: 'u2', name: 'Мария', phone: '+79992345678', username: 'masha', bio: 'Дизайнер. Рисую интерфейсы 🎨' },
  { id: 'u3', name: 'Дмитрий', phone: '+79993456789', username: 'dima', bio: 'Менеджер проектов' },
  { id: 'u4', name: 'Елена', phone: '+79994567890', username: 'elena', bio: 'Аналитик данных 📊' },
  { id: 'u5', name: 'Иван', phone: '+79995678901', username: 'ivan', bio: 'QA инженер. Ломать — не строить 🔧' },
];
for (const a of DEMO_ACCOUNTS) {
  users[a.id] = {
    ...a,
    avatar: null,
    created_at: new Date().toISOString(),
    provider: 'phone',
    oauth: {},
    email: null,
    privacy: 'visible',   // visible | invisible
    dnd: false,
    last_seen: new Date(Date.now() - Math.random() * 3600 * 1000).toISOString(),
  };
}

groups.g1 = { id: 'g1', name: 'Команда MAXgram', handle: 'maxgram_team', description: 'Рабочая чаты команды', members: ['u1', 'u2', 'u3', 'u4', 'u5'], admins: ['u1'], owner: 'u1', is_public: true, created_at: daysAgoIso(30) };
groups.g2 = { id: 'g2', name: '🚀 Проекты', handle: null, description: '', members: ['u1', 'u2', 'u4'], admins: ['u1'], owner: 'u1', is_public: false, created_at: daysAgoIso(20) };

channels.c1 = { id: 'c1', name: 'Новости MAXgram', handle: 'maxgram_news', description: 'Анонсы, релизы и советы по мессенджеру', avatar: null, owner: 'u1', admins: ['u1', 'u2'], members: ['u1', 'u2', 'u3', 'u4', 'u5'], is_public: true, created_at: daysAgoIso(40) };
channels.c2 = { id: 'c2', name: 'Закрытый клуб', handle: null, description: 'Только для своих', avatar: null, owner: 'u2', admins: ['u2'], members: ['u1', 'u2', 'u4'], is_public: false, created_at: daysAgoIso(10) };

function daysAgoIso(d) {
  return new Date(Date.now() - d * 86400 * 1000).toISOString();
}

const hoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();
const daysAgo = (d, hh) => new Date(Date.now() - d * 86400 * 1000 + hh * 3600 * 1000).toISOString();

function seed(key, list) {
  chats[key] = list.map(([sender_id, content, created_at, status]) => ({
    id: uuidv4(),
    chat_key: key,
    sender_id,
    content,
    kind: 'text',
    created_at,
    status: status || 'read',
    reply_to: null,
    forwarded_from: null,
    edited_at: null,
    views: null,
  }));
}

seed('p:u1,u2', [
  ['u2', 'Привет! Видел новый макет мессенджера?', daysAgo(1, -9)],
  ['u1', 'Да, выглядит отлично 🔥 Особенно тёмная тема', daysAgo(1, -8.8)],
  ['u2', 'Тогда вёрстаю список чатов, там ещё бейджи не готовы', daysAgo(1, -8.5)],
  ['u1', 'Ок, я подключу WebSocket, чтобы всё летало в реальном времени', daysAgo(1, -8.3)],
  ['u2', 'Договорились! Созвон в 18:00?', hoursAgo(3)],
  ['u1', 'Буду 👍', hoursAgo(2.8)],
]);
seed('p:u1,u3', [
  ['u3', 'Скинь, пожалуйста, доступ к репозиторию', daysAgo(2, -3)],
  ['u1', 'Готово, проверь почту', daysAgo(2, -2.7)],
  ['u3', 'Спасибо! 🙏', daysAgo(2, -2.5)],
]);
seed('p:u1,u4', [
  ['u4', 'Отчёт по метрикам готов, отправила на почту 📊', hoursAgo(6)],
  ['u4', 'И ещё: конверсия в онбординге выросла на 12%', hoursAgo(5.9)],
]);
seed('p:u1,u5', [['u5', 'Баг #1234 закрыт, можно катить 🚀', daysAgo(3, -1)]]);
seed('p:u2,u4', [
  ['u4', 'Марь, посмотри цвета для светлой темы', hoursAgo(9)],
  ['u2', 'Посмотрю после обеда', hoursAgo(8.5)],
]);
seed('g:g1', [
  ['u2', 'Всем привет! Напоминаю про релиз в пятницу 🎉', daysAgo(1, -5)],
  ['u3', 'У меня всё по срокам, готов', daysAgo(1, -4.6)],
  ['u4', 'Аналитика подключена, треким события', daysAgo(1, -4.4)],
  ['u5', 'Тест-план прогнал, критичных багов нет ✅', hoursAgo(7)],
  ['u1', 'Отлично, тогда катимся 💪', hoursAgo(6.5)],
]);
seed('g:g2', [
  ['u1', 'Новый спринт начинается, задачи в трекере', hoursAgo(20)],
  ['u2', 'Взяла вёрстку профиля', hoursAgo(19)],
]);
seed('c:c1', [
  ['u1', '🎉 Вышло обновление: звонки, видеокружки и геолокация', daysAgo(4, -6)],
  ['u1', '💡 Совет: закрепите важное сообщение — нажмите на него и выберите «Закрепить»', daysAgo(2, -4)],
  ['u2', '🎨 Новая палитра обоев для чата уже доступна в настройках', hoursAgo(11)],
]);
seed('c:c2', [
  ['u2', 'Закрытый канал: здесь только участники', hoursAgo(30)],
]);

// Закреплённое сообщение в канале — чтобы было видно механизм
pins['c:c1'] = { message_id: chats['c:c1'][2].id, by_id: 'u1', at: hoursAgo(11) };

// Демо-истории (живут 24 часа)
stories.u2 = [
  { id: uuidv4(), author_id: 'u2', kind: 'text', media: null, caption: 'Утро ☀️ Вёрстка списка чатов почти готова', created_at: hoursAgo(2), expires: Date.now() + 22 * 3600 * 1000, views: [] },
];
stories.u4 = [
  { id: uuidv4(), author_id: 'u4', kind: 'text', media: null, caption: 'Кто хочет на созвон в 19:00? 🎧', created_at: hoursAgo(5), expires: Date.now() + 19 * 3600 * 1000, views: ['u1'] },
];

/* ==================== СОХРАНЕНИЕ НА ДИСК ====================
   По умолчанию (веб-деплой) всё живёт в памяти — как раньше.
   Если задан DATA_FILE (десктоп-приложение передаёт его сам), состояние
   периодически пишется в JSON и восстанавливается на старте, иначе после
   закрытия программы переписка исчезала бы.
   Пишем по таймеру без отслеживания изменений: данные маленькие, а атомарная
   запись через tmp+rename безопасна на любом диске. */

const DATA_FILE = process.env.DATA_FILE ? path.resolve(process.env.DATA_FILE) : null;
const PERSIST_MS = Number(process.env.PERSIST_MS || 4000);

const replaceAll = (target, src) => {
  for (const k of Object.keys(target)) delete target[k];
  Object.assign(target, src || {});
};

function persist() {
  if (!DATA_FILE) return;
  const snapshot = {
    version: 1,
    saved_at: new Date().toISOString(),
    users, groups, channels, chats, pins, chatSettings, stories,
    sessions: Array.from(sessions.entries()),
  };
  const tmp = DATA_FILE + '.tmp';
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(snapshot));
    fs.renameSync(tmp, DATA_FILE); // rename атомарен — файл не бывает полузаписанным
  } catch (e) {
    console.error('Не удалось сохранить данные: ' + e.message);
  }
}

if (DATA_FILE && fs.existsSync(DATA_FILE)) {
  try {
    const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    replaceAll(users, saved.users);
    replaceAll(groups, saved.groups);
    replaceAll(channels, saved.channels);
    replaceAll(chats, saved.chats);
    replaceAll(pins, saved.pins);
    replaceAll(chatSettings, saved.chatSettings);
    replaceAll(stories, saved.stories);
    sessions.clear();
    for (const [token, uid] of saved.sessions || []) sessions.set(token, uid);
    // просроченные истории убираем сразу, иначе они остались бы «навсегда»
    const now = Date.now();
    for (const [uid, list] of Object.entries(stories)) {
      stories[uid] = (list || []).filter((s) => s.expires > now);
      if (!stories[uid].length) delete stories[uid];
    }
    console.log('Данные восстановлены из ' + DATA_FILE);
  } catch (e) {
    console.error('Файл данных повреждён (' + e.message + '), стартуем с демо-данными');
  }
}

if (DATA_FILE) {
  setInterval(persist, PERSIST_MS).unref();
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, persist);
  process.on('exit', persist);
}

/* ==================== ХЕЛПЕРЫ ==================== */

const pairKey = (a, b) => 'p:' + [a, b].sort().join(',');
const selfKey = (meId) => 's:' + meId;
const groupKey = (gid) => 'g:' + gid;
const channelKey = (cid) => 'c:' + cid;

function normalizePhone(raw) {
  if (typeof raw !== 'string') return null;
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 11 && digits[0] === '8') digits = '7' + digits.slice(1);
  if (digits.length === 10) digits = '7' + digits;
  if (digits.length < 10 || digits.length > 15) return null;
  return '+' + digits;
}

function formatPhone(p) {
  if (!p) return '';
  if (p.startsWith('+7') && p.length === 12) {
    return `+7 (${p.slice(2, 5)}) ${p.slice(5, 8)}-${p.slice(8, 10)}-${p.slice(10, 12)}`;
  }
  return p;
}

function normalizeHandle(raw) {
  const h = String(raw || '').trim().toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_]/g, '');
  return h.length >= 4 ? h.slice(0, 32) : '';
}

function findUserByPhone(phone) {
  return Object.values(users).find((u) => u.phone === phone) || null;
}

function isOnline(userId) {
  const set = sockets.get(userId);
  return !!set && set.size > 0;
}

function send(userId, payload) {
  const set = sockets.get(userId);
  if (!set) return;
  const raw = JSON.stringify(payload);
  for (const ws of set) {
    if (ws.readyState === 1) {
      try { ws.send(raw); } catch { /* соединение закрыто */ }
    }
  }
}

function broadcastTo(ids, payload, except) {
  for (const id of ids) {
    if (id === except) continue;
    send(id, payload);
  }
}

function broadcast(payload, except) {
  for (const uid of sockets.keys()) {
    if (uid === except) continue;
    send(uid, payload);
  }
}

const usersSnapshot = () => Object.values(users).map(publicUser);

/* ---------- Присутствие: в сети / только что / недавно / невидимка ---------- */

function presenceOf(u) {
  if (!u) return { online: false, text: '', exact: null };
  if (u.privacy === 'invisible') {
    return { online: false, text: 'статус скрыт', exact: null, hidden: true };
  }
  if (isOnline(u.id)) return { online: true, text: 'в сети', exact: new Date().toISOString() };

  const ts = u.last_seen ? Date.parse(u.last_seen) : 0;
  if (!ts) return { online: false, text: 'был(а) недавно', exact: null };
  const diff = Date.now() - ts;
  const d = new Date(ts);
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  if (diff < 60 * 1000) return { online: false, text: 'был(а) в сети только что', exact: u.last_seen };
  if (diff < 20 * 60 * 1000) return { online: false, text: 'был(а) в сети недавно', exact: u.last_seen };
  if (diff < 60 * 60 * 1000) {
    return { online: false, text: `был(а) в сети ${Math.round(diff / 60000)} мин назад`, exact: u.last_seen };
  }
  const today = new Date().toDateString();
  const yest = new Date(Date.now() - 86400000).toDateString();
  if (d.toDateString() === today) return { online: false, text: `был(а) в сети сегодня в ${time}`, exact: u.last_seen };
  if (d.toDateString() === yest) return { online: false, text: `был(а) в сети вчера в ${time}`, exact: u.last_seen };
  if (diff < 7 * 86400000) {
    return { online: false, text: `был(а) в сети ${d.toLocaleDateString('ru-RU', { weekday: 'long' })} в ${time}`, exact: u.last_seen };
  }
  return { online: false, text: `был(а) в сети ${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`, exact: u.last_seen };
}

function publicUser(u) {
  const presence = presenceOf(u);
  return {
    id: u.id,
    name: u.name,
    phone: formatPhone(u.phone),
    username: u.username,
    bio: u.bio,
    avatar: u.avatar,
    provider: u.provider,
    online: presence.online,
    presence: presence.text,
    last_seen: presence.exact,
    dnd: !!u.dnd,
    privacy: u.privacy,
  };
}

function privateUser(u) {
  return { ...publicUser(u), phone_raw: u.phone, email: u.email || null };
}

/* ---------- Настройки чата для пользователя ---------- */

function settingsOf(key, userId) {
  if (!chatSettings[key]) chatSettings[key] = {};
  if (!chatSettings[key][userId]) chatSettings[key][userId] = { wallpaper: null, no_copy: false, muted: false, last_read_at: null };
  return chatSettings[key][userId];
}

function publicMessage(m, meId, key) {
  if (!m) return m;
  const out = { ...m };
  delete out.viewed_by; // внутренний список зрителей, клиенту показываем только счётчик
  if (key && key.startsWith('c:')) {
    const s = settingsOf(key, meId || 'anon');
    const readAt = s.last_read_at;
    out.read = !readAt || Date.parse(m.created_at) <= Date.parse(readAt);
  }
  return out;
}

/* ---------- Права доступа ---------- */

function membersOf(key) {
  if (key.startsWith('g:')) return (groups[key.slice(2)] || {}).members || [];
  if (key.startsWith('c:')) return (channels[key.slice(2)] || {}).members || [];
  if (key.startsWith('s:')) return [key.slice(2)];
  if (key.startsWith('p:')) return key.slice(2).split(',');
  return [];
}

function recipientsOf(key, excludeId) {
  return membersOf(key).filter((id) => id !== excludeId);
}

function isAdmin(userId, key) {
  if (key.startsWith('g:')) {
    const g = groups[key.slice(2)];
    return !!g && (g.owner === userId || (g.admins || []).includes(userId));
  }
  if (key.startsWith('c:')) {
    const c = channels[key.slice(2)];
    return !!c && (c.owner === userId || (c.admins || []).includes(userId));
  }
  return false;
}

// Право работать с чатом: только его участники (или владелец избранного).
// Публичный канал можно читать без подписки.
function canAccess(userId, key, { write = false } = {}) {
  if (typeof key !== 'string') return false;
  if (key.startsWith('s:')) return key.slice(2) === userId;
  if (key.startsWith('g:')) {
    const g = groups[key.slice(2)];
    return !!g && g.members.includes(userId);
  }
  if (key.startsWith('c:')) {
    const c = channels[key.slice(2)];
    if (!c) return false;
    const member = c.members.includes(userId);
    if (write) return member;
    return member || c.is_public;
  }
  if (key.startsWith('p:')) {
    const ids = key.slice(2).split(',');
    return ids.length === 2 && ids.includes(userId) && ids.every((i) => users[i]);
  }
  return false;
}

// Публиковать в канал могут только владелец и админы
function canPost(userId, key) {
  if (key.startsWith('c:')) return isAdmin(userId, key);
  return canAccess(userId, key, { write: true });
}

/* ---------- Превью и сводка чата ---------- */

const PREVIEW = {
  photo: '📷 Фото',
  video: '🎬 Видео',
  file: '📎 Файл',
  audio: '🎵 Аудио',
  voice: '🎤 Голосовое',
  circle: '⭕ Видеокружок',
  location: '📍 Геолокация',
  contact: '👤 Контакт',
  event: '📅 Мероприятие',
  call: '📞 Звонок',
};

function previewText(m) {
  if (!m) return '';
  if (m.kind === 'text' || !m.kind) return m.content;
  if (m.kind === 'file') return PREVIEW.file + (m.media?.name ? ' ' + m.media.name : '');
  if (m.kind === 'event') return PREVIEW.event + ' ' + (m.event?.title || '');
  if (m.kind === 'contact') return PREVIEW.contact + ' ' + (m.contact?.name || '');
  if (m.kind === 'call') return m.content || PREVIEW.call;
  return PREVIEW[m.kind] || m.content || '';
}

function memberPreview(ids) {
  return ids.slice(0, 12).map((id) => {
    const u = users[id];
    return u ? { id: u.id, name: u.name, avatar: u.avatar, online: isOnline(u.id) } : null;
  }).filter(Boolean);
}

function unreadCount(key, meId, list) {
  if (key.startsWith('c:')) {
    const s = settingsOf(key, meId);
    const readAt = s.last_read_at ? Date.parse(s.last_read_at) : 0;
    return list.filter((m) => m.sender_id !== meId && Date.parse(m.created_at) > readAt).length;
  }
  return list.filter((m) => m.sender_id !== meId && m.status !== 'read').length;
}

function groupPrefix(senderId, meId) {
  if (senderId === meId) return 'Вы: ';
  const s = users[senderId];
  return s ? s.name.split(' ')[0] + ': ' : '';
}

function chatSummary(key, meId) {
  const list = chats[key] || [];
  const unread = unreadCount(key, meId, list);
  const last = list[list.length - 1] || null;
  const prefix = last ? (last.sender_id === meId ? 'Вы: ' : key.startsWith('c:') ? '' : groupPrefix(last.sender_id, meId)) : '';
  const settings = settingsOf(key, meId);
  const pin = pins[key] ? publicMessage(findMessage(key, pins[key].message_id), meId, key) : null;

  if (key.startsWith('s:')) {
    return {
      key,
      me_id: meId,
      is_self: true,
      is_group: false,
      is_channel: false,
      user: { id: 'self:' + meId, name: 'Избранное', is_self: true, is_group: false, avatar: null, phone: '', bio: 'Сохранённые сообщения', online: false, presence: '' },
      last_message: publicMessage(last, meId, key),
      preview_prefix: last ? (last.kind === 'text' ? 'Вы: ' : '') : '',
      unread: 0,
      pin,
      settings,
    };
  }

  if (key.startsWith('g:')) {
    const g = groups[key.slice(2)];
    if (!g || !g.members.includes(meId)) return null;
    return {
      key,
      me_id: meId,
      is_group: true,
      is_channel: false,
      is_public: !!g.is_public,
      handle: g.handle,
      can_post: true,
      is_admin: isAdmin(meId, key),
      user: {
        id: g.id,
        name: g.name,
        is_group: true,
        phone: `${g.members.length} участников`,
        username: g.handle,
        bio: g.description || 'Групповой чат',
        members: g.members,
        members_preview: memberPreview(g.members),
        avatar: null,
        online: false,
        presence: '',
        is_public: !!g.is_public,
      },
      last_message: publicMessage(last, meId, key),
      preview_prefix: last ? groupPrefix(last.sender_id, meId) : '',
      unread,
      pin,
      settings,
    };
  }

  if (key.startsWith('c:')) {
    const c = channels[key.slice(2)];
    if (!c) return null;
    const member = c.members.includes(meId);
    return {
      key,
      me_id: meId,
      is_group: false,
      is_channel: true,
      is_public: !!c.is_public,
      handle: c.handle,
      subscribed: member,
      can_post: isAdmin(meId, key),
      is_admin: isAdmin(meId, key),
      user: {
        id: c.id,
        name: c.name,
        is_channel: true,
        phone: `${c.members.length} подписчиков`,
        username: c.handle,
        bio: c.description,
        members: c.members,
        members_preview: memberPreview(c.admins || []),
        avatar: c.avatar,
        online: false,
        presence: '',
        is_public: !!c.is_public,
      },
      last_message: publicMessage(last, meId, key),
      preview_prefix: '',
      unread: member ? unread : 0,
      pin,
      settings,
    };
  }

  const otherId = key.slice(2).split(',').find((id) => id !== meId);
  const other = users[otherId];
  if (!other) return null;
  return {
    key,
    me_id: meId,
    is_group: false,
    is_channel: false,
    can_post: true,
    user: publicUser(other),
    last_message: publicMessage(last, meId, key),
    preview_prefix: prefix,
    unread,
    pin,
    settings,
  };
}

function findMessage(key, id) {
  return (chats[key] || []).find((m) => m.id === id) || null;
}

function chatKeysFor(meId) {
  const keys = new Set([selfKey(meId)]);
  for (const key of Object.keys(chats)) {
    if (key.startsWith('g:') || key.startsWith('c:') || key.startsWith('p:')) {
      if (membersOf(key).includes(meId)) keys.add(key);
    }
  }
  for (const id of Object.keys(users)) {
    if (id !== meId) keys.add(pairKey(meId, id));
  }
  for (const cid of Object.keys(channels)) {
    const c = channels[cid];
    if (c.is_public) keys.add(channelKey(cid));
  }
  return keys;
}

/* ---------- Авторизация ---------- */

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  const userId = token && sessions.get(token);
  if (!userId || !users[userId]) {
    res.status(401).json({ error: 'Требуется вход по номеру телефона' });
    return null;
  }
  req.userId = userId;
  req.user = users[userId];
  req.token = token;
  return next();
}

/* ==================== ЗАГРУЗКА ФАЙЛОВ ==================== */

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPLOAD_DIR, req.userId || 'anon');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 12).replace(/[^\w.]/g, '');
    cb(null, Date.now() + '-' + crypto.randomBytes(6).toString('hex') + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.upload.maxSizeMb * 1024 * 1024 },
});

app.post('/api/upload', auth, upload.array('files', 10), (req, res) => {
  const files = (req.files || []).map((f) => ({
    url: `/uploads/${req.userId}/${f.filename}`,
    name: Buffer.from(f.originalname, 'latin1').toString('utf8'),
    mime: f.mimetype,
    size: f.size,
  }));
  if (!files.length) return res.status(400).json({ error: 'Файлы не получены' });
  res.json({ files });
});

/* ==================== АУТЕНТИФИКАЦИЯ ПО ТЕЛЕФОНУ ==================== */

const CODE_TTL = 5 * 60 * 1000;

function generateCode() {
  // 5 цифр, как в Telegram
  return String(crypto.randomInt(10000, 99999));
}

/* ---- Реальная доставка SMS ----
   Каждый шлюз отвечает одинаковым объектом { ok, error?, balance? },
   чтобы вызывающий код не зависел от конкретного провайдера. */

const SMS_TEXT = (code) => `Код подтверждения MAXgram: ${code}. Не передавайте его никому.`;

// POST form-urlencoded с разбором ошибок провайдера
async function postUrlForm(url, fields, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(fields).toString(),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* не JSON — вернём текст */ }
  return { status: res.status, json, text };
}

// SMS.RU: статус «OK» приходит даже при HTTP 200 с ошибкой внутри — смотрим status_code
async function sendViaSmsRu(phone, code) {
  const { api_id, api_key, from } = config.sms.smsru;
  const fields = {
    api_id,
    to: phone.replace('+', ''),
    msg: SMS_TEXT(code),
    json: '1',
  };
  if (api_key) fields.api_key = api_key;   // кабинет выдаёт и id, и ключ — передаём оба
  if (from) fields.from = from;

  const { status, json, text } = await postUrlForm('https://sms.ru/sms/send', fields);
  if (!json) return { ok: false, error: `sms.ru ответил HTTP ${status}: ${text.slice(0, 120)}` };
  if (json.status !== 'OK') {
    return { ok: false, error: `sms.ru: ${json.status_text || 'код ' + json.status_code} (код ${json.status_code})`, balance: json.balance };
  }
  const perPhone = Object.values(json.sms || {})[0] || {};
  if (perPhone.status !== 'OK') {
    return { ok: false, error: `sms.ru: ${perPhone.status_text || 'код ' + perPhone.status_code}`, balance: json.balance };
  }
  return { ok: true, balance: json.balance };
}

// SMS Aero: авторизация по email + apiSign, успешный ответ — success: true
async function sendViaSmsAero(phone, code) {
  const { email, api_key, from } = config.sms.smsaero;
  const { status, json, text } = await postUrlForm('https://gate.smsaero.ru/v2/sms/send', {
    email,
    apiSign: api_key,
    number: phone.replace('+', ''),
    text: SMS_TEXT(code),
    from,
  });
  if (!json) return { ok: false, error: `smsaero ответил HTTP ${status}: ${text.slice(0, 120)}` };
  if (!json.success) return { ok: false, error: `SMS Aero: ${json.message || 'код ' + json.statusCode}` };
  return { ok: true };
}

/* ---- Собственный SMS-шлюз на телефоне с SIM (SMS_PROVIDER=http) ----
   Приложение-шлюз на Android поднимает HTTP-сервер в локальной сети; мы присылаем
   на него номер и текст, а он отправляет SMS своей SIM. Названия полей, метод и
   формат настраиваются в config (SMS_HTTP_*), потому что у разных приложений они
   разные. Адрес задаёт администратор в secrets.js — пользователь вводит только номер. */
async function sendViaHttp(phone, code) {
  const g = config.sms.http;
  const fields = { [g.phone_field]: phone, [g.text_field]: SMS_TEXT(code) };
  if (g.from) fields.from = g.from;
  if (g.extra) {
    try { Object.assign(fields, JSON.parse(g.extra)); }
    catch { return { ok: false, error: 'SMS_HTTP_EXTRA — не корректный JSON' }; }
  }

  const headers = {};
  if (g.token) headers.Authorization = 'Bearer ' + g.token;

  let url = g.url;
  let body;
  if (g.method === 'GET') {
    url += (url.includes('?') ? '&' : '?') + new URLSearchParams(fields).toString();
  } else if (g.format === 'json') {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(fields);
  } else {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(fields).toString();
  }

  const res = await fetch(url, { method: g.method, headers, body });
  const text = await res.text();
  if (!res.ok) return { ok: false, error: `шлюз ответил HTTP ${res.status}: ${text.slice(0, 120)}` };
  // Некоторые шлюзы всегда отвечают 200 и пишут результат текстом
  if (g.expect && !text.includes(g.expect)) {
    return { ok: false, error: `в ответе шлюза нет «${g.expect}»: ${text.slice(0, 120)}` };
  }
  return { ok: true };
}

/* ---- SMS Gateway for Android (sms-gateway.app) ----
   Приложение на телефоне с SIM держит постоянный канал с облаком шлюза, поэтому
   телефон не обязан быть доступен из интернета: сервер пишет в API, облако ставит
   задачу в очередь, телефон забирает её при следующем опросе (~10 с) и отправляет SMS.
   Авторизация: Bearer-ключ из дашборда (Settings / API) либо JWT из логина/пароля
   для self-hosted сервера. */
let smsgateToken = { value: '', expiresAt: 0 };

async function smsgateAuthHeader() {
  const g = config.sms.smsgate;
  if (g.key) return 'Bearer ' + g.key;

  // Self-hosted: меняем логин/пароль на короткоживущий JWT и переиспользуем до истечения
  if (smsgateToken.value && smsgateToken.expiresAt - Date.now() > 60 * 1000) {
    return 'Bearer ' + smsgateToken.value;
  }
  const basic = Buffer.from(`${g.username}:${g.password}`).toString('base64');
  const res = await fetch(`${g.base_url}/auth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Basic ' + basic,
    },
    body: JSON.stringify({ ttl: 3600, scopes: ['messages:send'] }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error('не удалось получить токен: ' + (data.error || data.message || 'HTTP ' + res.status));
  }
  smsgateToken = {
    value: data.access_token,
    expiresAt: data.expires_at ? Date.parse(data.expires_at) : Date.now() + 3600 * 1000,
  };
  return 'Bearer ' + smsgateToken.value;
}

/* Формат тела зависит от типа эндпоинта: облако из дашборда (…/api/v1) принимает
   плоский {"to","text"}, self-hosted сервер (…/3rdparty/v1) — вложенный
   {"phoneNumbers":[…],"textMessage":{…}}. Отправим не тот — 400 missing_parameter. */
function smsgatePayload(g, phone, text) {
  const selfHosted = /\/3rdparty\//.test(g.base_url);
  if (selfHosted) {
    const payload = { phoneNumbers: [phone], textMessage: { text } };
    if (g.device_id) payload.deviceId = g.device_id;
    return payload;
  }
  const payload = { to: phone, text };
  if (g.device_id) payload.deviceId = g.device_id;
  return payload;
}

async function sendViaSmsgate(phone, code) {
  const g = config.sms.smsgate;
  const payload = smsgatePayload(g, phone, SMS_TEXT(code));

  const res = await fetch(`${g.base_url}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: await smsgateAuthHeader() },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* не JSON */ }

  // Успех — 2xx и идентификатор сообщения; у 4xx читаем описание ошибки.
  // Облако отдаёт error объектом {"error":{"message":…}}, self-hosted — строкой.
  if (!res.ok) {
    const err = json && json.error;
    const why = err && (typeof err === 'string' ? err : err.message || err.code)
      || json && (json.message || json.detail);
    return { ok: false, error: `sms-gateway: ${why || 'HTTP ' + res.status}` };
  }
  if (!json) return { ok: false, error: `sms-gateway ответил не JSON: ${text.slice(0, 120)}` };
  // Идентификатор лежит по-разному: self-hosted — {id}, облако — {accepted, messages:[{id}]}
  if (json.id) return { ok: true };
  const first = Array.isArray(json.messages) && json.messages[0];
  if (first && (first.id || first.status)) return { ok: true };
  if (json.accepted >= 1) return { ok: true };
  return { ok: false, error: 'sms-gateway: 2xx без идентификатора сообщения' };
}

async function sendViaTwilio(phone, code) {
  const { accountSid, authToken, from, serviceSid } = config.sms.twilio;
  const basic = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const body = { To: phone, Body: SMS_TEXT(code) };
  if (serviceSid) body.MessagingServiceSid = serviceSid; else body.From = from;

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + basic, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: `Twilio: ${data.message || 'HTTP ' + res.status}` };
  return { ok: true };
}

// Есть ли у выбранного провайдера ключи и полна ли конфигурация
function smsGateway() {
  const { provider, http, smsgate, smsru, smsaero, twilio } = config.sms;
  if (provider === 'http') {
    return { name: 'свой HTTP-шлюз', ready: !!http.url, missing: http.url ? [] : ['SMS_HTTP_URL'] };
  }
  if (provider === 'smsgate') {
    const missing = [];
    if (!smsgate.key && !(smsgate.username && smsgate.password)) missing.push('SMS_GATE_KEY');
    return { name: 'SMS Gateway (Android)', ready: missing.length === 0, missing };
  }
  if (provider === 'smsru') {
    return { name: 'sms.ru', ready: !!smsru.api_id, missing: smsru.api_id ? [] : ['SMSRU_API_ID'] };
  }
  if (provider === 'smsaero') {
    const missing = [];
    if (!smsaero.email) missing.push('SMSAERO_EMAIL');
    if (!smsaero.api_key) missing.push('SMSAERO_API_KEY');
    return { name: 'SMS Aero', ready: missing.length === 0, missing };
  }
  if (provider === 'twilio') {
    const missing = [];
    if (!twilio.accountSid) missing.push('TWILIO_ACCOUNT_SID');
    if (!twilio.authToken) missing.push('TWILIO_AUTH_TOKEN');
    if (!twilio.from && !twilio.serviceSid) missing.push('TWILIO_FROM');
    return { name: 'Twilio', ready: missing.length === 0, missing };
  }
  return { name: 'demo', ready: true, missing: [] };
}

async function deliverSms(phone, code) {
  const { provider } = config.sms;
  const gw = smsGateway();
  if (provider === 'demo' || !gw.ready) return { ok: true, demo: true };

  try {
    if (provider === 'http') return await sendViaHttp(phone, code);
    if (provider === 'smsgate') return await sendViaSmsgate(phone, code);
    if (provider === 'smsru') return await sendViaSmsRu(phone, code);
    if (provider === 'smsaero') return await sendViaSmsAero(phone, code);
    if (provider === 'twilio') return await sendViaTwilio(phone, code);
  } catch (e) {
    return { ok: false, error: e.message };
  }
  return { ok: false, error: 'Неизвестный SMS-провайдер: ' + provider };
}

/* ---- Ограничение выдачи кодов ----
   Реальная SMS стоит денег, а запрос кода открыт всем. Без лимитов бот за вечер
   обнуляет баланс шлюза, поэтому считаем обращения к окну в один час.
   В демо-режиме SMS никуда не уходит и денег не стоит — лимиты отключены,
   иначе они мешали бы и разработке, и интеграционным тестам. */

const HOUR = 3600 * 1000;
const hitsByPhone = new Map();
const hitsByIp = new Map();

function allowSend(bucket, key, limit) {
  if (config.sms.provider === 'demo' || !key || limit <= 0) return true;
  const now = Date.now();
  const list = (bucket.get(key) || []).filter((t) => now - t < HOUR);
  if (list.length >= limit) {
    bucket.set(key, list);
    return false;
  }
  list.push(now);
  bucket.set(key, list);
  return true;
}

app.post('/api/auth/send-code', async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  if (!phone) return res.status(400).json({ error: 'Введите номер в формате +7 999 123-45-67' });

  const gw = smsGateway();
  if (config.sms.provider !== 'demo' && !gw.ready) {
    return res.status(503).json({
      error: `SMS через ${gw.name} не настроены: не хватает ${gw.missing.join(', ')}. Задайте их в messenger/secrets.js или переменными окружения (подробности: npm run doctor)`,
    });
  }

  const ip = req.ip || req.socket.remoteAddress || '';
  if (!allowSend(hitsByPhone, phone, config.rateLimit.perPhoneHour)) {
    return res.status(429).json({ error: 'Вы уже запрашивали коды несколько раз. Попробуйте через час.' });
  }
  if (!allowSend(hitsByIp, ip, config.rateLimit.perIpHour)) {
    return res.status(429).json({ error: 'Слишком много запросов кодов с этого адреса. Повторите позже.' });
  }

  const code = generateCode();
  otpCodes.set(phone, { code, expires: Date.now() + CODE_TTL, attempts: 0 });

  const result = await deliverSms(phone, code);
  if (!result.ok && !result.demo) {
    otpCodes.delete(phone);
    console.error(`SMS на ${phone} не отправлены: ${result.error}`);
    return res.status(502).json({ error: 'Не удалось отправить SMS. ' + (result.error || '') });
  }

  // Баланс шлюза виден в логах: удобно заметить, что деньги кончились
  if (result.balance !== undefined) console.log(`SMS отправлена на ${phone}, баланс шлюза: ${result.balance}`);

  // В демо-режиме код возвращается клиенту и показывается на экране.
  // При реальном шлюзе он никогда не уходит в ответ.
  res.json({
    ok: true,
    phone,
    sent: result.ok,
    demo: !!result.demo,
    demo_code: result.demo ? code : undefined,
    ttl_sec: CODE_TTL / 1000,
  });
});

app.post('/api/auth/verify', (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const code = String(req.body.code || '').trim();
  if (!phone || !code) return res.status(400).json({ error: 'Нужны номер и код' });

  const entry = otpCodes.get(phone);
  if (!entry) return res.status(400).json({ error: 'Сначала запросите код' });
  if (entry.expires < Date.now()) {
    otpCodes.delete(phone);
    return res.status(400).json({ error: 'Код истёк, запросите новый' });
  }
  if (entry.attempts >= 5) {
    otpCodes.delete(phone);
    return res.status(429).json({ error: 'Слишком много попыток, запросите новый код' });
  }
  if (entry.code !== code) {
    entry.attempts++;
    return res.status(400).json({ error: `Неверный код (осталось попыток: ${5 - entry.attempts})` });
  }

  otpCodes.delete(phone);
  const existing = findUserByPhone(phone);
  if (existing) return res.json(issueSession(existing));

  // Новый номер — просим создать профиль
  res.json({ needs_profile: true, phone });
});

app.post('/api/auth/register', (req, res) => {
  const phone = normalizePhone(req.body.phone);
  if (!phone) return res.status(400).json({ error: 'Некорректный номер' });
  if (findUserByPhone(phone)) return res.status(409).json({ error: 'Номер уже зарегистрирован' });

  const name = String(req.body.name || '').trim().slice(0, 40);
  if (!name) return res.status(400).json({ error: 'Укажите имя профиля' });

  const id = 'u' + crypto.randomBytes(4).toString('hex');
  let username = normalizeHandle(req.body.username) || 'user' + id.slice(1, 7);
  while (Object.values(users).some((u) => u.username === username)) username += 'x';

  users[id] = {
    id,
    name,
    phone,
    username,
    bio: String(req.body.bio || '').slice(0, 140),
    avatar: req.body.avatar || null,
    created_at: new Date().toISOString(),
    provider: 'phone',
    oauth: {},
    email: null,
    privacy: 'visible',
    dnd: false,
    last_seen: new Date().toISOString(),
  };

  // Личное «Избранное» для каждого нового аккаунта
  chats[selfKey(id)] = [];

  broadcast({ type: 'users', users: usersSnapshot() });
  res.json(issueSession(users[id]));
});

function issueSession(user) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, user.id);
  return { token, user: privateUser(user) };
}

app.get('/api/me', auth, (req, res) => {
  res.json({ user: privateUser(req.user) });
});

app.post('/api/auth/logout', auth, (req, res) => {
  req.user.last_seen = new Date().toISOString();
  sessions.delete(req.token);
  res.json({ ok: true });
});

app.put('/api/me', auth, (req, res) => {
  const { name, bio, username, privacy, dnd } = req.body;
  if (typeof name === 'string' && name.trim()) req.user.name = name.trim().slice(0, 40);
  if (typeof bio === 'string') req.user.bio = bio.slice(0, 140);
  if (['visible', 'invisible'].includes(privacy)) req.user.privacy = privacy;
  if (typeof dnd === 'boolean') req.user.dnd = dnd;
  if (typeof username === 'string') {
    const clean = normalizeHandle(username);
    if (clean && !Object.values(users).some((u) => u.id !== req.userId && u.username === clean)) {
      req.user.username = clean;
    }
  }
  broadcast({ type: 'users', users: usersSnapshot() });
  res.json({ user: privateUser(req.user) });
});

app.post('/api/me/avatar', auth, upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Фото не получено' });
  req.user.avatar = `/uploads/${req.userId}/${req.file.filename}`;
  broadcast({ type: 'users', users: usersSnapshot() });
  res.json({ user: privateUser(req.user) });
});

/* ==================== OAuth (Google / Яндекс / VK / OK) ==================== */

const OAUTH = {
  google: {
    label: 'Google',
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile',
    userinfo: 'https://openidconnect.googleapis.com/v1/userinfo',
    configured: () => !!(config.oauth.google.client_id && config.oauth.google.client_secret),
  },
  yandex: {
    label: 'Яндекс',
    authorize: 'https://oauth.yandex.ru/authorize',
    token: 'https://oauth.yandex.ru/token',
    scope: 'account:info email',
    userinfo: 'https://login.yandex.ru/info?format=json',
    configured: () => !!(config.oauth.yandex.client_id && config.oauth.yandex.client_secret),
  },
  vk: {
    label: 'VK',
    authorize: 'https://oauth.vk.com/authorize',
    token: 'https://oauth.vk.com/access_token',
    scope: 'email',
    userinfo: 'https://api.vk.com/method/users.get',
    configured: () => !!(config.oauth.vk.client_id && config.oauth.vk.client_secret),
  },
  ok: {
    label: 'OK',
    authorize: 'https://connect.ok.ru/oauth/authorize',
    token: 'https://connect.ok.ru/oauth/access_token',
    scope: 'standard',
    userinfo: 'https://api.ok.ru/fb.do',
    configured: () => !!(config.oauth.ok.client_id && config.oauth.ok.api_secret),
  },
};

async function postForm(url, fields, headers = {}) {
  const body = new URLSearchParams(fields).toString();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error((json && (json.error_description || json.error || json.raw)) || `HTTP ${res.status}`);
  return json;
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error((json && (json.error?.msg || json.error_description || json.error || json.raw)) || `HTTP ${res.status}`);
  return json;
}

// Обменивает код авторизации на профиль провайдера.
// client_secret остаётся на сервере и никогда не уходит в браузер.
async function exchangeOAuthCode(provider, code, redirectUri) {
  const p = config.oauth[provider];
  const meta = OAUTH[provider];

  if (provider === 'google') {
    const tok = await postForm(meta.token, {
      code, client_id: p.client_id, client_secret: p.client_secret,
      redirect_uri: redirectUri, grant_type: 'authorization_code',
    });
    const info = await getJson(meta.userinfo, { Authorization: 'Bearer ' + tok.access_token });
    return {
      pid: String(info.sub),
      name: info.name || info.given_name || 'Пользователь Google',
      email: info.email || null,
      avatar: info.picture || null,
    };
  }

  if (provider === 'yandex') {
    const tok = await postForm(meta.token, {
      code, grant_type: 'authorization_code', client_id: p.client_id, client_secret: p.client_secret,
    });
    const info = await getJson(meta.userinfo, { Authorization: 'OAuth ' + tok.access_token });
    return {
      pid: String(info.id),
      name: info.real_name || info.display_name || info.first_name || 'Пользователь Яндекса',
      email: info.default_email || info.emails?.[0] || null,
      avatar: info.default_avatar ? `https://avatars.yandex.net/get-yapic/${info.default_avatar}/islands-200` : null,
    };
  }

  if (provider === 'vk') {
    const tok = await postForm(meta.token, {
      code, client_id: p.client_id, client_secret: p.client_secret, redirect_uri: redirectUri,
    });
    const info = await getJson(
      `${meta.userinfo}?user_id=${tok.user_id}&fields=photo_200&v=5.131&access_token=${tok.access_token}`
    );
    const u = (info.response || [])[0] || {};
    return {
      pid: String(u.id || tok.user_id),
      name: [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Пользователь VK',
      email: tok.email || null,
      avatar: u.photo_200 || null,
    };
  }

  /* OK требует подписи каждого запроса. По документации apiok.ru:
     session_secret_key = md5(access_token + application_secret_key),
     затем sig = md5(отсортированные key=value + session_secret_key).
     access_token и format в подпись не входят, параметр называется sig,
     а публичный ключ — application_key (не application_id). */
  const tok = await postForm(meta.token, {
    code, client_id: p.client_id, client_secret: p.api_secret,
    redirect_uri: redirectUri, grant_type: 'authorization_code',
  });
  const params = {
    method: 'users.getCurrentUser',
    application_key: p.client_id,
    fields: 'uid,first_name,last_name,pic_150',
    format: 'json',
    access_token: tok.access_token,
  };
  const sessionSecret = crypto.createHash('md5').update(tok.access_token + p.api_secret).digest('hex');
  const toSign = Object.keys(params)
    .filter((k) => k !== 'access_token' && k !== 'format' && params[k] !== '')
    .sort()
    .map((k) => k + '=' + params[k])
    .join('');
  params.sig = crypto.createHash('md5').update(toSign + sessionSecret).digest('hex');
  const info = await getJson(meta.userinfo + '?' + new URLSearchParams(params));
  if (info.error_code || info.error) {
    throw new Error(`OK: ${info.error_msg || info.error_code || JSON.stringify(info).slice(0, 160)}`);
  }
  return {
    pid: String(info.uid),
    name: [info.first_name, info.last_name].filter(Boolean).join(' ') || 'Пользователь OK',
    email: null,
    avatar: info.pic_150 || null,
  };
}

function createOAuthUser(provider, prof) {
  const id = 'u' + crypto.randomBytes(4).toString('hex');
  let username = normalizeHandle((prof.email || '').split('@')[0]) || provider + id.slice(1, 6);
  while (Object.values(users).some((u) => u.username === username)) username += 'x';

  users[id] = {
    id,
    name: prof.name.slice(0, 40),
    phone: null,
    username,
    bio: '',
    avatar: prof.avatar || null,
    created_at: new Date().toISOString(),
    provider,
    oauth: { [provider]: prof.pid },
    email: prof.email || null,
    privacy: 'visible',
    dnd: false,
    last_seen: new Date().toISOString(),
  };
  chats[selfKey(id)] = [];
  return users[id];
}

function findOAuthUser(provider, prof) {
  const byPid = Object.values(users).find((u) => u.oauth && u.oauth[provider] === prof.pid);
  if (byPid) return byPid;
  if (prof.email) {
    const byMail = Object.values(users).find((u) => u.email === prof.email);
    if (byMail) {
      byMail.oauth = { ...(byMail.oauth || {}), [provider]: prof.pid };
      if (!byMail.avatar && prof.avatar) byMail.avatar = prof.avatar;
      return byMail;
    }
  }
  return createOAuthUser(provider, prof);
}

app.get('/api/health', (_req, res) => {
  const gw = smsGateway();
  res.json({
    ok: true,
    name: 'MAXgram',
    uptime_sec: Math.round(process.uptime()),
    users: Object.keys(users).length,
    online: sockets.size,
    chats: Object.keys(chats).length,
    channels: Object.keys(channels).length,
    groups: Object.keys(groups).length,
    sms_provider: config.sms.provider,
    sms_ready: gw.ready,
  });
});

app.get('/api/auth/providers', (_req, res) => {
  const out = {};
  for (const [id, cfg] of Object.entries(OAUTH)) {
    out[id] = { label: cfg.label, configured: cfg.configured() };
  }
  const gw = smsGateway();
  res.json({
    providers: out,
    sms_provider: config.sms.provider,
    sms_ready: gw.ready,
    // Реальный шлюз выбран, но ключей нет — фронт честно скажет об этом вместо
    // расплывчатого «SMS не отправлены»
    sms_name: gw.name,
    sms_missing: gw.missing,
  });
});

// Адрес этого сервера глазами браузера. PUBLIC_URL задаёт его жёстко (продакшен),
// иначе берём из заголовков прокси — тогда один процесс корректно работает и на
// localhost, и на trycloudflare-туннеле, и на Render без перезапуска.
function publicOrigin(req) {
  if (!config.publicUrlExplicit) {
    const host = req.get('x-forwarded-host') || req.get('host');
    if (host) {
      const proto = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
      return proto + '://' + host.split(',')[0].trim();
    }
  }
  return config.publicUrl;
}

app.get('/api/auth/:provider/start', (req, res) => {
  const id = req.params.provider;
  const provider = OAUTH[id];
  if (!provider) return res.status(404).json({ error: 'Неизвестный провайдер' });
  if (!provider.configured()) {
    return res.status(501).json({
      error: `${provider.label} не настроен: впишите client_id и client_secret в messenger/secrets.js (образец — secrets.example.js) или задайте переменными окружения. Проверка: npm run doctor`,
    });
  }

  const state = crypto.randomBytes(12).toString('hex');
  const redirect = `${publicOrigin(req)}/auth/${id}/callback`;
  oauthStates.set(state, { provider: id, expires: Date.now() + CODE_TTL, redirect });

  const p = config.oauth[id];
  let url;
  if (id === 'google') {
    url = `${provider.authorize}?client_id=${p.client_id}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=${encodeURIComponent(provider.scope)}&state=${state}&prompt=select_account`;
  } else if (id === 'yandex') {
    url = `${provider.authorize}?client_id=${p.client_id}&response_type=code&scope=${encodeURIComponent(provider.scope)}&state=${state}`;
  } else if (id === 'vk') {
    url = `${provider.authorize}?client_id=${p.client_id}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=${provider.scope}&state=${state}&v=5.131`;
  } else {
    // У ОК публичный ключ в параметре application_key
    url = `${provider.authorize}?application_key=${p.client_id}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&state=${state}&layout=w`;
  }
  res.json({ url, redirect_uri: redirect });
});

// Ответ провайдера: меняем code на профиль, выдаём свой токен и закрываем popup
app.get('/auth/:provider/callback', async (req, res) => {
  const id = req.params.provider;
  const provider = OAUTH[id];
  if (!provider) return res.status(404).send('Неизвестный провайдер');

  const fail = (msg) => res
    .status(400)
    .type('html')
    .send(`<meta charset="utf-8"><p style="font:16px system-ui;color:#c0392b">Ошибка входа через ${provider.label}: ${escapeHtml(msg)}</p>`);

  const { code, state, error } = req.query;
  if (error) return fail(String(error));
  const saved = state && oauthStates.get(state);
  if (!code || !saved || saved.provider !== id) return fail('не прошёл проверку state');
  oauthStates.delete(state);

  try {
    const prof = await exchangeOAuthCode(id, String(code), saved.redirect);
    const user = findOAuthUser(id, prof);
    const session = issueSession(user);
    broadcast({ type: 'users', users: usersSnapshot() });

    res.type('html').send(
      '<meta charset="utf-8"><script>' +
      `localStorage.setItem('mg-token', ${JSON.stringify(session.token)});` +
      `localStorage.setItem('mg:oauth:done', ${JSON.stringify(id)});` +
      'window.close();' +
      '</script><p style="font:15px system-ui;text-align:center;margin-top:40px">Готово! Окно закроется само.</p>'
    );
  } catch (e) {
    return fail(e.message || 'не удалось обменять код');
  }
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ==================== ЧАТЫ И СООБЩЕНИЯ ==================== */

app.get('/api/users', auth, (_req, res) => {
  res.json(usersSnapshot());
});

app.get('/api/users/:id/chats', auth, (req, res) => {
  const meId = req.userId;
  const list = [...chatKeysFor(meId)].map((k) => chatSummary(k, meId)).filter(Boolean);
  list.sort((a, b) => {
    const ta = a.last_message?.created_at || '';
    const tb = b.last_message?.created_at || '';
    return tb.localeCompare(ta);
  });
  res.json(list);
});

app.get('/api/chats/:key/messages', auth, (req, res) => {
  const key = decodeURIComponent(req.params.key);
  if (!canAccess(req.userId, key)) return res.status(403).json({ error: 'Нет доступа к чату' });
  const list = chats[key];
  if (!list) return res.json([]);

  if (key.startsWith('c:')) {
    // В канале сообщения нельзя «прочитать» за другого — считаем просмотры как в Telegram:
    // каждый участник, впервые открывший публикацию, увеличивает счётчик
    const s = settingsOf(key, req.userId);
    const last = list[list.length - 1];
    for (const m of list) {
      if (m.views == null) m.views = 0;
      if (!Array.isArray(m.viewed_by)) m.viewed_by = m.sender_id === req.userId ? [req.userId] : [];
      if (m.sender_id !== req.userId && !m.viewed_by.includes(req.userId)) {
        m.viewed_by.push(req.userId);
        m.views = m.viewed_by.length;
      }
    }
    if (last && (!s.last_read_at || Date.parse(last.created_at) > Date.parse(s.last_read_at))) {
      s.last_read_at = last.created_at;
    }
  } else {
    list.forEach((m) => {
      if (m.sender_id !== req.userId && m.status !== 'read') m.status = 'read';
    });
  }

  res.json(list.map((m) => publicMessage(m, req.userId, key)));
});

app.post('/api/messages', auth, (req, res) => {
  const { chat_key, content, kind = 'text', media, location, contact, event, reply_to, forwarded_from } = req.body;
  if (!chat_key) return res.status(400).json({ error: 'Не указан чат' });
  if (!canAccess(req.userId, chat_key, { write: true })) return res.status(403).json({ error: 'Нет доступа к чату' });
  if (!canPost(req.userId, chat_key)) return res.status(403).json({ error: 'Публиковать в этом чате могут только администраторы' });

  const type = ['text','photo','video','file','audio','voice','location','contact','event','circle','call'].includes(kind) ? kind : 'text';
  const text = typeof content === 'string' ? content.trim().slice(0, 4000) : '';

  if (type === 'text' && !text) return res.status(400).json({ error: 'Пустое сообщение' });
  // Звонок обслуживается только текстом-описанием, вложения у него нет
  if (type !== 'text' && type !== 'call' && !media && !location && !contact && !event) {
    return res.status(400).json({ error: 'Нет содержимого сообщения' });
  }
  if (type === 'call' && !text) return res.status(400).json({ error: 'Нужно описание звонка' });

  if (!chats[chat_key]) chats[chat_key] = [];

  let reply = null;
  if (reply_to) {
    const target = findMessage(chat_key, reply_to);
    if (target) {
      const author = users[target.sender_id];
      reply = {
        id: target.id,
        sender_id: target.sender_id,
        sender_name: author ? author.name : 'Неизвестный',
        content: previewText(target).slice(0, 200),
        kind: target.kind,
      };
    }
  }

  const msg = {
    id: uuidv4(),
    chat_key,
    sender_id: req.userId,
    kind: type,
    content: text,
    media: media || null,
    location: location || null,
    contact: contact || null,
    event: event || null,
    reply_to: reply ? reply.id : null,
    reply_ref: reply,
    forwarded_from: forwarded_from && (forwarded_from.name || forwarded_from.username)
      ? { name: String(forwarded_from.name || '').slice(0, 60), username: String(forwarded_from.username || '').slice(0, 40) }
      : null,
    edited_at: null,
    views: chat_key.startsWith('c:') ? 0 : null,
    viewed_by: chat_key.startsWith('c:') ? [] : null,
    created_at: new Date().toISOString(),
    status: 'sent',
  };
  chats[chat_key].push(msg);

  const recipients = recipientsOf(chat_key, req.userId);
  let delivered = false;
  for (const id of recipients) {
    if (isOnline(id)) {
      delivered = true;
      send(id, { type: 'message', message: msg });
    }
  }
  if (delivered && !chat_key.startsWith('c:')) {
    msg.status = 'delivered';
    send(req.userId, { type: 'receipt', message_id: msg.id, chat_key, status: 'delivered' });
  }

  res.json(publicMessage(msg, req.userId, chat_key));
});

app.put('/api/messages/:id', auth, (req, res) => {
  const key = decodeURIComponent(String(req.body.chat_key || ''));
  const msg = findMessage(key, req.params.id);
  if (!msg) return res.status(404).json({ error: 'Сообщение не найдено' });
  if (msg.sender_id !== req.userId) return res.status(403).json({ error: 'Редактировать можно только свои сообщения' });
  if (!canAccess(req.userId, key, { write: true })) return res.status(403).json({ error: 'Нет доступа к чату' });

  const text = typeof req.body.content === 'string' ? req.body.content.trim().slice(0, 4000) : '';
  if (!text) return res.status(400).json({ error: 'Пустое сообщение' });
  msg.content = text;
  msg.edited_at = new Date().toISOString();

  broadcastTo(recipientsOf(key, req.userId), { type: 'edit', chat_key: key, message: publicMessage(msg, null, key) });
  res.json({ message: publicMessage(msg, req.userId, key) });
});

app.post('/api/messages/:id/pin', auth, (req, res) => {
  const key = decodeURIComponent(String(req.body.chat_key || ''));
  const msg = findMessage(key, req.params.id);
  if (!msg) return res.status(404).json({ error: 'Сообщение не найдено' });
  if (!canAccess(req.userId, key, { write: true })) return res.status(403).json({ error: 'Нет доступа к чату' });
  if ((key.startsWith('g:') || key.startsWith('c:')) && !isAdmin(req.userId, key)) {
    return res.status(403).json({ error: 'Закреплять могут только администраторы' });
  }

  if (req.body.remove) {
    delete pins[key];
  } else {
    pins[key] = { message_id: msg.id, by_id: req.userId, at: new Date().toISOString() };
  }
  const payload = { type: 'pin', chat_key: key, pin: req.body.remove ? null : { ...pins[key] }, message: req.body.remove ? null : publicMessage(msg, null, key) };
  broadcastTo(membersOf(key), payload);
  res.json({ ok: true, pin: req.body.remove ? null : pins[key] });
});

app.post('/api/messages/forward', auth, (req, res) => {
  const { message_ids: ids, chat_keys: targets } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'Нет сообщений' });
  if (!Array.isArray(targets) || !targets.length) return res.status(400).json({ error: 'Выберите чат для пересылки' });

  const created = [];
  for (const target of targets) {
    if (!canPost(req.userId, target)) continue;
    if (!chats[target]) {
      if (!canAccess(req.userId, target, { write: true })) continue;
      chats[target] = [];
    }
    for (const id of ids) {
      for (const srcKey of Object.keys(chats)) {
        if (!canAccess(req.userId, srcKey)) continue;
        const src = findMessage(srcKey, id);
        if (!src) continue;
        const author = users[src.sender_id];
        const copy = {
          ...src,
          id: uuidv4(),
          chat_key: target,
          sender_id: req.userId,
          created_at: new Date().toISOString(),
          status: 'sent',
          views: target.startsWith('c:') ? 0 : null,
          reply_to: null,
          reply_ref: null,
          edited_at: null,
          forwarded_from: {
            id: src.sender_id,
            name: author ? author.name : 'Неизвестный',
            username: author ? author.username : null,
            chat_key: srcKey,
          },
        };
        chats[target].push(copy);
        created.push(copy);
        broadcastTo(recipientsOf(target, req.userId), { type: 'message', message: copy });
        break;
      }
    }
  }
  if (!created.length) return res.status(400).json({ error: 'Нечего пересылать или нет доступа' });
  res.json({ messages: created });
});

app.post('/api/chats/:key/read', auth, (req, res) => {
  const key = decodeURIComponent(req.params.key);
  if (!canAccess(req.userId, key)) return res.status(403).json({ error: 'Нет доступа к чату' });
  const list = chats[key] || [];

  if (key.startsWith('c:')) {
    const last = list[list.length - 1];
    if (last) settingsOf(key, req.userId).last_read_at = last.created_at;
    return res.json({ ok: true });
  }

  let changed = false;
  list.forEach((m) => {
    if (m.sender_id !== req.userId && m.status !== 'read') { m.status = 'read'; changed = true; }
  });
  if (changed) {
    broadcastTo(recipientsOf(key, req.userId), { type: 'read_all', chat_key: key, reader_id: req.userId });
  }
  res.json({ ok: true });
});

/* ---------- Настройки чата: обои, запрет копирования, отключение звука ---------- */

app.get('/api/chats/:key/settings', auth, (req, res) => {
  const key = decodeURIComponent(req.params.key);
  if (!canAccess(req.userId, key)) return res.status(403).json({ error: 'Нет доступа к чату' });
  res.json({ settings: settingsOf(key, req.userId) });
});

app.put('/api/chats/:key/settings', auth, (req, res) => {
  const key = decodeURIComponent(req.params.key);
  if (!canAccess(req.userId, key)) return res.status(403).json({ error: 'Нет доступа к чату' });
  const s = settingsOf(key, req.userId);
  const { wallpaper, no_copy, muted } = req.body;
  if (wallpaper === null || (wallpaper && (wallpaper.type === 'color' || wallpaper.type === 'image'))) {
    s.wallpaper = wallpaper || null;
  }
  if (typeof no_copy === 'boolean') s.no_copy = no_copy;
  if (typeof muted === 'boolean') s.muted = muted;
  res.json({ settings: s });
});

app.post('/api/chats/:key/wallpaper', auth, upload.single('photo'), (req, res) => {
  const key = decodeURIComponent(req.params.key);
  if (!canAccess(req.userId, key)) return res.status(403).json({ error: 'Нет доступа к чату' });
  if (!req.file) return res.status(400).json({ error: 'Файл не получен' });
  settingsOf(key, req.userId).wallpaper = { type: 'image', url: `/uploads/${req.userId}/${req.file.filename}` };
  res.json({ settings: settingsOf(key, req.userId) });
});

/* ---------- Экспорт, очистка и удаление истории ---------- */

function exportName(key, ext) {
  const safe = key.replace(/[^a-z0-9]+/gi, '-').slice(0, 40);
  return `maxgram-${safe}-${new Date().toISOString().slice(0, 10)}.${ext}`;
}

function toHtml(key, list) {
  const sum = chatSummary(key, list[0]?.sender_id || 'u1') || { user: { name: key } };
  const rows = list.map((m) => {
    const who = users[m.sender_id] ? users[m.sender_id].name : m.sender_id;
    const body = m.kind && m.kind !== 'text'
      ? `<em>${escapeHtml(previewText(m))}</em>` + (m.media?.url ? ` <a href="${m.media.url}">${escapeHtml(m.media.name || 'вложение')}</a>` : '')
      : escapeHtml(m.content);
    return `<div class="m"><b>${escapeHtml(who)}</b> <span>${new Date(m.created_at).toLocaleString('ru-RU')}</span><p>${body}</p></div>`;
  }).join('\n');
  return `<!doctype html><meta charset="utf-8"><title>${escapeHtml(sum.user.name)}</title>
<style>body{font:15px/1.5 system-ui;max-width:760px;margin:24px auto;padding:0 16px;color:#111}
h1{font-size:20px}.m{border-left:3px solid #3390ec;padding:6px 12px;margin:8px 0;background:#f7f8fa;border-radius:6px}
.m span{color:#707579;font-size:12px;margin-left:6px}.m p{margin:4px 0 0;white-space:pre-wrap}</style>
<h1>${escapeHtml(sum.user.name)}</h1><p>Сообщений: ${list.length}</p>${rows}`;
}

app.get('/api/chats/:key/export', auth, (req, res) => {
  const key = decodeURIComponent(req.params.key);
  if (!canAccess(req.userId, key)) return res.status(403).json({ error: 'Нет доступа к чату' });
  if (settingsOf(key, req.userId).no_copy) {
    return res.status(403).json({ error: 'В этом чате запрещён копирование и экспорт' });
  }
  const list = chats[key] || [];
  const format = ['json', 'html', 'txt'].includes(req.query.format) ? req.query.format : 'json';

  if (format === 'html') {
    return res.setHeader('Content-Disposition', `attachment; filename="${exportName(key, 'html')}"`)
      .type('html').send(toHtml(key, list));
  }
  if (format === 'txt') {
    const text = list.map((m) => `[${new Date(m.created_at).toLocaleString('ru-RU')}] ${users[m.sender_id]?.name || m.sender_id}: ${previewText(m)}`).join('\n');
    return res.setHeader('Content-Disposition', `attachment; filename="${exportName(key, 'txt')}"`)
      .type('text/plain').send(text);
  }
  const json = {
    chat_key: key,
    exported_at: new Date().toISOString(),
    messages: list.map((m) => ({ ...m, sender_name: users[m.sender_id]?.name || null })),
  };
  res.setHeader('Content-Disposition', `attachment; filename="${exportName(key, 'json')}"`)
    .json(json);
});

app.post('/api/chats/:key/clear', auth, (req, res) => {
  const key = decodeURIComponent(req.params.key);
  if (!canAccess(req.userId, key, { write: true })) return res.status(403).json({ error: 'Нет доступа к чату' });
  chats[key] = [];
  delete pins[key];
  broadcastTo(membersOf(key), { type: 'clear', chat_key: key });
  res.json({ ok: true });
});

app.delete('/api/chats/:key', auth, (req, res) => {
  const key = decodeURIComponent(req.params.key);
  if (!canAccess(req.userId, key)) return res.status(403).json({ error: 'Нет доступа к чату' });

  chats[key] = [];
  delete pins[key];
  if (chatSettings[key]) delete chatSettings[key][req.userId];

  // Для групп и каналов выход равно удалению чата у себя
  if (key.startsWith('g:')) {
    const g = groups[key.slice(2)];
    if (g) g.members = g.members.filter((id) => id !== req.userId);
  } else if (key.startsWith('c:')) {
    const c = channels[key.slice(2)];
    if (c) {
      c.members = c.members.filter((id) => id !== req.userId);
      c.admins = (c.admins || []).filter((id) => id !== req.userId);
    }
  }
  broadcastTo(membersOf(key), { type: 'clear', chat_key: key });
  res.json({ ok: true });
});

/* ==================== ГРУППЫ ==================== */

app.post('/api/groups', auth, (req, res) => {
  const title = String(req.body.name || '').trim().slice(0, 40);
  const members = Array.from(new Set([req.userId, ...(req.body.members || [])]));
  const isPublic = !!req.body.is_public;
  const handle = isPublic ? normalizeHandle(req.body.handle) : '';
  if (!title) return res.status(400).json({ error: 'Нужно название группы' });
  if (members.length < 2) return res.status(400).json({ error: 'Добавьте хотя бы одного участника' });
  if (!members.every((m) => users[m])) return res.status(400).json({ error: 'Неизвестный участник' });
  if (isPublic && !handle) return res.status(400).json({ error: 'Публичной группе нужен адрес от 4 символов (a-z, 0-9, _)' });
  if (handle && handleTaken(handle)) return res.status(409).json({ error: 'Такой адрес уже занят' });

  const id = 'g' + crypto.randomBytes(4).toString('hex');
  groups[id] = {
    id,
    name: title,
    handle: handle || null,
    description: String(req.body.description || '').slice(0, 200),
    members,
    admins: [req.userId],
    owner: req.userId,
    is_public: isPublic,
    created_at: new Date().toISOString(),
  };
  chats[groupKey(id)] = [];

  broadcast({ type: 'users', users: usersSnapshot() });
  res.json({ ...groups[id] });
});

app.put('/api/groups/:id', auth, (req, res) => {
  const g = groups[req.params.id];
  if (!g) return res.status(404).json({ error: 'Группа не найдена' });
  const key = groupKey(g.id);
  if (!isAdmin(req.userId, key)) return res.status(403).json({ error: 'Только владелец или админ' });

  if (typeof req.body.name === 'string' && req.body.name.trim()) g.name = req.body.name.trim().slice(0, 40);
  if (typeof req.body.description === 'string') g.description = req.body.description.slice(0, 200);
  if (typeof req.body.is_public === 'boolean') {
    g.is_public = req.body.is_public;
    g.handle = req.body.is_public ? normalizeHandle(req.body.handle) || g.handle : null;
  }
  if (Array.isArray(req.body.members)) {
    g.members = Array.from(new Set([g.owner, ...req.body.members.filter((m) => users[m])]));
  }
  if (Array.isArray(req.body.admins)) {
    g.admins = Array.from(new Set([g.owner, ...req.body.admins.filter((m) => g.members.includes(m))]));
  }
  broadcastTo(membersOf(key), { type: 'chat_updated', chat_key: key });
  res.json({ ...g });
});

/* ==================== КАНАЛЫ ==================== */

function handleTaken(handle) {
  if (!handle) return false;
  return Object.values(channels).some((c) => c.handle === handle) || Object.values(groups).some((g) => g.handle === handle);
}

app.post('/api/channels', auth, (req, res) => {
  const title = String(req.body.name || '').trim().slice(0, 40);
  const isPublic = req.body.is_public !== false;
  const handle = isPublic ? normalizeHandle(req.body.handle) : '';
  if (!title) return res.status(400).json({ error: 'Нужно название канала' });
  if (isPublic && !handle) return res.status(400).json({ error: 'Публичному каналу нужен адрес от 4 символов (a-z, 0-9, _)' });
  if (handle && handleTaken(handle)) return res.status(409).json({ error: 'Такой адрес уже занят' });

  const id = 'ch' + crypto.randomBytes(4).toString('hex');
  channels[id] = {
    id,
    name: title,
    handle: handle || null,
    description: String(req.body.description || '').slice(0, 200),
    avatar: null,
    owner: req.userId,
    admins: [req.userId],
    members: [req.userId],
    is_public: isPublic,
    created_at: new Date().toISOString(),
  };
  chats[channelKey(id)] = [];

  broadcast({ type: 'users', users: usersSnapshot() });
  res.json({ ...channels[id] });
});

app.put('/api/channels/:id', auth, (req, res) => {
  const c = channels[req.params.id];
  if (!c) return res.status(404).json({ error: 'Канал не найден' });
  const key = channelKey(c.id);
  if (!isAdmin(req.userId, key)) return res.status(403).json({ error: 'Только владелец или админ' });

  if (typeof req.body.name === 'string' && req.body.name.trim()) c.name = req.body.name.trim().slice(0, 40);
  if (typeof req.body.description === 'string') c.description = req.body.description.slice(0, 200);
  if (typeof req.body.is_public === 'boolean') {
    c.is_public = req.body.is_public;
    c.handle = req.body.is_public ? normalizeHandle(req.body.handle) || c.handle : null;
    if (c.is_public && handleTaken(c.handle) && Object.values(channels).filter((x) => x.handle === c.handle).length > 1) {
      return res.status(409).json({ error: 'Такой адрес уже занят' });
    }
  }
  broadcastTo(membersOf(key), { type: 'chat_updated', chat_key: key });
  res.json({ ...c });
});

app.post('/api/channels/:id/join', auth, (req, res) => {
  const c = channels[req.params.id];
  if (!c) return res.status(404).json({ error: 'Канал не найден' });
  if (!c.is_public && req.body.invite !== c.owner) return res.status(403).json({ error: 'Канал закрытый — нужен приглашающий' });
  if (!c.members.includes(req.userId)) {
    c.members.push(req.userId);
    broadcastTo(membersOf(channelKey(c.id)), { type: 'chat_updated', chat_key: channelKey(c.id) });
  }
  res.json({ ...c, members_count: c.members.length });
});

app.post('/api/channels/:id/leave', auth, (req, res) => {
  const c = channels[req.params.id];
  if (!c) return res.status(404).json({ error: 'Канал не найден' });
  c.members = c.members.filter((id) => id !== req.userId);
  c.admins = (c.admins || []).filter((id) => id !== req.userId);
  res.json({ ok: true });
});

app.post('/api/groups/:id/join', auth, (req, res) => {
  const g = groups[req.params.id];
  if (!g) return res.status(404).json({ error: 'Группа не найдена' });
  if (!g.is_public) return res.status(403).json({ error: 'Группа закрытая' });
  if (!g.members.includes(req.userId)) g.members.push(req.userId);
  broadcastTo(membersOf(groupKey(g.id)), { type: 'chat_updated', chat_key: groupKey(g.id) });
  res.json({ ...g, members_count: g.members.length });
});

app.post('/api/channels/:id/avatar', auth, upload.single('photo'), (req, res) => {
  const c = channels[req.params.id];
  if (!c) return res.status(404).json({ error: 'Канал не найден' });
  if (!isAdmin(req.userId, channelKey(c.id))) return res.status(403).json({ error: 'Только администраторы' });
  if (!req.file) return res.status(400).json({ error: 'Фото не получено' });
  c.avatar = `/uploads/${req.userId}/${req.file.filename}`;
  broadcastTo(membersOf(channelKey(c.id)), { type: 'chat_updated', chat_key: channelKey(c.id) });
  res.json({ ...c });
});

/* ---------- Поиск и каталог публичного ---------- */

app.get('/api/discover', auth, (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const match = (s) => !q || String(s || '').toLowerCase().includes(q);

  const chans = Object.values(channels)
    .filter((c) => c.is_public && (match(c.name) || match(c.handle) || match(c.description)))
    .map((c) => ({
      type: 'channel', id: c.id, key: channelKey(c.id), name: c.name, handle: c.handle,
      description: c.description, members: c.members.length, avatar: c.avatar,
      subscribed: c.members.includes(req.userId),
    }));

  const grs = Object.values(groups)
    .filter((g) => g.is_public && (match(g.name) || match(g.handle) || match(g.description)))
    .map((g) => ({
      type: 'group', id: g.id, key: groupKey(g.id), name: g.name, handle: g.handle,
      description: g.description, members: g.members.length,
      subscribed: g.members.includes(req.userId),
    }));

  const people = Object.values(users)
    .filter((u) => u.id !== req.userId && (match(u.name) || match(u.username)))
    .map((u) => ({ type: 'user', id: u.id, key: pairKey(req.userId, u.id), name: u.name, handle: u.username, description: u.bio }));

  res.json({ channels: chans, groups: grs, users: people });
});

/* ==================== ИСТОРИИ (24 часа) ==================== */

function storyCard(s, meId) {
  return {
    ...s,
    seen: (s.views || []).includes(meId),
    views: (s.views || []).length,
  };
}

app.get('/api/stories', auth, (req, res) => {
  const now = Date.now();
  const groupsByAuthor = {};
  for (const [uid, list] of Object.entries(stories)) {
    const alive = list.filter((s) => s.expires > now).sort((a, b) => a.created_at.localeCompare(b.created_at));
    stories[uid] = stories[uid].filter((s) => s.expires > now);
    if (!stories[uid].length) { delete stories[uid]; continue; }
    const u = users[uid];
    if (!u) continue;
    groupsByAuthor[uid] = {
      user: publicUser(u),
      items: alive.map((s) => storyCard(s, req.userId)),
    };
  }
  const out = Object.values(groupsByAuthor);
  out.sort((a, b) => (a.user.id === req.userId ? -1 : b.user.id === req.userId ? 1 : b.items[b.items.length - 1].created_at.localeCompare(a.items[a.items.length - 1].created_at)));
  res.json({ stories: out });
});

app.post('/api/stories', auth, (req, res) => {
  const { kind = 'photo', media = null, caption = '' } = req.body;
  if (!['photo', 'video', 'text'].includes(kind)) return res.status(400).json({ error: 'Неверный тип истории' });
  if (kind !== 'text' && !(media && media.url)) return res.status(400).json({ error: 'Нет вложения' });
  if (!['photo', 'video'].includes(kind) && !String(caption || '').trim()) return res.status(400).json({ error: 'Нет текста истории' });

  const story = {
    id: uuidv4(),
    author_id: req.userId,
    kind,
    media: media || null,
    caption: String(caption || '').slice(0, 200),
    created_at: new Date().toISOString(),
    expires: Date.now() + STORY_TTL,
    views: [],
  };
  if (!stories[req.userId]) stories[req.userId] = [];
  stories[req.userId].push(story);

  broadcast({ type: 'story_new', story: storyCard(story, req.userId) });
  res.json({ story: storyCard(story, req.userId) });
});

app.post('/api/stories/:id/view', auth, (req, res) => {
  for (const list of Object.values(stories)) {
    const s = list.find((x) => x.id === req.params.id);
    if (s) {
      if (s.author_id !== req.userId && !s.views.includes(req.userId)) s.views.push(req.userId);
      return res.json({ ok: true, views: s.views.length });
    }
  }
  res.status(404).json({ error: 'История не найдена' });
});

app.delete('/api/stories/:id', auth, (req, res) => {
  const list = stories[req.userId] || [];
  const idx = list.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'История не найдена' });
  const [removed] = list.splice(idx, 1);
  if (!list.length) delete stories[req.userId];
  broadcast({ type: 'story_deleted', story_id: removed.id });
  res.json({ ok: true });
});

/* ==================== УДАЛЕНИЕ СООБЩЕНИЙ ==================== */

app.delete('/api/messages/:id', auth, (req, res) => {
  const key = decodeURIComponent(String(req.query.chat_key || ''));
  const candidates = key && chats[key] ? [[key, chats[key]]] : Object.entries(chats);
  for (const [chatKey, list] of candidates) {
    const idx = list.findIndex((m) => m.id === req.params.id);
    if (idx === -1) continue;
    const msg = list[idx];
    const mine = msg.sender_id === req.userId;
    if (!mine && !isAdmin(req.userId, chatKey)) return res.status(403).json({ error: 'Удалить можно только своё сообщение' });
    if (!canAccess(req.userId, chatKey, { write: true })) return res.status(403).json({ error: 'Нет доступа к чату' });
    const [removed] = list.splice(idx, 1);
    if (pins[chatKey]?.message_id === removed.id) delete pins[chatKey];
    broadcastTo(membersOf(chatKey), { type: 'delete', message_id: removed.id, chat_key: chatKey });
    return res.json({ ok: true });
  }
  res.status(404).json({ error: 'Сообщение не найдено' });
});

/* ==================== WEBSOCKET ==================== */

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');
  const userId = token && sessions.get(token);
  if (!userId || !users[userId]) return ws.close();

  if (!sockets.has(userId)) sockets.set(userId, new Set());
  const set = sockets.get(userId);
  const firstConnection = set.size === 0;
  set.add(ws);
  ws.userId = userId;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  if (firstConnection) {
    users[userId].last_seen = new Date().toISOString();
    broadcast({ type: 'users', users: usersSnapshot() });
  }
  ws.send(JSON.stringify({ type: 'users', users: usersSnapshot() }));

  ws.on('message', (raw) => {
    let data;
    try { data = JSON.parse(raw.toString()); } catch { return; }

    switch (data.type) {
      case 'typing': {
        const key = data.chat_key;
        if (!key) break;
        broadcastTo(recipientsOf(key, userId), { type: 'typing', chat_key: key, user_id: userId });
        break;
      }

      case 'read': {
        const key = data.chat_key;
        if (!key) break;
        if (key.startsWith('c:')) {
          const list = chats[key] || [];
          const last = list[list.length - 1];
          if (last) settingsOf(key, userId).last_read_at = last.created_at;
          break;
        }
        const list = chats[key] || [];
        let changed = false;
        list.forEach((m) => {
          if (m.sender_id !== userId && m.status !== 'read') { m.status = 'read'; changed = true; }
        });
        if (changed) {
          broadcastTo(recipientsOf(key, userId), { type: 'read_all', chat_key: key, reader_id: userId });
        }
        break;
      }

      // ---- Сигнализация WebRTC для аудио/видеозвонков ----
      case 'call': {
        const to = data.to;
        if (!to || !users[to]) break;
        const relay = {
          type: 'call',
          action: data.action,           // offer | answer | ice | reject | ended | ringing
          call_id: data.call_id,
          from: userId,
          from_name: users[userId].name,
          from_avatar: users[userId].avatar,
          video: !!data.video,
          sdp: data.sdp,
          candidate: data.candidate,
          reason: data.reason,
        };
        if (data.action === 'offer') {
          if (!isOnline(to)) {
            send(userId, { type: 'call', action: 'unreachable', call_id: data.call_id, to });
            break;
          }
        }
        broadcastTo(recipientsOf(data.chat_key || pairKey(userId, to), userId), relay);
        if (data.action === 'offer') send(userId, relay); // дублируем другим вкладкам звонящего
        break;
      }

      default:
        break;
    }
  });

  const cleanup = () => {
    const s = sockets.get(userId);
    if (!s) return;
    s.delete(ws);
    if (s.size === 0) {
      sockets.delete(userId);
      users[userId].last_seen = new Date().toISOString();
      broadcast({ type: 'users', users: usersSnapshot() });
    }
  };
  ws.on('close', cleanup);
  ws.on('error', cleanup);
});

const heartbeat = setInterval(() => {
  for (const [, set] of sockets) {
    for (const ws of set) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      try { ws.ping(); } catch { /* игнорируем */ }
    }
  }
}, 25000);
wss.on('close', () => clearInterval(heartbeat));

/* ==================== SPA ==================== */

app.get(/^(?!\/api|\/ws|\/uploads|\/auth).*/, (_req, res) => {
  res.sendFile(path.join(__dirname, 'client', 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  // PORT может быть 0 (Electron просит свободный порт) — берём реальный из сокета
  const real = server.address().port;
  const gw = smsGateway();
  // При реальном шлюзе писать про demo вредно: админ ищет глазами именно эту
  // строку, чтобы понять, подхватились ли ключи из secrets.js.
  const smsLine = config.sms.provider === 'demo'
    ? 'demo (код показывается на экране)'
    : `${config.sms.provider} — ${gw.name}: ` +
      (gw.ready ? 'ключи заданы' : 'НЕ хватает ' + gw.missing.join(', ') + ' (подробности: npm run doctor)');
  console.log('\n  MAXgram запущен: http://localhost:' + real);
  console.log('  SMS-провайдер: ' + smsLine + '\n');
});

// Для десктоп-обёртки (electron/main.js), которая подключает сервер как модуль
module.exports = { app, server };
