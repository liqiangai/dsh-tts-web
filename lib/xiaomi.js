// Xiaomi MiMo TTS over the OpenAI-compatible chat-completions endpoint.
// Request shape mirrors the MiMo voice selector: one optional style instruction as
// the user message, the text to speak as the assistant message, audio settings in
// the `audio` field; the answer carries base64 audio in choices[0].message.audio.data.
import { TtsError } from './errors.js'

const MAX_AUDIO_BYTES = 32 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 120000
const DEFAULT_STYLE = '使用清晰、自然、准确的声音朗读，语速适中，停顿自然，语气平和克制，避免夸张表达。'
const VOICE_DESIGN_MODEL = 'mimo-v2.5-tts-voicedesign'

function endpoint(baseURL, apiKey) {
  const key = String(apiKey ?? '').trim()
  const configured = String(baseURL ?? '').trim()
  const base = key.startsWith('tp-')
    ? 'https://token-plan-cn.xiaomimimo.com/v1'
    : configured !== '' ? configured : 'https://api.xiaomimimo.com/v1'
  const normalized = base.replace(/\/+$/, '')
  return `${normalized}/chat/completions`
}

function decodeAudio(value, format) {
  if (typeof value !== 'string' || value === '') throw new TtsError('provider-error', 'Xiaomi MiMo returned no audio.', 502, 'xiaomi')
  const data = Buffer.from(value, 'base64')
  if (data.byteLength === 0) throw new TtsError('provider-error', 'Xiaomi MiMo returned empty audio.', 502, 'xiaomi')
  if (data.byteLength > MAX_AUDIO_BYTES) throw new TtsError('audio-too-large', 'Xiaomi MiMo audio exceeds the size limit.', 413, 'xiaomi')
  const valid = format === 'wav'
    ? data.byteLength >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WAVE'
    : data.byteLength >= 2 && (data.toString('ascii', 0, 3) === 'ID3' || (data[0] === 0xff && (data[1] & 0xe0) === 0xe0))
  if (!valid) throw new TtsError('provider-error', 'Xiaomi MiMo returned audio in an unexpected format.', 502, 'xiaomi')
  return data
}

function errorDetail(parsed, status) {
  const fromError = typeof parsed?.error === 'string' ? parsed.error : parsed?.error?.message
  const detail = String(fromError ?? parsed?.message ?? '').trim()
  return detail !== '' ? detail : `Xiaomi MiMo request failed (HTTP ${status}).`
}

export async function synthesizeXiaomi({ settings, apiKey, text, voiceId, model, format, signal }) {
  const selectedModel = String(model ?? settings.xiaomi.model ?? '').trim() || 'mimo-v2.5-tts'
  const voice = String(voiceId ?? settings.xiaomi.voice ?? '').trim()
  if (selectedModel !== VOICE_DESIGN_MODEL && voice === '') throw new TtsError('voice-required', 'Select a Xiaomi MiMo voice.', 400, 'xiaomi')
  const audioFormat = format === 'wav' ? 'wav' : 'mp3'
  const instruction = String(settings.xiaomi.instruction ?? '').trim()
  const messages = []
  const context = instruction !== '' ? instruction : DEFAULT_STYLE
  if (context !== '') messages.push({ role: 'user', content: context })
  messages.push({ role: 'assistant', content: text })

  const body = {
    model: selectedModel,
    messages,
    audio: selectedModel === VOICE_DESIGN_MODEL ? { format: audioFormat } : { format: audioFormat, voice },
    stream: false,
  }

  const timeout = AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
  const composed = signal === undefined ? timeout : AbortSignal.any([signal, timeout])
  let response
  try {
    response = await fetch(endpoint(settings.xiaomi.baseURL, apiKey), {
      method: 'POST',
      redirect: 'error',
      signal: composed,
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        accept: 'application/json',
        'user-agent': 'dsh-tts-web',
      },
      body: JSON.stringify(body),
    })
  } catch (error) {
    if (signal?.aborted === true) throw new TtsError('request-canceled', 'Speech request canceled.', 499, 'xiaomi')
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw new TtsError('provider-timeout', 'Xiaomi MiMo did not answer in time.', 504, 'xiaomi')
    throw new TtsError('network', `Cannot reach Xiaomi MiMo: ${error?.message ?? error}`, 502, 'xiaomi')
  }

  const raw = await response.text()
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new TtsError('provider-error', `Xiaomi MiMo returned a non-JSON answer (HTTP ${response.status}).`, 502, 'xiaomi')
  }
  if (!response.ok) {
    const detail = errorDetail(parsed, response.status)
    const code = response.status === 401 || response.status === 403
      ? 'api-key-rejected'
      : response.status === 429 ? 'rate-limited' : response.status === 408 || response.status === 504 ? 'provider-timeout' : 'provider-error'
    throw new TtsError(code, detail, response.status === 401 || response.status === 403 ? 401 : response.status === 429 ? 429 : 502, 'xiaomi')
  }

  const data = decodeAudio(parsed?.choices?.[0]?.message?.audio?.data, audioFormat)
  return {
    data,
    format: audioFormat,
    voice: selectedModel === VOICE_DESIGN_MODEL ? 'voice-design' : voice,
    provider: 'xiaomi',
    durationMs: null,
  }
}
