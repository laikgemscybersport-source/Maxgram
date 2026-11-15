// Менеджер аудио/видеозвонков на WebRTC.
// Сигнализация идёт через общий WebSocket мессенджера (type: 'call').
// Для сетей за симметричным NAT добавьте TURN-сервер в ICE servers ниже.

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  // { urls: 'turn:ваш-turn-сервер:3478', username: 'user', credential: 'pass' },
]

export default class CallManager {
  constructor({ send, onIncoming, onState, onError }) {
    this.send = send            // отправка сигнального объекта в WebSocket
    this.onIncoming = onIncoming
    this.onState = onState      // 'ringing' | 'connecting' | 'active' | 'ended'
    this.onError = onError

    this.pc = null
    this.local = null
    this.remote = null
    this.callId = null
    this.peer = null            // { id, name, avatar }
    this.video = false
    this.micOn = true
    this.camOn = true
    this.dialing = false
  }

  get supported() {
    return typeof RTCPeerConnection !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
  }

  async getMedia(video) {
    if (!this.supported) throw new Error('Браузер не поддерживает WebRTC')
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: video ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
      })
    } catch (e) {
      if (e.name === 'NotAllowedError') throw new Error('Доступ к микрофону/камере запрещён — разрешите его в браузере')
      if (e.name === 'NotFoundError') throw new Error('Не найдено устройство записи')
      throw new Error(e.message)
    }
  }

  createPeer() {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.send({ type: 'call', action: 'ice', call_id: this.callId, to: this.peer.id, candidate: e.candidate })
      }
    }
    pc.ontrack = (e) => {
      this.remote = e.streams[0]
      this.onState('active', { remote: this.remote })
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') this.onState('active', { remote: this.remote })
      if (['failed', 'closed'].includes(pc.connectionState)) this.teardown('ended')
    }
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') this.onError?.('Не удалось установить прямое соединение (проверьте сеть/TURN)')
    }
    return pc
  }

  async start(peer, { video }) {
    if (this.pc) return
    this.video = video
    this.peer = peer
    this.callId = 'c' + Math.random().toString(36).slice(2, 10)

    try {
      this.local = await this.getMedia(video)
    } catch (e) {
      this.onError?.(e.message)
      return this.teardown('failed')
    }

    this.pc = this.createPeer()
    this.local.getTracks().forEach((t) => this.pc.addTrack(t, this.local))

    this.onState('ringing')
    this.dialing = true

    const offer = await this.pc.createOffer()
    await this.pc.setLocalDescription(offer)
    this.send({
      type: 'call',
      action: 'offer',
      call_id: this.callId,
      to: peer.id,
      video,
      sdp: this.pc.localDescription,
    })
  }

  // Входящий offer от собеседника
  async handleSignal(data) {
    if (data.call_id === this.callId || data.action === 'offer') {
      // если уже есть другой активный вызов — отклоняем новый
      if (this.pc && this.callId && data.call_id !== this.callId && data.action === 'offer') {
        this.send({ type: 'call', action: 'reject', call_id: data.call_id, to: data.from, reason: 'busy' })
        return
      }
    }

    switch (data.action) {
      case 'offer': {
        this.callId = data.call_id
        this.peer = { id: data.from, name: data.from_name, avatar: data.from_avatar }
        this.video = !!data.video
        if (!this.pc) {
          try {
            this.local = await this.getMedia(this.video)
          } catch (e) {
            this.onError?.(e.message)
            this.send({ type: 'call', action: 'reject', call_id: data.call_id, to: data.from, reason: 'no-device' })
            return
          }
          this.pc = this.createPeer()
          this.local.getTracks().forEach((t) => this.pc.addTrack(t, this.local))
        }
        this.dialing = false
        await this.pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
        const answer = await this.pc.createAnswer()
        await this.pc.setLocalDescription(answer)
        this.onState('connecting')
        this.send({ type: 'call', action: 'answer', call_id: this.callId, to: this.peer.id, sdp: this.pc.localDescription })
        break
      }

      case 'answer': {
        if (!this.pc) break
        await this.pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
        this.onState('connecting')
        break
      }

      case 'ice': {
        if (!this.pc || !data.candidate) break
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(data.candidate))
        } catch { /* игнорируем поздние кандидаты */ }
        break
      }

      case 'reject':
        this.onError?.(data.reason === 'busy' ? 'Абонент занят' : 'Звонок отклонён')
        this.teardown('ended')
        break

      case 'ended':
        this.teardown('ended', 'Звонок завершён')
        break

      case 'unreachable':
        this.onError?.('Пользователь не в сети')
        this.teardown('ended')
        break

      case 'ringing':
        this.onState('ringing')
        break

      default:
        break
    }
  }

  accept() {
    this.onState('connecting')
  }

  reject() {
    this.send({ type: 'call', action: 'reject', call_id: this.callId, to: this.peer?.id, reason: 'declined' })
    this.teardown('ended')
  }

  hangup() {
    this.send({ type: 'call', action: 'ended', call_id: this.callId, to: this.peer?.id })
    this.teardown('ended')
  }

  toggleMic() {
    if (!this.local) return this.micOn
    this.micOn = !this.micOn
    this.local.getAudioTracks().forEach((t) => (t.enabled = this.micOn))
    return this.micOn
  }

  toggleCam() {
    if (!this.local) return this.camOn
    this.camOn = !this.camOn
    this.local.getVideoTracks().forEach((t) => (t.enabled = this.camOn))
    return this.camOn
  }

  // Сообщаем остальным своим вкладкам, что звонок активен
  announce(state) {
    this.send({ type: 'call', action: state, call_id: this.callId, to: this.peer?.id })
  }

  teardown(nextState, note) {
    this.local?.getTracks().forEach((t) => t.stop())
    try { this.pc?.close() } catch { /* уже закрыт */ }
    this.pc = null
    this.local = null
    this.remote = null
    this.callId = null
    this.peer = null
    this.dialing = false
    this.micOn = true
    this.camOn = true
    this.video = false
    this.onState(nextState || 'ended', { note })
  }
}

/* ==================== ГРУППОВОЙ ЗВОНОК (mesh) ====================
   Отдельный менеджер: на каждого участника свой RTCPeerConnection, сигнализация
   идёт через type:'group_call' общего WebSocket. Mesh прост и не требует SFU —
   его хватает для компании из нескольких человек; для десятков нужен медиасервер. */

export class GroupCallManager {
  constructor({ send, onState, onError }) {
    this.send = send
    this.onState = onState   // ({ state, peers, local, video })
    this.onError = onError

    this.callId = null
    this.chatKey = null
    this.meId = null
    this.video = false
    this.micOn = true
    this.camOn = true
    this.local = null
    this.peers = {}          // userId -> { id, name, pc, remote, polite }
    this.pendingIce = {}     // userId -> [candidate] (до появления RTCPeerConnection)
  }

  get supported() {
    return typeof RTCPeerConnection !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
  }

  async getMedia(video) {
    if (!this.supported) throw new Error('Браузер не поддерживает WebRTC')
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: video ? { width: { ideal: 640 }, height: { ideal: 360 }, facingMode: 'user' } : false,
      })
    } catch (e) {
      if (e.name === 'NotAllowedError') throw new Error('Доступ к микрофону/камере запрещён — разрешите его в браузере')
      if (e.name === 'NotFoundError') throw new Error('Не найдено устройство записи')
      throw new Error(e.message)
    }
  }

  emit(state) {
    this.onState({
      state,
      peers: Object.values(this.peers).map((p) => ({ id: p.id, name: p.name, remote: p.remote, connected: p.pc?.connectionState === 'connected' })),
      local: this.local,
      video: this.video,
      micOn: this.micOn,
      camOn: this.camOn,
    })
  }

  // Вход в комнату: otherIds — те, кто уже в звонке (кроме нас)
  async join({ call, meId, video, others }) {
    if (this.callId === call.id) return
    this.video = !!video
    try {
      this.local = await this.getMedia(this.video)
    } catch (e) {
      this.onError?.(e.message)
      throw e
    }
    this.callId = call.id
    this.chatKey = call.chat_key
    this.meId = meId
    this.emit('connecting')
    // Мы «невежливая» сторона по отношению к тем, кто уже в комнате: offer шлём только мы
    for (const id of others || []) this.addPeer(id, { polite: false, initiate: true })
    this.emit('active')
  }

  addPeer(id, { polite, initiate }) {
    if (!id || id === this.meId || this.peers[id]) return this.peers[id]
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    const peer = { id, name: id, pc, remote: null, polite: !!polite, makingOffer: false }
    this.peers[id] = peer

    this.local?.getTracks().forEach((t) => pc.addTrack(t, this.local))

    pc.onicecandidate = (e) => {
      if (e.candidate) this.send({ type: 'group_call', action: 'ice', call_id: this.callId, target: id, candidate: e.candidate })
    }
    pc.ontrack = (e) => {
      peer.remote = e.streams[0]
      this.emit('active')
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') this.emit('active')
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) this.removePeer(id)
    }
    pc.onnegotiationneeded = async () => {
      if (!polite) await this.makeOffer(id)
    }

    const queued = this.pendingIce[id] || []
    delete this.pendingIce[id]
    queued.forEach((c) => this.addIce(id, c))

    if (initiate) this.makeOffer(id)
    this.emit('active')
    return peer
  }

  async makeOffer(id) {
    const peer = this.peers[id]
    if (!peer) return
    try {
      peer.makingOffer = true
      const offer = await peer.pc.createOffer()
      if (peer.pc.signalingState !== 'stable') return
      await peer.pc.setLocalDescription(offer)
      this.send({ type: 'group_call', action: 'offer', call_id: this.callId, target: id, sdp: peer.pc.localDescription })
    } catch (e) {
      this.onError?.('Не удалось предложить соединение: ' + e.message)
    } finally {
      peer.makingOffer = false
    }
  }

  async addIce(id, candidate) {
    const peer = this.peers[id]
    if (!peer || !candidate) return
    try {
      await peer.pc.addIceCandidate(new RTCIceCandidate(candidate))
    } catch { /* поздний кандидат — игнорируем */ }
  }

  removePeer(id) {
    const peer = this.peers[id]
    if (!peer) return
    try { peer.pc?.close() } catch { /* уже закрыт */ }
    delete this.peers[id]
    this.emit(this.callId ? 'active' : 'ended')
  }

  // Обработка сигнального пакета от сервера (уже отфильтрованного по target)
  async handleSignal(data) {
    if (!this.callId || data.call_id !== this.callId) return
    const from = data.from
    if (!from || from === this.meId) return

    switch (data.action) {
      case 'offer': {
        const peer = this.addPeer(from, { polite: true, initiate: false }) || this.peers[from]
        if (!peer) return
        peer.name = data.from_name || peer.name
        try {
          const offerCollision = data.sdp && peer.pc.signalingState !== 'stable'
          if (offerCollision) return
          await peer.pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
          const answer = await peer.pc.createAnswer()
          await peer.pc.setLocalDescription(answer)
          this.send({ type: 'group_call', action: 'answer', call_id: this.callId, target: from, sdp: peer.pc.localDescription })
          this.emit('active')
        } catch (e) {
          this.onError?.('Ошибка соединения: ' + e.message)
        }
        break
      }

      case 'answer': {
        const peer = this.peers[from]
        if (!peer) break
        try {
          await peer.pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
          const queued = this.pendingIce[from] || []
          delete this.pendingIce[from]
          queued.forEach((c) => this.addIce(from, c))
          this.emit('active')
        } catch { /* игнорируем */ }
        break
      }

      case 'ice': {
        if (!this.peers[from]) {
          this.pendingIce[from] = (this.pendingIce[from] || []).concat([data.candidate])
          break
        }
        this.addIce(from, data.candidate)
        break
      }

      case 'leave':
        this.removePeer(from)
        break

      default:
        break
    }
  }

  // Кто-то вошёл в комнату, когда мы уже в ней — ждём его offer, сами не инициируем
  peerJoined(id, name) {
    if (!this.callId || !id || id === this.meId) return
    const peer = this.addPeer(id, { polite: true, initiate: false })
    if (peer && name) peer.name = name
  }

  toggleMic() {
    this.micOn = !this.micOn
    this.local?.getAudioTracks().forEach((t) => (t.enabled = this.micOn))
    this.emit('active')
    return this.micOn
  }

  toggleCam() {
    this.camOn = !this.camOn
    this.local?.getVideoTracks().forEach((t) => (t.enabled = this.camOn))
    this.emit('active')
    return this.camOn
  }

  leave() {
    if (this.callId) this.send({ type: 'group_call', action: 'leave', call_id: this.callId })
    this.callId = null
    this.chatKey = null
    this.stop()
    this.emit('ended')
  }

  stop() {
    for (const id of Object.keys(this.peers)) {
      try { this.peers[id].pc?.close() } catch { /* уже закрыт */ }
      delete this.peers[id]
    }
    this.local?.getTracks().forEach((t) => t.stop())
    this.local = null
    this.pendingIce = {}
    this.micOn = true
    this.camOn = true
  }
}
