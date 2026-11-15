import React, { useState, useEffect, useRef } from 'react'
import { api } from '../api'
import { Avatar } from './ui.jsx'
import { IconArrowLeft, IconLink, IconPlus, IconPhoneGroup, IconMic, IconVideo } from './Icons.jsx'

/* ==================== ИСТОРИЯ СООБЩЕСТВА ==================== */
export function JournalModal({ chat, onClose }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [invites, setInvites] = useState([])
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    api.chatEvents(chat.key).then((d) => setEvents(d.events || [])).catch(() => {}).finally(() => setLoading(false))
    if (chat.is_group || chat.is_channel) {
      api.listInvites(chat.key).then((d) => setInvites(d.invites || [])).catch(() => {})
    }
  }, [chat.key, chat.is_group, chat.is_channel])

  const handleCreate = async () => {
    setCreating(true)
    try {
      const d = await api.createInvite(chat.key)
      setInvites((prev) => [d.invite, ...prev])
    } catch (e) { /* toast */ } finally { setCreating(false) }
  }

  const handleRevoke = async (code) => {
    try { await api.revokeInvite(code) } catch (e) { /* toast */ }
    setInvites((prev) => prev.filter((i) => i.code !== code))
  }

  const copyLink = (code) => {
    const url = `${window.location.origin}/#/join/${code}`
    navigator.clipboard.writeText(url).catch(() => {})
  }

  const typeLabel = {
    created: 'Создано', joined: 'Вступление', left: 'Выход',
    renamed: 'Переименование', added: 'Приглашение', removed: 'Исключение',
    invite_created: 'Ссылка создана', invite_revoked: 'Ссылка удалена',
    call_started: 'Звонок начат', call_ended: 'Звонок завершён',
  }

  return (
    <>
      <div className="backdrop" onClick={onClose} style={{ zIndex: 21 }} />
      <div className="modal-card journal-modal" style={{ zIndex: 22 }}>
        <div className="modal-head">
          <button className="icon-btn" onClick={onClose}><IconArrowLeft /></button>
          <h2>История сообщества</h2>
        </div>
        <div className="modal-body">
          {(chat.is_group || chat.is_channel) && (
            <button className="new-group-btn" onClick={() => setShowInvite((v) => !v)}>
              <IconLink width={18} height={18} />
              {showInvite ? 'Скрыть ссылки' : 'Ссылки-приглашения'}
            </button>
          )}
          {showInvite && (chat.is_group || chat.is_channel) && (
            <div className="invite-bar">
              <button className="auth-primary" onClick={handleCreate} disabled={creating}>
                <IconPlus width={16} height={16} /> {creating ? 'Создание…' : 'Создать ссылку'}
              </button>
              {invites.map((inv) => (
                <div key={inv.code} className="invite-item">
                  <div className="invite-code">{inv.code}</div>
                  <div className="invite-meta">
                    <span>Пользований: {inv.uses}</span>
                    <span>Создал: {inv.creator?.name || '?'}</span>
                  </div>
                  <div className="invite-actions">
                    <button className="auth-ghost" onClick={() => copyLink(inv.code)}>Копировать</button>
                    <button className="auth-ghost danger" onClick={() => handleRevoke(inv.code)}>Отозвать</button>
                  </div>
                </div>
              ))}
              {invites.length === 0 && <div className="hint-center">Нет активных ссылок</div>}
            </div>
          )}
          {loading ? (
            <div className="hint-center">Загрузка…</div>
          ) : events.length === 0 ? (
            <div className="hint-center">Пока пусто</div>
          ) : (
            <div className="event-list">
              {events.map((ev) => (
                <div key={ev.id} className="event-item">
                  <div className="event-body">
                    <div className="event-label">
                      <span className="event-type">{typeLabel[ev.type] || ev.type}</span>
                      {ev.actor && (
                        <span className="event-actor">
                          <Avatar user={ev.actor} size="sm" ring={false} />
                          {ev.actor.name}
                        </span>
                      )}
                    </div>
                    <div className="event-text">{ev.text}</div>
                    <div className="event-time">{new Date(ev.at).toLocaleString('ru-RU')}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

/* ==================== ПОИСК ПО НОМЕРУ ТЕЛЕФОНА ==================== */
export function PhoneSearchModal({ users, onPick, onClose }) {
  const [phone, setPhone] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSearch = async () => {
    if (!phone.trim()) return
    setLoading(true)
    try {
      const d = await api.lookupPhone(phone)
      setResult(d)
    } catch (e) { /* toast */ } finally { setLoading(false) }
  }

  if (result?.found) {
    return (
      <>
        <div className="backdrop" onClick={onClose} style={{ zIndex: 21 }} />
        <div className="modal-card" style={{ zIndex: 22 }}>
          <div className="modal-head">
            <button className="icon-btn" onClick={onClose}><IconArrowLeft /></button>
            <h2>Поиск по номеру</h2>
          </div>
          <div className="modal-body">
            {result.is_self ? (
              <div className="result-box self">Это вы</div>
            ) : (
              <button className="result-box user" onClick={() => { onPick(result.user); onClose() }}>
                <Avatar user={result.user} size="lg" ring={false} />
                <div className="result-info">
                  <div className="result-name">{result.user.name}</div>
                  <div className="result-phone">{result.phone}</div>
                </div>
              </button>
            )}
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="backdrop" onClick={onClose} style={{ zIndex: 21 }} />
      <div className="modal-card" style={{ zIndex: 22 }}>
        <div className="modal-head">
          <button className="icon-btn" onClick={onClose}><IconArrowLeft /></button>
          <h2>Поиск по номеру</h2>
        </div>
        <div className="modal-body">
          <div className="field">
            <input
              className="search-input"
              placeholder="+7 (999) 123-45-67"
              value={phone}
              onChange={(e) => { setPhone(e.target.value.replace(/[^\d+() -]/g, '')); setResult(null) }}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
          </div>
          <button className="auth-primary" onClick={handleSearch} disabled={!phone.trim() || loading}>
            {loading ? 'Ищу…' : 'Найти'}
          </button>
          {result && !result.found && !result.hidden && (
            <div className="result-box not-found">Пользователь с номером {result.phone} не найден</div>
          )}
          {result?.hidden && (
            <div className="result-box hidden">Пользователь скрыл номер в настройках приватности</div>
          )}
        </div>
      </div>
    </>
  )
}

/* ==================== ГРУППОВОЙ ЗВОНОК: выбор формата ====================
   Модалка только запускает звонок — сам оверлей с видео участников рисует
   GroupCallOverlay ниже, потому что состояние звонка живёт в GroupCallManager. */
export function GroupCallModal({ chat, onClose, onStart }) {
  const [video, setVideo] = useState(false)
  const [busy, setBusy] = useState(false)
  const count = (chat.user?.members || []).length || chat.user?.phone || ''

  const go = async () => {
    setBusy(true)
    try {
      await onStart(video)
      onClose()
    } catch (e) {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="backdrop" onClick={onClose} style={{ zIndex: 21 }} />
      <div className="modal-card" style={{ zIndex: 22 }}>
        <div className="modal-head">
          <button className="icon-btn" onClick={onClose}><IconArrowLeft /></button>
          <h2>Групповой звонок</h2>
        </div>
        <div className="modal-body">
          <div className="hint-line">
            {chat.user?.name}{count ? ` · ${count}` : ''}
          </div>
          <button className={`switch-row ${video ? '' : 'on'}`} onClick={() => setVideo(false)}>
            <IconPhoneGroup width={20} height={20} />
            <div>
              <div className="name">Аудиозвонок</div>
              <div className="hint">Только голос — меньше трафика</div>
            </div>
            {!video && <span className="radio-dot on" />}
          </button>
          <button className={`switch-row ${video ? 'on' : ''}`} onClick={() => setVideo(true)}>
            <IconPhoneGroup width={20} height={20} />
            <div>
              <div className="name">Видеозвонок</div>
              <div className="hint">Камера и микрофон</div>
            </div>
            {video && <span className="radio-dot on" />}
          </button>
          <button className="auth-primary" onClick={go} disabled={busy}>
            {busy ? 'Подключение…' : 'Начать звонок'}
          </button>
        </div>
      </div>
    </>
  )
}

/* --- Плитка одного участника: video получает MediaStream через ref --- */
function GcTile({ id, name, stream, muted, video, self }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== (stream || null)) {
      ref.current.srcObject = stream || null
    }
  }, [stream])

  return (
    <div className={`gc-tile ${self ? 'self' : ''}`}>
      {video && stream ? (
        <video ref={ref} autoPlay playsInline muted={!!muted} />
      ) : (
        <Avatar user={{ id, name }} size="lg" ring={false} />
      )}
      <span className="gc-name">{self ? `${name} (вы)` : name}</span>
    </div>
  )
}

/* ==================== ГРУППОВОЙ ЗВОНОК: оверлей ==================== */
export function GroupCallOverlay({ gc, chat, micOn, camOn, onToggleMic, onToggleCam, onLeave }) {
  const video = !!gc.video
  const title = chat?.user?.name || 'Групповой звонок'
  const total = 1 + (gc.peers?.length || 0)

  return (
    <div className="call-overlay">
      <div className="call-top">
        <div className="call-name">{title}</div>
        <div className="call-state">
          {gc.state === 'connecting' ? 'Соединение…' : `${total} в разговоре`}
        </div>
      </div>

      <div className="gc-grid">
        <GcTile id="me" name="Вы" stream={gc.local} muted video={video && camOn} self />
        {(gc.peers || []).map((p) => (
          <GcTile key={p.id} id={p.id} name={p.name} stream={p.remote} muted={false} video={video} />
        ))}
      </div>

      {video && camOn && gc.local && (
        <video className="call-pip" autoPlay playsInline muted
          ref={(el) => { if (el && el.srcObject !== gc.local) el.srcObject = gc.local }} />
      )}

      <div className="gc-state">
        {video ? 'Видеосвязь mesh: каждый участник передаёт поток всем остальным' : 'Аудиосвязь установлена'}
      </div>

      <div className="call-controls">
        <button className={`call-btn ${micOn ? '' : 'off'}`} onClick={onToggleMic} title="Микрофон">
          <IconMic width={24} height={24} />
        </button>
        <button className={`call-btn ${camOn ? '' : 'off'}`} onClick={onToggleCam} title="Камера">
          <IconVideo width={24} height={24} />
        </button>
        <button className="call-btn reject" onClick={onLeave} title="Покинуть звонок">
          <IconPhoneGroup width={24} height={24} style={{ transform: 'rotate(135deg)' }} />
        </button>
      </div>
    </div>
  )
}
