/*
 * Ключи внешних сервисов. Файл в .gitignore — в Git, на хостинг и в сборку .exe не попадает.
 *
 *   npm run doctor                  — что из этого реально видит сервер + баланс SMS-шлюза
 *   npm run doctor -- --test +7...  — отправить одно настоящее SMS
 *
 * Переменные окружения имеют приоритет над этим файлом.
 * Значение 'demo' у sms.provider означает «код показывается на экране, никуда не отправляется».
 */
module.exports = {
  /* ---------- Вход по номеру телефона: реальные SMS ---------- */
  sms: {
    // 'demo' | 'smsgate' | 'http' | 'smsru' | 'smsaero' | 'twilio'
    provider: 'smsgate',

    // SMS Gateway for Android (sms-gateway.app): приложение на телефоне с SIM
    // держит канал с облаком шлюза, поэтому телефон доступен из любой сети.
    // Ключ: дашборд https://app.sms-gateway.app → Settings / API (показывается один раз).
    smsgate: {
      base_url: 'https://app.sms-gateway.app/api/v1',
      key: 'sboxk_live_nyde82wLDf5SvcgWt94zTePnvCrkwloypDPYA4UYvTF',            // вид: sboxk_live_…
      username: '',       // альтернатива ключу для self-hosted: логин/пароль → JWT
      password: '',
      device_id: '',      // если телефонов несколько — id нужного
    },

    // Свой шлюз на телефоне с SIM: бесплатно, расход — SMS вашего тарифа.
    // Приложение на Android («SMS Gateway - The SMS Forwarder», «HTTP2Tunnel») поднимает
    // HTTP-сервер, сюда вписывается его адрес. Телефон и сервер — в одной сети.
    http: {
      url: '',                 // http://192.168.1.50:8080/send  — IP из приложения-шлюза
      method: 'POST',          // POST или GET
      format: 'form',          // form или json
      phone_field: 'to',       // имя поля номера у шлюза
      text_field: 'message',   // имя поля текста
      token: '',               // пароль шлюза → Authorization: Bearer …
      from: '',
      expect: '',              // если шлюз всегда 200: подстрока успеха, напр. 'OK'
      extra: '',               // {"password":"1234"}
    },

    // SMS.ru — https://sms.ru → «Настройки API». api_id там отдельные длинные цифры.
    smsru: { api_id: '', api_key: '', from: 'sms-RU' },

    // SMS Aero — https://smsaero.ru → «Интеграция / API»
    smsaero: { email: '', api_key: '', from: 'MAXgram' },

    // Twilio — console.twilio.com
    twilio: { account_sid: '', auth_token: '', from: '', service_sid: '' },
  },

  /* ---------- Вход через соцсети (OAuth) ---------- */
  // Redirect URI для кабинетов провайдеров: https://<домен>/auth/<провайдер>/callback
  oauth: {
    google: { client_id: '', client_secret: '' },
    yandex: { client_id: '', client_secret: '' },
    vk: { client_id: '', client_secret: '' },
    // У OK публичный ключ идёт в client_id, secret — в api_secret
    ok: { client_id: '', api_secret: '' },
  },

  /* ---------- Где взять настоящие ключи ----------
   * Значения, придуманные или сгенерированные стороной (в том числе генераторами
   * случайных строк), провайдеры не принимают: каждый сверяет ключ со своей базой.
   *   SMS.ru    https://sms.ru                              → api_id + api_key
   *   SMS Aero  https://smsaero.ru                          → email + api_key
   *   Twilio    https://console.twilio.com                  → Account SID + Auth Token + номер
   *   Google    https://console.cloud.google.com/apis/credentials
   *   Яндекс    https://id.yandex.ru/developer/applications
   *   VK        https://id.vk.com/about/business/go
   *   OK        https://dev.ok.ru/create                    → public_key + api_secret
   * Redirect URI для OAuth: https://<домен>/auth/<провайдер>/callback */

  // Пусто = адрес берётся из заголовков запроса (работает и на localhost, и на туннеле).
  // Для продакшена: 'https://ваш-домен'
  public_url: '',
};
