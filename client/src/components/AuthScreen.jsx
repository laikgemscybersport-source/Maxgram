import React, { useState, useRef, useEffect } from 'react'
import { api } from '../api'
import { IconLogo, IconArrowLeft, IconClose } from './Icons.jsx'

// Экран входа: телефон → код из SMS → создание профиля, плюс OAuth-провайдеры
export default function AuthScreen({ onAuthed }) {
  const [step, setStep] = useState('phone') // phone | code | profile
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [demoCode, setDemoCode] = useState(null)
  const [ttl, setTtl] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [providers, setProviders] = useState({})
  const [smsProvider, setSmsProvider] = useState('demo')
  const [smsInfo, setSmsInfo] = useState({ ready: true, name: 'demo', missing: [] })

  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')

  const codeRef = useRef(null)
  const timerRef = useRef(null)

  useEffect(() => {
    api.providers().then((d) => {
      setProviders(d.providers || {})
      setSmsProvider(d.sms_provider || 'demo')
      setSmsInfo({
        ready: d.sms_ready !== false,
        name: d.sms_name || d.sms_provider || 'demo',
        missing: d.sms_missing || [],
      })
    }).catch(() => {})
    return () => clearInterval(timerRef.current)
  }, [])

  useEffect(() => {
    if (step === 'code' && codeRef.current) codeRef.current.focus()
  }, [step])

  const startCountdown = (sec) => {
    setTtl(sec)
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => setTtl((t) => (t <= 1 ? 0 : t - 1)), 1000)
  }

  const formatInput = (raw) => {
    let d = raw.replace(/\D/g, '')
    if (d.startsWith('8')) d = '7' + d.slice(1)
    if (d && !d.startsWith('7')) d = '7' + d
    d = d.slice(0, 11)
    if (d.length <= 1) return '+' + d
    let out = '+7'
    if (d.length > 1) out += ' (' + d.slice(1, 4)
    if (d.length >= 4) out += ') ' + d.slice(4, 7)
    if (d.length >= 7) out += '-' + d.slice(7, 9)
    if (d.length >= 9) out += '-' + d.slice(9, 11)
    return out
  }

  const askCode = async () => {
    setError('')
    setBusy(true)
    try {
      const res = await api.sendCode(phone)
      setDemoCode(res.demo_code || null)
      setCode('')
      setStep('code')
      startCountdown(res.ttl_sec || 300)
      if (!res.sent && !res.demo) setError('SMS не отправлены: проверьте настройки провайдера')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const checkCode = async (value) => {
    setError('')
    setBusy(true)
    try {
      const res = await api.verifyCode(phone, value)
      if (res.needs_profile) {
        setStep('profile')
      } else if (res.token) {
        onAuthed(res.token, res.user)
      }
    } catch (e) {
      setError(e.message)
      setCode('')
      if (codeRef.current) codeRef.current.value = ''
    } finally {
      setBusy(false)
    }
  }

  const onCodeChange = (raw) => {
    const digits = raw.replace(/\D/g, '').slice(0, 5)
    setCode(digits)
    if (digits.length === 5) checkCode(digits)
  }

  const finishRegister = async () => {
    setError('')
    if (!name.trim()) return setError('Укажите имя')
    setBusy(true)
    try {
      const res = await api.register({ phone, name: name.trim(), username, bio })
      onAuthed(res.token, res.user)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  // У OK ключи называются иначе, чем у остальных: public_key + api_secret.
  const oauthKeysHint = (id) => (id === 'ok' ? 'public_key и api_secret' : 'client_id и client_secret')

  const startOauth = async (id) => {
    setError('')
    if (!providers[id]?.configured) {
      setError(`${providers[id]?.label || id}: нужно вписать ${oauthKeysHint(id)} в messenger/secrets.js — образец в secrets.example.js, проверка npm run doctor`)
      return
    }
    setBusy(true)
    try {
      localStorage.removeItem('mg:oauth:done')
      const { url } = await api.oauthStart(id)
      const win = window.open(url, '_blank', 'width=520,height=680')

      // Сервер сам меняет code на профиль и кладёт наш токен в localStorage,
      // который общий с этим окном (один origin) — остаётся его подхватить.
      const poll = setInterval(async () => {
        if (localStorage.getItem('mg:oauth:done') !== id) return
        clearInterval(poll)
        clearTimeout(guard)
        localStorage.removeItem('mg:oauth:done')
        try { win && win.close() } catch { /* уже закрыто */ }
        const token = localStorage.getItem('mg-token')
        if (!token) {
          setError('Не удалось получить сессию — попробуйте ещё раз')
          setBusy(false)
          return
        }
        try {
          const { user } = await api.me()
          onAuthed(token, user)
        } catch (e) {
          setError(e.message || 'Сессия не подтверждена')
          setBusy(false)
        }
      }, 400)

      const guard = setTimeout(() => {
        clearInterval(poll)
        if (busy) setBusy(false)
      }, 180000)
      void guard
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <div className="login-card">
        <div className="login-logo"><IconLogo width={38} height={38} /></div>

        {step === 'phone' && (
          <>
            <h1>MAXgram</h1>
            <p>Введите номер телефона — мы отправим SMS с кодом подтверждения.</p>
            <input
              className="search-input"
              style={{ width: '100%', marginBottom: 12, textAlign: 'center', fontSize: 17 }}
              placeholder="+7 (999) 123-45-67"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(formatInput(e.target.value))}
              onKeyDown={(e) => e.key === 'Enter' && phone.replace(/\D/g, '').length >= 11 && askCode()}
            />
            {error && <div className="auth-error">{error}</div>}
            <button className="auth-primary" disabled={busy || phone.replace(/\D/g, '').length < 11} onClick={askCode}>
              {busy ? 'Отправляем…' : 'Получить код по SMS'}
            </button>

            <div className="auth-divider">или войдите через</div>
            <div className="oauth-grid">
              {Object.entries(providers).map(([id, p]) => (
                <button key={id} className={`oauth-btn oauth-${id}`} onClick={() => startOauth(id)} title={p.configured ? 'Войти' : 'Не настроен'}>
                  <span className="oauth-ico">{id === 'google' ? 'G' : id === 'yandex' ? 'Я' : id === 'vk' ? 'VK' : 'OK'}</span>
                  {p.label}
                  {!p.configured && <span className="oauth-off">не настроен</span>}
                </button>
              ))}
            </div>
            {smsProvider === 'demo' && (
              <p className="auth-note">
                Демо-режим SMS: код покажется на экране. Реальная доставка включается в messenger/secrets.js
              </p>
            )}
            {smsProvider !== 'demo' && !smsInfo.ready && (
              <p className="auth-note auth-note-warn">
                Выбран шлюз {smsInfo.name}, но не хватает ключей: {smsInfo.missing.join(', ')}. Пока вход по SMS недоступен.
              </p>
            )}
            {smsProvider !== 'demo' && smsInfo.ready && (
              <p className="auth-note">SMS отправляет {smsInfo.name}</p>
            )}
          </>
        )}

        {step === 'code' && (
          <>
            <button className="auth-back" onClick={() => { setStep('phone'); setError(''); clearInterval(timerRef.current) }}>
              <IconArrowLeft width={20} height={20} /> Назад
            </button>
            <h1>Код подтверждения</h1>
            <p>Мы отправили 5-значный код на {phone}</p>

            {demoCode && (
              <div className="demo-code">
                Демо-режим: ваш код <b>{demoCode}</b>
                <button className="demo-fill" onClick={() => onCodeChange(demoCode)}>Подставить</button>
              </div>
            )}

            <input
              ref={codeRef}
              className="search-input code-input"
              style={{ width: '100%', marginBottom: 12, textAlign: 'center', fontSize: 26, letterSpacing: 10 }}
              placeholder="•••••"
              inputMode="numeric"
              value={code}
              onChange={(e) => onCodeChange(e.target.value)}
            />
            {error && <div className="auth-error">{error}</div>}

            <button className="auth-ghost" disabled={busy || ttl > 0} onClick={askCode}>
              {ttl > 0 ? `Отправить снова через ${ttl} с` : 'Отправить код ещё раз'}
            </button>
          </>
        )}

        {step === 'profile' && (
          <>
            <h1>Новый аккаунт</h1>
            <p>Номер {phone} подтверждён. Создайте личный профиль.</p>
            <div className="field">
              <label>Имя *</label>
              <input className="search-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Как вас зовут" maxLength={40} />
            </div>
            <div className="field">
              <label>Имя пользователя</label>
              <div className="username-wrap">
                <span>@</span>
                <input className="search-input" value={username} onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))} placeholder="nickname" maxLength={24} />
              </div>
            </div>
            <div className="field">
              <label>О себе</label>
              <input className="search-input" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Пара слов о вас" maxLength={140} />
            </div>
            {error && <div className="auth-error">{error}</div>}
            <button className="auth-primary" disabled={busy} onClick={finishRegister}>
              {busy ? 'Создаём…' : 'Создать профиль'}
            </button>
            <button className="auth-ghost" onClick={() => setStep('code')}>
              <IconClose width={16} height={16} /> Назад к коду
            </button>
          </>
        )}
      </div>
    </div>
  )
}
