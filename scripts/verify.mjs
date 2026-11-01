// Reproducible verification for dsh-tts-web (development only; not shipped).
//   1. settings/text/credential unit checks
//   2. every same-origin route on a throwaway HTTP server, including real synthesis
//   3. the live gateway routes, when dsh web is running
// Run: node scripts/verify.mjs [gatewayBaseUrl]
import { createServer } from 'node:http'
import { mkdtempSync, readFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { registerRoutes } from '../lib/routes.js'
import { SettingsStore, mergeSettings, normalizeSettings, publicSettings } from '../lib/settings.js'
import { clampSpeechText, prepareSpeechText, splitSpeechText } from '../lib/text.js'
import { resolveApiKey, describeApiKey } from '../lib/credentials.js'

let failures = 0
function check(label, condition, detail = '') {
  if (!condition) failures += 1
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail === '' ? '' : `  ${detail}`}`)
}

function credentialValue(name) {
  try {
    const text = readFileSync(join(homedir(), '.dsh', '.credentials.yaml'), 'utf8')
    return new RegExp(`^\\s{2}${name}:\\s*(\\S+)\\s*$`, 'm').exec(text)?.[1]
  } catch {
    return undefined
  }
}

const credentials = {
  async resolve(name) {
    const value = credentialValue(name)
    return value === undefined ? undefined : { value, source: 'file' }
  },
  async describe(name) {
    return { configured: credentialValue(name) !== undefined, source: 'file', writable: true }
  },
}

/* 1 — settings, text, credentials ------------------------------------------------ */
const defaults = normalizeSettings({})
check('defaults: minimax provider', defaults.provider === 'minimax')
check('defaults: keeps credential names', defaults.minimax.apiKeyEnv === 'MINIMAX_CN_API_KEY' && defaults.xiaomi.apiKeyEnv === 'XIAOMI_MIMO_API_KEY')
check('defaults: public view hides keys', publicSettings(defaults).minimax.apiKey === '')
check('merge: omitted key keeps value', mergeSettings({ minimax: { apiKey: 'k' } }, { minimax: { speed: 1.2 } }).minimax.apiKey === 'k')
check('merge: empty key clears', mergeSettings({ minimax: { apiKey: 'k' } }, { minimax: { apiKey: '' } }).minimax.apiKey === '')

const spoken = prepareSpeechText('## 标题\n**重点** [链接](https://x.y) `code`\n```js\nhidden\n```\n- 一\n- 二')
check('text: strips code block', !spoken.includes('hidden'))
check('text: strips url', !spoken.includes('https://'))
check('text: keeps prose', spoken.includes('重点') && spoken.includes('一'))
check('text: clamp keeps sentence', clampSpeechText('一二三四五六七八九十。abcdefghij', 12) === '一二三四五六七八九十。')
check('text: split keeps all words', splitSpeechText('第一句。第二句。第三句。', 5).join('') === '第一句。第二句。第三句。')

check('credentials: minimax configured', (await describeApiKey(defaults, 'minimax', credentials)).configured)
let missing = ''
try { await resolveApiKey(defaults, 'xiaomi', credentials) } catch (error) { missing = error.code }
check('credentials: xiaomi missing code', missing === 'api-key-not-configured')

/* 2 — routes on a throwaway server ---------------------------------------------- */
const routes = new Map()
let origin = ''
const store = new SettingsStore(mkdtempSync(join(tmpdir(), 'dsh-tts-verify-')))
const ctx = {
  logger: { warn: () => {} },
  webServer: { register: (route) => { routes.set(route.path, route); return () => routes.delete(route.path) }, getOrigin: () => origin },
  get: (name) => (name === 'credentials' ? credentials : undefined),
}
const dispose = registerRoutes(ctx, { store, credentials })
const server = createServer((req, res) => {
  const route = routes.get(new URL(req.url ?? '/', 'http://localhost').pathname)
  if (route === undefined) { res.statusCode = 404; res.end('no route'); return }
  void route.handler(req, res)
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
origin = `http://127.0.0.1:${server.address().port}`

async function call(path, { method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(origin + path, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), origin, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if ((response.headers.get('content-type') ?? '').startsWith('audio/')) {
    return { status: response.status, headers: response.headers, bytes: Buffer.from(await response.arrayBuffer()) }
  }
  return { status: response.status, headers: response.headers, json: await response.json() }
}

check('routes: four registered', routes.size === 4, [...routes.keys()].join(','))

const config = await call('/plugins/dsh-tts-web/config')
check('config: 200 + no secret leak', config.status === 200 && !JSON.stringify(config.json).includes(credentialValue('MINIMAX_CN_API_KEY') ?? 'no-key'))
const saved = await call('/plugins/dsh-tts-web/config', { method: 'POST', body: { minimax: { speed: 1.1 }, autoRead: true } })
check('config: save applies', saved.json.config.minimax.speed === 1.1 && saved.json.config.autoRead === true)
const crossOrigin = await call('/plugins/dsh-tts-web/speak', { method: 'POST', body: { text: 'x' }, headers: { origin: 'https://evil.example' } })
check('speak: cross-origin rejected', crossOrigin.status === 403 && crossOrigin.json.error === 'origin-rejected')
check('speak: empty text rejected', (await call('/plugins/dsh-tts-web/speak', { method: 'POST', body: { text: '```x```' } })).json.error === 'no-text')
check('speak: long text rejected', (await call('/plugins/dsh-tts-web/speak', { method: 'POST', body: { text: '啊'.repeat(2000) } })).json.error === 'text-too-long')
check('speak: method guard', (await call('/plugins/dsh-tts-web/speak')).status === 405)

const voices = await call('/plugins/dsh-tts-web/voices?provider=minimax')
check('voices: minimax catalog non-empty', voices.json.voices.length > 0, `${voices.json.voices.length} voices`)
check('voices: xiaomi built-ins', (await call('/plugins/dsh-tts-web/voices?provider=xiaomi')).json.voices.length === 8)

const spokenAudio = await call('/plugins/dsh-tts-web/speak', { method: 'POST', body: { text: '你好，这是路由验证。' } })
const isMP3 = spokenAudio.headers?.get('content-type') === 'audio/mpeg' && spokenAudio.bytes.subarray(0, 3).toString('ascii') === 'ID3'
check('speak: real mp3 audio', isMP3, `${spokenAudio.bytes?.byteLength ?? 0} bytes`)
check('history: recorded', (await call('/plugins/dsh-tts-web/history')).json.items.length === 1)
check('history: cleared', (await call('/plugins/dsh-tts-web/history', { method: 'DELETE' })).json.items.length === 0)

dispose()
await new Promise((resolve) => server.close(resolve))
check('routes: disposed', routes.size === 0)

/* 3 — live gateway -------------------------------------------------------------- */
const gateway = process.argv[2] ?? 'http://127.0.0.1:57573'
try {
  const live = await fetch(`${gateway}/plugins/dsh-tts-web/config`).then((response) => response.json())
  check('gateway: config reachable', live?.config?.provider !== undefined, live?.credentials ? JSON.stringify(live.credentials) : '')
  const liveSpeak = await fetch(`${gateway}/plugins/dsh-tts-web/speak`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: '网关验证：语音朗读插件正在工作。' }),
  })
  const bytes = Buffer.from(await liveSpeak.arrayBuffer())
  check('gateway: live synthesis', liveSpeak.status === 200 && bytes.byteLength > 1000, `${bytes.byteLength} bytes`)
  await fetch(`${gateway}/plugins/dsh-tts-web/history`, { method: 'DELETE' })
  await fetch(`${gateway}/plugins/dsh-tts-web/config`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ autoRead: false }) })
} catch (error) {
  console.log(`SKIP  gateway checks (${error?.message ?? error}); pass the running dsh web base URL as argv[2]`)
}

console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) failed`}`)
process.exitCode = failures === 0 ? 0 : 1
