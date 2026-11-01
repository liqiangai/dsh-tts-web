// Headless smoke + auto-read test for client.js without a browser.
// Stubs React hooks, the module loader, fetch, Audio and object URLs, then renders the
// three slot components and asserts that automatic reading fires exactly when configured.
import { readFileSync } from 'node:fs'

let failures = 0
const check = (label, condition, detail = '') => {
  if (!condition) failures += 1
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
}

/* ---- environment stubs ------------------------------------------------------- */
let registry = null
globalThis.window = globalThis
globalThis.document = { baseURI: 'http://127.0.0.1:57573/' }
globalThis.window.__ModuleLoader__ = { load: (entry) => { registry = entry } }
globalThis.URL.createObjectURL = () => 'blob:stub'
globalThis.URL.revokeObjectURL = () => {}
const timers = []
globalThis.window.setTimeout = (fn) => { timers.push(fn); return timers.length }
globalThis.window.clearTimeout = () => {}
class FakeAudio {
  constructor(url) { this.url = url; this.playbackRate = 1 }
  play() { Promise.resolve().then(() => this.onended && this.onended()); return Promise.resolve() }
  pause() {}
  removeAttribute() {}
}
globalThis.Audio = FakeAudio

const speakCalls = []
let configBody = null
globalThis.fetch = async (url, options = {}) => {
  if (String(url).includes('/speak')) {
    speakCalls.push(JSON.parse(options.body ?? '{}'))
    return {
      ok: true,
      status: 200,
      blob: async () => ({ size: 1024, type: 'audio/mpeg' }),
      json: async () => ({}),
      text: async () => '',
    }
  }
  return {
    ok: true,
    status: 200,
    json: async () => configBody,
    blob: async () => ({ size: 0 }),
    text: async () => JSON.stringify(configBody),
  }
}

/* ---- react stub -------------------------------------------------------------- */
function makeReact() {
  let hookIndex = 0
  let effects = []
  const states = []
  class Component {
    constructor(props) { this.props = props ?? {}; this.state = {} }
    setState(patch) { this.state = Object.assign({}, this.state, patch) }
  }
  Component.prototype.isReactComponent = true
  const React = {
    Component,
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() }),
    useState: (initial) => {
      const index = hookIndex++
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial
      return [states[index], (next) => { states[index] = next }]
    },
    useMemo: (factory) => factory(),
    useCallback: (fn) => fn,
    useRef: (value) => ({ current: value }),
    useEffect: (fn) => { effects.push(fn) },
    useSyncExternalStore: (subscribe, getSnapshot) => getSnapshot(),
  }
  return {
    React,
    beginRender() { hookIndex = 0; effects = []; return { takeEffects: () => effects } },
  }
}

function render(element) {
  if (element === null || element === undefined || element === false) return null
  if (typeof element !== 'object') return element
  const { type, props, children } = element
  const allProps = children.length > 0 ? { ...props, children: children.length === 1 ? children[0] : children } : props
  if (typeof type === 'function') {
    if (type.prototype && type.prototype.isReactComponent) return render(new type(allProps).render())
    return render(type(allProps))
  }
  return element
}

/* ---- fake host context ------------------------------------------------------- */
const registrations = []
const ctx = {
  locale: {
    register: () => () => {},
    bind: () => (key) => key,
    subscribe: () => () => {},
    getLocale: () => ({ active: 'zh' }),
  },
  slots: {
    inject: (name, callback) => { registrations.push({ name, dispose: callback() }); return () => {} },
    register: (options, component) => { registrations.push({ slot: options.name, options, component }); return () => {} },
  },
  effect: (fn) => { const disposer = fn(); return () => { if (typeof disposer === 'function') disposer() } },
}

/* ---- load the bundle --------------------------------------------------------- */
const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
new Function('window', 'document', 'URL', 'Audio', 'fetch', source)(globalThis, globalThis.document, globalThis.URL, globalThis.Audio, globalThis.fetch)
check('module loader entry registered', registry !== null && registry.id === 'dsh-tts-web')

const stub = makeReact()
const clientModule = registry.factory((name) => {
  if (name === 'react') return stub.React
  throw new Error(`unexpected require: ${name}`)
})
check('factory returns inject/apply', Array.isArray(clientModule.inject) && typeof clientModule.apply === 'function')

/* apply must not throw and must register the three slots */
try {
  clientModule.apply(ctx)
  const names = registrations.map((entry) => entry.slot).filter(Boolean)
  check('three slot registrations', names.length === 3, names.join(','))
  check('ids match the contract', names.includes('sidebar.panellist') && names.includes('main') && names.includes('conversation.chat.assistant-actions'))
} catch (error) {
  check('apply threw', false, error.message)
}

/* ---- component rendering ----------------------------------------------------- */
const sidebar = registrations.find((entry) => entry.slot === 'sidebar.panellist').component
const action = registrations.find((entry) => entry.slot === 'conversation.chat.assistant-actions').component
const panelEntry = registrations.find((entry) => entry.slot === 'main').component

const sidebarRender = stub.beginRender()
const sidebarTree = render(stub.React.createElement(sidebar, { size: 20, active: true }))
const sidebarEffects = sidebarRender.takeEffects()
check('sidebar icon renders an svg', sidebarTree && sidebarTree.type === 'svg', String(sidebarTree && sidebarTree.type))
check('sidebar icon is inert (no effects)', sidebarEffects.length === 0, `${sidebarEffects.length}`)

const panelRender = stub.beginRender()
const panelTree = render(stub.React.createElement(panelEntry, {}))
const panelEffects = panelRender.takeEffects()
check('panel renders a root div', panelTree && panelTree.type === 'div', String(panelTree && panelTree.type))
check('panel registers effects', panelEffects.length > 0, `${panelEffects.length}`)

/* ---- auto-read: enabled ------------------------------------------------------ */
const fakeChat = {
  legacy: {
    nodes: [
      { kind: 'user', text: 'a question' },
      { kind: 'assistant', messageId: 'm1', blocks: [{ kind: 'text', text: 'This reply should be read automatically.' }], time: 10 },
    ],
  },
}
const hostProps = {
  messageId: 'm1',
  sessionId: 's1',
  useChat: (selector) => selector(fakeChat),
  useSession: (selector) => selector({ running: false }),
}

configBody = {
  config: {
    enabled: true,
    autoRead: true,
    provider: 'minimax',
    maxCharsPerRequest: 1800,
    minimax: { voiceId: 'female-shaonv', model: 'speech-2.6-hd', speed: 1, format: 'mp3' },
    xiaomi: { voice: 'voice-x', model: 'mimo-v2.5-tts' },
  },
  credentials: { minimax: { configured: true, source: 'credential:MINIMAX_CN_API_KEY' }, xiaomi: { configured: false } },
  providers: { minimax: { models: ['speech-2.6-hd'], defaultVoices: [] }, xiaomi: { models: ['mimo-v2.5-tts'], voices: [] } },
}

// Pass 1 loads the config store through the component effect, pass 2 renders with it ready.
const renderAction = () => {
  const pass = stub.beginRender()
  render(stub.React.createElement(action, hostProps))
  for (const effect of pass.takeEffects()) effect()
  return pass.takeEffects()
}
renderAction()
await new Promise((resolve) => setImmediate(resolve))
const secondRender = stub.beginRender()
const actionTree = render(stub.React.createElement(action, hostProps))
for (const effect of secondRender.takeEffects()) effect()
for (const timer of timers.splice(0)) timer()
await new Promise((resolve) => setImmediate(resolve))
await new Promise((resolve) => setImmediate(resolve))

check('message action renders a button', actionTree && actionTree.type === 'span', String(actionTree && actionTree.type))
check('auto-read requested speech once', speakCalls.length === 1, `${speakCalls.length} call(s)`)
check('auto-read sent the reply text', (speakCalls[0]?.text ?? '').includes('read automatically'), speakCalls[0]?.text ?? '')
check('auto-read used the configured voice', speakCalls[0]?.voiceId === 'female-shaonv', JSON.stringify(speakCalls[0] ?? {}))

// A second render of the same message must not speak again.
const thirdRender = stub.beginRender()
render(stub.React.createElement(action, hostProps))
for (const effect of thirdRender.takeEffects()) effect()
for (const timer of timers.splice(0)) timer()
await new Promise((resolve) => setImmediate(resolve))
check('auto-read does not repeat for the same message', speakCalls.length === 1, `${speakCalls.length} call(s)`)

/* ---- auto-read: disabled ----------------------------------------------------- */
speakCalls.length = 0
configBody = { ...configBody, config: { ...configBody.config, autoRead: false } }
clientModule.apply(ctx)
renderAction()
await new Promise((resolve) => setImmediate(resolve))
const offRender = stub.beginRender()
render(stub.React.createElement(action, hostProps))
for (const effect of offRender.takeEffects()) effect()
for (const timer of timers.splice(0)) timer()
await new Promise((resolve) => setImmediate(resolve))
check('disabled auto-read never requests speech', speakCalls.length === 0, `${speakCalls.length} call(s)`)

console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} check(s) failed`}`)
process.exitCode = failures === 0 ? 0 : 1
