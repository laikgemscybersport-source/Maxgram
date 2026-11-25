import React, { useState, useRef, useEffect, useMemo } from 'react'
import { api, mediaUrl } from '../api'
import {
  IconSend, IconAttach, IconEmoji, IconMic, IconSearch, IconMenu, IconMore,
  IconPhone, IconVideo, IconCheck, IconChecks, IconMoon, IconSun, IconArrowLeft,
  IconLogo, IconClose, IconEdit, IconBookmark, IconUserPlus, IconLogout, IconCamera,
  IconChats, IconContacts, IconReply, IconPinUp, IconCopy, IconForward, IconTrash,
  IconSelect, IconMega, IconEye, IconEyeOff, IconMoon2, IconBellOff, IconWallpaper,
  IconExport, IconBroom, IconPlus, IconLock, IconGlobe, IconStory, IconCheckCircle,
  IconPencil2, IconDownload, IconPlay, IconPause, IconPhoto,
  IconHistory, IconPhoneGroup, IconSettings,
} from './Icons.jsx'
import { AudioBubble, MediaBubble, FileBubble, LocationBubble, ContactBubble, EventBubble, CallBubble } from './MediaMessage.jsx'

/* ==================== УТИЛИТЫ ==================== */

const AVATAR_COLORS = [
  '#ff8a65', '#4fc3f7', '#81c784', '#ba68c8', '#f06292',
  '#ffd54f', '#7986cb', '#4db6ac', '#e57373', '#a1887f',
]

export function colorFor(id) {
  let h = 0
  for (let i = 0; i < (id || 'x').length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

export function initials(name) {
  const clean = (name || '?').replace(/[^\p{L}\p{N}\s]/gu, '').trim()
  const parts = clean.split(/\s+/)
  if (parts.length === 1) return parts[0] ? parts[0].slice(0, 2) : '?'
  return parts[0][0] + parts[1][0]
}

// Личный префикс («★», «👑», «[VIP]») выводится перед именем везде, где оно
// показано: так собеседник не выделяется только в одном месте списка.
export function displayNameOf(u) {
  if (!u) return ''
  return u.prefix ? `${u.prefix} ${u.name}` : u.name || ''
}

// Короткое имя для тесных мест (круг историй): префикс сохраняется, из имени
// берётся первое слово.
export function shortNameOf(u) {
  if (!u) return ''
  const first = (u.name || '').split(' ')[0]
  return u.prefix ? `${u.prefix} ${first}` : first
}

export function timeOf(iso) {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

export function dayLabel(iso) {
  const d = new Date(iso)
  const today = new Date()
  const yest = new Date(today)
  yest.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Сегодня'
  if (d.toDateString() === yest.toDateString()) return 'Вчера'
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}

export function listTime(iso) {
  const d = new Date(iso)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return timeOf(iso)
  if ((today - d) / 86400000 < 7) return d.toLocaleDateString('ru-RU', { weekday: 'short' })
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
}

/* ==================== АВАТАР ==================== */

export function Avatar({ user, size = '', online, ring = true }) {
  // Точка «в сети» зависит только от online. Раньше она была завязана ещё и на
  // ring, а все вызовы в приложениях идут с ring={false} — поэтому зелёной точки
  // не было видно нигде, включая список чатов.
  if (user?.avatar) {
    return (
      <div className={`avatar img ${size}`}>
        <img src={mediaUrl(user.avatar)} alt={user.name || ''} />
        {online && <span className="presence" />}
      </div>
    )
  }
  const isGroup = !!user?.is_group
  const isChannel = !!user?.is_channel
  const isSelf = !!user?.is_self
  const bg = isGroup
    ? 'linear-gradient(135deg,#3390ec,#2bb673)'
    : isChannel
      ? 'linear-gradient(135deg,#7b68ee,#3390ec)'
      : isSelf
        ? 'linear-gradient(135deg,#3390ec,#7b68ee)'
        : colorFor(user?.id)
  const iconSize = size === 'sm' ? 18 : size === 'xl' ? 52 : 26
  return (
    <div className={`avatar ${size}`} style={{ background: bg }}>
      {isGroup ? (
        <IconLogo width={iconSize} height={iconSize} />
      ) : isChannel ? (
        <IconMega width={iconSize} height={iconSize} />
      ) : isSelf ? (
        <IconBookmark width={iconSize} height={iconSize} />
      ) : (
        initials(user?.name)
      )}
      {online && <span className="presence" />}
    </div>
  )
}

export function Ticks({ status }) {
  if (status === 'read') return <IconChecks className="ticks" style={{ color: 'var(--tick-read)' }} />
  if (status === 'delivered') return <IconChecks className="ticks" />
  if (status === 'sent') return <IconCheck className="ticks" />
  if (status === 'failed') return <IconClose className="ticks" style={{ color: '#e5534b' }} />
  return <IconCheck className="ticks" style={{ opacity: 0.55 }} />
}

/* ==================== СОСТАВЛITELЬ ==================== */

const EMOJI_GROUPS = [
  { title: 'Смайлы', items: ['😀','😂','🤣','😊','😍','🥰','😘','😉','🙂','🤩','🥳','😎','🤓','🧐','😕','😟','🙁','😮','😯','😲','😳','🥺','😢','😭','😤','😡','🤬','😈','💀','☠️','🤡','👻','💩'] },
  { title: 'Жесты', items: ['👍','👎','👌','✌️','🤞','🤟','🤘','👏','🙌','👐','🤲','🙏','💪','🦾','👋','🤚','✋','🖖','🫰','🫶','🫡','🫢','🤝','✍️'] },
  { title: 'Сердца', items: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','♥️'] },
  { title: 'Животные', items: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🦆','🦅','🦉','🦄','🐝','🐛','🦋','🐌','🐞','🐙','🦈','🐳','🐋','🐬'] },
  { title: 'Еда', items: ['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🥑','🍕','🍔','🍟','🌭','🍿','🧂','🥓','🥚','🍳','🧇','🥞','🍞','🥐','🧀','🍩','🍪','🎂','🍰','🍫','🍬','☕','🍵','🧃','🥤','🍺','🍷','🥂'] },
  { title: 'Активность', items: ['⚽','🏀','🏈','⚾','🎾','🏐','🏉','🎱','🏓','🏸','🥅','🏒','🏑','🥍','🏏','⛳','🥊','🥋','🎯','🎮','🕹️','🎲','♟️','🏆','🥇','🥈','🥉','🎖️','🏅','🚴','🏋️','🤸','🏊','🧘'] },
  { title: 'Погода', items: ['☀️','🌤️','⛅','🌥️','☁️','🌧️','⛈️','🌩️','❄️','☃️','⛄','🌪️','🌈','🌊','💧','🔥','⭐','🌟','✨','⚡','☄️','🌙','🌍','🪐','🌠','🌞','🌻','🌹','🌷','🌱','🍀','🍁'] },
  { title: 'Транспорт', items: ['🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🚚','🚛','🚜','🛵','🏍️','🚲','✈️','🚀','🛸','⛵','🚢','⚓','🚁','🛂'] },
  { title: 'Предметы', items: ['📱','💻','⌨️','🖥️','🖨️','📷','📸','🎥','📞','☎️','📟','📺','📻','🎙️','⏰','⌚','📔','📕','📚','📁','📎','✂️','🔒','🔑','💡','🔦','🧲','🔧','🔨','💣','🔫','💰','💎'] },
  { title: 'Символы', items: ['❤','✅','❌','⭕','❗','❓','💯','🔔','🔕','🎵','🎶','➕','➖','✖️','🆗','🆕','🔝','🎉','🎊','🏳️','🚩','♻️','🔰','⚠️','🚫','💤','🆔','☮️','✝️','🕉️'] },
]

export function Composer({ onSend, onTyping, onAttach, onVoice, disabled, reply, edit, onCancelReply, onCancelEdit }) {
  const [text, setText] = useState('')
  const [emoji, setEmoji] = useState(false)
  const [tab, setTab] = useState(0)
  const ta = useRef(null)
  const typingAt = useRef(0)

  const ctx = edit || reply
  const ctxLabel = edit ? 'Редактирование' : `Ответ ${reply?.sender_name || ''}`

  const grow = () => {
    const el = ta.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 150) + 'px'
  }

  const submit = () => {
    const t = text.trim()
    if (!t) return
    onSend(t)
    setText('')
    setEmoji(false)
    if (ta.current) ta.current.style.height = 'auto'
  }

  const handleChange = (e) => {
    setText(e.target.value)
    grow()
    const now = Date.now()
    if (onTyping && now - typingAt.current > 1500) {
      typingAt.current = now
      onTyping()
    }
  }

  useEffect(() => {
    if (edit && ta.current) {
      setText(edit.content || '')
      ta.current.focus()
      setTimeout(grow, 0)
    }
    if (!edit && ta.current) {
      setText('')
      ta.current.style.height = 'auto'
      ta.current.focus()
    }
  }, [edit?.id, reply?.id])

  return (
    <div className="composer">
      {emoji && (
        <div className="emoji-pop wide">
          <div className="emoji-tabs">
            {EMOJI_GROUPS.map((g, i) => (
              <button key={g.title} className={i === tab ? 'on' : ''} onClick={() => setTab(i)} title={g.title}>
                {g.items[0]}
              </button>
            ))}
          </div>
          <div className="emoji-grid">
            {EMOJI_GROUPS[tab].items.map((e) => (
              <button key={e} onClick={() => { setText((t) => t + e); ta.current?.focus() }}>{e}</button>
            ))}
          </div>
        </div>
      )}

      {ctx && (
        <div className="composer-ctx">
          <div className="composer-ctx-bar" />
          <div className="composer-ctx-body">
            <div className="composer-ctx-label">{edit ? 'Редактирование' : ctxLabel}</div>
            <div className="composer-ctx-text">{(edit?.content || ctx.content || '').slice(0, 120)}</div>
          </div>
          <button className="icon-btn" onClick={edit ? onCancelEdit : onCancelReply} title="Отмена">
            <IconClose width={18} height={18} />
          </button>
        </div>
      )}

      <div className="composer-row">
        <div className="composer-box">
          <button className="icon-btn" onClick={() => setEmoji((v) => !v)} title="Эмодзи">
            <IconEmoji width={22} height={22} />
          </button>
          <textarea
            ref={ta}
            rows={1}
            placeholder={edit ? 'Новый текст сообщения…' : 'Написать сообщение…'}
            value={text}
            disabled={disabled}
            onChange={handleChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
          />
          <button className="icon-btn" onClick={onAttach} title="Прикрепить">
            <IconAttach width={22} height={22} />
          </button>
        </div>
        {text.trim() ? (
          <button className="send-btn" onClick={submit} title={edit ? 'Сохранить' : 'Отправить'}>
            {edit ? <IconPencil2 width={22} height={22} /> : <IconSend width={22} height={22} />}
          </button>
        ) : (
          <button className="send-btn" onClick={onVoice} title="Записать голосовое">
            <IconMic width={22} height={22} />
          </button>
        )}
      </div>
    </div>
  )
}

/* ==================== КОНТЕКСТНОЕ МЕНЮ СООБЩЕНИЯ ==================== */

export function MessageMenu({ menu, onClose, onAction, noCopy }) {
  const ref = useRef(null)

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  if (!menu) return null
  const { msg, x, y, canPin, isChannel, selected } = menu
  const mine = msg.mine

  const items = []
  if (isChannel) {
    items.push({ k: 'select', label: 'Выделить', icon: <IconSelect width={18} height={18} /> })
  } else {
    items.push({ k: 'reply', label: 'Ответить', icon: <IconReply width={18} height={18} /> })
  }
  if (canPin) items.push({ k: msg.pinned ? 'unpin' : 'pin', label: msg.pinned ? 'Открепить' : 'Закрепить', icon: <IconPinUp width={18} height={18} /> })
  if (!noCopy) {
    if (msg.content) items.push({ k: 'copy', label: 'Копировать текст', icon: <IconCopy width={18} height={18} /> })
    items.push({ k: 'forward', label: 'Переслать', icon: <IconForward width={18} height={18} /> })
  }
  if (!isChannel) items.push({ k: 'select', label: selected ? 'Снять выделение' : 'Выделить', icon: <IconSelect width={18} height={18} /> })
  if (mine && msg.kind === 'text') items.push({ k: 'edit', label: 'Редактировать', icon: <IconPencil2 width={18} height={18} /> })
  if (mine || canPin) items.push({ k: 'delete', label: 'Удалить', icon: <IconTrash width={18} height={18} />, danger: true })

  const style = {
    left: Math.max(8, Math.min(x, window.innerWidth - 220)),
    top: Math.max(8, Math.min(y, window.innerHeight - items.length * 40 - 20)),
  }

  return (
    <div className="ctx-menu" style={style} ref={ref}>
      {items.map((it) => (
        <button
          key={it.k}
          className={it.danger ? 'ctx-item danger' : 'ctx-item'}
          onClick={() => { onAction(it.k, msg); onClose() }}
        >
          {it.icon} {it.label}
        </button>
      ))}
    </div>
  )
}

/* ==================== СПИСОК СООБЩЕНИЙ ==================== */

function BubbleContent({ msg, out, onOpenMedia, onOpenContact }) {
  switch (msg.kind) {
    case 'photo':
    case 'video':
    case 'circle':
      return <MediaBubble msg={msg} onOpen={onOpenMedia} />
    case 'voice':
    case 'audio':
      return <AudioBubble src={mediaUrl(msg.media?.url)} dur={msg.media?.dur} kind={msg.kind} out={out} />
    case 'file':
      return <FileBubble msg={msg} />
    case 'location':
      return <LocationBubble msg={msg} />
    case 'contact':
      return <ContactBubble msg={msg} onOpen={onOpenContact} />
    case 'event':
      return <EventBubble msg={msg} />
    case 'call':
      return <CallBubble msg={msg} out={out} />
    default:
      return <span className="msg-text">{msg.content}</span>
  }
}

const isBubble = (m) => !m.kind || m.kind === 'text' || m.kind === 'voice' || m.kind === 'audio' || m.kind === 'file' || m.kind === 'call'

export function MessageList({
  messages, meId, usersById, chat, pin, onOpenMedia, onOpenContact,
  onMenu, selected, onToggleSelect, noCopy, onUnpin,
}) {
  const wrap = useRef(null)
  const isChannel = !!chat?.is_channel
  const canPin = !!chat?.is_admin
  const ids = useMemo(() => new Set((selected || []).map((m) => m.id)), [selected])

  useEffect(() => {
    const el = wrap.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length])

  const blocks = []
  let lastDay = null
  let lastSender = null

  messages.forEach((m, i) => {
    const day = dayLabel(m.created_at)
    if (day !== lastDay) {
      blocks.push({ kind: 'day', key: 'd' + m.id, label: day })
      lastDay = day
      lastSender = null
    }
    const next = messages[i + 1]
    const grouped = next && next.sender_id === m.sender_id && dayLabel(next.created_at) === day && isBubble(next) && isBubble(m)
    const showName = (chat?.is_group || isChannel) && m.sender_id !== meId && lastSender !== m.sender_id
    lastSender = m.sender_id
    blocks.push({ kind: 'msg', key: m.id, msg: m, grouped, showName })
  })

  return (
    <div className="messages" ref={wrap}>
      {pin && (
        <div className="pin-bar" onClick={() => onMenu?.({ msg: pin, x: 60, y: 90, canPin, isChannel, selected: [] })}>
          <span className="pin-ico"><IconPinUp width={16} height={16} /></span>
          <div className="pin-body">
            <div className="pin-label">Закреплено</div>
            <div className="pin-text">{previewOf(pin)}</div>
          </div>
          {canPin && (
            <button className="icon-btn" title="Открепить" onClick={(e) => { e.stopPropagation(); onUnpin() }}>
              <IconClose width={16} height={16} />
            </button>
          )}
        </div>
      )}

      {blocks.map((b) => {
        if (b.kind === 'day') return <div key={b.key} className="day-divider">{b.label}</div>
        const m = b.msg
        const out = m.sender_id === meId
        const sender = usersById[m.sender_id]
        const media = m.kind && m.kind !== 'text'
        const sel = ids.has(m.id)

        return (
          <div
            key={b.key}
            className={`msg ${out ? 'out' : 'in'} ${b.grouped ? 'grouped' : ''} ${media ? 'media' : ''} ${sel ? 'selected' : ''}`}
            onContextMenu={(e) => {
              e.preventDefault()
              onMenu?.({ msg: m, x: e.clientX, y: e.clientY, canPin, isChannel, selected: [...(selected || [])] })
            }}
          >
            {sel && (
              <span className={`msg-check ${out ? 'left' : ''}`} onClick={() => onToggleSelect?.(m)}>
                <IconCheckCircle width={20} height={20} />
              </span>
            )}
            {b.showName && (
              <div className="msg-sender-name" style={{ color: colorFor(m.sender_id) }}>
                {sender ? displayNameOf(sender) : displayNameOf(chat?.user)}
              </div>
            )}
            {m.forwarded_from && (
              <div className="msg-fwd">
                <IconForward width={13} height={13} />
                Переслано от {m.forwarded_from.name}
                {m.forwarded_from.username ? ` (@${m.forwarded_from.username})` : ''}
              </div>
            )}
            {m.reply_ref && (
              <div className="msg-reply">
                <span className="msg-reply-bar" />
                <div>
                  <div className="msg-reply-name">{m.reply_ref.sender_name ?? ''}</div>
                  <div className="msg-reply-text">{m.reply_ref.content}</div>
                </div>
              </div>
            )}
            <BubbleContent msg={m} out={out} onOpenMedia={onOpenMedia} onOpenContact={onOpenContact} />
            <span className="msg-meta">
              {m.edited_at && <span className="msg-edited">ред.</span>}
              {isChannel && m.views != null && (
                <span className="msg-views"><IconEye width={13} height={13} /> {m.views}</span>
              )}
              {timeOf(m.created_at)}
              {out && !isChannel && <Ticks status={m.status} />}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ==================== ПАНЕЛЬ ВЫДЕЛЕНИЯ ==================== */

export function SelectionBar({ selected, onForward, onDelete, onClear, canDelete }) {
  if (!selected?.length) return null
  return (
    <div className="sel-bar">
      <div className="sel-count">{selected.length} выбрано</div>
      <button className="sel-btn" onClick={onForward}><IconForward width={18} height={18} /> Переслать</button>
      {canDelete && <button className="sel-btn danger" onClick={onDelete}><IconTrash width={18} height={18} /> Удалить</button>}
      <button className="icon-btn" onClick={onClear}><IconClose width={18} height={18} /></button>
    </div>
  )
}

/* ==================== ШАПКА ЧАТА ==================== */

export function ChatHeader({ peer, statusText, typing, onBack, onInfo, onCall, onVideo, onMenu, subscribed, onSubscribe }) {
  return (
    <div className="chat-header">
      <button className="icon-btn back-btn" onClick={onBack} title="Назад">
        <IconArrowLeft />
      </button>
      <div className="chat-header-info" onClick={onInfo}>
        <Avatar user={peer} size="sm" ring={false} />
        <div style={{ minWidth: 0 }}>
          <div className="chat-header-name">
            {displayNameOf(peer)}
            {peer.is_channel && <IconMega width={15} height={15} className="name-ico" />}
            {peer.is_public && <IconGlobe width={14} height={14} className="name-ico" />}
          </div>
          <div className={`chat-header-status ${typing ? 'typing' : ''}`}>{statusText}</div>
        </div>
      </div>
      <div className="chat-actions">
        {peer.is_channel && !subscribed && (
          <button className="chat-sub" onClick={onSubscribe}><IconPlus width={16} height={16} /> Подписаться</button>
        )}
        {!peer.is_group && !peer.is_channel && !peer.is_self && (
          <>
            <button className="icon-btn" onClick={onCall} title="Аудиозвонок"><IconPhone width={22} height={22} /></button>
            <button className="icon-btn" onClick={onVideo} title="Видеозвонок"><IconVideo width={22} height={22} /></button>
          </>
        )}
        <button className="icon-btn" onClick={onMenu} title="Ещё">
          <IconMore width={22} height={22} />
        </button>
      </div>
    </div>
  )
}

/* ==================== ИСТОРИИ (24 часа) ==================== */

export function StoriesBar({ groups, meId, onOpen, onAdd }) {
  if (!groups?.length && !meId) return null
  return (
    <div className="stories">
      {meId && (
        <button className="story mine" onClick={onAdd}>
          <div className="story-ring add">
            <Avatar user={{ id: 'me-story' }} size="sm" ring={false} />
            <span className="story-plus"><IconPlus width={13} height={13} /></span>
          </div>
          <span className="story-name">Ваша</span>
        </button>
      )}
      {groups.map((g) => {
        const seen = g.items.every((s) => s.seen)
        return (
          <button key={g.user.id} className="story" onClick={() => onOpen(g)}>
            <div className={`story-ring ${seen ? 'seen' : ''}`}>
              <Avatar user={g.user} size="sm" ring={false} />
            </div>
            <span className="story-name">{g.user.id === meId ? 'Вы' : shortNameOf(g.user)}</span>
          </button>
        )
      })}
    </div>
  )
}

export function StoryViewer({ group, index, onClose, onNav, onDelete, canDelete }) {
  const [progress, setProgress] = useState(0)
  const [paused, setPaused] = useState(false)
  const story = group?.items?.[index]
  const DUR = 5200

  useEffect(() => {
    if (!story || paused) return
    setProgress(0)
    const t0 = Date.now()
    const id = setInterval(() => {
      const p = Math.min(1, (Date.now() - t0) / DUR)
      setProgress(p)
      if (p >= 1) {
        clearInterval(id)
        if (index < group.items.length - 1) onNav(index + 1)
        else onClose()
      }
    }, 60)
    return () => clearInterval(id)
  }, [story?.id, paused])

  if (!story) return null
  const isMedia = story.kind === 'photo' || story.kind === 'video'

  return (
    <div className="story-view" onMouseDown={() => setPaused(true)} onMouseUp={() => setPaused(false)} onMouseLeave={() => setPaused(false)}>
      <div className="story-progress">
        {group.items.map((s, i) => (
          <span key={s.id} className="sp">
            <b style={{ width: i < index ? '100%' : i === index ? progress * 100 + '%' : '0%' }} />
          </span>
        ))}
      </div>

      <div className="story-top">
        <Avatar user={group.user} size="sm" ring={false} />
        <div className="story-who">{group.user.name}</div>
        <div className="story-time">{listTime(story.created_at)}</div>
        {canDelete && <button className="icon-btn" onClick={() => { onDelete(story.id); onClose() }}><IconTrash width={18} height={18} /></button>}
        <button className="icon-btn" onClick={onClose}><IconClose width={20} height={20} /></button>
      </div>

      <button className="story-hit left" onClick={() => index > 0 && onNav(index - 1)} />
      <button className="story-hit right" onClick={() => (index < group.items.length - 1 ? onNav(index + 1) : onClose())} />

      <div className="story-body">
        {isMedia && story.kind === 'photo' && <img src={mediaUrl(story.media.url)} alt="" />}
        {isMedia && story.kind === 'video' && <video src={mediaUrl(story.media.url)} autoPlay playsInline loop />}
        {!isMedia && (
          <div className="story-text" style={{ background: `linear-gradient(135deg, ${colorFor(story.author_id)}, #17212b)` }}>
            {story.caption}
          </div>
        )}
        {isMedia && story.caption && <div className="story-caption">{story.caption}</div>}
      </div>
    </div>
  )
}

export function StoryComposer({ onCancel, onPublish }) {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [kind, setKind] = useState(null)
  const [caption, setCaption] = useState('')
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState('')
  const inp = useRef(null)

  const pick = async (f) => {
    setErr('')
    if (!f) return
    setFile(f)
    setKind(f.type.startsWith('video/') ? 'video' : 'photo')
    setPreview(URL.createObjectURL(f))
    setUploading(true)
    try {
      const { files } = await api.uploadFiles([f])
      setPreview(files[0].url)
      setFile({ ...files[0], _kind: kind })
    } catch (e) {
      setErr(e.message || 'Файл не загружен')
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <div className="backdrop" onClick={onCancel} style={{ zIndex: 25 }} />
      <div className="modal-card" style={{ zIndex: 26 }}>
        <div className="modal-head">
          <h2>Новая история</h2>
          <button className="icon-btn" onClick={onCancel}><IconClose /></button>
        </div>
        <div className="modal-body">
          <p className="hint-line">История видна 24 часа всем контактам</p>

          {!file ? (
            <>
              <button className="auth-primary" onClick={() => inp.current?.click()} disabled={uploading}>
                <IconPhoto width={18} height={18} /> Фото или видео
              </button>
              <div className="divider-or">или текстовая история</div>
              <textarea
                className="search-input story-textarea"
                placeholder="О чём рассказать?"
                rows={4}
                maxLength={200}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                style={{ paddingLeft: 14 }}
              />
              <button className="auth-ghost" disabled={!caption.trim()} onClick={() => onPublish({ kind: 'text', caption: caption.trim(), media: null })}>
                <IconStory width={18} height={18} /> Опубликовать текст
              </button>
            </>
          ) : (
            <div className="story-preview">
              {kind === 'video' ? <video src={preview} controls playsInline /> : <img src={preview} alt="" />}
            </div>
          )}

          <input ref={inp} type="file" accept="image/*,video/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
          {err && <div className="auth-error">{err}</div>}
          {file && (
            <>
              <input className="search-input" placeholder="Подпись" maxLength={200} value={caption} onChange={(e) => setCaption(e.target.value)} style={{ paddingLeft: 14 }} />
              <button className="auth-primary" disabled={uploading} onClick={() => onPublish({ kind: file._kind || kind, caption, media: { url: file.url, name: file.name, mime: file.mime, size: file.size } })}>
                <IconStory width={18} height={18} /> Опубликовать
              </button>
              <button className="auth-ghost" onClick={() => { setFile(null); setCaption('') }}>Другой файл</button>
            </>
          )}
        </div>
      </div>
    </>
  )
}

/* ==================== КТО В СЕТИ ==================== */

/*
 * Лента «В сети» над списком чатов. Список приходит из /api/users и обновляется
 * тем же ws-событием 'users', которое сервер рассылает при входе и выходе
 * собеседника, поэтому точка на аватаре и эта лента всегда свежие.
 * В «Невидимке» (privacy: invisible) пользователь в online не попадает.
 */
export function OnlineStrip({ users, onSelect }) {
  if (!users?.length) return null
  return (
    <div className="online-strip">
      <div className="online-head">
        <span className="online-dot" />
        <span>В сети — {users.length}</span>
      </div>
      <div className="online-list">
        {users.map((u) => (
          <button key={u.id} className="online-item" onClick={() => onSelect(u.id)} title={displayNameOf(u)}>
            <div className="online-ring">
              <Avatar user={u} size="sm" ring={false} online />
            </div>
            <span className="online-name">{shortNameOf(u)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ==================== САЙДБАР ==================== */

const TABS = [
  { k: 'all', label: 'Все', icon: <IconChats width={17} height={17} /> },
  { k: 'dm', label: 'Личные', icon: <IconContacts width={17} height={17} /> },
  { k: 'groups', label: 'Группы', icon: <IconLogo width={16} height={16} /> },
  { k: 'channels', label: 'Каналы', icon: <IconMega width={17} height={17} /> },
]

// Одна классификация чата и для списка слева, и для пустой панели справа,
// иначе вкладки и содержимое разъедутся.
export function chatBucket(c) {
  if (c.is_channel) return 'channels'
  if (c.is_group) return 'groups'
  return 'dm'
}

export function Sidebar({ chats, activeKey, onSelect, onMenu, onNewChat, theme, onTheme, stories, onOpenStory, onAddStory, meId, tab: tabProp, onTabChange, onlineUsers, onStartChat }) {
  const [q, setQ] = useState('')
  const [tabInner, setTabInner] = useState('all')
  // Вкладка нужна и App (правая пустая панель), поэтому состояние поднимаем наверх,
  // а локальное оставляем как запас для вызовов без props.
  const tab = tabProp ?? tabInner
  const setTab = (t) => (onTabChange ? onTabChange(t) : setTabInner(t))

  const filtered = chats.filter((c) => {
    if (tab !== 'all' && chatBucket(c) !== tab) return false
    return displayNameOf(c.user).toLowerCase().includes(q.toLowerCase())
  })

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <button className="icon-btn" onClick={onMenu} title="Меню"><IconMenu /></button>
        <div className="search-wrap">
          <IconSearch />
          <input className="search-input" placeholder="Поиск" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="icon-btn" onClick={onTheme} title="Сменить тему">
          {theme === 'dark' ? <IconSun width={22} height={22} /> : <IconMoon width={22} height={22} />}
        </button>
      </div>

      {stories?.length ? <StoriesBar groups={stories} meId={meId} onOpen={onOpenStory} onAdd={onAddStory} /> : null}

      {onlineUsers?.length ? <OnlineStrip users={onlineUsers} onSelect={onStartChat} /> : null}

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.k} className={`tab ${tab === t.k ? 'on' : ''}`} onClick={() => setTab(t.k)}>
            {t.icon} {t.label}
            {t.k !== 'all' && (
              <span className="tab-count">{chats.filter((c) => chatBucket(c) === t.k).length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="chat-list">
        {filtered.map((c) => {
          const active = c.key === activeKey
          const last = c.last_message
          const preview = last ? (c.preview_prefix || '') + previewOf(last) : c.is_self ? 'Ваши сохранённые сообщения' : c.is_channel ? (c.subscribed === false ? 'Нажмите, чтобы подписаться' : 'Нет публикаций') : 'Нет сообщений'
          return (
            <div
              key={c.key}
              role="button"
              tabIndex={0}
              aria-pressed={active}
              className={`chat-item ${active ? 'active' : ''}`}
              onClick={() => onSelect(c.key)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(c.key) }
              }}
            >
              <Avatar user={c.user} online={!c.user.is_group && !c.user.is_self && !c.user.is_channel && c.user.online} ring={false} />
              <div className="chat-body">
                <div className="chat-top">
                  <div className="chat-name">
                    {c.is_channel && <IconMega width={14} height={14} className="name-ico" />}
                    {displayNameOf(c.user)}
                  </div>
                  {last && <div className="chat-time">{listTime(last.created_at)}</div>}
                </div>
                <div className="chat-bottom">
                  <div className="chat-preview">
                    {c.settings?.muted && <IconBellOff width={14} height={14} className="name-ico" />}
                    {preview}
                  </div>
                  {c.unread > 0 && <div className="unread-badge">{c.unread}</div>}
                </div>
              </div>
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>Ничего не найдено</div>
        )}
      </div>
      <button onClick={onNewChat} title="Новый чат, группа или канал" className="fab">
        <IconEdit width={24} height={24} />
      </button>
    </div>
  )
}

function previewOf(m) {
  const map = {
    photo: '📷 Фото', video: '🎬 Видео', file: '📎 Файл', voice: '🎤 Голосовое',
    audio: '🎵 Аудио', circle: '⭕ Видеокружок', location: '📍 Геолокация',
    contact: '👤 Контакт', event: '📅 Мероприятие', call: '📞 Звонок',
  }
  if (!m.kind || m.kind === 'text') return m.content
  if (m.kind === 'file') return '📎 ' + (m.media?.name || 'Файл')
  if (m.kind === 'event') return '📅 ' + (m.event?.title || 'Мероприятие')
  if (m.kind === 'contact') return '👤 ' + (m.contact?.name || 'Контакт')
  return map[m.kind] || m.content
}

export { previewOf }

/* ==================== МЕНЮ ==================== */

export function Drawer({ me, chats, onClose, onLogout, onNewGroup, onNewChannel, onProfile, theme, onTheme }) {
  const unread = chats.reduce((s, c) => s + (c.unread || 0), 0)
  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-head" onClick={() => { onClose(); onProfile() }}>
          <Avatar user={me} ring={false} />
          <div className="name">{displayNameOf(me)}</div>
          <div className="phone">{me.phone || me.username || 'профиль без телефона'}</div>
        </div>
        <div style={{ padding: '8px 0' }}>
          <button className="drawer-item" onClick={onClose}>
            <IconChats width={22} height={22} /> Чаты {unread > 0 && <span className="unread-badge">{unread}</span>}
          </button>
          <button className="drawer-item" onClick={onNewGroup}>
            <IconUserPlus width={22} height={22} /> Новая группа
          </button>
          <button className="drawer-item" onClick={onNewChannel}>
            <IconMega width={22} height={22} /> Новый канал
          </button>
          <button className="drawer-item" onClick={onProfile}>
            <IconContacts width={22} height={22} /> Мой профиль
          </button>
          <button className="drawer-item" onClick={onTheme}>
            {theme === 'dark' ? <IconSun width={22} height={22} /> : <IconMoon width={22} height={22} />}
            {theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
          </button>
          <button className="drawer-item" onClick={onLogout} style={{ color: 'var(--accent)' }}>
            <IconLogout /> Сменить аккаунт
          </button>
        </div>
      </div>
    </>
  )
}

/* ==================== СТАТУС ПРОСМОТРА ==================== */

const PRESENCE_OPTIONS = [
  { k: 'visible', label: 'Показывать «в сети»', hint: 'Все видят, когда вы в сети и когда вышли', icon: <IconEye width={20} height={20} /> },
  { k: 'invisible', label: 'Невидимка', hint: 'Никто не увидит ваш статус и время последнего входа', icon: <IconEyeOff width={20} height={20} /> },
]

export function ProfilePanel({ peer, statusText, isMe, onClose, onSave, onAvatar, onCall, onVideo, onMessage, onFavorites, onManage, onLeave }) {
  const [edit, setEdit] = useState(false)
  const [form, setForm] = useState({ name: peer?.name || '', prefix: peer?.prefix || '', username: peer?.username || '', bio: peer?.bio || '' })
  const [privacy, setPrivacy] = useState(peer?.privacy || 'visible')
  const [dnd, setDnd] = useState(!!peer?.dnd)
  const fileRef = useRef(null)

  useEffect(() => {
    setForm({ name: peer?.name || '', prefix: peer?.prefix || '', username: peer?.username || '', bio: peer?.bio || '' })
    setPrivacy(peer?.privacy || 'visible')
    setDnd(!!peer?.dnd)
    setEdit(false)
  }, [peer?.id])

  if (!peer) return null

  const save = async () => {
    await onSave({ ...form, privacy, dnd })
    setEdit(false)
  }

  return (
    <>
      <div className="backdrop" onClick={onClose} style={{ zIndex: 11 }} />
      <div className="profile-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <button className="icon-btn" onClick={onClose}><IconArrowLeft /></button>
          <div className="profile-head-actions">
            {peer.is_self && <button className="icon-btn" onClick={onFavorites} title="Избранное"><IconBookmark /></button>}
            {isMe && <button className="icon-btn" onClick={() => setEdit((v) => !v)} title="Редактировать"><IconEdit /></button>}
          </div>
        </div>

        <div style={{ position: 'relative', width: 'fit-content', margin: '0 auto' }}>
          <Avatar user={peer} size="xl" ring={false} />
          {isMe && (
            <>
              <button className="avatar-cam" onClick={() => fileRef.current?.click()} title="Сменить фото">
                <IconCamera />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) onAvatar(f)
                  e.target.value = ''
                }}
              />
            </>
          )}
        </div>

        {edit ? (
          <div style={{ padding: '8px 6px' }}>
            <div className="field">
              <label>Имя</label>
              <input className="search-input" value={form.name} maxLength={40} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label>Префикс перед именем</label>
              <input className="search-input" value={form.prefix} maxLength={16} placeholder="★, 👑, [VIP] — или пусто"
                onChange={(e) => setForm({ ...form, prefix: e.target.value })} />
              <div className="hint">Виден всем в списке чатов и в группах. Поставьте, например, ★ — и выделитесь среди остальных.</div>
            </div>
            <div className="field">
              <label>Имя пользователя</label>
              <div className="username-wrap">
                <span>@</span>
                <input className="search-input" value={form.username} maxLength={24}
                  onChange={(e) => setForm({ ...form, username: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })} />
              </div>
            </div>
            <div className="field">
              <label>О себе</label>
              <input className="search-input" value={form.bio} maxLength={140} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
            </div>

            <div className="hint-line">Статус в сети</div>
            <div className="radio-list">
              {PRESENCE_OPTIONS.map((o) => (
                <button key={o.k} className={`radio-item ${privacy === o.k ? 'on' : ''}`} onClick={() => setPrivacy(o.k)}>
                  {o.icon}
                  <div>
                    <div className="name">{o.label}</div>
                    <div className="hint">{o.hint}</div>
                  </div>
                </button>
              ))}
            </div>

            <button className="switch-row" onClick={() => setDnd((v) => !v)}>
              <IconMoon2 width={20} height={20} />
              <div>
                <div className="name">Не беспокоить</div>
                <div className="hint">Собеседники увидят, что вас лучше не трогать</div>
              </div>
              <span className={`switch ${dnd ? 'on' : ''}`} />
            </button>

            <button className="auth-primary" onClick={save}>Сохранить</button>
          </div>
        ) : (
          <>
            <div className="profile-title">{displayNameOf(peer)}</div>
            <div className="profile-sub">{statusText}</div>
            {!peer.is_group && !peer.is_self && !peer.is_channel && (
              <>
                {peer.phone && <div className="profile-row"><div><div className="value">{peer.phone}</div><div className="label">Телефон</div></div></div>}
                {peer.username && <div className="profile-row"><div><div className="value">@{peer.username}</div><div className="label">Имя пользователя</div></div></div>}
                {peer.bio && <div className="profile-row"><div><div className="value">{peer.bio}</div><div className="label">О себе</div></div></div>}
                {peer.provider && peer.provider !== 'phone' && (
                  <div className="profile-row"><div><div className="value">{peer.provider}</div><div className="label">Вход через</div></div></div>
                )}
                <div className="profile-actions">
                  <button onClick={onMessage}><IconEdit width={18} height={18} /> Написать</button>
                  <button onClick={onCall}><IconPhone width={18} height={18} /> Звонок</button>
                  <button onClick={onVideo}><IconVideo width={18} height={18} /> Видео</button>
                </div>
              </>
            )}
            {(peer.is_group || peer.is_channel) && (
              <>
                <div className="profile-row"><div><div className="value">{peer.phone}</div><div className="label">{peer.is_channel ? 'Подписчики' : 'Участники'}</div></div></div>
                {peer.username && <div className="profile-row"><div><div className="value">@{peer.username}</div><div className="label">{peer.is_public ? 'Публичный адрес' : 'Адрес'}</div></div></div>}
                {!peer.is_public && (
                  <div className="profile-row"><div><div className="value"><IconLock width={14} height={14} /> закрытый</div><div className="label">Видимость</div></div></div>
                )}
                {peer.bio && <div className="profile-row"><div><div className="value">{peer.bio}</div><div className="label">Описание</div></div></div>}
                {peer.members_preview?.length > 0 && (
                  <>
                    <div className="hint-line">{peer.is_channel ? 'Подписчики' : 'Участники'}</div>
                    <div className="member-row">
                      {peer.members_preview.map((m) => (
                        <div key={m.id} className="member-chip">
                          <Avatar user={m} size="sm" ring={false} online={m.online} />
                          <span>{m.name.split(' ')[0]}</span>
                          {m.admin && <IconCheckCircle width={13} height={13} className="chip-admin" />}
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {(onManage || onLeave) && (
                  <div className="profile-actions">
                    {onManage && (
                      <button onClick={onManage}>
                        <IconSettings width={18} height={18} /> {peer.is_channel ? 'Настройки канала' : 'Настройки группы'}
                      </button>
                    )}
                    {onLeave && (
                      <button className="danger" onClick={onLeave}>
                        <IconLogout width={18} height={18} /> {peer.is_channel ? 'Отписаться' : 'Выйти'}
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
            {peer.is_self && (
              <>
                <div className="profile-row"><div><div className="value">{peer.phone}</div><div className="label">Телефон</div></div></div>
                {peer.username && <div className="profile-row"><div><div className="value">@{peer.username}</div><div className="label">Имя пользователя</div></div></div>}
                {peer.bio && <div className="profile-row"><div><div className="value">{peer.bio}</div><div className="label">О себе</div></div></div>}
                {onFavorites && (
                  <div className="profile-actions">
                    <button onClick={onFavorites}><IconBookmark width={18} height={18} /> Избранное</button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </>
  )
}

/* ==================== МОДАЛКА «НОВЫЙ ЧАТ» С ВКЛАДКАМИ ==================== */

export function NewChatModal({ users, onPick, onNewGroup, onNewChannel, discover, onJoin, onClose, busyIds, onPhoneSearch, onUsernameSearch }) {
  const [tab, setTab] = useState('private') // private | public
  const [q, setQ] = useState('')
  const [found, setFound] = useState(null)

  useEffect(() => {
    if (tab !== 'public') return
    let alive = true
    const t = setTimeout(() => {
      discover(q).then((d) => alive && setFound(d)).catch(() => {})
    }, 220)
    return () => { alive = false; clearTimeout(t) }
  }, [tab, q])

  const contacts = users.filter((u) => (u.name || '').toLowerCase().includes(q.toLowerCase()) || (u.username || '').includes(q.toLowerCase()))

  return (
    <>
      <div className="backdrop" onClick={onClose} style={{ zIndex: 13 }} />
      <div className="modal-card" style={{ zIndex: 14 }}>
        <div className="modal-head">
          <h2>Новый чат</h2>
          <button className="icon-btn" onClick={onClose}><IconClose /></button>
        </div>
        <div className="modal-body">
          <div className="tabs inner">
            <button className={`tab ${tab === 'private' ? 'on' : ''}`} onClick={() => setTab('private')}>
              <IconLock width={16} height={16} /> Частные
            </button>
            <button className={`tab ${tab === 'public' ? 'on' : ''}`} onClick={() => setTab('public')}>
              <IconGlobe width={16} height={16} /> Публичные
            </button>
          </div>

          <div className="search-wrap" style={{ margin: '10px 0 12px' }}>
            <IconSearch />
            <input className="search-input" placeholder={tab === 'public' ? 'Поиск по названию или @адресу' : 'Поиск контактов…'} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>

          {tab === 'private' ? (
            <>
              <div className="two-btns">
                <button className="new-group-btn" onClick={onNewGroup}>
                  <IconUserPlus width={20} height={20} /> Создать группу
                </button>
                <button className="new-group-btn" onClick={onNewChannel}>
                  <IconMega width={20} height={20} /> Создать канал
                </button>
              </div>
              {onPhoneSearch && (
                <button className="new-group-btn wide" onClick={onPhoneSearch}>
                  <IconSearch width={20} height={20} /> Найти по номеру телефона
                </button>
              )}
              {onUsernameSearch && (
                <button className="new-group-btn wide" onClick={onUsernameSearch}>
                  <IconSearch width={20} height={20} /> Найти по @username
                </button>
              )}
              <div className="picker-list">
                {contacts.map((u) => (
                  <button key={u.id} className="login-user" onClick={() => onPick(u.id)}>
                    <Avatar user={u} size="sm" ring={false} online={u.online} />
                    <div>
                      <div className="name">{u.name}</div>
                      <div className="hint">{u.presence || (u.username ? '@' + u.username : u.phone)}</div>
                    </div>
                  </button>
                ))}
                {contacts.length === 0 && <div className="empty-hint">Никого не найдено</div>}
              </div>
            </>
          ) : (
            <div className="picker-list">
              {found?.channels?.map((c) => (
                <button key={c.id} className="login-user" onClick={() => onJoin(c, 'channel')} disabled={busyIds?.has(c.key) || c.subscribed}>
                  <Avatar user={{ id: c.id, name: c.name, is_channel: true, avatar: c.avatar }} size="sm" ring={false} />
                  <div style={{ minWidth: 0 }}>
                    <div className="name">{c.name}</div>
                    <div className="hint">{c.handle ? '@' + c.handle : ''} · {c.members} подписчиков</div>
                  </div>
                  <span className="join-btn">{c.subscribed ? 'Вы внутри' : 'Подписаться'}</span>
                </button>
              ))}
              {found?.groups?.map((g) => (
                <button key={g.id} className="login-user" onClick={() => onJoin(g, 'group')} disabled={busyIds?.has(g.key) || g.subscribed}>
                  <Avatar user={{ id: g.id, name: g.name, is_group: true }} size="sm" ring={false} />
                  <div style={{ minWidth: 0 }}>
                    <div className="name">{g.name}</div>
                    <div className="hint">{g.handle ? '@' + g.handle : ''} · {g.members} участников</div>
                  </div>
                  <span className="join-btn">{g.subscribed ? 'Вы внутри' : 'Вступить'}</span>
                </button>
              ))}
              {found?.users?.map((u) => (
                <button key={u.id} className="login-user" onClick={() => onPick(u.id)}>
                  <Avatar user={{ id: u.id, name: u.name }} size="sm" ring={false} />
                  <div>
                    <div className="name">{u.name}</div>
                    <div className="hint">{u.handle ? '@' + u.handle : (u.description || '').slice(0, 40)}</div>
                  </div>
                </button>
              ))}
              {found && !found.channels?.length && !found.groups?.length && !found.users?.length && (
                <div className="empty-hint">Публичного по запросу «{q}» нет</div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

/* ==================== СОЗДАНИЕ ГРУППЫ / КАНАЛА ==================== */

export function GroupModal({ users, onClose, onCreate, kind = 'group' }) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [pub, setPub] = useState(false)
  const [handle, setHandle] = useState('')
  const [picked, setPicked] = useState([])

  const isChannel = kind === 'channel'
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const valid = name.trim() && (!pub || handle.replace(/[^a-z0-9_]/g, '').length >= 4) && (!isChannel || picked.length >= 0) && (!isChannel || true)

  return (
    <>
      <div className="backdrop" onClick={onClose} style={{ zIndex: 15 }} />
      <div className="modal-card" style={{ zIndex: 16 }}>
        <div className="modal-head">
          <h2>{isChannel ? 'Новый канал' : 'Новая группа'}</h2>
          <button className="icon-btn" onClick={onClose}><IconClose /></button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>{isChannel ? 'Название канала *' : 'Название группы *'}</label>
            <input className="search-input" style={{ paddingLeft: 14 }} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={isChannel ? 'Например: Новости компании' : 'Например: Друзья'} />
          </div>
          <div className="field">
            <label>Описание</label>
            <textarea className="search-input" style={{ paddingLeft: 14, resize: 'vertical' }} rows={2} maxLength={200} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={isChannel ? 'О чём этот канал' : 'Зачем эта группа'} />
          </div>

          <button className="switch-row" onClick={() => setPub((v) => !v)}>
            {pub ? <IconGlobe width={20} height={20} /> : <IconLock width={20} height={20} />}
            <div>
              <div className="name">{pub ? 'Публичный' : 'Частный'}</div>
              <div className="hint">
                {pub
                  ? 'Его можно найти по адресу и вступить без приглашения'
                  : 'Доступ только по приглашению участников'}
              </div>
            </div>
            <span className={`switch ${pub ? 'on' : ''}`} />
          </button>

          {pub && (
            <div className="field">
              <label>Публичный адрес *</label>
              <div className="username-wrap">
                <span>@</span>
                <input className="search-input" value={handle} maxLength={32} placeholder="my_channel"
                  onChange={(e) => setHandle(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())} />
              </div>
              <div className="hint" style={{ marginTop: 4 }}>от 4 символов: латиница, цифры, _</div>
            </div>
          )}

          {!isChannel && (
            <>
              <div className="hint-line">Участники ({picked.length})</div>
              <div className="picker-list">
                {users.map((u) => (
                  <button key={u.id} className="login-user"
                    style={{ background: picked.includes(u.id) ? 'rgba(51,144,236,.16)' : undefined, outline: picked.includes(u.id) ? '2px solid var(--accent)' : 'none' }}
                    onClick={() => toggle(u.id)}>
                    <Avatar user={u} size="sm" ring={false} />
                    <div className="name">{u.name}</div>
                  </button>
                ))}
              </div>
            </>
          )}

          {isChannel && (
            <>
              <div className="hint-line">Первые подписчики (необязательно)</div>
              <div className="picker-list">
                {users.map((u) => (
                  <button key={u.id} className="login-user"
                    style={{ background: picked.includes(u.id) ? 'rgba(51,144,236,.16)' : undefined, outline: picked.includes(u.id) ? '2px solid var(--accent)' : 'none' }}
                    onClick={() => toggle(u.id)}>
                    <Avatar user={u} size="sm" ring={false} />
                    <div className="name">{u.name}</div>
                  </button>
                ))}
              </div>
            </>
          )}

          <button className="auth-primary" disabled={!valid || (!isChannel && picked.length < 1)}
            onClick={() => {
              if (!valid) return
              if (!isChannel && !picked.length) return
              onCreate({ name: name.trim(), description: desc.trim(), is_public: pub, handle: pub ? handle : null, members: picked })
            }}>
            {isChannel ? <IconMega width={18} height={18} /> : <IconUserPlus width={18} height={18} />}
            {isChannel ? 'Создать канал' : 'Создать группу'}
          </button>
        </div>
      </div>
    </>
  )
}

/* ==================== МЕНЮ ЧАТА (три точки над звонками) ==================== */

const WALLPAPERS = [
  { k: 'default', label: 'По умолчанию', css: null },
  { k: 'sky', label: 'Небо', css: 'linear-gradient(135deg,#a8d8f0,#d6ecfa)' },
  { k: 'mint', label: 'Мята', css: 'linear-gradient(135deg,#b8e6c8,#e2f5e6)' },
  { k: 'peach', label: 'Персик', css: 'linear-gradient(135deg,#ffd3bd,#ffeee2)' },
  { k: 'lilac', label: 'Сирень', css: 'linear-gradient(135deg,#d8c9f0,#f0e8fa)' },
  { k: 'night', label: 'Ночь', css: 'linear-gradient(135deg,#1b2836,#2b5278)', dark: true },
  { k: 'graphite', label: 'Графит', css: 'linear-gradient(135deg,#2b2b2b,#4a4a4a)', dark: true },
  { k: 'forest', label: 'Лес', css: 'linear-gradient(160deg,#123 0%,#1e4d3b 60%,#2b6b4f 100%)', dark: true },
  // Картинка лежит в client/public/wallpapers → Vite копирует её в dist как есть,
  // поэтому путь абсолютный и работает и на сервере, и в APK.
  // dark: false — фон светлый, поэтому пузыри остаются обычными, а не тёмными.
  { k: 'soft', label: 'Розовое', url: '/wallpapers/soft.jpg', dark: false },
]

export function ChatMenu({ chat, onClose, onAction, settings }) {
  const ref = useRef(null)
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [onClose])

  const isCommunity = !!chat?.is_group || !!chat?.is_channel
  const items = [
    { k: 'wallpaper', label: 'Обои чата', icon: <IconWallpaper width={19} height={19} /> },
    { k: 'no_copy', label: settings?.no_copy ? 'Разрешить копирование' : 'Запретить копирование', icon: settings?.no_copy ? <IconEye width={19} height={19} /> : <IconLock width={19} height={19} />, on: settings?.no_copy },
    { k: 'mute', label: settings?.muted ? 'Включить уведомления' : 'Отключить уведомления', icon: settings?.muted ? <IconBellOff width={19} height={19} /> : <IconChats width={19} height={19} />, on: settings?.muted },
    ...(isCommunity ? [{ k: 'group_call', label: 'Групповой звонок', icon: <IconPhoneGroup width={19} height={19} /> }] : []),
    ...(isCommunity ? [{ k: 'manage', label: chat?.is_channel ? 'Настройки канала' : 'Настройки группы', icon: <IconSettings width={19} height={19} /> }] : []),
    ...(isCommunity ? [{ k: 'journal', label: 'История сообщества', icon: <IconHistory width={19} height={19} /> }] : []),
    { k: 'export', label: 'Экспорт истории', icon: <IconExport width={19} height={19} /> },
    { k: 'profile', label: chat?.is_channel ? 'О канале' : chat?.is_group ? 'О группе' : 'Профиль', icon: <IconContacts width={19} height={19} /> },
    { k: 'clear', label: 'Очистить историю', icon: <IconBroom width={19} height={19} /> },
    { k: 'delete', label: chat?.is_channel ? 'Отписаться и удалить' : 'Удалить чат', icon: <IconTrash width={19} height={19} />, danger: true },
  ]

  return (
    <div className="ctx-menu right" ref={ref}>
      {items.map((it) => (
        <button key={it.k} className={it.danger ? 'ctx-item danger' : 'ctx-item'} onClick={() => { onAction(it.k); onClose() }}>
          {it.icon} {it.label}
          {it.on && <span className="ctx-on">вкл</span>}
        </button>
      ))}
    </div>
  )
}

export { WALLPAPERS }

export function WallpaperModal({ current, onClose, onPick, onUpload, onRemove }) {
  return (
    <>
      <div className="backdrop" onClick={onClose} style={{ zIndex: 19 }} />
      <div className="modal-card" style={{ zIndex: 20 }}>
        <div className="modal-head">
          <h2>Обои чата</h2>
          <button className="icon-btn" onClick={onClose}><IconClose /></button>
        </div>
        <div className="modal-body">
          <div className="wall-grid">
            {WALLPAPERS.map((w) => {
              const on = current?.k === w.k && (w.url ? current?.type === 'image' : current?.type === 'color')
              return (
                <button key={w.k} className={`wall-cell ${on ? 'on' : ''}`}
                  style={w.url
                    ? { backgroundImage: `url(${w.url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                    : { background: w.css || 'var(--pattern)' }}
                  onClick={() => onPick(w)}>
                  <span>{w.label}</span>
                </button>
              )
            })}
            {current?.type === 'image' && !WALLPAPERS.some((w) => w.k === current.k) && (
              <button className="wall-cell on" style={{ backgroundImage: `url(${current.url})`, backgroundSize: 'cover' }}>
                <span>Своё фото</span>
              </button>
            )}
          </div>
          <button className="auth-primary" onClick={onUpload}><IconCamera width={18} height={18} /> Загрузить своё фото</button>
          <button className="auth-ghost" onClick={onRemove}>Убрать обои</button>
        </div>
      </div>
    </>
  )
}

export function ExportModal({ chat, onClose, onExport }) {
  const [fmt, setFmt] = useState('html')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [info, setInfo] = useState(null)

  const run = async () => {
    setBusy(true)
    setErr('')
    try {
      const r = await onExport(fmt)
      setInfo(`${r.name} · ${Math.max(1, Math.round(r.size / 1024))} КБ`)
    } catch (e) {
      setErr(e.message || 'Экспорт не удался')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="backdrop" onClick={onClose} style={{ zIndex: 19 }} />
      <div className="modal-card" style={{ zIndex: 20 }}>
        <div className="modal-head">
          <h2>Экспорт «{chat?.user?.name}»</h2>
          <button className="icon-btn" onClick={onClose}><IconClose /></button>
        </div>
        <div className="modal-body">
          <div className="radio-list">
            {[
              { k: 'html', label: 'HTML-архив', hint: 'Красивая страница, открывается в браузере' },
              { k: 'json', label: 'JSON', hint: 'Полная структура: сообщения, вложения, статусы' },
              { k: 'txt', label: 'Текст', hint: 'Простая лента: дата, автор, сообщение' },
            ].map((o) => (
              <button key={o.k} className={`radio-item ${fmt === o.k ? 'on' : ''}`} onClick={() => setFmt(o.k)}>
                <IconExport width={20} height={20} />
                <div>
                  <div className="name">{o.label}</div>
                  <div className="hint">{o.hint}</div>
                </div>
              </button>
            ))}
          </div>
          {err && <div className="auth-error">{err}</div>}
          {info && <div className="auth-note">Файл сохранён: {info}</div>}
          <button className="auth-primary" disabled={busy} onClick={run}>
            <IconDownload width={18} height={18} /> {busy ? 'Готовим…' : 'Скачать'}
          </button>
        </div>
      </div>
    </>
  )
}

/* ==================== ПЕРЕСЫЛКА ==================== */

export function ForwardModal({ chats, messages, onClose, onSend }) {
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState([])
  const list = chats.filter((c) => (c.user.name || '').toLowerCase().includes(q.toLowerCase()) && c.can_post !== false)

  return (
    <>
      <div className="backdrop" onClick={onClose} style={{ zIndex: 19 }} />
      <div className="modal-card" style={{ zIndex: 20 }}>
        <div className="modal-head">
          <h2>Переслать {messages.length} сообщ.</h2>
          <button className="icon-btn" onClick={onClose}><IconClose /></button>
        </div>
        <div className="modal-body">
          <div className="search-wrap" style={{ marginBottom: 10 }}>
            <IconSearch />
            <input className="search-input" placeholder="Куда переслать…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="picker-list">
            {list.map((c) => (
              <button key={c.key} className="login-user"
                style={{ background: picked.includes(c.key) ? 'rgba(51,144,236,.16)' : undefined, outline: picked.includes(c.key) ? '2px solid var(--accent)' : 'none' }}
                onClick={() => setPicked((p) => (p.includes(c.key) ? p.filter((x) => x !== c.key) : [...p, c.key]))}>
                <Avatar user={c.user} size="sm" ring={false} />
                <div className="name">{c.user.name}</div>
              </button>
            ))}
            {!list.length && <div className="empty-hint">Нет подходящих чатов</div>}
          </div>
          <button className="auth-primary" disabled={!picked.length} onClick={() => { onSend(picked); onClose() }}>
            <IconForward width={18} height={18} /> Переслать ({picked.length})
          </button>
        </div>
      </div>
    </>
  )
}

/* ==================== УПРАВЛЕНИЕ ГРУППОЙ / КАНАЛОМ ====================
   Одна модалка на оба типа сообществ: название, описание, адрес, фото,
   участники и администраторы. Различия — только в формулировках: право
   публиковать в канале ограничивает сервер. */

export function CommunityModal({ chat, users, meId, onClose, onSave, onAvatar }) {
  const info = chat?.user || {}
  const isChannel = !!chat?.is_channel
  const can = !!chat?.is_admin
  const owner = info.owner || meId
  const word = isChannel ? 'подписчика' : 'участника'
  const bio = info.bio === 'Групповой чат' ? '' : (info.bio || '')

  const [name, setName] = useState(info.name || '')
  const [desc, setDesc] = useState(bio)
  const [pub, setPub] = useState(!!chat?.is_public)
  const [handle, setHandle] = useState(info.username || '')
  const [members, setMembers] = useState(info.members || [meId])
  const [admins, setAdmins] = useState(info.admins || [owner])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

  const byId = (id) => users.find((x) => x.id === id)
  // Владелец и админы — наверху, остальные по алфавиту
  const ordered = [...members].sort((a, b) => {
    const rank = (id) => (id === owner ? 0 : admins.includes(id) ? 1 : 2)
    return rank(a) - rank(b) || (byId(a)?.name || '').localeCompare(byId(b)?.name || '')
  })
  const needle = q.trim().toLowerCase().replace(/^@/, '')
  const addable = users
    .filter((u) => u.id !== meId && !members.includes(u.id))
    .filter((u) => !needle || (u.name || '').toLowerCase().includes(needle) || (u.username || '').toLowerCase().includes(needle))
    .slice(0, 12)

  const toggleAdmin = (id) => {
    if (!can || id === owner) return
    setAdmins((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]))
  }
  const kick = (id) => {
    if (!can || id === owner) return
    setMembers((m) => m.filter((x) => x !== id))
    setAdmins((a) => a.filter((x) => x !== id))
  }
  const invite = (id) => setMembers((m) => (m.includes(id) ? m : [...m, id]))

  const dirty = name.trim() !== (info.name || '')
    || desc.trim() !== bio
    || pub !== !!chat?.is_public
    || (handle || '') !== (info.username || '')
    || members.length !== (info.members || []).length
    || members.some((m) => !(info.members || []).includes(m))
    || admins.length !== (info.admins || []).length
    || admins.some((a) => !(info.admins || []).includes(a))

  const save = async () => {
    if (!name.trim() || busy) return
    if (pub && handle.replace(/[^a-z0-9_]/g, '').length < 4) return
    setBusy(true)
    const ok = await onSave({
      name: name.trim(),
      description: desc.trim(),
      is_public: pub,
      handle: pub ? handle : null,
      members,
      admins,
    })
    setBusy(false)
    if (ok) onClose()
  }

  return (
    <>
      <div className="backdrop" onClick={onClose} style={{ zIndex: 19 }} />
      <div className="modal-card community-modal" style={{ zIndex: 20 }}>
        <div className="modal-head">
          <h2>{isChannel ? 'Настройки канала' : 'Настройки группы'}</h2>
          <button className="icon-btn" onClick={onClose}><IconClose /></button>
        </div>
        <div className="modal-body">
          {!can && (
            <div className="cm-notice">
              <IconLock width={16} height={16} />
              <span>Изменять могут только владелец и администраторы — всё остальное только для чтения.</span>
            </div>
          )}

          <div className="cm-avatar-wrap">
            <Avatar user={info} size="xl" ring={false} />
            {can && (
              <>
                <button className="avatar-cam" onClick={() => fileRef.current?.click()} title="Сменить фото сообщества">
                  <IconCamera />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) onAvatar(f)
                    e.target.value = ''
                  }}
                />
              </>
            )}
          </div>

          <div className="field">
            <label>{isChannel ? 'Название канала' : 'Название группы'}</label>
            <input className="search-input" style={{ paddingLeft: 14 }} value={name} maxLength={40} disabled={!can}
              onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="field">
            <label>Описание</label>
            <textarea className="search-input" style={{ paddingLeft: 14, resize: 'vertical' }} rows={2} maxLength={200}
              disabled={!can} value={desc} placeholder={isChannel ? 'О чём этот канал' : 'Зачем эта группа'}
              onChange={(e) => setDesc(e.target.value)} />
          </div>

          <button className="switch-row" disabled={!can} onClick={() => setPub((v) => !v)}>
            {pub ? <IconGlobe width={20} height={20} /> : <IconLock width={20} height={20} />}
            <div>
              <div className="name">{pub ? 'Публичное' : 'Частное'}</div>
              <div className="hint">{pub ? 'Находится в каталоге и находится по адресу' : 'Доступ только по приглашению участников'}</div>
            </div>
            <span className={`switch ${pub ? 'on' : ''}`} />
          </button>

          {pub && (
            <div className="field">
              <label>Публичный адрес</label>
              <div className="username-wrap">
                <span>@</span>
                <input className="search-input" value={handle} maxLength={32} disabled={!can} placeholder="my_channel"
                  onChange={(e) => setHandle(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())} />
              </div>
              <div className="hint" style={{ marginTop: 4 }}>от 4 символов: латиница, цифры, _</div>
            </div>
          )}

          <div className="hint-line">{isChannel ? 'Подписчики' : 'Участники'} ({members.length})</div>
          <div className="cm-members">
            {ordered.map((id) => {
              const u = byId(id)
              const isOwner = id === owner
              const isAdminRow = admins.includes(id) || isOwner
              return (
                <div key={id} className="cm-member">
                  <Avatar user={u || { id, name: id }} size="sm" ring={false} />
                  <div className="cm-member-name">
                    {u ? displayNameOf(u) : 'Неизвестный'}
                    {id === meId && <span className="cm-you">вы</span>}
                  </div>
                  {isAdminRow && <span className={`cm-badge ${isOwner ? 'owner' : ''}`}>{isOwner ? 'владелец' : 'админ'}</span>}
                  {can && !isOwner && (
                    <>
                      <button className="cm-act" title={admins.includes(id) ? 'Снять администратора' : 'Сделать администратором'}
                        onClick={() => toggleAdmin(id)}>
                        {admins.includes(id) ? <IconCheckCircle width={18} height={18} /> : <IconUserPlus width={18} height={18} />}
                      </button>
                      <button className="cm-act danger" title={isChannel ? 'Отписать' : 'Исключить'} onClick={() => kick(id)}>
                        <IconClose width={16} height={16} />
                      </button>
                    </>
                  )}
                </div>
              )
            })}
          </div>

          {can && (
            <div className="field">
              <label>Добавить {word}</label>
              <div className="search-wrap" style={{ marginBottom: 6 }}>
                <IconSearch />
                <input className="search-input" placeholder="Имя или @username" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <div className="cm-add-list">
                {addable.map((u) => (
                  <button key={u.id} className="cm-add-item" onClick={() => invite(u.id)}>
                    <Avatar user={u} size="sm" ring={false} />
                    <span className="name">{displayNameOf(u)}</span>
                    <IconPlus width={16} height={16} />
                  </button>
                ))}
                {!addable.length && <div className="empty-hint">{needle ? 'Никого не нашлось' : 'Все уже добавлены'}</div>}
              </div>
            </div>
          )}

          {can && (
            <button className="auth-primary" disabled={!dirty || !name.trim() || busy} onClick={save}>
              {busy ? 'Сохраняем…' : 'Сохранить изменения'}
            </button>
          )}
        </div>
      </div>
    </>
  )
}

/* ==================== ПОДТВЕРЖДЕНИЕ ==================== */

export function ConfirmModal({ title, text, confirmLabel, onConfirm, onClose, danger }) {
  return (
    <>
      <div className="backdrop" onClick={onClose} style={{ zIndex: 21 }} />
      <div className="modal-card" style={{ zIndex: 22, maxWidth: 340 }}>
        <div className="modal-head"><h2>{title}</h2></div>
        <div className="modal-body">
          <p style={{ color: 'var(--text-secondary)', fontSize: 14.5, marginBottom: 16 }}>{text}</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="auth-ghost" style={{ flex: 1 }} onClick={onClose}>Отмена</button>
            <button className={danger ? 'auth-primary danger' : 'auth-primary'} style={{ flex: 1, margin: 0 }} onClick={() => { onConfirm(); onClose() }}>{confirmLabel}</button>
          </div>
        </div>
      </div>
    </>
  )
}

export { IconPlay, IconPause }
