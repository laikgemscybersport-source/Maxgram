import React, { useState, useRef, useEffect, useCallback } from 'react'
import { api, getToken, setToken, connectSocket, mediaUrl, getServerBase, isNativeApp } from './api'
import { compressImage } from './media'
import CallManager, { GroupCallManager } from './webrtc.js'
import ServerSetup from './components/ServerSetup.jsx'
import AuthScreen from './components/AuthScreen.jsx'
import CallOverlay from './components/CallOverlay.jsx'
import { JournalModal, PhoneSearchModal, UsernameSearchModal, GroupCallModal, GroupCallOverlay } from './components/NewFeatures.jsx'
import { Lightbox } from './components/MediaMessage.jsx'
import {
  AttachMenu,
  VoiceRecorder,
  CircleRecorder,
  LocationComposer,
  ContactComposer,
  EventComposer,
} from './components/Attachments.jsx'
import {
  Sidebar,
  ChatHeader,
  MessageList,
  Composer,
  Drawer,
  ProfilePanel,
  NewChatModal,
  GroupModal,
  ConfirmModal,
  MessageMenu,
  SelectionBar,
  ChatMenu,
  WallpaperModal,
  ExportModal,
  ForwardModal,
  StoryViewer,
  StoryComposer,
  WALLPAPERS,
  Avatar,
  previewOf,
  chatBucket,
  displayNameOf,
} from './components/ui.jsx'
import { IconBookmark, IconHistory, IconLink, IconPhoneGroup, IconUsers } from './components/Icons.jsx'

const pairKey = (a, b) => 'p:' + [a, b].sort().join(',')

const TAB_HINT = {
  all: 'Выберите чат, чтобы начать переписку',
  dm: 'Выберите личный чат',
  groups: 'Выберите группу',
  channels: 'Выберите канал',
}

const TAB_EMPTY = {
  all: 'Пока нет ни чатов, ни групп, ни каналов',
  dm: 'Пока нет личных чатов',
  groups: 'Пока нет групп',
  channels: 'Пока нет каналов',
}

function QaItem({ chat, onSelect, sub, bookmark }) {
  return (
    <button type="button" className="qa-item" onClick={() => onSelect(chat.key)}>
      {bookmark ? (
        <div className="qa-avatar" style={{ background: 'var(--accent-grad)' }}>
          <IconBookmark width={22} height={22} />
        </div>
      ) : (
        <Avatar user={chat.user} online={chat.user.online} size="sm" ring={false} />
      )}
      <div className="qa-info">
        <div className="qa-name">{displayNameOf(chat.user)}</div>
        <div className="qa-sub">{sub}</div>
      </div>
    </button>
  )
}

/*
 * Правая панель, когда чат не открыт. Показывает ровно ту вкладку, которая
 * выбрана слева: «Группы» → группы, «Каналы» → каналы и т. д.
 * limit нужен только для режима «Все», где секции идут подряд.
 */
function QuickAccess({ chats, tab, onSelect }) {
  const fav = chats.find((c) => c.is_self)
  const groups = chats.filter((c) => chatBucket(c) === 'groups')
  const channels = chats.filter((c) => chatBucket(c) === 'channels')
  const dms = chats.filter((c) => !c.is_self && chatBucket(c) === 'dm')

  const subOf = (c) =>
    c.last_message ? previewOf(c.last_message)
    : c.is_self ? 'Ваши сохранённые сообщения'
    : c.is_channel || c.is_group ? (c.user.phone || (c.is_channel ? 'Канал' : 'Группа'))
    : 'Нет сообщений'

  const section = (id, label, list, limit) => {
    if (!list.length) return null
    const shown = limit ? list.slice(0, limit) : list
    return (
      <React.Fragment key={id}>
        {label && <div className="qa-label">{label}</div>}
        <div className="qa-list">
          {shown.map((c) => (
            <QaItem key={c.key} chat={c} onSelect={onSelect} sub={subOf(c)} bookmark={c.is_self} />
          ))}
          {limit && list.length > limit && <div className="qa-more">ещё {list.length - limit}…</div>}
        </div>
      </React.Fragment>
    )
  }

  // Избранное живёт в «Личных», поэтому показываем его в «Всех» и в «Личных».
  const favSection = fav ? section('fav', null, [fav]) : null

  let body
  if (tab === 'dm') body = [favSection, section('dm', null, dms)]
  else if (tab === 'groups') body = [section('groups', null, groups)]
  else if (tab === 'channels') body = [section('channels', null, channels)]
  else body = [favSection, section('dm', 'Чаты', dms, 5), section('groups', 'Группы', groups), section('channels', 'Каналы', channels)]

  const empty = tab === 'dm' ? !fav && !dms.length : tab === 'groups' ? !groups.length : tab === 'channels' ? !channels.length : !chats.length

  return (
    <div className="empty-state">
      <div className="qa-panel">
        <div className="qa-title">MAXgram</div>
        <div className="qa-hint">{TAB_HINT[tab] || TAB_HINT.all}</div>
        {empty ? <div className="qa-none">{TAB_EMPTY[tab] || TAB_EMPTY.all}</div> : body}
      </div>
    </div>
  )
}

export default function App() {
  const [user, setUser] = useState(null)
  const [booting, setBooting] = useState(true)
  const [theme, setTheme] = useState(() => localStorage.getItem('mg-theme') || 'light')
  const [directory, setDirectory] = useState([])
  const [chats, setChats] = useState([])
  const [messages, setMessages] = useState([])
  const [activeKey, setActiveKey] = useState(null)
  const [typing, setTyping] = useState({})
  const [view, setView] = useState('list')
  // Вкладка списка чатов поднята из Sidebar сюда: пустая правая панель
  // показывает содержимое той же вкладки, которая выбрана слева.
  const [tab, setTab] = useState('all')

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [profileMe, setProfileMe] = useState(false)
  const [profilePeer, setProfilePeer] = useState(false)
  const [newChatOpen, setNewChatOpen] = useState(false)
  const [groupOpen, setGroupOpen] = useState(null)   // 'group' | 'channel'
  const [attachOpen, setAttachOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [circleOpen, setCircleOpen] = useState(false)
  const [locOpen, setLocOpen] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)
  const [eventOpen, setEventOpen] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [notice, setNotice] = useState('')
  const [call, setCall] = useState(null)

  // Новое: меню, выделение, ответы, истории, настройки чата
  const [menu, setMenu] = useState(null)
  const [chatMenuOpen, setChatMenuOpen] = useState(false)
  const [selected, setSelected] = useState([])
  const [reply, setReply] = useState(null)
  const [edit, setEdit] = useState(null)
  const [forward, setForward] = useState(null)        // массив сообщений
  const [wallpaperOpen, setWallpaperOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmDeleteChat, setConfirmDeleteChat] = useState(false)
  const [stories, setStories] = useState([])
  const [storyView, setStoryView] = useState(null)     // { group, index }
  const [storyComposer, setStoryComposer] = useState(false)
  const [busyIds, setBusyIds] = useState(new Set())

  // История сообщений, поиск по номеру, приглашения, групповой звонок
  const [journalOpen, setJournalOpen] = useState(false)
  const [phoneSearchOpen, setPhoneSearchOpen] = useState(false)
  const [usernameSearchOpen, setUsernameSearchOpen] = useState(false)
  const [groupCallModal, setGroupCallModal] = useState(false)
  const [groupCall, setGroupCall] = useState(null)     // { state, peers, local, video, callId, micOn, camOn }
  const [gcBanner, setGcBanner] = useState(null)       // активный звонок в открытом чате, к которому можно присоединиться

  const wsRef = useRef(null)
  const activeRef = useRef(null)
  const userRef = useRef(null)
  const directoryRef = useRef([])
  const chatsRef = useRef([])
  const typingTimer = useRef(null)
  const lastTypedAt = useRef(0)
  const reconnectTimer = useRef(null)
  const noticeTimer = useRef(null)
  const photoInput = useRef(null)
  const fileInput = useRef(null)
  const joinBusy = useRef(null)

  const callRef = useRef(null)
  const callInfoRef = useRef(null)
  const callChatRef = useRef(null)
  const callStartedRef = useRef(0)
  const incomingRef = useRef(null)
  const pendingIce = useRef([])
  const facingRef = useRef('user')

  const gcRef = useRef(null)
  const gcStateRef = useRef(null)
  const gcInfoRef = useRef(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('mg-theme', theme)
  }, [theme])

  useEffect(() => { directoryRef.current = directory }, [directory])
  useEffect(() => { chatsRef.current = chats }, [chats])

  const toast = useCallback((text) => {
    setNotice(text)
    clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(''), 4200)
  }, [])

  // Имя участника по id: из справочника, иначе сам id — сетка не должна показывать технический id
  const nameOf = useCallback((id) => {
    const u = directoryRef.current.find((x) => x.id === id)
    return u ? displayNameOf(u) : id
  }, [])

  /* ==================== ЗВОНОК ==================== */

  const applyCall = useCallback((next) => {
    callInfoRef.current = next
    setCall(next)
  }, [])

  const reportCall = useCallback(async (info, reason) => {
    const me = userRef.current
    const key = callChatRef.current
    if (!me || !key || !info?.peer) return
    let text
    if (reason === 'no-answer') text = 'Пропущенный звонок'
    else if (reason === 'declined') text = info.incoming ? 'Звонок отклонён' : 'Звонок не принят'
    else if (reason === 'failed') text = 'Звонок не состоялся'
    else {
      const sec = callStartedRef.current ? Math.round((Date.now() - callStartedRef.current) / 1000) : 0
      text = sec > 0 ? `${info.video ? 'Видеозвонок' : 'Звонок'} · ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : 'Звонок завершён'
    }
    callStartedRef.current = 0
    try {
      await api.sendMessage({ chat_key: key, kind: 'call', content: text })
      if (activeRef.current === key) api.getMessages(key).then(setMessages).catch(() => {})
    } catch (e) {
      console.error('call report', e)
    }
  }, [])

  const onCallState = useCallback(
    (state, extra) => {
      const cm = callRef.current
      const cur = callInfoRef.current
      if (state === 'ended' || state === 'failed') {
        if (cur) reportCall(cur, extra?.reason || (state === 'failed' ? 'failed' : 'hangup'))
        incomingRef.current = null
        pendingIce.current = []
        applyCall(null)
        return
      }
      if (state === 'active' && !callStartedRef.current) callStartedRef.current = Date.now()
      if (!cur) return
      applyCall({
        ...cur,
        state,
        local: cm?.local || cur.local,
        remote: extra?.remote || cm?.remote || cur.remote,
        video: cm?.video ?? cur.video,
      })
    },
    [applyCall, reportCall]
  )

  useEffect(() => {
    const cm = new CallManager({
      send: (payload) => {
        const ws = wsRef.current
        if (ws && ws.readyState === 1) ws.send(JSON.stringify(payload))
      },
      onIncoming: () => {},
      onState: onCallState,
      onError: (msg) => toast(msg),
    })
    callRef.current = cm
    return () => {
      try { cm.teardown('ended') } catch { /* уже закрыт */ }
    }
  }, [onCallState, toast])

  useEffect(() => {
    const gcm = new GroupCallManager({
      send: (payload) => {
        const ws = wsRef.current
        if (ws && ws.readyState === 1) ws.send(JSON.stringify(payload))
      },
      onState: (s) => {
        gcStateRef.current = s
        const info = gcInfoRef.current
        if (!info) return
        if (s.state === 'ended') {
          gcInfoRef.current = null
          setGroupCall(null)
          return
        }
        // Имена участников менеджер знает только как id — подставляем из справочника
        const peers = (s.peers || []).map((p) => ({ ...p, name: p.name && p.name !== p.id ? p.name : nameOf(p.id) }))
        setGroupCall({ ...info, ...s, peers })
      },
      onError: (msg) => toast(msg),
    })
    gcRef.current = gcm
    return () => {
      try { gcm.stop() } catch { /* уже закрыт */ }
    }
  }, [toast, nameOf])

  const handleSignal = useCallback(
    (data) => {
      const me = userRef.current
      const cm = callRef.current
      if (!me || !cm) return
      if (data.from === me.id) return

      if (data.action === 'offer') {
        if (callInfoRef.current || incomingRef.current) {
          cm.send({ type: 'call', action: 'reject', call_id: data.call_id, to: data.from, reason: 'busy' })
          return
        }
        incomingRef.current = data
        callChatRef.current = pairKey(me.id, data.from)
        applyCall({
          incoming: true, video: !!data.video, state: 'ringing',
          peer: { id: data.from, name: data.from_name, avatar: data.from_avatar },
          local: null, remote: null, micOn: true, camOn: true,
        })
        return
      }

      if (incomingRef.current && ['ended', 'reject', 'unreachable'].includes(data.action)) {
        const pend = incomingRef.current
        incomingRef.current = null
        reportCall({ incoming: true, video: !!pend.video, peer: { id: pend.from, name: pend.from_name } }, 'hangup')
        applyCall(null)
        return
      }

      if (data.action === 'ice' && !cm.pc) {
        pendingIce.current.push(data.candidate)
        return
      }

      cm.handleSignal(data)
    },
    [applyCall, reportCall]
  )

  const startCall = (video) => {
    const me = userRef.current
    const chat = chatsRef.current.find((c) => c.key === activeRef.current)
    const peer = chat && !chat.is_group && !chat.is_channel && !chat.is_self ? chat.user : null
    const cm = callRef.current
    if (!me || !peer || !cm || callInfoRef.current) return
    callChatRef.current = chat.key
    callStartedRef.current = 0
    facingRef.current = 'user'
    applyCall({ incoming: false, video, state: 'ringing', peer, local: null, remote: null, micOn: true, camOn: true })
    cm.start(peer, { video })
  }

  const acceptCall = async () => {
    const cm = callRef.current
    const offer = incomingRef.current
    if (!cm || !offer) return
    incomingRef.current = null
    applyCall({ ...callInfoRef.current, state: 'connecting' })
    await cm.handleSignal(offer)
    const ice = pendingIce.current
    pendingIce.current = []
    for (const c of ice) cm.handleSignal({ type: 'call', action: 'ice', call_id: offer.call_id, candidate: c })
  }

  const rejectCall = () => {
    const cm = callRef.current
    const offer = incomingRef.current
    if (offer) {
      cm.send({ type: 'call', action: 'reject', call_id: offer.call_id, to: offer.from, reason: 'declined' })
      incomingRef.current = null
      reportCall({ ...callInfoRef.current, incoming: true }, 'declined')
      applyCall(null)
      return
    }
    cm?.reject()
  }

  const hangupCall = () => {
    if (incomingRef.current) return rejectCall()
    callRef.current?.hangup()
  }

  const toggleMic = () => applyCall({ ...callInfoRef.current, micOn: callRef.current?.toggleMic() })
  const toggleCam = () => applyCall({ ...callInfoRef.current, camOn: callRef.current?.toggleCam() })

  const switchCamera = () => {
    const track = callRef.current?.local?.getVideoTracks()[0]
    if (!track || !track.applyConstraints) return toast('Камера в этом устройстве одна')
    facingRef.current = facingRef.current === 'user' ? 'environment' : 'user'
    track.applyConstraints({ advanced: [{ facingMode: facingRef.current }] }).catch(() => toast('Сменить камеру не удалось'))
  }

  /* ==================== ГРУППОВОЙ ЗВОНОК ==================== */

  const handleGroupCallEvent = useCallback(async (data) => {
    const me = userRef.current
    if (!me || !gcRef.current) return
    const gcm = gcRef.current

    switch (data.action) {
      case 'start': {
        const call = data.call
        // Если уже в звонке — игнорируем start (мы уже внутри)
        if (gcInfoRef.current) break
        // Если в активном чате — показываем баннер
        if (activeRef.current === call.chat_key && !call.members.includes(me.id)) {
          setGcBanner({ callId: call.id, chatKey: call.chat_key, video: call.video, host: call.host })
        }
        // Если мы уже в комнате — обновляем участников
        if (call.members.includes(me.id)) {
          gcInfoRef.current = call
          setGroupCall({
            state: 'active',
            peers: call.members.filter((m) => m !== me.id).map((m) => ({ id: m, name: nameOf(m), connected: false })),
            local: null,
            video: call.video,
            callId: call.id,
            micOn: true,
            camOn: true,
          })
        }
        break
      }

      case 'leave': {
        // Если это мы — leave обрабатывается через gcm.leave()
        if (data.user_id === me.id) break
        if (!gcInfoRef.current || gcInfoRef.current.callId !== data.call_id) break
        // Выход участника закрывает его RTCPeerConnection
        gcRef.current.removePeer(data.user_id)
        setGroupCall((prev) => (prev ? { ...prev, peers: prev.peers.filter((p) => p.id !== data.user_id) } : prev))
        break
      }

      case 'end': {
        const info = gcInfoRef.current
        if (info && info.callId === data.call_id) {
          gcInfoRef.current = null
          setGroupCall(null)
        }
        // Баннер убираем
        setGcBanner((prev) => prev?.callId === data.call_id ? null : prev)
        break
      }

      default:
        // offer/answer/ice — передаём gcm
        if (gcInfoRef.current) gcRef.current.handleSignal(data)
        break
    }
  }, [])

  // Вход в комнату: если WebRTC/доступ к устройствам не получились, обязательно
  // выходим из серверной комнаты — иначе висеть в участниках звонка без медиа.
  const enterGroupCall = useCallback(async (call, video) => {
    const me = userRef.current
    if (!me) return
    gcInfoRef.current = call
    const others = call.members.filter((m) => m !== me.id)
    try {
      await gcRef.current.join({ call, meId: me.id, video, others })
    } catch (e) {
      gcInfoRef.current = null
      try { await api.leaveGroupCall(call.id) } catch { /* сервер сам почистит пустую комнату */ }
      throw e
    }
    setGroupCall({
      state: 'active',
      peers: others.map((m) => ({ id: m, name: nameOf(m), connected: false })),
      local: gcRef.current.local,
      video,
      callId: call.id,
      chatKey: call.chat_key,
      micOn: true,
      camOn: true,
    })
    setGcBanner(null)
  }, [nameOf])

  const handleStartGroupCall = useCallback(async (video) => {
    const me = userRef.current
    const key = activeRef.current
    if (!me || !key) return
    try {
      const d = await api.startGroupCall(key, video)
      if (!d.call) return toast('Звонок не создан')
      await enterGroupCall(d.call, video)
    } catch (e) {
      toast(e.message || 'Не удалось начать звонок')
    }
  }, [enterGroupCall, toast])

  const handleJoinGroupCall = useCallback(async () => {
    const me = userRef.current
    const key = activeRef.current
    if (!me || !key || !gcBanner) return
    try {
      const d = await api.startGroupCall(key, gcBanner.video)
      if (!d.call) return toast('Звонок не найден')
      await enterGroupCall(d.call, !!d.call.video)
    } catch (e) {
      toast(e.message || 'Не удалось присоединиться')
    }
  }, [gcBanner, enterGroupCall, toast])

  const handleLeaveGroupCall = useCallback(async () => {
    const gcm = gcRef.current
    const info = gcInfoRef.current
    if (gcm && info) {
      try { await api.leaveGroupCall(info.callId) } catch { /* ignore */ }
      gcm.leave()
    }
    gcInfoRef.current = null
    setGroupCall(null)
  }, [])

  const handleToggleGcMic = useCallback(() => {
    const gcm = gcRef.current
    if (!gcm) return
    const on = gcm.toggleMic()
    setGroupCall((prev) => prev ? { ...prev, micOn: on } : prev)
  }, [])

  const handleToggleGcCam = useCallback(() => {
    const gcm = gcRef.current
    if (!gcm) return
    const on = gcm.toggleCam()
    setGroupCall((prev) => prev ? { ...prev, camOn: on } : prev)
  }, [])

  /* ==================== ДАННЫЕ ==================== */

  const loadChats = useCallback(async (meId) => {
    try {
      setChats(await api.getChats(meId))
    } catch (e) {
      console.error('chats', e)
    }
  }, [])

  const loadStories = useCallback(async () => {
    try {
      const d = await api.getStories()
      setStories(d.stories || [])
    } catch (e) {
      console.error('stories', e)
    }
  }, [])

  const sendSocket = useCallback((payload) => {
    const ws = wsRef.current
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(payload))
  }, [])

  const handleEvent = useCallback(
    (data) => {
      const me = userRef.current
      if (!me) return

      switch (data.type) {
        case 'users': {
          setDirectory(data.users)
          // Список чатов хранит копию собеседника из chatSummary — подтягиваем
          // актуальный online/presence, иначе точка в списке отстаёт на целый
          // цикл перезагрузки чатов.
          const byId = Object.fromEntries(data.users.map((u) => [u.id, u]))
          setChats((prev) => prev.map((c) => {
            const fresh = c.user?.is_group || c.user?.is_channel || c.user?.is_self ? null : byId[c.user?.id]
            if (!fresh) return c
            return { ...c, user: { ...c.user, ...fresh } }
          }))
          break
        }

        case 'message': {
          const m = data.message
          if (m.sender_id === me.id) break
          if (m.chat_key === activeRef.current) {
            setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
            if (!m.chat_key.startsWith('c:')) sendSocket({ type: 'read', chat_key: m.chat_key })
            setTyping((t) => {
              const next = { ...t }
              delete next[m.chat_key]
              return next
            })
          }
          loadChats(me.id)
          break
        }

        case 'receipt':
          setMessages((prev) => prev.map((m) => (m.id === data.message_id ? { ...m, status: data.status } : m)))
          break

        case 'read_all': {
          if (data.reader_id === me.id || data.chat_key !== activeRef.current) break
          setMessages((prev) => prev.map((m) => (m.sender_id === me.id && m.status !== 'read' ? { ...m, status: 'read' } : m)))
          break
        }

        case 'delete':
          setMessages((prev) => prev.filter((m) => m.id !== data.message_id))
          setSelected((prev) => prev.filter((m) => m.id !== data.message_id))
          loadChats(me.id)
          break

        case 'edit': {
          if (data.chat_key !== activeRef.current) break
          const e = data.message
          setMessages((prev) => prev.map((m) => (m.id === e.id ? { ...m, content: e.content, edited_at: e.edited_at } : m)))
          loadChats(me.id)
          break
        }

        case 'pin': {
          if (data.chat_key !== activeRef.current) { loadChats(me.id); break }
          setMessages((prev) => prev.map((m) => ({ ...m, pinned: data.pin && m.id === data.pin.message_id })))
          loadChats(me.id)
          break
        }

        case 'clear': {
          if (data.chat_key === activeRef.current) setMessages([])
          setSelected([])
          loadChats(me.id)
          break
        }

        case 'chat_updated':
          loadChats(me.id)
          break

        case 'story_new':
        case 'story_deleted':
          loadStories()
          break

        case 'typing': {
          if (data.user_id === me.id || data.chat_key !== activeRef.current) break
          const who = directoryRef.current.find((u) => u.id === data.user_id)
          setTyping((t) => ({ ...t, [data.chat_key]: who ? who.name : 'Кто-то' }))
          clearTimeout(typingTimer.current)
          typingTimer.current = setTimeout(() => {
            setTyping((t) => {
              const next = { ...t }
              delete next[data.chat_key]
              return next
            })
          }, 3500)
          break
        }

        case 'call':
          handleSignal(data)
          break

        case 'group_call':
          handleGroupCallEvent(data)
          break

        default:
          break
      }
    },
    [loadChats, loadStories, sendSocket, handleSignal, handleGroupCallEvent]
  )

  const openSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onclose = null
      wsRef.current.close()
    }
    const ws = connectSocket(handleEvent)
    wsRef.current = ws
    ws.onclose = () => {
      clearTimeout(reconnectTimer.current)
      reconnectTimer.current = setTimeout(() => {
        if (userRef.current) openSocket()
      }, 2000)
    }
  }, [handleEvent])

  /* Приглашение по ссылке вида <origin>/#/join/<code>: код запоминаем при старте,
     а принимаем уже после входа в аккаунт — до авторизации сервер вернёт 401. */
  const pendingInvite = useRef(null)
  const consumeInviteRef = useRef(null)
  useEffect(() => {
    const m = /^#\/join\/([A-Za-z0-9_-]{4,16})$/.exec(window.location.hash || '')
    if (m) pendingInvite.current = m[1]
  }, [])

  const afterAuth = useCallback(
    async (me) => {
      userRef.current = me
      setUser(me)
      try {
        const [list, people] = await Promise.all([api.getChats(me.id), api.getUsers()])
        setChats(list)
        setDirectory(people)
        loadStories()
      } catch (e) {
        console.error('bootstrap', e)
      }
      openSocket()
      setBooting(false)
      consumeInviteRef.current?.()
    },
    [openSocket, loadStories]
  )

  useEffect(() => {
    if (!getToken()) {
      setBooting(false)
      return
    }
    api
      .me()
      .then((d) => afterAuth(d.user))
      .catch(() => {
        setToken(null)
        setBooting(false)
      })
  }, [afterAuth])

  const onAuthed = (token, me) => {
    setToken(token)
    afterAuth(me)
  }

  const doLogout = useCallback(() => {
    clearTimeout(reconnectTimer.current)
    api.logout().catch(() => {})
    if (wsRef.current) {
      wsRef.current.onclose = null
      wsRef.current.close()
      wsRef.current = null
    }
    setToken(null)
    userRef.current = null
    activeRef.current = null
    setUser(null)
    setActiveKey(null)
    setChats([])
    setMessages([])
    setStories([])
    setTyping({})
    setSelected([])
    setReply(null)
    setEdit(null)
    setView('list')
    setDrawerOpen(false)
    setProfileMe(false)
    setProfilePeer(false)
    setConfirmLogout(false)
  }, [])

  useEffect(
    () => () => {
      clearTimeout(reconnectTimer.current)
      clearTimeout(noticeTimer.current)
      clearTimeout(typingTimer.current)
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
      }
    },
    []
  )

  const selectChat = useCallback(
    (chatKey) => {
      const me = userRef.current
      if (!me) return
      activeRef.current = chatKey
      setActiveKey(chatKey)
      setView('chat')
      setMessages([])
      setSelected([])
      setReply(null)
      setEdit(null)
      api
        .getMessages(chatKey)
        .then(setMessages)
        .catch((e) => {
          console.error('messages', e)
          setMessages([])
        })
      sendSocket({ type: 'read', chat_key: chatKey })
      api.markRead(chatKey).catch(() => {})
      loadChats(me.id)
    },
    [loadChats, sendSocket]
  )

  // Принять приглашение по ссылке можно только после входа в аккаунт, поэтому
  // объявляем после selectChat и пробрасываем через ref в afterAuth.
  useEffect(() => {
    consumeInviteRef.current = async () => {
      const code = pendingInvite.current
      if (!code) return
      pendingInvite.current = null
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
      try {
        const d = await api.joinByInvite(code)
        if (d?.chat?.key) {
          await loadChats(userRef.current?.id)
          selectChat(d.chat.key)
          toast(d.already ? 'Вы уже участник этого чата' : 'Вы присоединились по ссылке')
        }
      } catch (e) {
        toast(e.message || 'Приглашение недействительно')
      }
    }
  }, [loadChats, selectChat, toast])

  // Открываем чат — проверяем, не идёт ли в нём групповой звонок, чтобы показать баннер
  useEffect(() => {
    if (!activeKey || !activeKey.startsWith('g:')) {
      setGcBanner(null)
      return
    }
    if (gcInfoRef.current?.chatKey === activeKey) return
    let alive = true
    api
      .groupCall(activeKey)
      .then((d) => {
        if (!alive || !d.call || gcInfoRef.current) return
        const me = userRef.current
        if (!me || d.call.members.includes(me.id)) return
        setGcBanner({ callId: d.call.id, chatKey: d.call.chat_key, video: d.call.video, host: d.call.host })
      })
      .catch(() => {})
    return () => { alive = false }
  }, [activeKey])

  /* ==================== ОТПРАВКА ==================== */

  const push = useCallback(async (kind, fields, text) => {
    const me = userRef.current
    const key = activeRef.current
    if (!me || !key) return null
    const local = {
      id: 'tmp-' + Math.random().toString(36).slice(2),
      chat_key: key,
      sender_id: me.id,
      kind,
      content: text || '',
      created_at: new Date().toISOString(),
      status: 'sending',
      ...fields,
    }
    setMessages((prev) => [...prev, local])
    try {
      const saved = await api.sendMessage({ chat_key: key, kind, content: text || '', ...fields })
      setMessages((prev) => prev.map((m) => (m.id === local.id ? saved : m)))
      loadChats(me.id)
      return saved
    } catch (e) {
      setMessages((prev) => prev.map((m) => (m.id === local.id ? { ...m, status: 'failed' } : m)))
      toast(e.message || 'Не удалось отправить')
      return null
    }
  }, [loadChats, toast])

  const send = (content) => {
    if (edit) {
      api
        .editMessage(edit.id, activeRef.current, content)
        .then((d) => {
          setMessages((prev) => prev.map((m) => (m.id === edit.id ? { ...m, ...d.message } : m)))
          setEdit(null)
          loadChats(userRef.current.id)
        })
        .catch((e) => toast(e.message || 'Не удалось изменить'))
      return
    }
    const body = { content }
    if (reply) body.reply_to = reply.id
    push('text', body, content)
    setReply(null)
  }

  const onTyping = () => {
    if (!activeKey) return
    const now = Date.now()
    if (now - lastTypedAt.current < 1500) return
    lastTypedAt.current = now
    sendSocket({ type: 'typing', chat_key: activeKey })
  }

  const handleFiles = async (fileList, forced) => {
    const files = Array.from(fileList || [])
    if (!files.length) return
    if (!activeRef.current) return toast('Откройте чат')
    for (const f of files) {
      try {
        const prepared = f.type.startsWith('image/') ? await compressImage(f) : f
        const { files: up } = await api.uploadFiles([prepared])
        const meta = up[0]
        const mime = meta.mime || ''
        const kind = forced || (mime.startsWith('image/') ? 'photo' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'file')
        await push(kind, { media: meta }, '')
      } catch (e) {
        toast('Файл не загружен: ' + (e.message || 'ошибка'))
      }
    }
  }

  const onPickAttach = (kind) => {
    setAttachOpen(false)
    if (kind === 'photo') photoInput.current?.click()
    else if (kind === 'file') fileInput.current?.click()
    else if (kind === 'circle') setCircleOpen(true)
    else if (kind === 'location') setLocOpen(true)
    else if (kind === 'contact') setContactOpen(true)
    else if (kind === 'event') setEventOpen(true)
  }

  const onVoiceDone = async (blob, dur) => {
    setVoiceOpen(false)
    try {
      const file = new File([blob], 'voice.webm', { type: blob.type || 'audio/webm' })
      const { files } = await api.uploadFiles([file])
      await push('voice', { media: { ...files[0], dur } }, '')
    } catch (e) {
      toast('Голосовое не загружено: ' + (e.message || 'ошибка'))
    }
  }

  const onCircleDone = async (blob, dur) => {
    setCircleOpen(false)
    try {
      const file = new File([blob], 'circle.webm', { type: blob.type || 'video/webm' })
      const { files } = await api.uploadFiles([file])
      await push('circle', { media: { ...files[0], dur } }, '')
    } catch (e) {
      toast('Видеокружок не загружен: ' + (e.message || 'ошибка'))
    }
  }

  /* ==================== ДЕЙСТВИЯ С СООБЩЕНИЕМ ==================== */

  const openMenu = (payload) => {
    if (!payload) return setMenu(null)
    const me = userRef.current
    const chat = chatsRef.current.find((c) => c.key === activeRef.current)
    const pinned = chat?.pin?.id === payload.msg.id
    setMenu({ ...payload, msg: { ...payload.msg, mine: payload.msg.sender_id === me?.id, pinned } })
  }

  const onMenuAction = async (action, msg) => {
    const key = activeRef.current
    const chat = chatsRef.current.find((c) => c.key === key)
    switch (action) {
      case 'reply':
        setEdit(null)
        setReply({ id: msg.id, sender_id: msg.sender_id, sender_name: msg.sender_id === user.id ? 'Вы' : (displayNameOf(usersById[msg.sender_id]) || displayNameOf(chat?.user) || ''), content: msg.content || '' })
        break
      case 'edit':
        setReply(null)
        setEdit({ id: msg.id, content: msg.content })
        break
      case 'pin':
      case 'unpin':
        try {
          await api.pinMessage(msg.id, key, action === 'unpin')
          toast(action === 'unpin' ? 'Сообщение откреплено' : 'Сообщение закреплено')
          loadChats(user.id)
        } catch (e) { toast(e.message) }
        break
      case 'copy':
        try {
          await navigator.clipboard.writeText(msg.content)
          toast('Текст скопирован')
        } catch { toast('Браузер запретил доступ к буферу обмена') }
        break
      case 'forward':
        setForward([msg])
        break
      case 'select':
        toggleSelect(msg)
        break
      case 'delete':
        try {
          await api.deleteMessage(msg.id, key)
          setMessages((prev) => prev.filter((m) => m.id !== msg.id))
          setSelected((prev) => prev.filter((m) => m.id !== msg.id))
          loadChats(user.id)
        } catch (e) { toast(e.message) }
        break
      default:
        break
    }
  }

  const toggleSelect = (msg) => {
    setSelected((prev) => (prev.some((m) => m.id === msg.id) ? prev.filter((m) => m.id !== msg.id) : [...prev, msg]))
  }

  const doForward = async (targets) => {
    try {
      const ids = (forward || selected).map((m) => m.id)
      await api.forwardMessages(ids, targets)
      toast(`Переслано в ${targets.length} чат(а)`)
      setForward(null)
      setSelected([])
      loadChats(user.id)
    } catch (e) {
      toast(e.message || 'Пересылка не удалась')
    }
  }

  const deleteSelected = async () => {
    const key = activeRef.current
    for (const m of selected) {
      try {
        await api.deleteMessage(m.id, key)
      } catch (e) {
        toast(e.message || 'Не удалось удалить')
      }
    }
    setMessages((prev) => prev.filter((m) => !selected.some((s) => s.id === m.id)))
    setSelected([])
    loadChats(user.id)
  }

  /* ==================== НАСТРОЙКИ ЧАТА ==================== */

  const patchSettings = async (payload) => {
    const key = activeRef.current
    if (!key) return
    try {
      const d = await api.chatSettings(key, payload)
      setChats((prev) => prev.map((c) => (c.key === key ? { ...c, settings: d.settings } : c)))
    } catch (e) {
      toast(e.message || 'Не удалось изменить настройки')
    }
  }

  const pickWallpaper = async (w) => {
    // Пресет с картинкой хранится как image: url берётся из раздачи клиента,
    // поэтому mediaUrl превратит его в абсолютный путь для APK.
    const next = w.k === 'default' ? null : w.url ? { type: 'image', k: w.k, url: w.url } : { type: 'color', k: w.k }
    await patchSettings({ wallpaper: next })
    setWallpaperOpen(false)
  }

  const uploadWallpaper = async () => {
    const inp = document.createElement('input')
    inp.type = 'file'
    inp.accept = 'image/*'
    inp.onchange = async () => {
      const f = inp.files?.[0]
      if (!f) return
      try {
        const prepared = await compressImage(f, 1400, 0.8)
        const d = await api.uploadWallpaper(activeRef.current, prepared)
        setChats((prev) => prev.map((c) => (c.key === activeRef.current ? { ...c, settings: d.settings } : c)))
        setWallpaperOpen(false)
      } catch (e) {
        toast(e.message || 'Файл не загружен')
      }
    }
    inp.click()
  }

  const onChatMenuAction = (action) => {
    const chat = chats.find((c) => c.key === activeKey)
    switch (action) {
      case 'wallpaper': setWallpaperOpen(true); break
      case 'no_copy': patchSettings({ no_copy: !chat?.settings?.no_copy }); toast(chat?.settings?.no_copy ? 'Копирование разрешено' : 'Копирование и экспорт запрещены'); break
      case 'mute': patchSettings({ muted: !chat?.settings?.muted }); break
      case 'export': setExportOpen(true); break
      case 'profile': if (chat?.is_self || chat?.is_channel || chat?.is_group) setProfilePeer(true); else setProfilePeer(true); break
      case 'journal': setChatMenuOpen(false); setJournalOpen(true); break
      case 'group_call': setChatMenuOpen(false); setGroupCallModal(true); break
      case 'clear': setConfirmClear(true); break
      case 'delete': setConfirmDeleteChat(true); break
      default: break
    }
  }

  /* ==================== ПРОФИЛЬ / ЧАТЫ ==================== */

  const saveProfile = async (form) => {
    try {
      const { user: updated } = await api.updateProfile(form)
      userRef.current = updated
      setUser(updated)
      setDirectory(await api.getUsers())
      toast('Профиль обновлён')
    } catch (e) {
      toast(e.message || 'Не удалось сохранить')
    }
  }

  const saveAvatar = async (file) => {
    try {
      const prepared = await compressImage(file, 640, 0.85)
      const { user: updated } = await api.uploadAvatar(prepared)
      userRef.current = updated
      setUser(updated)
      toast('Фото профиля обновлено')
    } catch (e) {
      toast(e.message || 'Фото не загружено')
    }
  }

  const startChat = (peerId) => {
    setNewChatOpen(false)
    setContactOpen(false)
    setProfilePeer(false)
    const me = userRef.current
    if (!me) return
    selectChat(pairKey(me.id, peerId))
  }

  const createdChat = async (payload, kind) => {
    try {
      const me = userRef.current
      if (kind === 'channel') {
        const c = await api.createChannel(payload)
        setGroupOpen(null)
        await loadChats(me.id)
        selectChat('c:' + c.id)
      } else {
        const g = await api.createGroup(payload)
        setGroupOpen(null)
        await loadChats(me.id)
        selectChat('g:' + g.id)
      }
    } catch (e) {
      toast(e.message || 'Не удалось создать')
    }
  }

  const joinChat = async (item, kind) => {
    setBusyIds((s) => new Set(s).add(item.key))
    try {
      if (kind === 'channel') await api.joinChannel(item.id)
      else await api.joinGroup(item.id)
      setNewChatOpen(false)
      await loadChats(user.id)
      selectChat(item.key)
      toast(kind === 'channel' ? 'Вы подписались на канал' : 'Вы вошли в группу')
    } catch (e) {
      toast(e.message || 'Не получилось')
    } finally {
      setBusyIds((s) => {
        const n = new Set(s)
        n.delete(item.key)
        return n
      })
    }
  }

  const openContact = (userId) => {
    const found = directoryRef.current.find((u) => u.id === userId)
    if (!found) return toast('Контакт больше недоступен')
    const me = userRef.current
    activeRef.current = pairKey(me.id, userId)
    setProfilePeer(false)
    selectChat(pairKey(me.id, userId))
  }

  const subscribe = async () => {
    const chat = chats.find((c) => c.key === activeKey)
    if (!chat) return
    try {
      if (chat.is_channel) await api.joinChannel(chat.user.id)
      else await api.joinGroup(chat.user.id)
      await loadChats(user.id)
      toast('Подписка оформлена')
    } catch (e) {
      toast(e.message || 'Не удалось подписаться')
    }
  }

  /* ==================== ИСТОРИИ ==================== */

  const openStory = async (group) => {
    setStoryView({ group, index: 0 })
    const first = group.items[0]
    if (first && !first.seen && first.author_id !== user.id) {
      try {
        await api.viewStory(first.id)
        loadStories()
      } catch { /* не критично */ }
    }
  }

  const navStory = async (index) => {
    if (!storyView) return
    setStoryView({ ...storyView, index })
    const s = storyView.group.items[index]
    if (s && !s.seen && s.author_id !== user.id) {
      try {
        await api.viewStory(s.id)
      } catch { /* ignore */ }
    }
  }

  const publishStory = async (payload) => {
    try {
      await api.addStory(payload)
      setStoryComposer(false)
      loadStories()
      toast('История опубликована на 24 часа')
    } catch (e) {
      toast(e.message || 'Не удалось опубликовать')
    }
  }

  /* ==================== РЕНДЕР ==================== */

  if (booting) {
    return (
      <div className="boot">
        <div className="boot-logo">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4L3 21l1.1-9A8.4 8.4 0 1 1 21 11.5z" />
          </svg>
        </div>
        <div className="boot-spin" />
      </div>
    )
  }

  // В APK без адреса сервера интерфейс строить не на что — сначала спрашиваем адрес
  if (isNativeApp() && getServerBase() === null) {
    return <ServerSetup />
  }

  if (!user) return <AuthScreen onAuthed={onAuthed} />

  const activeChat = chats.find((c) => c.key === activeKey) || null
  const activeChatPin = activeChat?.pin || null
  const peer = activeChat ? activeChat.user : null
  const isGroup = !!activeChat?.is_group
  const isChannel = !!activeChat?.is_channel
  const isSelf = !!activeChat?.is_self
  const typingName = activeKey ? typing[activeKey] : null
  const usersById = Object.fromEntries(directory.map((u) => [u.id, u]))
  // Присутствие приходит ws-событием 'users' при каждом входе/выходе, поэтому
  // лента и зелёные точки не устаревают между опросами.
  const onlineUsers = directory.filter((u) => u.id !== user.id && u.online)
  const settings = activeChat?.settings || {}
  const noCopy = !!settings.no_copy

  const wp = WALLPAPERS.find((w) => w.k === settings.wallpaper?.k)
  const wpUrl = settings.wallpaper?.type === 'image' ? mediaUrl(settings.wallpaper.url) : null
  const bgStyle = settings.wallpaper?.type === 'image'
    ? { backgroundImage: `url(${wpUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : wp?.css
      ? { background: wp.css }
      : undefined
  // Тёмная подложка пузырей нужна на тёмных обоях. Для встроенной картинки это
  // знает сам пресет (dark), для загруженного фото подложку делаем тёмной:
  // предсказать яркость чужого снимка нельзя, а на тёмной текст читается всегда.
  const darkBg = settings.wallpaper?.type === 'image'
    ? wp?.dark !== false
    : !!wp?.dark

  let statusText
  if (isChannel) statusText = peer?.phone || 'канал'
  else if (isGroup) statusText = peer?.phone || 'группа'
  else if (isSelf) statusText = 'заметки для себя'
  else if (typingName) statusText = `${typingName} печатает…`
  else statusText = peer?.presence || (peer?.online ? 'в сети' : 'не в сети')

  const canPost = activeChat?.can_post !== false
  const composerHidden = voiceOpen || circleOpen || !canPost

  return (
    <div className="app" data-view={view}>
      <Sidebar
        chats={chats}
        activeKey={activeKey}
        onSelect={selectChat}
        onMenu={() => setDrawerOpen(true)}
        onNewChat={() => setNewChatOpen(true)}
        theme={theme}
        onTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        stories={stories}
        meId={user.id}
        onOpenStory={openStory}
        onAddStory={() => setStoryComposer(true)}
        tab={tab}
        onTabChange={setTab}
        onlineUsers={onlineUsers}
        onStartChat={startChat}
      />

      {view === 'chat' && peer ? (
        <div className="chat-view" style={bgStyle} data-darkbg={darkBg ? '1' : '0'}>
          <ChatHeader
            peer={peer}
            statusText={statusText}
            typing={!!typingName}
            subscribed={activeChat?.subscribed !== false}
            onSubscribe={subscribe}
            onBack={() => setView('list')}
            onInfo={() => (isSelf ? setProfileMe(true) : setProfilePeer(true))}
            onCall={() => startCall(false)}
            onVideo={() => startCall(true)}
            onMenu={() => setChatMenuOpen((v) => !v)}
          />
          {chatMenuOpen && (
            <ChatMenu chat={activeChat} settings={settings} onClose={() => setChatMenuOpen(false)} onAction={onChatMenuAction} />
          )}

          {gcBanner && gcBanner.chatKey === activeKey && (
            <div className="gc-banner">
              <IconPhoneGroup width={18} height={18} />
              <span className="gc-banner-text">
                {gcBanner.host?.name || 'Участник'}: групповой {gcBanner.video ? 'видео' : 'аудио'}-звонок
              </span>
              <button className="gc-banner-join" onClick={handleJoinGroupCall}>Присоединиться</button>
            </div>
          )}

          <MessageList
            messages={messages.map((m) => ({ ...m, mine: m.sender_id === user.id, pinned: activeChatPin?.id === m.id }))}
            meId={user.id}
            usersById={usersById}
            chat={activeChat}
            pin={activeChatPin}
            selected={selected}
            noCopy={noCopy}
            onToggleSelect={toggleSelect}
            onMenu={openMenu}
            onUnpin={() => onMenuAction('unpin', activeChatPin)}
            onOpenMedia={(url, type) => setLightbox({ url, type })}
            onOpenContact={openContact}
          />

          <SelectionBar
            selected={selected}
            canDelete={selected.every((m) => m.sender_id === user.id) || !!activeChat?.is_admin}
            onForward={() => setForward(selected)}
            onDelete={deleteSelected}
            onClear={() => setSelected([])}
          />

          {!composerHidden && (
            <Composer
              onSend={send}
              onTyping={onTyping}
              onAttach={() => setAttachOpen(true)}
              onVoice={() => setVoiceOpen(true)}
              reply={reply}
              edit={edit}
              onCancelReply={() => setReply(null)}
              onCancelEdit={() => setEdit(null)}
            />
          )}
          {!canPost && !isChannel && <div className="composer-locked">Вы не участник этого чата</div>}
          {!canPost && isChannel && (
            <div className="composer-locked">
              {activeChat?.subscribed === false ? 'Вы не подписаны на канал' : 'Публиковать могут только администраторы'}
            </div>
          )}
          {voiceOpen && <VoiceRecorder onCancel={() => setVoiceOpen(false)} onDone={onVoiceDone} />}
          {circleOpen && (
            <div className="circle-dock">
              <CircleRecorder onCancel={() => setCircleOpen(false)} onDone={onCircleDone} />
            </div>
          )}
        </div>
      ) : (
        <QuickAccess chats={chats} tab={tab} onSelect={selectChat} />
      )}

      <input ref={photoInput} type="file" accept="image/*,video/*" multiple hidden
        onChange={(e) => { handleFiles(e.target.files); e.target.value = '' }} />
      <input ref={fileInput} type="file" multiple hidden
        onChange={(e) => { handleFiles(e.target.files, 'file'); e.target.value = '' }} />

      <MessageMenu menu={menu} onClose={() => setMenu(null)} onAction={onMenuAction} noCopy={noCopy} />

      {attachOpen && <AttachMenu onPick={onPickAttach} onClose={() => setAttachOpen(false)} />}
      {locOpen && <LocationComposer onCancel={() => setLocOpen(false)} onSend={(loc) => push('location', { location: loc }, '')} />}
      {contactOpen && (
        <ContactComposer users={directory} meId={user.id} onCancel={() => setContactOpen(false)}
          onSend={(c) => push('contact', { contact: c }, '')} />
      )}
      {eventOpen && <EventComposer onCancel={() => setEventOpen(false)} onSend={(ev) => push('event', { event: ev }, '')} />}

      {lightbox && <Lightbox item={lightbox} onClose={() => setLightbox(null)} />}

      {forward && (
        <ForwardModal
          chats={chats}
          messages={forward}
          onClose={() => setForward(null)}
          onSend={doForward}
        />
      )}

      {wallpaperOpen && (
        <WallpaperModal
          current={settings.wallpaper}
          onClose={() => setWallpaperOpen(false)}
          onPick={pickWallpaper}
          onUpload={uploadWallpaper}
          onRemove={() => patchSettings({ wallpaper: null })}
        />
      )}

      {exportOpen && (
        <ExportModal
          chat={activeChat}
          onClose={() => setExportOpen(false)}
          onExport={(fmt) => api.exportChat(activeKey, fmt)}
        />
      )}

      {confirmClear && (
        <ConfirmModal
          title="Очистить историю?"
          text={`Все сообщения в «${displayNameOf(peer)}» будут удалены для всех участников.`}
          confirmLabel="Очистить"
          danger
          onConfirm={async () => {
            try {
              await api.clearHistory(activeKey)
              setMessages([])
              loadChats(user.id)
              toast('История очищена')
            } catch (e) { toast(e.message || 'Не удалось очистить') }
          }}
          onClose={() => setConfirmClear(false)}
        />
      )}

      {confirmDeleteChat && (
        <ConfirmModal
          title={isChannel ? 'Отписаться от канала?' : 'Удалить чат?'}
          text={isChannel ? 'Вы выйдете из канала и он исчезнет из вашего списка.' : 'Чат исчезнет из вашего списка. У других участников история сохранится.'}
          confirmLabel={isChannel ? 'Отписаться' : 'Удалить'}
          danger
          onConfirm={async () => {
            try {
              await api.deleteHistory(activeKey)
              setMessages([])
              setActiveKey(null)
              activeRef.current = null
              setView('list')
              await loadChats(user.id)
              toast(isChannel ? 'Вы отписались' : 'Чат удалён')
            } catch (e) { toast(e.message || 'Не удалось удалить') }
          }}
          onClose={() => setConfirmDeleteChat(false)}
        />
      )}

      {drawerOpen && (
        <Drawer
          me={user}
          chats={chats}
          onClose={() => setDrawerOpen(false)}
          onLogout={() => setConfirmLogout(true)}
          onNewGroup={() => { setDrawerOpen(false); setGroupOpen('group') }}
          onNewChannel={() => { setDrawerOpen(false); setGroupOpen('channel') }}
          onProfile={() => setProfileMe(true)}
          theme={theme}
          onTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        />
      )}

      {profileMe && (
        <ProfilePanel
          peer={{ ...user, is_self: true }}
          statusText={user.phone || user.presence}
          isMe
          onClose={() => setProfileMe(false)}
          onSave={saveProfile}
          onAvatar={saveAvatar}
          onFavorites={() => {
            setProfileMe(false)
            const key = 's:' + user.id
            if (chatsRef.current.some((c) => c.key === key)) selectChat(key)
          }}
        />
      )}

      {profilePeer && peer && (
        <ProfilePanel
          peer={peer}
          statusText={statusText}
          onClose={() => setProfilePeer(false)}
          onCall={() => { setProfilePeer(false); startCall(false) }}
          onVideo={() => { setProfilePeer(false); startCall(true) }}
          onMessage={() => setProfilePeer(false)}
        />
      )}

      {newChatOpen && (
        <NewChatModal
          users={directory.filter((u) => u.id !== user.id)}
          busyIds={busyIds}
          discover={(q) => api.discover(q)}
          onJoin={joinChat}
          onPick={startChat}
          onNewGroup={() => { setNewChatOpen(false); setGroupOpen('group') }}
          onNewChannel={() => { setNewChatOpen(false); setGroupOpen('channel') }}
          onPhoneSearch={() => setPhoneSearchOpen(true)}
          onUsernameSearch={() => setUsernameSearchOpen(true)}
          onClose={() => setNewChatOpen(false)}
        />
      )}

      {groupOpen && (
        <GroupModal
          kind={groupOpen}
          users={directory.filter((u) => u.id !== user.id)}
          onClose={() => setGroupOpen(null)}
          onCreate={(payload) => createdChat(payload, groupOpen)}
        />
      )}

      {confirmLogout && (
        <ConfirmModal
          title="Сменить аккаунт?"
          text="Вы выйдете из текущего профиля. История переписки сохранится на сервере."
          confirmLabel="Выйти"
          onConfirm={doLogout}
          onClose={() => setConfirmLogout(false)}
        />
      )}

      {storyComposer && <StoryComposer onCancel={() => setStoryComposer(false)} onPublish={publishStory} />}

      {storyView && (
        <StoryViewer
          group={storyView.group}
          index={storyView.index}
          canDelete={storyView.group.user.id === user.id}
          onNav={navStory}
          onClose={() => setStoryView(null)}
          onDelete={(id) => {
            api.deleteStory(id).then(loadStories).catch(() => {})
          }}
        />
      )}

      {journalOpen && activeChat && (
        <JournalModal chat={activeChat} onClose={() => setJournalOpen(false)} />
      )}

      {phoneSearchOpen && (
        <PhoneSearchModal
          users={directory}
          onClose={() => setPhoneSearchOpen(false)}
          onPick={(u) => { setPhoneSearchOpen(false); setNewChatOpen(false); startChat(u.id) }}
        />
      )}

      {usernameSearchOpen && (
        <UsernameSearchModal
          onClose={() => setUsernameSearchOpen(false)}
          onPick={(u) => { setUsernameSearchOpen(false); setNewChatOpen(false); startChat(u.id) }}
        />
      )}

      {groupCallModal && activeChat && (
        <GroupCallModal
          chat={activeChat}
          onClose={() => setGroupCallModal(false)}
          onStart={handleStartGroupCall}
        />
      )}

      {groupCall && (
        <GroupCallOverlay
          gc={groupCall}
          chat={chats.find((c) => c.key === groupCall.chatKey) || activeChat}
          micOn={groupCall.micOn !== false}
          camOn={groupCall.camOn !== false}
          onToggleMic={handleToggleGcMic}
          onToggleCam={handleToggleGcCam}
          onLeave={handleLeaveGroupCall}
        />
      )}

      {call && (
        <CallOverlay
          call={call}
          video={call.video}
          state={call.state}
          peer={call.peer}
          micOn={call.micOn}
          camOn={call.camOn}
          onAccept={acceptCall}
          onReject={rejectCall}
          onHangup={hangupCall}
          onToggleMic={toggleMic}
          onToggleCam={toggleCam}
          onSwitchCamera={switchCamera}
        />
      )}

      {notice && <div className="toast">{notice}</div>}
    </div>
  )
}
