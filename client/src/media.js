// Запись голоса и видеокружка через MediaRecorder.
// Голосовое → audio/webm (Telegram пишет ogg/opus, но webm шире всего поддержан в браузерах).
// Видеокружок → короткое видео с квадратной дорожкой, снимается через getUserMedia.

function pickMime(candidates) {
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c
  }
  return ''
}

export const canRecord = () =>
  typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

export async function recordVoice({ onStop, onError, maxSec = 120 }) {
  let stream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch (e) {
    onError?.(e.name === 'NotAllowedError' ? 'Разрешите доступ к микрофону' : 'Микрофон недоступен')
    return null
  }

  const mimeType = pickMime(['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'])
  let rec
  try {
    rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop())
    onError?.('Запись звука не поддерживается этим браузером')
    return null
  }

  const chunks = []
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  const timer = setTimeout(() => stop(), maxSec * 1000)

  function stop() {
    clearTimeout(timer)
    if (rec.state !== 'inactive') rec.stop()
  }

  rec.onstop = () => {
    stream.getTracks().forEach((t) => t.stop())
    const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' })
    onStop?.(blob, Math.round((Date.now() - startedAt) / 1000))
  }

  const startedAt = Date.now()
  rec.start(250)
  return { stop, cancel: () => { chunks.length = 0; stop() }, stream }
}

// Запись видеокружка (круглая аватарка-видео, как в Telegram).
// stream можно передать извне — тогда пишем в уже показанный предпросмотр, не
// переоткрывая камеру: на ПК переоткрытие сразу после stop() упиралось в занятую
// камеру (NotReadableError) и давало чёрный круг вместо себя в кадре.
export async function recordCircle({ stream: provided, onStop, onError, maxSec = 60 }) {
  let stream = provided
  if (!stream) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 640 }, facingMode: 'user' },
        audio: true,
      })
    } catch (e) {
      onError?.(e.name === 'NotAllowedError' ? 'Разрешите доступ к камере' : 'Камера недоступна')
      return null
    }
  }

  const mimeType = pickMime(['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'])
  let rec
  try {
    rec = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 900000 } : undefined)
  } catch {
    stream.getTracks().forEach((t) => t.stop())
    onError?.('Видеозапись не поддерживается этим браузером')
    return null
  }

  const chunks = []
  let cancelled = false
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  const startedAt = Date.now()
  const timer = setTimeout(() => stop(), maxSec * 1000)

  function stop() {
    clearTimeout(timer)
    if (rec.state !== 'inactive') rec.stop()
  }

  rec.onstop = () => {
    // Запись закончена (стоп, отмена или лимит времени) — камера больше не нужна.
    // stop() на уже остановленном треке безопасен, так что повторный вызов из
    // компонента не страшен.
    stream.getTracks().forEach((t) => t.stop())
    if (cancelled) return
    const blob = new Blob(chunks, { type: rec.mimeType || 'video/webm' })
    onStop?.(blob, Math.round((Date.now() - startedAt) / 1000))
  }

  rec.start(250)
  return {
    stop,
    cancel: () => { cancelled = true; chunks.length = 0; stop() },
    stream,
    preview: stream,
  }
}

export function fmtDur(sec) {
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Сжимает фото перед отправкой, чтобы не гигабайты гонять
export function compressImage(file, maxSide = 1600, quality = 0.82) {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/') || file.size < 200_000) return resolve(file)
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((b) => {
        URL.revokeObjectURL(url)
        if (!b) return resolve(file)
        resolve(new File([b], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }))
      }, 'image/jpeg', quality)
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
    img.src = url
  })
}
