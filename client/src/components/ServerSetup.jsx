import React, { useState } from 'react'
import { setServerBase, getServerBase, apiUrl } from '../api'
import { IconLogo, IconClose } from './Icons.jsx'

/*
 * Экран адреса сервера. Нужен только в нативной оболочке (APK): страница грузится
 * из самого приложения, поэтому адрес бэкенда нельзя вывести из window.location.
 * Перед сохранением адрес проверяется запросом к /api/health, чтобы не оставлять
 * пользователя с пустым интерфейсом из-за опечатки.
 */
export default function ServerSetup({ onClose, onSaved }) {
  const [url, setUrl] = useState(getServerBase() || '')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [ok, setOk] = useState(false)

  const check = async (base) => {
    const res = await fetch(base + '/api/health', { method: 'GET' })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    return res.json()
  }

  const submit = async () => {
    const v = url.trim().replace(/\/+$/, '')
    if (!v) { setErr('Введите адрес сервера'); return }
    let parsed
    try {
      parsed = new URL(/^https?:\/\//i.test(v) ? v : 'https://' + v)
    } catch {
      setErr('Некорректный адрес')
      return
    }
    const base = parsed.origin
    setErr('')
    setBusy(true)
    try {
      await check(base)
      setServerBase(base)
      setOk(true)
      setBusy(false)
      // Дальше приложение перечитывает состояние с новым базовым адресом
      if (onSaved) onSaved(base)
      else setTimeout(() => window.location.reload(), 400)
    } catch (e) {
      setBusy(false)
      setErr('Сервер не отвечает: ' + (e.message || 'ошибка сети'))
    }
  }

  return (
    <div className="server-setup">
      <div className="setup-card">
        <div className="setup-ico"><IconLogo width={30} height={30} /></div>
        <h2 className="auth-title">Адрес сервера</h2>
        <p className="setup-hint">
          Приложение подключается к вашему серверу MAXgram. Укажите его адрес, например
          <b> https://maxgram.example.com</b> или <b>http://192.168.1.10:3000</b> в локальной сети.
        </p>
        <input
          className="setup-input"
          placeholder="https://…"
          value={url}
          onChange={(e) => { setUrl(e.target.value); setErr(''); setOk(false) }}
          onKeyDown={(e) => e.key === 'Enter' && !busy && submit()}
          autoFocus
          inputMode="url"
          autoCapitalize="none"
          spellCheck="false"
        />
        {err && <div className="auth-error">{err}</div>}
        {ok && <div className="setup-ok">Сервер отвечает, подключаюсь…</div>}
        <button className="auth-primary" disabled={busy || !url.trim()} onClick={submit}>
          {busy ? 'Проверка…' : 'Подключиться'}
        </button>
        {onClose && (
          <button className="auth-ghost" onClick={onClose}>
            <IconClose width={18} height={18} /> Отмена
          </button>
        )}
        <p className="setup-note">
          {apiUrl('/health').startsWith('/') ? 'Сейчас используется тот же сервер, что и страница.' : 'Текущий адрес: ' + (getServerBase() || '—')}
        </p>
      </div>
    </div>
  )
}
