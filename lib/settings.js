// Durable plugin settings for dsh-tts-web.
// The plugin owns its own JSON store: user preferences are edited from the sidebar
// panel at runtime, which is what the DSH settings form cannot express for a plugin
// that ships no Config schema.
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const PROVIDERS = ['minimax', 'xiaomi']
export const FORMATS = ['mp3', 'wav']
export const HISTORY_LIMIT = 30
export const HISTORY_TEXT_LIMIT = 500
export const MAX_CHARS_PER_REQUEST = 1800

/** MiniMax Speech models offered in the panel. Any other model string is accepted. */
export const MINIMAX_MODELS = [
  'speech-2.6-hd',
  'speech-2.6-turbo',
  'speech-2.5-hd-preview',
  'speech-2.5-turbo-preview',
  'speech-02-hd',
  'speech-02-turbo',
  'speech-01-hd',
  'speech-01-turbo',
]

/** A small curated slice of MiniMax's system voices, used before the live catalog loads. */
export const MINIMAX_DEFAULT_VOICES = [
  { id: 'female-shaonv', name: '少女音色' },
  { id: 'female-yujie', name: '御姐音色' },
  { id: 'female-tianmei', name: '甜美女性' },
  { id: 'male-qn-qingse', name: '青涩青年音色' },
  { id: 'male-qn-jingying', name: '精英青年音色' },
  { id: 'male-qn-badao', name: '霸道青年音色' },
  { id: 'presenter_male', name: '男性主持人' },
  { id: 'presenter_female', name: '女性主持人' },
  { id: 'audiobook_male_1', name: '男性有声书1' },
  { id: 'audiobook_female_1', name: '女性有声书1' },
  { id: 'clever_boy', name: '聪明男童' },
  { id: 'lovely_girl', name: '萌萌女童' },
]

/** Built-in Xiaomi MiMo voices, mirrored from the MiMo voice selector. */
export const XIAOMI_VOICES = ['冰糖', '茉莉', '苏打', '白桦', 'Mia', 'Chloe', 'Milo', 'Dean']

export const XIAOMI_MODELS = ['mimo-v2.5-tts', 'mimo-v2.5-tts-voicedesign']

const DEFAULT_SETTINGS = {
  provider: 'minimax',
  enabled: true,
  autoRead: false,
  maxCharsPerRequest: MAX_CHARS_PER_REQUEST,
  minimax: {
    baseURL: 'https://api.minimaxi.com',
    model: 'speech-2.6-hd',
    voiceId: 'female-shaonv',
    speed: 1,
    vol: 1,
    pitch: 0,
    format: 'mp3',
    languageBoost: 'auto',
    emotion: '',
    apiKey: '',
    apiKeyEnv: 'MINIMAX_CN_API_KEY',
    groupId: '',
  },
  xiaomi: {
    baseURL: 'https://api.xiaomimimo.com/v1',
    model: 'mimo-v2.5-tts',
    voice: '冰糖',
    format: 'mp3',
    instruction: '请忠实朗读原文，根据文本语气自然表达，不添加或改写内容。',
    apiKey: '',
    apiKeyEnv: 'XIAOMI_MIMO_API_KEY',
  },
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

function trimmed(value, fallback) {
  return typeof value === 'string' ? value.trim() : fallback
}

function clamp(value, min, max, fallback) {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, number))
}

function httpURL(value, fallback) {
  const text = trimmed(value, '')
  if (text === '') return fallback
  try {
    const url = new URL(text)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return fallback
    return text
  } catch {
    return fallback
  }
}

/** Normalize any stored or submitted settings object into the complete, validated shape. */
export function normalizeSettings(raw) {
  const input = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const minimax = input.minimax !== null && typeof input.minimax === 'object' ? input.minimax : {}
  const xiaomi = input.xiaomi !== null && typeof input.xiaomi === 'object' ? input.xiaomi : {}
  const provider = PROVIDERS.includes(input.provider) ? input.provider : DEFAULT_SETTINGS.provider
  const maxChars = clamp(input.maxCharsPerRequest, 200, 8000, DEFAULT_SETTINGS.maxCharsPerRequest)
  return {
    provider,
    enabled: input.enabled !== false,
    autoRead: input.autoRead === true,
    maxCharsPerRequest: Math.round(maxChars),
    minimax: {
      baseURL: httpURL(minimax.baseURL, DEFAULT_SETTINGS.minimax.baseURL),
      model: trimmed(minimax.model, '') || DEFAULT_SETTINGS.minimax.model,
      voiceId: trimmed(minimax.voiceId, '') || DEFAULT_SETTINGS.minimax.voiceId,
      speed: clamp(minimax.speed, 0.5, 2, DEFAULT_SETTINGS.minimax.speed),
      vol: clamp(minimax.vol, 0.1, 10, DEFAULT_SETTINGS.minimax.vol),
      pitch: Math.round(clamp(minimax.pitch, -12, 12, DEFAULT_SETTINGS.minimax.pitch)),
      format: FORMATS.includes(minimax.format) ? minimax.format : DEFAULT_SETTINGS.minimax.format,
      languageBoost: trimmed(minimax.languageBoost, '') || DEFAULT_SETTINGS.minimax.languageBoost,
      emotion: trimmed(minimax.emotion, ''),
      apiKey: trimmed(minimax.apiKey, ''),
      apiKeyEnv: minimax.apiKeyEnv === undefined
        ? DEFAULT_SETTINGS.minimax.apiKeyEnv
        : trimmed(minimax.apiKeyEnv, ''),
      groupId: trimmed(minimax.groupId, ''),
    },
    xiaomi: {
      baseURL: httpURL(xiaomi.baseURL, DEFAULT_SETTINGS.xiaomi.baseURL),
      model: trimmed(xiaomi.model, '') || DEFAULT_SETTINGS.xiaomi.model,
      voice: trimmed(xiaomi.voice, '') || DEFAULT_SETTINGS.xiaomi.voice,
      format: FORMATS.includes(xiaomi.format) ? xiaomi.format : DEFAULT_SETTINGS.xiaomi.format,
      instruction: typeof xiaomi.instruction === 'string' ? xiaomi.instruction : DEFAULT_SETTINGS.xiaomi.instruction,
      apiKey: trimmed(xiaomi.apiKey, ''),
      apiKeyEnv: xiaomi.apiKeyEnv === undefined
        ? DEFAULT_SETTINGS.xiaomi.apiKeyEnv
        : trimmed(xiaomi.apiKeyEnv, ''),
    },
  }
}

/** Merge a partial patch over current settings. An omitted `apiKey` keeps the stored key. */
export function mergeSettings(current, patch) {
  const base = normalizeSettings(current)
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return base
  const next = {
    ...base,
    ...(patch.provider === undefined ? {} : { provider: patch.provider }),
    ...(patch.enabled === undefined ? {} : { enabled: patch.enabled }),
    ...(patch.autoRead === undefined ? {} : { autoRead: patch.autoRead }),
    ...(patch.maxCharsPerRequest === undefined ? {} : { maxCharsPerRequest: patch.maxCharsPerRequest }),
    minimax: { ...base.minimax, ...(patch.minimax !== null && typeof patch.minimax === 'object' ? patch.minimax : {}) },
    xiaomi: { ...base.xiaomi, ...(patch.xiaomi !== null && typeof patch.xiaomi === 'object' ? patch.xiaomi : {}) },
  }
  return normalizeSettings(next)
}

/** Settings view safe for the browser: stored keys never leave the Host. */
export function publicSettings(settings) {
  const copy = clone(settings)
  copy.minimax.apiKey = ''
  copy.xiaomi.apiKey = ''
  return copy
}

function defaultDirectory() {
  const profile = process.env.DSH_PROFILE_DIR
  try {
    if (typeof profile === 'string' && profile.trim() !== '') return join(profile.trim(), 'plugin-data', 'dsh-tts-web')
    return join(homedir(), '.dsh', 'plugin-data', 'dsh-tts-web')
  } catch {
    return join('.', '.dsh-tts-web')
  }
}

export class SettingsStore {
  constructor(directory) {
    this.directory = typeof directory === 'string' && directory.trim() !== '' ? directory.trim() : defaultDirectory()
    this.file = join(this.directory, 'settings.json')
    this.state = null
    this.history = null
  }

  load() {
    if (this.state !== null) return this.state
    let parsed
    try {
      parsed = JSON.parse(readFileSync(this.file, 'utf8'))
    } catch {
      parsed = undefined
    }
    this.state = normalizeSettings(parsed?.settings)
    this.history = Array.isArray(parsed?.history) ? parsed.history.filter(validHistoryEntry).slice(0, HISTORY_LIMIT) : []
    return this.state
  }

  current() {
    return this.load()
  }

  update(patch) {
    const next = mergeSettings(this.load(), patch)
    this.state = next
    this.persist()
    return next
  }

  addHistory(entry) {
    this.load()
    const row = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      text: String(entry.text ?? '').slice(0, HISTORY_TEXT_LIMIT),
      provider: String(entry.provider ?? ''),
      voice: String(entry.voice ?? ''),
      createdAt: new Date().toISOString(),
      durationMs: Number.isFinite(entry.durationMs) ? Math.round(entry.durationMs) : null,
    }
    this.history = [row, ...(this.history ?? [])].slice(0, HISTORY_LIMIT)
    this.persist()
    return row
  }

  clearHistory() {
    this.history = []
    this.persist()
  }

  persist() {
    const payload = JSON.stringify({ version: 1, settings: this.state, history: this.history ?? [] }, null, 2)
    const temporary = `${this.file}.tmp`
    try {
      mkdirSync(this.directory, { recursive: true })
      writeFileSync(temporary, payload, { encoding: 'utf8', mode: 0o600 })
      renameSync(temporary, this.file)
    } catch (error) {
      try {
        rmSync(temporary, { force: true })
      } catch {
        // ignored: the write failure is reported below
      }
      throw error
    }
  }
}

function validHistoryEntry(entry) {
  return entry !== null && typeof entry === 'object' && typeof entry.id === 'string' && typeof entry.text === 'string'
}

export { DEFAULT_SETTINGS }
