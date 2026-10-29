// Конфигурация внешних интеграций.
// Всё работает и без ключей — в демо-режиме (см. режим ниже).

module.exports = {
  // ---------- SMS ----------
  // provider: 'demo' — код показывается на экране (без затрат).
  // provider: 'twilio' — реальная доставка SMS, нужны ниже три значения и баланс на аккаунте.
  sms: {
    provider: process.env.SMS_PROVIDER || 'demo',
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID || '',
      authToken: process.env.TWILIO_AUTH_TOKEN || '',
      from: process.env.TWILIO_FROM || '', // номер вида +1... или сервис Twilio Messaging Service
      serviceSid: process.env.TWILIO_SERVICE_SID || '',
    },
  },

  // ---------- OAuth-провайдеры ----------
  // Для каждого нужно зарегистрировать приложение и вписать client_id / client_secret.
  // Пока значения пустые — кнопка вернёт понятную ошибку вместо падения.
  oauth: {
    google: {
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
    },
    yandex: {
      client_id: process.env.YANDEX_CLIENT_ID || '',
      client_secret: process.env.YANDEX_CLIENT_SECRET || '',
    },
    vk: {
      client_id: process.env.VK_CLIENT_ID || '',
      client_secret: process.env.VK_CLIENT_SECRET || '',
    },
    ok: {
      client_id: process.env.OK_APP_ID || '',
      client_secret: process.env.OK_PUBLIC_KEY || '',
      api_secret: process.env.OK_API_SECRET || '',
    },
  },

  // Публичный адрес этого сервера — обязателен для OAuth redirect_uri.
  publicUrl: process.env.PUBLIC_URL || 'http://localhost:3000',

  // Карты: OpenStreetMap работает без ключей. Свой тайл-сервер можно указать здесь.
  tiles: process.env.TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',

  upload: {
    // Относительный путь — от папки проекта; абсолютный — как задан (для том-диска на хостинге).
    dir: process.env.UPLOAD_DIR || 'uploads',
    maxSizeMb: 64,
  },
};
