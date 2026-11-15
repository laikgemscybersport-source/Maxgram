import React, { useState, useRef, useEffect } from 'react'
import { api } from '../api'
import { fmtDur, recordVoice, recordCircle, canRecord } from '../media'
import { StaticMap } from './MediaMessage.jsx'
import {
  IconPhoto, IconFile, IconPin, IconCamera, IconCircle, IconUserPlus,
  IconCalendar, IconClose, IconMic, IconSend,
} from './Icons.jsx'
import { Avatar, colorFor, initials } from './ui.jsx'

/* ==================== Меню вложений ==================== */

export function AttachMenu({ onPick, onClose }) {
  const items = [
    { k: 'photo', label: 'Фото или видео', icon: <IconPhoto width={22} height={22} />, color: '#e17076' },
    { k: 'file', label: 'Файл', icon: <IconFile width={22} height={22} />, color: '#7b68ee' },
    { k: 'circle', label: 'Видеокружок', icon: <IconCircle width={22} height={22} />, color: '#f0a500' },
    { k: 'location', label: 'Геолокация', icon: <IconPin width={22} height={22} />, color: '#4fb3a9' },
    { k: 'contact', label: 'Контакт', icon: <IconUserPlus width={22} height={22} />, color: '#3390ec' },
    { k: 'event', label: 'Мероприятие', icon: <IconCalendar width={22} height={22} />, color: '#2bb673' },
  ]

  return (
    <>
      <div className="backdrop" onClick={onClose} style={{ zIndex: 15 }} />
      <div className="attach-menu" style={{ zIndex: 16 }}>
        {items.map((it) => (
          <button key={it.k} className="attach-item" onClick={() => onPick(it.k)}>
            <span className="attach-ico" style={{ background: it.color }}>{it.icon}</span>
            {it.label}
          </button>
        ))}
      </div>
    </>
  )
}

/* ==================== Запись голоса ==================== */

export function VoiceRecorder({ onCancel, onDone }) {
  const [sec, setSec] = useState(0)
  const [ready, setReady] = useState(false)
  const [err, setErr] = useState('')
  const rec = useRef(null)
  const tick = useRef(null)

  useEffect(() => {
    if (!canRecord()) { setErr('Браузер не поддерживает запись звука'); return }
    recordVoice({
      onStop: (blob, dur) => onDone(blob, dur),
      onError: setErr,
    }).then((r) => {
      if (!r) return
      rec.current = r
      setReady(true)
      tick.current = setInterval(() => setSec((s) => s + 1), 1000)
    })
    return () => {
      clearInterval(tick.current)
      if (rec.current) rec.current.cancel()
    }
  }, [])

  const stop = () => { clearInterval(tick.current); rec.current?.stop() }
  const cancel = () => { clearInterval(tick.current); rec.current?.cancel(); onCancel() }

  return (
    <div className="recorder">
      <button className="rec-x" onClick={cancel}><IconClose width={20} height={20} /></button>
      <div className="rec-time">{fmtDur(sec)}</div>
      <div className="rec-wave">{Array.from({ length: 18 }).map((_, i) => <span key={i} style={{ animationDelay: i * 0.07 + 's' }} />)}</div>
      <button className="rec-stop" onClick={stop} disabled={!ready}>
        <span className="rec-stop-dot" />
      </button>
      {err && <div className="rec-err">{err}</div>}
    </div>
  )
}

/* ==================== Запись видеокружка ==================== */

export function CircleRecorder({ onCancel, onDone }) {
  const [sec, setSec] = useState(0)
  const [recording, setRecording] = useState(false)
  const [err, setErr] = useState('')
  const [camIdx, setCamIdx] = useState(0)
  const [hasMany, setHasMany] = useState(false)
  const videoRef = useRef(null)
  const previewStream = useRef(null)
  const rec = useRef(null)
  const tick = useRef(null)

  useEffect(() => {
    if (!canRecord()) { setErr('Браузер не поддерживает видеозапись'); return }
    navigator.mediaDevices.enumerateDevices()
      .then((ds) => setHasMany(ds.filter((d) => d.kind === 'videoinput').length > 1))
      .catch(() => {})
    return () => {
      clearInterval(tick.current)
      if (rec.current) rec.current.cancel()
      previewStream.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  // Предпросмотр камеры до начала записи
  useEffect(() => {
    if (recording) return
    let alive = true
    navigator.mediaDevices.getUserMedia({
      video: { width: 480, height: 480, facingMode: camIdx === 0 ? 'user' : 'environment' },
      audio: true,
    }).then((stream) => {
      if (!alive) { stream.getTracks().forEach((t) => t.stop()); return }
      previewStream.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
    }).catch(() => setErr('Нет доступа к камере'))
    return () => {
      alive = false
      previewStream.current?.getTracks().forEach((t) => t.stop())
      previewStream.current = null
    }
  }, [camIdx, recording])

  const start = async () => {
    setErr('')
    previewStream.current?.getTracks().forEach((t) => t.stop())
    previewStream.current = null
    const r = await recordCircle({
      onStop: (blob, dur) => onDone(blob, dur),
      onError: setErr,
    })
    if (!r) return
    rec.current = r
    setRecording(true)
    if (videoRef.current) videoRef.current.srcObject = r.preview
    tick.current = setInterval(() => setSec((s) => s + 1), 1000)
  }

  const stop = () => { clearInterval(tick.current); setRecording(false); rec.current?.stop() }
  const cancel = () => {
    clearInterval(tick.current)
    if (rec.current) rec.current.cancel()
    onCancel()
  }

  return (
    <div className="circle-rec">
      <div className="circle-frame">
        <video ref={videoRef} autoPlay playsInline muted />
        {!recording && <div className="circle-hint">Нажмите, чтобы записать<br />видеокружок</div>}
        {recording && <span className="circle-rec-dot" />}
      </div>
      <div className="circle-time">{fmtDur(sec)}</div>
      <div className="circle-actions">
        <button className="rec-x" onClick={cancel}><IconClose width={22} height={22} /></button>
        {recording ? (
          <button className="rec-stop big" onClick={stop}><span className="rec-stop-dot" /></button>
        ) : (
          <button className="circle-go" onClick={start} />
        )}
        {hasMany ? (
          <button className="rec-x" onClick={() => setCamIdx((i) => (i + 1) % 2)}>⟳</button>
        ) : <span className="circle-slot" />}
      </div>
      {err && <div className="rec-err">{err}</div>}
    </div>
  )
}

/* ==================== Выбор геолокации ==================== */

export function LocationComposer({ onCancel, onSend }) {
  const [pos, setPos] = useState(null)
  const [manual, setManual] = useState({ lat: '', lng: '', name: '' })
  const [err, setErr] = useState('')

  const locate = () => {
    setErr('')
    if (!navigator.geolocation) { setErr('Геолокация недоступна в этом браузере'); return }
    navigator.geolocation.getCurrentPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude, name: 'Моё местоположение' }),
      (e) => setErr(e.code === 1 ? 'Вы запретили доступ к геолокации' : 'Не удалось определить координаты'),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const submit = (loc) => { onSend(loc); onCancel() }

  return (
    <Modal title="Отправить геолокацию" onClose={onCancel}>
      <button className="auth-primary" onClick={locate}>Определить моё местоположение</button>
      {err && <div className="auth-error">{err}</div>}

      {pos && (
        <div className="loc-preview">
          <StaticMap lat={pos.lat} lng={pos.lng} w={300} h={160} />
          <div className="loc-info">
            <div className="loc-name">{pos.name}</div>
            <div className="loc-coords">{pos.lat.toFixed(5)}, {pos.lng.toFixed(5)}</div>
          </div>
          <button className="auth-primary" onClick={() => submit(pos)}>
            <IconSend width={18} height={18} /> Отправить
          </button>
        </div>
      )}

      <div className="divider-or">или введите координаты вручную</div>
      <div className="row2">
        <input className="search-input" placeholder="Широта" value={manual.lat}
          onChange={(e) => setManual({ ...manual, lat: e.target.value })} inputMode="decimal" />
        <input className="search-input" placeholder="Долгота" value={manual.lng}
          onChange={(e) => setManual({ ...manual, lng: e.target.value })} inputMode="decimal" />
      </div>
      <input className="search-input" placeholder="Название места" value={manual.name}
        onChange={(e) => setManual({ ...manual, name: e.target.value })} />
      <button
        className="auth-ghost"
        disabled={!manual.lat || !manual.lng || isNaN(+manual.lat) || isNaN(+manual.lng)}
        onClick={() => submit({ lat: +manual.lat, lng: +manual.lng, name: manual.name || 'Место' })}
      >
        Отправить координаты
      </button>
    </Modal>
  )
}

/* ==================== Выбор контакта ==================== */

export function ContactComposer({ users, meId, onCancel, onSend }) {
  const list = users.filter((u) => u.id !== meId)
  return (
    <Modal title="Поделиться контактом" onClose={onCancel}>
      <div className="picker-list">
        {list.map((u) => (
          <button key={u.id} className="login-user" onClick={() => {
            onSend({ userId: u.id, name: u.name, phone: u.phone, phone_raw: (u.phone || '').replace(/\D/g, '') })
            onCancel()
          }}>
            <Avatar user={u} size="sm" ring={false} />
            <div>
              <div className="name">{u.name}</div>
              <div className="hint">{u.phone}</div>
            </div>
          </button>
        ))}
      </div>
    </Modal>
  )
}

/* ==================== Создание мероприятия ==================== */

export function EventComposer({ onCancel, onSend }) {
  const [ev, setEv] = useState({ title: '', start: '', end: '', place: '', note: '' })
  const set = (k) => (e) => setEv({ ...ev, [k]: e.target.value })

  const submit = () => {
    if (!ev.title.trim() || !ev.start) return
    onSend({
      title: ev.title.trim(),
      start: ev.start,
      end: ev.end || null,
      place: ev.place.trim(),
      note: ev.note.trim(),
    })
    onCancel()
  }

  const min = ev.start || new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)

  return (
    <Modal title="Новое мероприятие" onClose={onCancel}>
      <input className="search-input" placeholder="Название *" value={ev.title} onChange={set('title')} maxLength={80} />
      <div className="row2">
        <div className="field"><label>Начало</label><input className="search-input" type="datetime-local" value={ev.start} min={min} onChange={set('start')} /></div>
        <div className="field"><label>Окончание</label><input className="search-input" type="datetime-local" value={ev.end} min={ev.start || min} onChange={set('end')} /></div>
      </div>
      <input className="search-input" placeholder="Место проведения" value={ev.place} onChange={set('place')} maxLength={120} />
      <textarea className="search-input" placeholder="Описание" value={ev.note} onChange={set('note')} rows={3} style={{ resize: 'vertical' }} maxLength={500} />
      <button className="auth-primary" disabled={!ev.title.trim() || !ev.start} onClick={submit}>
        <IconCalendar width={18} height={18} /> Отправить приглашение
      </button>
    </Modal>
  )
}

/* ==================== Обёртка модального окна ==================== */

function Modal({ title, children, onClose }) {
  return (
    <>
      <div className="backdrop" onClick={onClose} style={{ zIndex: 17 }} />
      <div className="modal-card" style={{ zIndex: 18 }}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose}><IconClose /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </>
  )
}

export { Modal }
