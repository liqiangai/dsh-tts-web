// MiniMax Speech synthesis (t2a_v2). Verified live against the CN endpoint:
// POST {origin}/v1/t2a_v2 with a bearer key returns hex MP3 in data.audio and
// extra_info.audio_length in milliseconds.
import { TtsError } from './errors.js'

const MAX_AUDIO_BYTES = 32 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 120000

/** Status codes returned inside base_resp that deserve their own public error code. */
const STATUS_CODES = {
  1002: ['rate-limited', 429],
  1004: ['api-key-rejected', 401],
  1008: ['provider-error', 402],
  1026: ['provider-error', 400],
  1027: ['provider-error', 400],
  2013: ['invalid-request', 400],
  2049: ['api-key-rejected', 401],
}

function endpoint(baseURL, groupId) {
  let base = String(baseURL ?? '').trim().replace(/\/+$/, '')
  if (base === '') base = 'https://api.minimaxi.com'
  if (base.toLowerCase().endsWith('/v1')) base = base.slice(0, -3)
  const url = new URL(`${base}/v1/t2a_v2`)
  if (typeof groupId === 'string' && groupId.trim() !== '') url.searchParams.set('GroupId', groupId.trim())
  return url.toString()
}

function decodeAudio(payload) {
  if (typeof payload !== 'string' || payload === '') throw new TtsError('provider-error', 'MiniMax returned no audio.', 502, 'minimax')
  const isHex = /^[0-9a-fA-F]+$/.test(payload) && payload.length % 2 === 0
  const data = Buffer.from(payload, isHex ? 'hex' : 'base64')
  if (data.byteLength === 0) throw new TtsError('provider-error', 'MiniMax returned empty audio.', 502, 'minimax')
  if (data.byteLength > MAX_AUDIO_BYTES) throw new TtsError('audio-too-large', 'MiniMax audio exceeds the size limit.', 413, 'minimax')
  return data
}

function audioLooksValid(data, format) {
  if (format === 'wav') {
    return data.byteLength >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WAVE'
  }
  return data.byteLength >= 2 && (data.toString('ascii', 0, 3) === 'ID3' || (data[0] === 0xff && (data[1] & 0xe0) === 0xe0))
}

export async function synthesizeMinimax({ settings, apiKey, text, voiceId, model, speed, format, signal }) {
  const voice = (voiceId ?? settings.minimax.voiceId ?? '').trim()
  if (voice === '') throw new TtsError('voice-required', 'Enter a MiniMax voice id.', 400, 'minimax')
  const audioFormat = format === 'wav' ? 'wav' : 'mp3'
  const body = {
    model: (model ?? settings.minimax.model ?? '').trim() || 'speech-2.6-hd',
    text,
    stream: false,
    voice_setting: {
      voice_id: voice,
      speed: Number(speed ?? settings.minimax.speed ?? 1),
      vol: Number(settings.minimax.vol ?? 1),
      pitch: Number(settings.minimax.pitch ?? 0),
      ...(String(settings.minimax.emotion ?? '').trim() === '' ? {} : { emotion: String(settings.minimax.emotion).trim() }),
    },
    audio_setting: {
      sample_rate: 32000,
      bitrate: 128000,
      format: audioFormat,
      channel: 1,
    },
    language_boost: String(settings.minimax.languageBoost ?? 'auto').trim() || 'auto',
  }

  const timeout = AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
  const composed = signal === undefined ? timeout : AbortSignal.any([signal, timeout])
  let response
  try {
    response = await fetch(endpoint(settings.minimax.baseURL, settings.minimax.groupId), {
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
    if (signal?.aborted === true) throw new TtsError('request-canceled', 'Speech request canceled.', 499, 'minimax')
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw new TtsError('provider-timeout', 'MiniMax did not answer in time.', 504, 'minimax')
    throw new TtsError('network', `Cannot reach MiniMax: ${error?.message ?? error}`, 502, 'minimax')
  }

  const raw = await response.text()
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new TtsError('provider-error', `MiniMax returned a non-JSON answer (HTTP ${response.status}).`, 502, 'minimax')
  }
  const statusCode = Number(parsed?.base_resp?.status_code ?? 0)
  const statusMessage = String(parsed?.base_resp?.status_msg ?? '')
  if (!response.ok || (Number.isFinite(statusCode) && statusCode !== 0)) {
    const mapped = STATUS_CODES[statusCode]
    const code = mapped?.[0] ?? (response.ok ? 'provider-error' : response.status === 401 ? 'api-key-rejected' : 'provider-error')
    const status = mapped?.[1] ?? (response.status >= 400 ? response.status : 502)
    throw new TtsError(code, statusMessage || `MiniMax request failed (HTTP ${response.status}).`, status, 'minimax')
  }

  const data = decodeAudio(parsed?.data?.audio)
  if (!audioLooksValid(data, audioFormat)) throw new TtsError('provider-error', 'MiniMax returned audio in an unexpected format.', 502, 'minimax')
  const durationMs = Number(parsed?.extra_info?.audio_length)
  return {
    data,
    format: audioFormat,
    voice,
    provider: 'minimax',
    durationMs: Number.isFinite(durationMs) && durationMs > 0 ? durationMs : null,
  }
}

/** Live system-voice catalog. Failures stay non-fatal for the panel. */
export async function listMinimaxVoices({ settings, apiKey, signal }) {
  let base = String(settings.minimax.baseURL ?? '').trim().replace(/\/+$/, '')
  if (base === '') base = 'https://api.minimaxi.com'
  if (base.toLowerCase().endsWith('/v1')) base = base.slice(0, -3)
  const timeout = AbortSignal.timeout(30000)
  const composed = signal === undefined ? timeout : AbortSignal.any([signal, timeout])
  const response = await fetch(`${base}/v1/get_voice`, {
    method: 'POST',
    redirect: 'error',
    signal: composed,
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      accept: 'application/json',
      'user-agent': 'dsh-tts-web',
    },
    body: JSON.stringify({ voice_type: 'all' }),
  })
  const raw = await response.text()
  const parsed = JSON.parse(raw)
  if (!response.ok || Number(parsed?.base_resp?.status_code ?? 0) !== 0) {
    throw new TtsError('provider-error', String(parsed?.base_resp?.status_msg ?? `HTTP ${response.status}`), 502, 'minimax')
  }
  const groups = ['system_voice', 'voice_cloning', 'voice_generation']
  const voices = []
  for (const group of groups) {
    const rows = Array.isArray(parsed?.[group]) ? parsed[group] : []
    for (const row of rows) {
      const id = String(row?.voice_id ?? '').trim()
      if (id === '') continue
      const label = String(row?.voice_name ?? '').trim() || id
      const description = Array.isArray(row?.description) ? row.description.join(' ') : ''
      voices.push({ id, name: label, group, description })
    }
  }
  return voices
}
