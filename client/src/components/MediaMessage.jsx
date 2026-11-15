import React, { useRef, useState, useEffect } from 'react'
import { IconPlay, IconPause, IconDownload, IconPin, IconCalendar, IconFile, IconPhone, IconClose } from './Icons.jsx'
import { fmtDur } from '../media'
import { colorFor, initials } from './ui.jsx'
import { mediaUrl } from '../api'

/* ---------- Карта: статичный тайл OSM без API-ключа ---------- */

const TILE = 256

function project(lat, lng, z) {
  const n = 2 ** z
  const x = ((lng + 180) / 360) * n
  const s = Math.sin((lat * Math.PI) / 180)
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n
  return { x, y }
}

export function StaticMap({ lat, lng, zoom = 14, w = 260, h = 150, url }) {
  const z = Math.round(zoom)
  const p = project(lat, lng, z)
  const tx = Math.floor(p.x)
  const ty = Math.floor(p.y)
  const offX = (p.x - tx) * TILE
  const offY = (p.y - ty) * TILE
  const s = `https://tile.openstreetmap.org/${z}/${tx}/${ty}.png`

  return (
    <a
      className="map-thumb"
      href={url || `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
      target="_blank"
      rel="noreferrer"
      style={{ width: w, height: h }}
      title="Открыть в Google Maps"
    >
      <img src={s} alt="" style={{ position: 'absolute', left: w / 2 - offX, top: h / 2 - offY, width: TILE, height: TILE }} />
      <span className="map-pin" style={{ left: w / 2, top: h / 2 }}>
        <IconPin width={26} height={26} />
      </span>
    </a>
  )
}

/* ---------- Аудио / голосовое ---------- */

function Waveform({ seed, active }) {
  const bars = []
  let h = 0
  for (let i = 0; i < 32; i++) h = (h * 1103515245 + 12345) >>> 0
  for (let i = 0; i < 32; i++) {
    h = (h * 1103515245 + 12345) >>> 0
    bars.push(0.25 + ((h >>> 8) % 100) / 130)
  }
  return (
    <div className="wave">
      {bars.map((b, i) => (
        <span key={i} style={{ height: `${Math.min(1, b) * 100}%`, opacity: active ? 1 : 0.55 }} />
      ))}
    </div>
  )
}

export function AudioBubble({ src, dur, kind, out }) {
  const ref = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [t, setT] = useState(0)
  const total = dur || 0

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onTime = () => setT(el.currentTime)
    const onEnd = () => { setPlaying(false); setT(0) }
    el.addEventListener('timeupdate', onTime)
    el.addEventListener('ended', onEnd)
    return () => {
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('ended', onEnd)
    }
  }, [])

  const toggle = () => {
    const el = ref.current
    if (!el) return
    if (playing) { el.pause(); setPlaying(false) }
    else { el.play().then(() => setPlaying(true)).catch(() => {}) }
  }

  const shown = playing && el_dur(t) ? t : total
  return (
    <div className={`audio-bubble ${out ? 'out' : ''}`}>
      <audio ref={ref} src={mediaUrl(src)} preload="metadata" />
      <button className="play-btn" onClick={toggle}>
        {playing ? <IconPause width={18} height={18} /> : <IconPlay width={18} height={18} />}
      </button>
      <div className="wave-wrap" onClick={() => {
        const el = ref.current
        if (el && total) el.currentTime = (el_dur(t) ? t : 0)
      }}>
        <Waveform active={playing} />
      </div>
      <span className="audio-dur">{fmtDur(shown)}</span>
      {kind === 'voice' && <span className="voice-tag">🎤</span>}
    </div>
  )
}

const el_dur = (v) => Number(v) > 0

/* ---------- Фото / видео / кружок ---------- */

export function MediaBubble({ msg, onOpen }) {
  const m = msg.media || {}
  const kind = msg.kind
  const src = mediaUrl(m.url)

  if (kind === 'photo') {
    return (
      <div className="media-bubble">
        <img className="media-photo" src={src} alt={m.name || ''} onClick={() => onOpen?.(src, 'photo')} loading="lazy" />
        {msg.content && <div className="media-caption">{msg.content}</div>}
      </div>
    )
  }

  if (kind === 'video') {
    return (
      <div className="media-bubble">
        <video className="media-video" src={src} controls playsInline preload="metadata" poster={mediaUrl(m.poster)} />
        {msg.content && <div className="media-caption">{msg.content}</div>}
      </div>
    )
  }

  if (kind === 'circle') {
    return (
      <div className="media-bubble circle-bubble">
        <video className="media-circle" src={src} controls playsInline loop preload="metadata" />
        <span className="circle-ring" />
        {msg.content && <div className="media-caption">{msg.content}</div>}
      </div>
    )
  }

  return null
}

/* ---------- Файл ---------- */

export function FileBubble({ msg }) {
  const m = msg.media || {}
  const href = mediaUrl(m.url)
  const size = m.size ? (m.size > 1048576 ? (m.size / 1048576).toFixed(1) + ' МБ' : Math.max(1, Math.round(m.size / 1024)) + ' КБ') : ''
  const isImg = (m.mime || '').startsWith('image/') && !m.url
  return (
    <div className="file-bubble">
      <div className="file-ico">{isImg ? <IconFile width={22} height={22} /> : <IconFile width={22} height={22} />}</div>
      <div className="file-meta">
        <a className="file-name" href={href} target="_blank" rel="noreferrer" download={m.name}>
          {m.name || 'Файл'}
        </a>
        <div className="file-size">{size}</div>
      </div>
      <a className="file-dl" href={href} download={m.name} target="_blank" rel="noreferrer" title="Скачать">
        <IconDownload width={20} height={20} />
      </a>
    </div>
  )
}

/* ---------- Геолокация ---------- */

export function LocationBubble({ msg }) {
  const l = msg.location || {}
  const google = `https://www.google.com/maps/search/?api=1&query=${l.lat},${l.lng}`
  const osm = `https://www.openstreetmap.org/?mlat=${l.lat}&mlon=${l.lng}#map=16/${l.lat}/${l.lng}`
  return (
    <div className="loc-bubble">
      <StaticMap lat={l.lat} lng={l.lng} />
      <div className="loc-info">
        <div className="loc-name">{l.name || 'Мои координаты'}</div>
        <div className="loc-coords">{l.lat.toFixed(5)}, {l.lng.toFixed(5)}</div>
        <div className="loc-links">
          <a href={google} target="_blank" rel="noreferrer">Google Maps</a>
          <a href={osm} target="_blank" rel="noreferrer">OSM</a>
        </div>
      </div>
    </div>
  )
}

/* ---------- Визитка контакта ---------- */

export function ContactBubble({ msg, onOpen }) {
  const c = msg.contact || {}
  return (
    <div className="contact-bubble" onClick={() => c.userId && onOpen?.(c.userId)}>
      <div className="contact-ava" style={{ background: colorFor(c.userId || c.name || 'x') }}>
        {initials(c.name || '?')}
      </div>
      <div>
        <div className="contact-name">{c.name}</div>
        <div className="contact-phone">{c.phone}</div>
      </div>
      {c.phone_raw && <a className="contact-call" href={`tel:${c.phone_raw}`} onClick={(e) => e.stopPropagation()}>Позвонить</a>}
    </div>
  )
}

/* ---------- Мероприятие ---------- */

export function EventBubble({ msg }) {
  const e = msg.event || {}
  const start = e.start ? new Date(e.start) : null
  const gcal = start
    ? 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
      '&text=' + encodeURIComponent(e.title || 'Встреча') +
      '&dates=' + toIcs(start) + (e.end ? '/' + toIcs(new Date(e.end)) : '') +
      (e.place ? '&location=' + encodeURIComponent(e.place) : '') +
      (e.note ? '&text=' + encodeURIComponent(e.note) : '')
    : '#'
  const ycal = start
    ? 'https://yandex.ru/calendar/attach/?to=' + toIcs(start) + '&title=' + encodeURIComponent(e.title || 'Встреча') : '#'

  return (
    <div className="event-bubble">
      <div className="event-head">
        <IconCalendar width={20} height={20} />
        <span className="event-title">{e.title || 'Мероприятие'}</span>
      </div>
      {start && <div className="event-when">{start.toLocaleString('ru-RU', { dateStyle: 'full', timeStyle: 'short' })}</div>}
      {e.place && (
        <div className="event-where">
          <IconPin width={15} height={15} /> {e.place}
        </div>
      )}
      {e.note && <div className="event-note">{e.note}</div>}
      <div className="event-links">
        <a href={gcal} target="_blank" rel="noreferrer">Google Календарь</a>
        <a href={ycal} target="_blank" rel="noreferrer">Яндекс Календарь</a>
        {e.lat != null && <StaticMap lat={e.lat} lng={e.lng} w={240} h={110} />}
      </div>
    </div>
  )
}

const toIcs = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/* ---------- Звонок как сообщение ---------- */

export function CallBubble({ msg, out }) {
  return (
    <div className="call-bubble">
      <IconPhone width={18} height={18} style={{ transform: out ? 'rotate(135deg)' : 'none' }} />
      <span>{msg.content || (out ? 'Исходящий звонок' : 'Входящий звонок')}</span>
    </div>
  )
}

/* ---------- Lightbox ---------- */

export function Lightbox({ item, onClose }) {
  if (!item) return null
  return (
    <div className="lightbox" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose}><IconClose width={22} height={22} /></button>
      {item.type === 'photo'
        ? <img src={item.url} alt="" onClick={(e) => e.stopPropagation()} />
        : <video src={item.url} controls autoPlay playsInline onClick={(e) => e.stopPropagation()} />}
    </div>
  )
}
