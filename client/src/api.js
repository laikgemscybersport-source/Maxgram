/*
 * Базовый адрес сервера.
 *
 * В браузере и в десктоп-обёртке страница отдаётся тем же сервером, поэтому достаточно
 * относительных путей ('/api', '/uploads/...'). В APK (Capacitor) файл лежит внутри
 * приложения и грузится с capacitor://localhost, а API, WebSocket и загрузки живут на
 * внешнем сервере — там относительный путь вести некуда, поэтому адрес сервера задаётся
 * вручную (экран настройки) и хранится в localStorage.
 */
const SERVER_KEY = 'mg-server-base';

export function isNativeApp() {
  const c = window.Capacitor;
  return !!(c && (c.isNativePlatform?.() || c.getPlatform?.()));
}

// '' — тот же источник (веб/десктоп); null — адрес ещё не настроен (нужен экран ввода)
export function getServerBase() {
  const saved = (localStorage.getItem(SERVER_KEY) || '').trim().replace(/\/+$/, '');
  if (saved) return saved;
  // В APK страница грузится с capacitor://… либо http://localhost без сервера позади,
  // поэтому относительные пути вести некуда — адрес спрашиваем у пользователя.
  if (isNativeApp() || window.location.protocol === 'capacitor:') return null;
  const p = window.location.protocol;
  if (p === 'http:' || p === 'https:') return '';
  return null;
}

export function setServerBase(url) {
  const v = String(url || '').trim().replace(/\/+$/, '');
  if (!v) localStorage.removeItem(SERVER_KEY);
  else localStorage.setItem(SERVER_KEY, v);
  return v;
}

export function apiUrl(path) {
  const base = getServerBase();
  return (base === null ? '' : base) + '/api' + path;
}

// Сервер отдаёт медиа относительными путями вида /uploads/<uid>/<file>.
// Для нативной оболочки их нужно превращать в абсолютные.
export function mediaUrl(url) {
  if (!url || /^(https?:|data:|blob:|file:|content:)/i.test(url)) return url;
  const base = getServerBase();
  if (base === null) return url;
  return base + (url.startsWith('/') ? url : '/' + url);
}

let authToken = null;
export function setToken(t) {
  authToken = t;
  if (t) localStorage.setItem('mg-token', t);
  else localStorage.removeItem('mg-token');
}
export function getToken() {
  if (!authToken) authToken = localStorage.getItem('mg-token');
  return authToken;
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const res = await fetch(apiUrl(path), { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Загрузка файла-выгрузки (экспорт истории) через ссылку, чтобы браузер сохранил его
async function download(path) {
  const token = getToken();
  const res = await fetch(apiUrl(path), { headers: token ? { Authorization: 'Bearer ' + token } : {} });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') || '';
  const name = /filename="?([^";]+)"?/.exec(cd)?.[1] || 'maxgram-export.json';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return { name, size: blob.size };
}

export const api = {
  // ---------- Авторизация ----------
  sendCode: (phone) => request('/auth/send-code', { method: 'POST', body: JSON.stringify({ phone }) }),
  verifyCode: (phone, code) =>
    request('/auth/verify', { method: 'POST', body: JSON.stringify({ phone, code }) }),
  register: (payload) => request('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  me: () => request('/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),
  updateProfile: (payload) => request('/me', { method: 'PUT', body: JSON.stringify(payload) }),
  uploadAvatar: (file) => {
    const fd = new FormData();
    fd.append('photo', file);
    return request('/me/avatar', { method: 'POST', body: fd });
  },
  providers: () => request('/auth/providers'),
  oauthStart: (provider) => request(`/auth/${provider}/start`),

  // ---------- Данные ----------
  getUsers: () => request('/users'),
  getChats: (userId) => request(`/users/${userId}/chats`),
  getMessages: (chatKey) => request(`/chats/${encodeURIComponent(chatKey)}/messages`),
  sendMessage: (payload) => request('/messages', { method: 'POST', body: JSON.stringify(payload) }),
  editMessage: (id, chatKey, content) =>
    request(`/messages/${id}`, { method: 'PUT', body: JSON.stringify({ chat_key: chatKey, content }) }),
  deleteMessage: (id, chatKey) =>
    request(`/messages/${id}?chat_key=${encodeURIComponent(chatKey)}`, { method: 'DELETE' }),
  pinMessage: (id, chatKey, remove) =>
    request(`/messages/${id}/pin`, { method: 'POST', body: JSON.stringify({ chat_key: chatKey, remove: !!remove }) }),
  forwardMessages: (messageIds, chatKeys) =>
    request('/messages/forward', { method: 'POST', body: JSON.stringify({ message_ids: messageIds, chat_keys: chatKeys }) }),
  markRead: (chatKey) => request(`/chats/${encodeURIComponent(chatKey)}/read`, { method: 'POST', body: '{}' }),

  createGroup: (payload) => request('/groups', { method: 'POST', body: JSON.stringify(payload) }),
  updateGroup: (id, payload) => request(`/groups/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  joinGroup: (id) => request(`/groups/${id}/join`, { method: 'POST', body: '{}' }),

  createChannel: (payload) => request('/channels', { method: 'POST', body: JSON.stringify(payload) }),
  updateChannel: (id, payload) => request(`/channels/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  joinChannel: (id) => request(`/channels/${id}/join`, { method: 'POST', body: '{}' }),
  leaveChannel: (id) => request(`/channels/${id}/leave`, { method: 'POST', body: '{}' }),
  uploadChannelAvatar: (id, file) => {
    const fd = new FormData();
    fd.append('photo', file);
    return request(`/channels/${id}/avatar`, { method: 'POST', body: fd });
  },

  discover: (q) => request('/discover?q=' + encodeURIComponent(q || '')),

  // ---------- Поиск по номеру телефона ----------
  lookupPhone: (phone) => request('/lookup-phone?phone=' + encodeURIComponent(phone || '')),

  // ---------- Поиск по @username ----------
  lookupUsername: (username) => request('/lookup-username?username=' + encodeURIComponent(username || '')),

  // ---------- История сообщества ----------
  chatEvents: (chatKey) => request(`/chats/${encodeURIComponent(chatKey)}/events`),

  // ---------- Приглашения по ссылке ----------
  createInvite: (chatKey) => request('/invites', { method: 'POST', body: JSON.stringify({ chat_key: chatKey }) }),
  listInvites: (chatKey) => request('/invites?chat_key=' + encodeURIComponent(chatKey)),
  inviteInfo: (code) => request('/invites/' + encodeURIComponent(code)),
  joinByInvite: (code) => request('/invites/' + encodeURIComponent(code) + '/join', { method: 'POST', body: '{}' }),
  revokeInvite: (code) => request('/invites/' + encodeURIComponent(code), { method: 'DELETE' }),

  // ---------- Групповые звонки ----------
  startGroupCall: (chatKey, video) =>
    request('/group-calls', { method: 'POST', body: JSON.stringify({ chat_key: chatKey, video: !!video }) }),
  groupCall: (chatKey) => request('/group-calls?chat_key=' + encodeURIComponent(chatKey)),
  leaveGroupCall: (id) => request(`/group-calls/${encodeURIComponent(id)}/leave`, { method: 'POST', body: '{}' }),

  // ---------- Настройки и история чата ----------
  chatSettings: (chatKey, payload) =>
    request(`/chats/${encodeURIComponent(chatKey)}/settings`, { method: 'PUT', body: JSON.stringify(payload) }),
  uploadWallpaper: (chatKey, file) => {
    const fd = new FormData();
    fd.append('photo', file);
    return request(`/chats/${encodeURIComponent(chatKey)}/wallpaper`, { method: 'POST', body: fd });
  },
  exportChat: (chatKey, format) =>
    download(`/chats/${encodeURIComponent(chatKey)}/export?format=${format}`),
  clearHistory: (chatKey) => request(`/chats/${encodeURIComponent(chatKey)}/clear`, { method: 'POST', body: '{}' }),
  deleteHistory: (chatKey) => request(`/chats/${encodeURIComponent(chatKey)}`, { method: 'DELETE' }),

  // ---------- Истории (24 часа) ----------
  getStories: () => request('/stories'),
  addStory: (payload) => request('/stories', { method: 'POST', body: JSON.stringify(payload) }),
  viewStory: (id) => request(`/stories/${id}/view`, { method: 'POST', body: '{}' }),
  deleteStory: (id) => request(`/stories/${id}`, { method: 'DELETE' }),

  uploadFiles: (files) => {
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    return request('/upload', { method: 'POST', body: fd });
  },
};

export function connectSocket(onEvent) {
  const base = getServerBase();
  let host = window.location.host;
  if (base) {
    try {
      host = new URL(base).host;
    } catch {
      /* некорректный адрес — оставляем текущий источник */
    }
  }
  const secure = base ? base.startsWith('https://') : window.location.protocol === 'https:';
  const proto = secure ? 'wss' : 'ws';
  const token = getToken() || '';
  const ws = new WebSocket(`${proto}://${host}/ws?token=${encodeURIComponent(token)}`);
  ws.onmessage = (event) => {
    try {
      onEvent(JSON.parse(event.data));
    } catch {
      /* игнорируем повреждённые пакеты */
    }
  };
  return ws;
}
