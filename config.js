/*
 * Конфигурация внешних интеграций.
 *
 * Значения берутся (по убыванию приоритета) из переменных окружения, затем из
 * secrets.js, затем из значений по умолчанию. Ключи в этом файле не хранятся —
 * для них предназначен secrets.js (он в .gitignore) или переменные окружения.
 *
 * Всё работает и без ключей: вход по SMS в демо-режиме, OAuth-кнопки сообщают,
 * что провайдер не настроен. Проверить, что видно серверу: npm run doctor
 */

// Ключи в secrets.js — факультативные: на хостинге их обычно задают окружением.
// MAXGRAM_SECRETS задаёт десктоп-обёртка: в собранном .exe папка проекта недоступна
// для записи, поэтому там ключи лежат рядом с данными — %APPDATA%\maxgram\secrets.js
let secrets = {};
for (const where of [process.env.MAXGRAM_SECRETS, './secrets']) {
  if (!where) continue;
  try {
    secrets = require(where);
    break;
  } catch (e) {
    if (e.code !== 'MODULE_NOT_FOUND') throw e;
  }
}

// env имеет приоритет над файлом: так один и тот же код работает и локально, и на Render
const pick = (envName, fileValue, fallback = '') => {
  const fromEnv = process.env[envName];
  if (fromEnv !== undefined && fromEnv !== '') return fromEnv;
  if (fileValue !== undefined && fileValue !== null && fileValue !== '') return String(fileValue);
  return fallback;
};

const s = secrets.sms || {};
const so = secrets.oauth || {};

const SMS_PROVIDERS = ['demo', 'http', 'smsgate', 'smsru', 'smsaero', 'twilio'];
const requestedProvider = pick('SMS_PROVIDER', s.provider, 'demo').toLowerCase();
if (!SMS_PROVIDERS.includes(requestedProvider)) {
  console.warn(`SMS_PROVIDER="${requestedProvider}" неизвестен — использую demo. Доступны: ${SMS_PROVIDERS.join(', ')}`);
}

module.exports = {
  // ---------- SMS ----------
  // demo    — код показывается на экране (для разработки, без затрат)
  // smsgate — SMS Gateway for Android (sms-gateway.app)
  // http    — свой HTTP-шлюз на телефоне с SIM в локальной сети
  // smsru   — SMS.RU,      https://sms.ru      (RF, есть тестовый режим)
  // smsaero — SMS Aero,    https://smsaero.ru  (RF)
  // twilio  — Twilio,      https://twilio.com  (международный)
  sms: {
    provider: SMS_PROVIDERS.includes(requestedProvider) ? requestedProvider : 'demo',

    // SMS Gateway for Android (sms-gateway.app): приложение на телефоне с SIM
    // регистрируется в облаке, сервер шлёт код в их API, телефон отправляет SMS.
    // Ключ — из дашборда https://app.sms-gateway.app → Settings / API.
    // Отличается от 'http' тем, что телефон доступен из любой точки интернета
    // (он сам опрашивает облако), а не только из локальной сети.
    smsgate: {
      // Для облака из дашборда: https://app.sms-gateway.app/api/v1
      // Для self-hosted сервера: https://api.sms-gate.app/3rdparty/v1
      base_url: pick('SMS_GATE_URL', s.smsgate && s.smsgate.base_url, 'https://app.sms-gateway.app/api/v1').replace(/\/+$/, ''),
      // Ключ из дашборда (вид sboxk_live_…) → Authorization: Bearer <ключ>
      key: pick('SMS_GATE_KEY', s.smsgate && s.smsgate.key),
      // Альтернатива ключу для self-hosted: логин/пароль, из них берём JWT
      username: pick('SMS_GATE_USERNAME', s.smsgate && s.smsgate.username),
      password: pick('SMS_GATE_PASSWORD', s.smsgate && s.smsgate.password),
      // Если к телефону привязано несколько устройств — конкретный deviceId
      device_id: pick('SMS_GATE_DEVICE', s.smsgate && s.smsgate.device_id),
    },


    // Собственный шлюз: сервер отправляет POST/GET на HTTP-эндпоинт, который
    // поднимает приложение на телефоне с SIM. Деньги провайдерам не нужны,
    // расход — ваши собственные SMS на тарифе.
    http: {
      url: pick('SMS_HTTP_URL', s.http && s.http.url),
      method: pick('SMS_HTTP_METHOD', s.http && s.http.method, 'POST').toUpperCase(),
      // form — application/x-www-form-urlencoded, json — application/json
      format: pick('SMS_HTTP_FORMAT', s.http && s.http.format, 'form').toLowerCase(),
      phone_field: pick('SMS_HTTP_PHONE_FIELD', s.http && s.http.phone_field, 'to'),
      text_field: pick('SMS_HTTP_TEXT_FIELD', s.http && s.http.text_field, 'message'),
      // Если приложение требует авторизацию — токен пойдёт в Authorization: Bearer
      token: pick('SMS_HTTP_TOKEN', s.http && s.http.token),
      // Имя отправителя, если шлюз его принимает (многие игнорируют)
      from: pick('SMS_HTTP_FROM', s.http && s.http.from),
      // Некоторые шлюзы отвечают 200 и текстом. Если задано — считаем успехом только
      // ответ, содержащий эту подстроку.
      expect: pick('SMS_HTTP_EXPECT', s.http && s.http.expect),
      // Запасные поля, если у приложения-шлюза свои названия (пароль, api_key, …).
      // JSON-строка: {"password":"1234","priority":"high"}
      extra: pick('SMS_HTTP_EXTRA', s.http && s.http.extra),
    },

    smsru: {
      api_id: pick('SMSRU_API_ID', s.smsru && s.smsru.api_id),
      api_key: pick('SMSRU_API_KEY', s.smsru && s.smsru.api_key),
      from: pick('SMSRU_FROM', s.smsru && s.smsru.from, 'sms-RU'),
    },

    smsaero: {
      // SMS Aero авторизует запрос по email + apiSign (api-ключ из кабинета)
      email: pick('SMSAERO_EMAIL', s.smsaero && (s.smsaero.email || s.smsaero.login)),
      api_key: pick('SMSAERO_API_KEY', s.smsaero && s.smsaero.api_key),
      from: pick('SMSAERO_FROM', s.smsaero && s.smsaero.from, 'SMS Aero'),
    },

    twilio: {
      accountSid: pick('TWILIO_ACCOUNT_SID', s.twilio && s.twilio.account_sid),
      authToken: pick('TWILIO_AUTH_TOKEN', s.twilio && s.twilio.auth_token),
      from: pick('TWILIO_FROM', s.twilio && s.twilio.from),
      serviceSid: pick('TWILIO_SERVICE_SID', s.twilio && s.twilio.service_sid),
    },
  },

  // ---------- OAuth-провайдеры ----------
  // Для каждого нужно зарегистрировать приложение и вписать client_id / client_secret.
  // Пока значения пустые — кнопка вернёт понятную ошибку вместо падения.
  oauth: {
    google: {
      client_id: pick('GOOGLE_CLIENT_ID', so.google && so.google.client_id),
      client_secret: pick('GOOGLE_CLIENT_SECRET', so.google && so.google.client_secret),
    },
    yandex: {
      client_id: pick('YANDEX_CLIENT_ID', so.yandex && so.yandex.client_id),
      client_secret: pick('YANDEX_CLIENT_SECRET', so.yandex && so.yandex.client_secret),
    },
    vk: {
      client_id: pick('VK_CLIENT_ID', so.vk && so.vk.client_id),
      client_secret: pick('VK_CLIENT_SECRET', so.vk && so.vk.client_secret),
    },
    ok: {
      // В OK публичный ключ называется public_key и в запросах идёт как application_key
      client_id: pick('OK_APP_ID', so.ok && (so.ok.client_id || so.ok.public_key)),
      api_secret: pick('OK_API_SECRET', so.ok && so.ok.api_secret),
    },
  },

  // Публичный адрес этого сервера — обязателен для OAuth redirect_uri.
  publicUrl: (pick('PUBLIC_URL', secrets.public_url, 'http://localhost:3000')).replace(/\/+$/, ''),
  // Задан ли адрес явно. Если нет — сервер берёт его из заголовков запроса,
  // поэтому один и тот же процесс корректно работает и на localhost, и на туннеле.
  publicUrlExplicit:
    (process.env.PUBLIC_URL !== undefined && process.env.PUBLIC_URL !== '') ||
    !!(secrets.public_url && secrets.public_url !== ''),

  // Ограничение на выдачу кодов: с одного номера и с одного IP за час.
  // Без него публичный сайт позволяет сжечь весь баланс SMS-шлюза за вечер.
  rateLimit: {
    perPhoneHour: Number(pick('SMS_LIMIT_PHONE', secrets.sms_limit_phone, 5)),
    perIpHour: Number(pick('SMS_LIMIT_IP', secrets.sms_limit_ip, 20)),
  },

  // Карты: OpenStreetMap работает без ключей. Свой тайл-сервер можно указать здесь.
  tiles: process.env.TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',

  upload: {
    // Относительный путь — от папки проекта; абсолютный — как задан (для том-диска на хостинге).
    dir: process.env.UPLOAD_DIR || 'uploads',
    maxSizeMb: 64,
  },
};
