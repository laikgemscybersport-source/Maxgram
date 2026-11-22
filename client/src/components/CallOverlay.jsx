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
  IconHeadphones,
} from './Icons.jsx'
import { DevicePicker, useDeviceList, micId, speakerId, camId, setMicId, setSpeakerId, setCamId, applySink } from './DeviceSelector.jsx'

// Полноэкранное окно звонка.
export default function CallOverlay({ call, video, state, peer, micOn, camOn, onAccept, onReject, onHangup, onToggleMic, onToggleCam, onSwitchCamera, note }) {
  const remoteRef = useRef(null)
  const localRef = useRef(null)
  const [secs, setSecs] = useState(0)
  const [picker, setPicker] = useState(null) // 'mic' | 'spk' | 'cam'

  const { mics, speakers, cameras } = useDeviceList()

  // Вывод собеседника идёт в выбранные наушники (setSinkId).
  useEffect(() => {
    if (remoteRef.current) applySink(remoteRef.current, speakers)
  }, [call.remote, state, speakers])

  useEffect(() => {
    if (remoteRef.current && call.remote && remoteRef.current.srcObject !== call.remote) {
      remoteRef.current.srcObject = call.remote
    }
  }, [call.remote, state])

  useEffect(() => {
    if (localRef.current && call.local && localRef.current.srcObject !== call.local) {
      localRef.current.srcObject = call.local
    }
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
  const close = () => setPicker(null)
  const nameOf = (list, id, fb) => list.find((d) => d.deviceId === id)?.label || fb

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
            {/* Микрофон: вкл/выкл + выбор устройства */}
            <div className="call-device">
              <button className={`call-btn ${micOn ? '' : 'off'}`} onClick={onToggleMic} title="Микрофон">
                {micOn ? <IconMic width={24} height={24} /> : <IconMicOff width={24} height={24} />}
              </button>
              <DevicePicker
                open={picker === 'mic'}
                onToggle={() => setPicker(picker === 'mic' ? null : 'mic')}
                onClose={close}
                items={mics}
                value={micId()}
                placeholder="Микрофон"
                title={nameOf(mics, micId(), 'Выбрать микрофон')}
                note="Сработает при следующем звонке"
                onChange={(id) => { setMicId(id); close() }}
              />
            </div>

            {/* Наушники: куда выводить звук собеседника */}
            <div className="call-device">
              <button className="call-btn" title="Наушники"><IconHeadphones width={24} height={24} /></button>
              <DevicePicker
                open={picker === 'spk'}
                onToggle={() => setPicker(picker === 'spk' ? null : 'spk')}
                onClose={close}
                items={speakers}
                value={speakerId()}
                placeholder="Наушники"
                title={nameOf(speakers, speakerId(), 'Выбрать наушники')}
                note="Звук переключается сразу"
                onChange={(id) => { setSpeakerId(id); close() }}
              />
            </div>

            {video && (
              <>
                <div className="call-device">
                  <button className={`call-btn ${camOn ? '' : 'off'}`} onClick={onToggleCam} title="Камера">
                    {camOn ? <IconVideo width={24} height={24} /> : <IconVideoOff width={24} height={24} />}
                  </button>
                  <DevicePicker
                    open={picker === 'cam'}
                    onToggle={() => setPicker(picker === 'cam' ? null : 'cam')}
                    onClose={close}
                    items={cameras}
                    value={camId()}
                    placeholder="Камера"
                    title={nameOf(cameras, camId(), 'Выбрать камеру')}
                    note="Сработает при следующем звонке"
                    onChange={(id) => { setCamId(id); close() }}
                  />
                </div>
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
