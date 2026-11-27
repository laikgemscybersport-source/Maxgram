import React, { useEffect, useState } from 'react'
import { api } from '../api'
import { IconGlobe, IconClose, IconCopy, IconCheck, IconVideo, IconLock } from './Icons.jsx'

/*
 * Экран «Доступ по сети».
 *
 * Смысл: мессенджер живёт на одном ПК, а пользоваться им хотят с телефона и
 * других компьютеров. Обычный http-адрес в локальной сети годится для чатов,
 * но браузер не даёт камеру и микрофон вне «безопасного контекста» — поэтому
 * для видеокружка и видеозвонка нужен именно https-адрес.
 *
 * Адреса берём с сервера (/api/netinfo): только он знает свои сетевые
 * интерфейсы. Если HTTPS не поднялся, честно говорим, что камера будет
 * недоступна, вместо тихой поломки при первом звонке.
 */
export default function NetworkInfo({ onClose }) {
  const [info, setInfo] = useState(null)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState('')

  useEffect(() => {
    let alive = true
    api.netinfo()
      .then((data) => { if (alive) setInfo(data) })
      .catch((e) => { if (alive) setErr(e.message || 'Не удалось получить адреса') })
    return () => { alive = false }
  }, [])

  const copy = async (url) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(url)
      setTimeout(() => setCopied(''), 1500)
    } catch {
      setErr('Буфер обмена недоступен — скопируйте адрес вручную')
    }
  }

  const secure = typeof window !== 'undefined' && window.isSecureContext
  const primary = info?.lan_https?.[0] || info?.lan_http?.[0] || ''

  return (
    <>
      <div className="backdrop" onClick={onClose} style={{ zIndex: 12 }} />
      <div className="modal-card net-card">
        <div className="modal-head">
          <h2>Доступ по сети</h2>
          <button className="icon-btn" onClick={onClose} title="Закрыть"><IconClose /></button>
        </div>

        <div className="modal-body">
          <p className="net-lead">
            Откройте этот адрес на телефоне или другом компьютере в той же сети —
            и сможете писать, звонить и записывать видеокружки.
          </p>

          {err && <div className="auth-error">{err}</div>}
          {!info && !err && <div className="net-loading">Собираю адреса…</div>}

          {info && (
            <>
              <div className="hint-line">Основной адрес</div>
              {primary ? (
                <div className="net-main">
                  <span className="net-url">{primary}</span>
                  <button className="net-copy" onClick={() => copy(primary)} title="Скопировать">
                    {copied === primary ? <IconCheck width={18} height={18} /> : <IconCopy width={18} height={18} />}
                  </button>
                </div>
              ) : (
                <div className="net-warn">
                  Сетевые адреса не найдены. Проверьте, что компьютер подключён к Wi-Fi или кабелю.
                </div>
              )}

              {primary.startsWith('https') && (
                <div className="net-note">
                  <IconLock width={16} height={16} />
                  <span>
                    Сертификат самоподписанный: браузер один раз покажет предупреждение.
                    Нажмите «Дополнительно» → «Перейти на сайт» — это безопасно, сертификат создан вашим же сервером.
                  </span>
                </div>
              )}

              {!info.https_ready && (
                <div className="net-warn">
                  HTTPS не запущен, поэтому камера и микрофон на других устройствах работать не будут.
                  Запустите сервер заново без переменной <b>HTTPS=0</b>.
                </div>
              )}

              {info.lan_https?.length > 1 && (
                <>
                  <div className="hint-line">Все адреса HTTPS</div>
                  <div className="net-list">
                    {info.lan_https.map((u) => (
                      <div key={u} className="net-row">
                        <IconVideo width={16} height={16} />
                        <span className="net-url">{u}</span>
                        <button className="net-copy" onClick={() => copy(u)} title="Скопировать">
                          {copied === u ? <IconCheck width={16} height={16} /> : <IconCopy width={16} height={16} />}
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {info.lan_http?.length > 0 && (
                <>
                  <div className="hint-line">Только чаты (без камеры)</div>
                  <div className="net-list">
                    {info.lan_http.map((u) => (
                      <div key={u} className="net-row muted">
                        <IconGlobe width={16} height={16} />
                        <span className="net-url">{u}</span>
                        <button className="net-copy" onClick={() => copy(u)} title="Скопировать">
                          {copied === u ? <IconCheck width={16} height={16} /> : <IconCopy width={16} height={16} />}
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {info.public_url && (
                <>
                  <div className="hint-line">Публичный адрес</div>
                  <div className="net-row">
                    <IconGlobe width={16} height={16} />
                    <span className="net-url">{info.public_url}</span>
                    <button className="net-copy" onClick={() => copy(info.public_url)} title="Скопировать">
                      {copied === info.public_url ? <IconCheck width={16} height={16} /> : <IconCopy width={16} height={16} />}
                    </button>
                  </div>
                </>
              )}

              <div className="net-status">
                {secure
                  ? 'Сейчас страница открыта в безопасном контексте — камера и микрофон доступны.'
                  : 'Сейчас страница открыта по http: камера и микрофон здесь недоступны, используйте https-адрес выше.'}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
