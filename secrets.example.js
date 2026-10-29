/*
 * Ключи внешних сервисов.
 *
 *   1. Скопируйте этот файл в secrets.js            copy secrets.example.js secrets.js
 *   2. Впишите полученные ключи
 *   3. Перезапустите сервер: npm start  (или npm run doctor — он подскажет, чего не хватает)
 *
 * secrets.js добавлен в .gitignore — ключи не попадут в Git и на хостинг через репозиторий.
 * На Render/Railway вместо этого файла удобнее задавать те же значения переменными окружения.
 *
 * Значения ниже — НЕ рабочие. Это форма, которую ждут провайдеры.
 */
module.exports = {
  /* ---------- Вход по номеру телефона: реальные SMS ---------- */
  sms: {
    // Что использовать: 'demo' | 'smsgate' | 'http' | 'smsru' | 'smsaero' | 'twilio'
    provider: 'http',

    // SMS Gateway for Android (sms-gateway.app) — телефон с SIM + их облако.
    // На телефон ставится приложение «SMS Gateway for Android», оно регистрируется
    // в вашем аккаунте и само опрашивает облако, поэтому телефон не обязан быть
    // доступен из интернета и может быть в любой сети. Деньги не нужны — расход
    // SMS вашего тарифа. Ключ: дашборд https://app.sms-gateway.app → Settings / API.
    smsgate: {
      // Облако из дашборда (нужен только ключ). Для self-hosted сервера шлюза:
      // https://api.sms-gate.app/3rdparty/v1 — тогда можно логином/паролем вместо ключа.
      base_url: 'https://app.sms-gateway.app/api/v1',
      key: '',            // вид: sboxk_live_…  (показывается один раз при создании)
      username: '',       // альтернатива ключу для self-hosted: логин/пароль → JWT
      password: '',
      device_id: '',      // если к аккаунту привязано несколько телефонов — id нужного
    },

    // Свой шлюз на телефоне с SIM — бесплатно, без договора и ключей провайдера.
    // На Android ставится приложение-шлюз (например, «SMS Gateway - The SMS Forwarder»
    // или «HTTP2Tunnel»), в нём включается HTTP-сервер, а сюда пишется его адрес.
    // Расход — SMS вашего тарифа. Телефон и сервер должны быть в одной сети.
    http: {
      url: '',                 // вид: http://192.168.1.50:8080/send  (IP телефона из приложения)
      method: 'POST',          // POST или GET
      format: 'form',          // form (x-www-form-urlencoded) или json
      phone_field: 'to',       // как у шлюза называется поле номера
      text_field: 'message',   // …и поле текста
      token: '',               // если приложение требует пароль: уйдёт в Authorization: Bearer
      from: '',                // имя отправителя, если шлюз его принимает
      expect: '',              // если шлюз всегда отвечает 200: подстрока успеха, напр. 'OK'
      extra: '',               // прочие поля списком: {"password":"1234","client":"maxgram"}
    },

    // SMS.ru — работает с номерами РФ, есть тестовый баланс.
    // Кабинет: https://sms.ru  →  API-ключ в разделе «Настройки API».
    smsru: {
      api_id: '',      // API-идентификатор (длинные цифры из кабинета)
      api_key: '',     // API-ключ
      // Имя отправителя: 'sms-RU' (бесплатно, но письма-«письмо»), либо зарегистрируйте своё
      from: 'sms-RU',
    },

    // SMS Aero — https://smsaero.ru  →  раздел «Интеграция / API»
    smsaero: {
      login: '',       // логин кабинета
      api_key: '',     // API-ключ
      from: 'MAXgram', // имя отправителя (по умолчанию «TEST» на бесплатном тарифе)
    },

    // Twilio — международный, стабильный, но до номеров РФ часто не доходит.
    twilio: {
      account_sid: '',
      auth_token: '',
      from: '',            // номер вида +1... или Messaging Service SID
      service_sid: '',     // если используете Messaging Service
    },
  },

  /* ---------- Вход через соцсети (OAuth) ---------- */
  // Для каждого провайдера нужно зарегистрировать приложение и разрешить
  // redirect URI: https://<ваш-домен>/auth/<провайдер>/callback
  //   Google  — https://console.cloud.google.com/apis/credentials
  //   Яндекс  — https://id.yandex.ru/developer/applications
  //   VK      — https://id.vk.com/about/business/go
  //   OK      — https://dev.ok.ru/create
  oauth: {
    google: { client_id: '', client_secret: '' },
    yandex: { client_id: '', client_secret: '' },
    vk: { client_id: '', client_secret: '' },
    // У OK пара ключей называется иначе: public_key идёт в client_id, api_secret — в api_secret
    ok: { client_id: '', public_key: '', api_secret: '' },
  },

  // Публичный адрес этого сервера — обязателен для OAuth.
  // Без него редирект уходит на localhost и провайдер отказывает.
  public_url: 'http://localhost:3000',
};
