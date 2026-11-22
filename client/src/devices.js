// Выбор устройств ввода/вывода: микрофон, наушники, камера.
// Выбранные deviceId хранятся в localStorage и подставляются в getUserMedia
// для видеокружка, личных и групповых звонков.
//
// Модуль намеренно без React: его использует webrtc.js (CallManager,
// GroupCallManager) и компоненты Attachments/DeviceSelector.

const KEY_MIC = 'mg_mic_deviceId'
const KEY_SPK = 'mg_speaker_deviceId'
const KEY_CAM = 'mg_cam_deviceId'

function saved(key) {
  try { return localStorage.getItem(key) || '' } catch { return '' }
}
function store(key, val) {
  try { if (val) localStorage.setItem(key, val); else localStorage.removeItem(key) } catch { /* ignore */ }
}

export const micId = () => saved(KEY_MIC)
export const speakerId = () => saved(KEY_SPK)
export const camId = () => saved(KEY_CAM)

export const setMicId = (id) => store(KEY_MIC, id)
export const setSpeakerId = (id) => store(KEY_SPK, id)
export const setCamId = (id) => store(KEY_CAM, id)

// Актуальный список устройств (для проверки живости сохранённого id).
export async function listDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return []
  try { return await navigator.mediaDevices.enumerateDevices() } catch { return [] }
}

export const byKind = (list, kind) => (list || []).filter((d) => d.kind === kind)

// Название устройства по deviceId (пустая строка, если не выбрано/не найдено).
// list — уже отфильтрованный массив нужного kind.
export function deviceName(list, id) {
  if (!id) return ''
  return (list || []).find((d) => d.deviceId === id)?.label || ''
}

// getUserMedia отклоняет deviceId.exact для неизвестного устройства (наушники
// выключили, камеру отсоединили). Если сохранённого id нет в списке — молча
// падаем на системное устройство по умолчанию, иначе звонок не начнётся.
function usable(id, list, kind) {
  return id && byKind(list, kind).some((d) => d.deviceId === id) ? id : ''
}

// Аудио-констрейнты с учётом сохранённого микрофона.
export function audioConstraints(devices) {
  const base = { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
  const id = usable(micId(), devices, 'audioinput')
  return id ? { ...base, deviceId: { exact: id } } : base
}

// Видео-констрейты с учётом сохранённой камеры.
// Только ideal для размеров: веб-камеры не умеют квадрат, точные значения
// вызвали бы OverconstrainedError и «Камера недоступна» вместо превью.
export function videoConstraints(devices, { facingMode = 'user', w = 1280, h = 720 } = {}) {
  const base = { width: { ideal: w }, height: { ideal: h } }
  const id = usable(camId(), devices, 'videoinput')
  // deviceId.exact и facingMode конфликтуют на ПК с одной камерой — id важнее.
  return id ? { ...base, deviceId: { exact: id } } : { ...base, facingMode }
}

// Вывод звука конкретного <video> в выбранные наушники.
// setSinkId есть не во всех браузерах — тихо игнорируем, звук пойдёт в системные.
export async function applySink(el, devices) {
  if (!el || !('setSinkId' in el)) return false
  const id = usable(speakerId(), devices, 'audiooutput')
  try {
    await el.setSinkId(id)
    return true
  } catch { return false }
}
