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
  // Сколько кодов разрешить за час: с одного номера и с одного IP. Нужны потому, что
  // запрос кода открыт всем, а реальная SMS стоит денег (или минут вашего тарифа).
  // 0 — запретить выдачу кодов совсем. Переменные окружения: SMS_LIMIT_PHONE, SMS_LIMIT_IP.
  sms_limit_phone: 5,
  sms_limit_ip: 20,

  sms: {
    // Что использовать: 'demo' | 'smsgate' | 'textbee' | 'http' | 'smsru' | 'smsaero' | 'twilio'
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

    // TextBee (textbee.dev) — то же приложение на Android с SIM, но облако и API другие.
    // Ключ от sms-gateway.app здесь не работает, и наоборот.
    // Ключ: https://app.textbee.dev/dashboard → API keys (вид txb_…).
    // Отправка идёт на /gateway/devices/<id>/send-sms, поэтому device_id обязателен.
    textbee: {
      base_url: 'https://api.textbee.dev/api/v1',
      api_key: '',        // вид: txb_…
      device_id: '',      // id устройства из панели или из GET /gateway/devices
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
  // Доступен только Google. Яндекс, VK и OK убраны из сервера (server.js / config.js)
  // — чтобы вернуть любого, добавьте его объект в OAUTH на сервере и сюда же.
  //
  // Google-клиент можно создать двух типов:
  //   «Веб-приложение»  — для боевого HTTPS-домена, redirect URI точный:
  //                        https://<ваш-домен>/auth/google/callback
  //   «Desktop app»     — redirect URI http://localhost; Google для таких
  //                        принимает localhost с любым портом/путём, и вход
  //                        работает локально и на туннеле без правок. Такой
  //                        клиент требует PKCE — он уже включён на сервере.
  // Кабинет: https://console.cloud.google.com/apis/credentials
  //   «Создать учётные данные» → «Идентификатор клиента OAuth» → нужный тип
  //   Скопировать Client ID и Client Secret (из JSON-файла: client_id / client_secret)
  // client_id веб-клиента: …apps.googleusercontent.com
  oauth: {
    google: { client_id: '', client_secret: '' },
  },

  // Публичный адрес этого сервера — обязателен для OAuth.
  // Без него редирект уходит на localhost и провайдер отказывает.
  // Пусто = адрес берётся из заголовков запроса (удобно на туннеле).
  public_url: 'http://localhost:3000',
};
