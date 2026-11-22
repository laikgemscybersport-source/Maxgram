// React-обёртки над devices.js: хук живого списка устройств и выпадающий
// список выбора (стрелка рядом с кнопкой микрофона/наушников, как на ПК-звонках).

import { useState, useEffect, useRef, useCallback } from 'react'
import { IconChevronDown } from './Icons.jsx'
import { listDevices, byKind } from '../devices.js'

export {
  micId, speakerId, camId, setMicId, setSpeakerId, setCamId,
  audioConstraints, videoConstraints, deviceName, applySink,
} from '../devices.js'

// Хук: живой список устройств (обновляется на devicechange).
export function useDeviceList() {
  const [devices, setDevices] = useState([])

  const refresh = useCallback(async () => {
    const list = await listDevices()
    setDevices(list)
    return list
  }, [])

  useEffect(() => {
    refresh()
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh)
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', refresh)
  }, [refresh])

  return {
    all: devices,
    mics: byKind(devices, 'audioinput'),
    speakers: byKind(devices, 'audiooutput'),
    cameras: byKind(devices, 'videoinput'),
    refresh,
  }
}

// Стрелка ▾ у кнопки устройства, открывающая список подключённых девайсов.
export function DevicePicker({ open, onToggle, onClose, items, value, onChange, title, placeholder, note }) {
  const box = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (box.current && !box.current.contains(e.target)) onClose() }
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  const current = (items || []).find((d) => d.deviceId === value)

  return (
    <div className="device-picker" ref={box}>
      <button
        type="button"
        className={`device-picker-btn ${open ? 'open' : ''}`}
        onClick={onToggle}
        title={title || (current ? current.label : placeholder)}
        aria-haspopup="listbox"
        aria-expanded={!!open}
      >
        <IconChevronDown width={15} height={15} />
      </button>

      {open && (
        <div className="device-menu" role="listbox">
          <div className="device-menu-head">{placeholder}</div>
          <button
            type="button"
            className={`device-item ${!value ? 'sel' : ''}`}
            role="option"
            aria-selected={!value}
            onClick={() => onChange('')}
          >
            <span className="device-item-name">Системное по умолчанию</span>
            {!value && <span className="device-item-check">✓</span>}
          </button>
          {(items || []).map((d) => (
            <button
              key={d.deviceId}
              type="button"
              className={`device-item ${value === d.deviceId ? 'sel' : ''}`}
              role="option"
              aria-selected={value === d.deviceId}
              onClick={() => onChange(d.deviceId)}
            >
              <span className="device-item-name">{d.label || placeholder}</span>
              {value === d.deviceId && <span className="device-item-check">✓</span>}
            </button>
          ))}
          {(items || []).length === 0 && <div className="device-empty">Устройства не найдены</div>}
          {note && <div className="device-menu-note">{note}</div>}
        </div>
      )}
    </div>
  )
}
