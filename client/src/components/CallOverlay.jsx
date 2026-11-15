import React, { useEffect, useRef, useState } from 'react'
import { Avatar } from './ui.jsx'
import {
  IconPhone,
  IconClose,
  IconMic,
  IconVideo,
  IconMicOff,
  IconVideoOff,
  IconSwitchCamera,
} from './Icons.jsx'

// Полноэкранное окно звонка
export default function CallOverlay({ call, video, state, peer, micOn, camOn, onAccept, onReject, onHangup, onToggleMic, onToggleCam, onSwitchCamera, note }) {
  const remoteRef = useRef(null)
  const localRef = useRef(null)
  const [secs, setSecs] = useState(0)

  useEffect(() => {
    if (remoteRef.current && call.remote) remoteRef.current.srcObject = call.remote
  }, [call.remote, state])

  useEffect(() => {
    if (localRef.current && call.local) localRef.current.srcObject = call.local
  }, [call.local])

  useEffect(() => {
    if (state !== 'active') return setSecs(0)
    const t = setInterval(() => setSecs((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [state])

  const mm = String(Math.floor(secs / 60)).padStart(2, '0')
  const ss = String(secs % 60).padStart(2, '0')

  const label =
    state === 'ringing' ? (call.incoming ? 'Входящий звонок…' : 'Гудки…')
    : state === 'connecting' ? 'Соединение…'
    : state === 'active' ? `${mm}:${ss}`
    : 'Завершён'

  const avatarUser = { id: peer?.id || 'x', name: peer?.name || 'Звонок', avatar: peer?.avatar }

  return (
    <div className="call-overlay">
      <video ref={remoteRef} autoPlay playsInline className={video ? 'call-video' : 'call-video hidden'} />
      {!video && <div className="call-poster"><Avatar user={avatarUser} size="xl" ring={false} /></div>}

      {video && call.local && (
        <video ref={localRef} autoPlay playsInline muted className="call-pip" />
      )}

      <div className="call-top">
        <div className="call-name">{peer?.name || 'Неизвестный'}</div>
        <div className="call-state">{label}</div>
      </div>

      {note && <div className="call-note">{note}</div>}

      <div className="call-controls">
        {state === 'ringing' && call.incoming ? (
          <>
            <button className="call-btn accept" onClick={onAccept} title="Ответить">
              <IconPhone width={26} height={26} />
            </button>
            <button className="call-btn reject" onClick={onReject} title="Отклонить">
              <IconClose width={26} height={26} />
            </button>
          </>
        ) : (
          <>
            <button className={`call-btn ${micOn ? '' : 'off'}`} onClick={onToggleMic} title="Микрофон">
              {micOn ? <IconMic width={24} height={24} /> : <IconMicOff width={24} height={24} />}
            </button>
            {video && (
              <>
                <button className={`call-btn ${camOn ? '' : 'off'}`} onClick={onToggleCam} title="Камера">
                  {camOn ? <IconVideo width={24} height={24} /> : <IconVideoOff width={24} height={24} />}
                </button>
                <button className="call-btn" onClick={onSwitchCamera} title="Сменить камеру">
                  <IconSwitchCamera width={24} height={24} />
                </button>
              </>
            )}
            <button className="call-btn reject" onClick={onHangup} title="Завершить">
              <IconPhone width={24} height={24} style={{ transform: 'rotate(135deg)' }} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
