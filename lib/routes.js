// Same-origin HTTP surface for the Web client.
// Routes are registered on the Host web server, so the panel and the per-message
// action reach them with a plain same-origin fetch.
import { resolveApiKey, describeApiKey } from './credentials.js'
import { publicError, TtsError } from './errors.js'
import { listMinimaxVoices, synthesizeMinimax } from './minimax.js'
import {
  MINIMAX_DEFAULT_VOICES,
  MINIMAX_MODELS,
  PROVIDERS,
  XIAOMI_MODELS,
  XIAOMI_VOICES,
  publicSettings,
} from './settings.js'
import { clampSpeechText, prepareSpeechText } from './text.js'
import { synthesizeXiaomi } from './xiaomi.js'

export const ROUTE_PREFIX = '/plugins/dsh-tts-web'
const MAX_BODY_BYTES = 1024 * 1024
const VOICE_CACHE_MS = 10 * 60 * 1000

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('content-length', Buffer.byteLength(body))
  res.end(body)
}

function sendAudio(res, audio, { provider, voice, durationMs, textLength, download }) {
  const contentType = audio.format === 'wav' ? 'audio/wav' : 'audio/mpeg'
  res.statusCode = 200
  res.setHeader('content-type', contentType)
  res.setHeader('content-length', audio.data.byteLength)
  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-tts-provider', provider)
  res.setHeader('x-tts-voice', encodeURIComponent(voice ?? ''))
  res.setHeader('x-tts-format', audio.format)
  res.setHeader('x-tts-duration-ms', durationMs === null || durationMs === undefined ? '' : String(Math.round(durationMs)))
  res.setHeader('x-tts-text-length', String(textLength))
  if (download === true) res.setHeader('content-disposition', `attachment; filename="dsh-tts-${Date.now()}.${audio.format}"`)
  res.end(audio.data)
}

async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new TtsError('invalid-request', 'Request body is too large.', 413)
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return {}
  try {
    const parsed = JSON.parse(text)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object')
    return parsed
  } catch {
    throw new TtsError('invalid-request', 'Expected a JSON object body.', 400)
  }
}

function requestAllowed(req, origin) {
  const header = req.headers.origin
  if (typeof header !== 'string' || header === '') return true
  if (typeof origin !== 'string' || origin === '') return true
  try {
    return new URL(header).origin === new URL(origin).origin
  } catch {
    return false
  }
}

export function registerRoutes(ctx, { store, credentials }) {
  const disposers = []
  const voiceCache = new Map()
  const origin = () => {
    try {
      return ctx.webServer.getOrigin()
    } catch {
      return ''
    }
  }

  const register = (path, handler) => {
    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path,
      handler: async (req, res) => {
        try {
          if (req.method !== 'GET' && req.method !== 'DELETE' && requestAllowed(req, origin()) === false) {
            sendJson(res, 403, { error: 'origin-rejected', message: 'Cross-origin request rejected.' })
            return
          }
          await handler(req, res)
        } catch (error) {
          if (!res.headersSent) {
            const failure = publicError(error)
            sendJson(res, failure.status ?? 500, { error: failure.error, message: failure.message, provider: failure.provider })
          } else {
            try {
              res.end()
            } catch {
              // the response is already unusable
            }
          }
          if (!(error instanceof TtsError) && error !== undefined) ctx.logger?.warn?.('dsh-tts-web route failed: %s', error?.message ?? error)
        }
      },
    }))
  }

  const providerCatalog = (settings) => ({
    minimax: {
      models: MINIMAX_MODELS,
      defaultVoices: MINIMAX_DEFAULT_VOICES,
      baseURL: settings.minimax.baseURL,
    },
    xiaomi: {
      models: XIAOMI_MODELS,
      voices: XIAOMI_VOICES,
      baseURL: settings.xiaomi.baseURL,
    },
  })

  const credentialStatus = async (settings) => {
    const status = {}
    for (const provider of PROVIDERS) {
      try {
        status[provider] = await describeApiKey(settings, provider, credentials)
      } catch {
        status[provider] = { configured: false, source: null }
      }
    }
    return status
  }

  register(`${ROUTE_PREFIX}/config`, async (req, res) => {
    if (req.method === 'GET') {
      const settings = store.current()
      sendJson(res, 200, {
        config: publicSettings(settings),
        credentials: await credentialStatus(settings),
        providers: providerCatalog(settings),
        version: '0.1.0',
        routes: { speak: `${ROUTE_PREFIX}/speak`, voices: `${ROUTE_PREFIX}/voices` },
      })
      return
    }
    if (req.method === 'POST') {
      const patch = await readJsonBody(req)
      let settings
      try {
        settings = store.update(patch)
      } catch (error) {
        throw new TtsError('settings-write-failed', `Cannot save settings: ${error?.message ?? error}`, 500)
      }
      ctx.logger?.debug?.('dsh-tts-web settings updated')
      sendJson(res, 200, {
        config: publicSettings(settings),
        credentials: await credentialStatus(settings),
        providers: providerCatalog(settings),
      })
      return
    }
    res.setHeader('allow', 'GET, POST')
    sendJson(res, 405, { error: 'method-not-allowed', message: 'Use GET or POST.' })
  })

  register(`${ROUTE_PREFIX}/speak`, async (req, res) => {
    if (req.method !== 'POST') {
      res.setHeader('allow', 'POST')
      sendJson(res, 405, { error: 'method-not-allowed', message: 'Use POST.' })
      return
    }
    const body = await readJsonBody(req)
    const settings = store.current()
    if (settings.enabled !== true) throw new TtsError('disabled', 'Voice reading is switched off in the plugin panel.', 409)
    const provider = body.provider === undefined ? settings.provider : body.provider
    if (!PROVIDERS.includes(provider)) throw new TtsError('invalid-request', 'Unknown speech provider.', 400)
    const text = clampSpeechText(prepareSpeechText(body.text), settings.maxCharsPerRequest)
    if (text === '') throw new TtsError('no-text', 'There is nothing to read.', 400)
    const rawText = prepareSpeechText(body.text)
    if (rawText.length > settings.maxCharsPerRequest) {
      throw new TtsError('text-too-long', `Text exceeds ${settings.maxCharsPerRequest} characters; send it in shorter segments.`, 413, provider)
    }
    const format = body.format === 'wav' ? 'wav' : body.format === 'mp3' ? 'mp3' : settings[provider].format
    const controller = new AbortController()
    const abort = () => controller.abort()
    req.on('close', abort)
    try {
      const key = await resolveApiKey(settings, provider, credentials)
      const audio = provider === 'minimax'
        ? await synthesizeMinimax({
          settings,
          apiKey: key.value,
          text,
          voiceId: typeof body.voiceId === 'string' ? body.voiceId : undefined,
          model: typeof body.model === 'string' ? body.model : undefined,
          speed: body.speed,
          format,
          signal: controller.signal,
        })
        : await synthesizeXiaomi({
          settings,
          apiKey: key.value,
          text,
          voiceId: typeof body.voiceId === 'string' ? body.voiceId : undefined,
          model: typeof body.model === 'string' ? body.model : undefined,
          format,
          signal: controller.signal,
        })
      const url = new URL(req.url ?? '/', 'http://localhost')
      sendAudio(res, audio, {
        provider,
        voice: audio.voice,
        durationMs: audio.durationMs,
        textLength: text.length,
        download: url.searchParams.get('download') === '1',
      })
      try {
        store.addHistory({ text, provider, voice: audio.voice, durationMs: audio.durationMs })
      } catch (error) {
        ctx.logger?.warn?.('dsh-tts-web cannot record history: %s', error?.message ?? error)
      }
    } finally {
      req.off('close', abort)
    }
  })

  register(`${ROUTE_PREFIX}/voices`, async (req, res) => {
    if (req.method !== 'GET') {
      res.setHeader('allow', 'GET')
      sendJson(res, 405, { error: 'method-not-allowed', message: 'Use GET.' })
      return
    }
    const url = new URL(req.url ?? '/', 'http://localhost')
    const provider = url.searchParams.get('provider') ?? 'minimax'
    if (!PROVIDERS.includes(provider)) throw new TtsError('invalid-request', 'Unknown speech provider.', 400)
    if (provider === 'xiaomi') {
      sendJson(res, 200, {
        provider,
        voices: XIAOMI_VOICES.map((voice) => ({ id: voice, name: voice })),
        cached: true,
      })
      return
    }
    const settings = store.current()
    const signature = `${settings.minimax.baseURL}|${settings.minimax.apiKeyEnv}|${settings.minimax.apiKey === '' ? '' : 'inline'}`
    const cached = voiceCache.get('minimax')
    if (cached !== undefined && cached.signature === signature && Date.now() - cached.at < VOICE_CACHE_MS && cached.voices.length > 0) {
      sendJson(res, 200, { provider, voices: cached.voices, cached: true })
      return
    }
    try {
      const key = await resolveApiKey(settings, 'minimax', credentials)
      const voices = await listMinimaxVoices({ settings, apiKey: key.value })
      if (voices.length > 0) {
        voiceCache.set('minimax', { at: Date.now(), signature, voices })
        sendJson(res, 200, { provider, voices, cached: false })
        return
      }
      sendJson(res, 200, { provider, voices: MINIMAX_DEFAULT_VOICES, cached: false, error: 'empty-catalog' })
    } catch (error) {
      const failure = publicError(error)
      sendJson(res, 200, {
        provider,
        voices: MINIMAX_DEFAULT_VOICES,
        cached: false,
        error: failure.error,
        message: failure.message,
      })
    }
  })

  register(`${ROUTE_PREFIX}/history`, async (req, res) => {
    if (req.method === 'GET') {
      store.load()
      sendJson(res, 200, { items: store.history ?? [] })
      return
    }
    if (req.method === 'DELETE') {
      store.clearHistory()
      sendJson(res, 200, { items: [] })
      return
    }
    res.setHeader('allow', 'GET, DELETE')
    sendJson(res, 405, { error: 'method-not-allowed', message: 'Use GET or DELETE.' })
  })

  return () => {
    for (const dispose of disposers.splice(0)) {
      try {
        dispose()
      } catch {
        // a route owner already tore down
      }
    }
  }
}
