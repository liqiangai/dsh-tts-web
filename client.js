// dsh-tts-web — browser half.
//
// A self-contained Web client plugin: a sidebar entry that opens a voice-reading
// panel, plus a per-message "read aloud" action in the Chat transcript. Both
// halves share one module-level player and one config store.
//
// Contract: see CONTRACT.md in this package. Only `react` and browser APIs are
// used here; no @deepseek-ai/* imports, no build step, no CSS files.

window.__ModuleLoader__.load({
  id: 'dsh-tts-web',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useMemo, useRef, useState, useSyncExternalStore } = React
    const { useCallback } = React

    const NS = 'dsh-tts-web'
    const ROUTE_PREFIX = 'plugins/dsh-tts-web/'

    /* ------------------------------------------------------------------ */
    /* Dictionaries                                                        */
    /* ------------------------------------------------------------------ */

    const ZH = {
      'nav.label': '语音朗读',
      'action.label': '朗读',
      'action.play': '朗读此回复',
      'action.stop': '停止朗读',
      'action.loading': '正在合成语音…',
      'action.autoplayBlocked': '浏览器拦截了自动播放，点一下喇叭即可',
      'panel.title': '语音朗读',
      'panel.subtitle': '用 MiniMax Speech 或小米 MiMo TTS 朗读助手回复。',
      'panel.loading': '正在读取配置…',
      'panel.retry': '重试',
      'panel.unavailable': '语音朗读暂不可用：{message}',
      'provider.label': '服务商',
      'provider.minimax': 'MiniMax Speech',
      'provider.xiaomi': '小米 MiMo TTS',
      'provider.minimaxHint': '使用 MiniMax Speech 合成，可选音色与 0.5–2 倍速。',
      'provider.xiaomiHint': '使用小米 MiMo TTS 合成，音色由朗读指令控制。',
      'settings.title': '朗读设置',
      'settings.enabled': '启用语音朗读',
      'settings.enabledHint': '关闭后不再朗读回复，消息工具栏按钮也会隐藏。',
      'settings.autoRead': '自动朗读新回复',
      'settings.autoReadHint': '助手完成一条回复后自动朗读（需停留在对话页）。浏览器拦截自动播放时，点一下消息上的喇叭即可。',
      'settings.apiKey': 'API Key',
      'settings.apiKeyPlaceholder': '未配置，粘贴 API Key',
      'settings.apiKeyConfigured': '已通过 {name} 配置',
      'settings.apiKeyKeep': '留空则保留已保存的 Key，填写空值后再保存会清除。',
      'settings.apiKeyEnv': '凭据环境变量名',
      'settings.baseURL': 'Base URL',
      'settings.model': '模型',
      'settings.voice': '音色',
      'settings.voiceLoading': '正在读取音色…',
      'settings.voiceFallback': '未能获取音色列表，已回退到默认音色。',
      'settings.speed': '语速（{value}×）',
      'settings.format': '音频格式',
      'settings.instruction': '朗读指令',
      'settings.save': '保存',
      'settings.saving': '保存中…',
      'settings.saved': '已保存',
      'settings.saveError': '保存失败：{message}',
      'settings.loadError': '读取配置失败：{message}',
      'test.title': '朗读测试',
      'test.placeholder': '输入要朗读的文字…',
      'test.read': '朗读',
      'test.stop': '停止',
      'test.latest': '朗读最新回复',
      'test.empty': '请先输入要朗读的文字。',
      'test.noReply': '没有找到可朗读的最新回复，可以先在上方输入文字试听。',
      'test.busy': '正在准备语音…',
      'test.progress': '第 {index}/{total} 段',
      'history.title': '播放历史',
      'history.empty': '还没有朗读记录。',
      'history.refresh': '刷新',
      'history.clear': '清空',
      'history.clearing': '清空中…',
      'history.replay': '重新朗读',
      'history.clearError': '清空失败：{message}',
      'history.meta': '{provider} · {voice}',
      'history.time': '{time}',
      'history.unknownVoice': '默认音色',
      'error.api-key-not-configured': '还没有配置 API Key',
      'error.api-key-rejected': 'API Key 被拒绝，请检查后重试',
      'error.voice-required': '需要先选择音色',
      'error.no-text': '没有可朗读的文字',
      'error.text-too-long': '文字过长，请缩短后重试',
      'error.rate-limited': '请求过于频繁，请稍后重试',
      'error.provider-error': '服务商返回错误',
      'error.provider-timeout': '服务商响应超时',
      'error.audio-too-large': '生成的音频过大',
      'error.invalid-format': '不支持该音频格式',
      'error.invalid-request': '请求参数不合法',
      'error.network': '网络或服务连接失败',
      'error.play-failed': '浏览器无法播放这段音频',
      'error.autoplay-blocked': '浏览器拦截了自动播放，点一下喇叭即可',
      'error.generic': '朗读失败',
      'common.unknown': '未知',
    }

    const EN = {
      'nav.label': 'Voice reading',
      'action.label': 'Read aloud',
      'action.play': 'Read this reply aloud',
      'action.stop': 'Stop reading',
      'action.loading': 'Synthesizing speech…',
      'action.autoplayBlocked': 'The browser blocked autoplay — tap the speaker',
      'panel.title': 'Voice reading',
      'panel.subtitle': 'Read assistant replies aloud with MiniMax Speech or Xiaomi MiMo TTS.',
      'panel.loading': 'Loading settings…',
      'panel.retry': 'Retry',
      'panel.unavailable': 'Voice reading is unavailable: {message}',
      'provider.label': 'Provider',
      'provider.minimax': 'MiniMax Speech',
      'provider.xiaomi': 'Xiaomi MiMo TTS',
      'provider.minimaxHint': 'Synthesized with MiniMax Speech, with voice selection and 0.5–2× speed.',
      'provider.xiaomiHint': 'Synthesized with Xiaomi MiMo TTS; the reading instruction shapes the voice.',
      'settings.title': 'Reading settings',
      'settings.enabled': 'Enable voice reading',
      'settings.enabledHint': 'When off, replies are not read and the message action hides.',
      'settings.autoRead': 'Read new replies automatically',
      'settings.autoReadHint': 'Speak each reply as soon as it finishes (keep the conversation open). If the browser blocks autoplay, tap the speaker on the message.',
      'settings.apiKey': 'API key',
      'settings.apiKeyPlaceholder': 'Not configured — paste an API key',
      'settings.apiKeyConfigured': 'Configured through {name}',
      'settings.apiKeyKeep': 'Leave empty to keep the stored key; saving an empty value clears it.',
      'settings.apiKeyEnv': 'Credential env-var name',
      'settings.baseURL': 'Base URL',
      'settings.model': 'Model',
      'settings.voice': 'Voice',
      'settings.voiceLoading': 'Loading voices…',
      'settings.voiceFallback': 'Could not load the voice list; using the default voices.',
      'settings.speed': 'Speed ({value}×)',
      'settings.format': 'Audio format',
      'settings.instruction': 'Reading instruction',
      'settings.save': 'Save',
      'settings.saving': 'Saving…',
      'settings.saved': 'Saved',
      'settings.saveError': 'Save failed: {message}',
      'settings.loadError': 'Could not load settings: {message}',
      'test.title': 'Read-aloud test',
      'test.placeholder': 'Type text to read aloud…',
      'test.read': 'Read aloud',
      'test.stop': 'Stop',
      'test.latest': 'Read latest reply',
      'test.empty': 'Type some text first.',
      'test.noReply': 'No assistant reply was found yet — type some text above to test.',
      'test.busy': 'Preparing audio…',
      'test.progress': 'Part {index}/{total}',
      'history.title': 'Playback history',
      'history.empty': 'No reading history yet.',
      'history.refresh': 'Refresh',
      'history.clear': 'Clear',
      'history.clearing': 'Clearing…',
      'history.replay': 'Read again',
      'history.clearError': 'Could not clear history: {message}',
      'history.meta': '{provider} · {voice}',
      'history.time': '{time}',
      'history.unknownVoice': 'default voice',
      'error.api-key-not-configured': 'No API key is configured yet',
      'error.api-key-rejected': 'The API key was rejected — check it and retry',
      'error.voice-required': 'A voice must be selected first',
      'error.no-text': 'There is no text to read',
      'error.text-too-long': 'The text is too long — shorten it and retry',
      'error.rate-limited': 'Too many requests — try again shortly',
      'error.provider-error': 'The provider returned an error',
      'error.provider-timeout': 'The provider timed out',
      'error.audio-too-large': 'The generated audio was too large',
      'error.invalid-format': 'That audio format is not supported',
      'error.invalid-request': 'The request was invalid',
      'error.network': 'Network or service connection failed',
      'error.play-failed': 'The browser could not play this audio',
      'error.autoplay-blocked': 'The browser blocked autoplay — tap the speaker',
      'error.generic': 'Reading failed',
      'common.unknown': 'unknown',
    }

    const DICTS = { zh: ZH, en: EN }

    let boundTranslate = null

    function interpolate(text, params) {
      if (!params) return text
      let result = text
      for (const name of Object.keys(params)) {
        const value = params[name]
        result = result.split('{' + name + '}').join(String(value))
      }
      return result
    }

    /** Translate through the host locale seat, falling back to the zh dictionary. */
    function t(key, params) {
      let value = null
      try {
        if (typeof boundTranslate === 'function') value = boundTranslate(key)
      } catch (error) {
        value = null
      }
      if (typeof value !== 'string' || value.length === 0) {
        const fallback = ZH[key]
        value = typeof fallback === 'string' ? fallback : key
      }
      try {
        return interpolate(value, params)
      } catch (error) {
        return value
      }
    }

    const ERROR_KEYS = {
      'api-key-not-configured': 'error.api-key-not-configured',
      'api-key-rejected': 'error.api-key-rejected',
      'voice-required': 'error.voice-required',
      'no-text': 'error.no-text',
      'text-too-long': 'error.text-too-long',
      'rate-limited': 'error.rate-limited',
      'provider-error': 'error.provider-error',
      'provider-timeout': 'error.provider-timeout',
      'audio-too-large': 'error.audio-too-large',
      'invalid-format': 'error.invalid-format',
      'invalid-request': 'error.invalid-request',
      network: 'error.network',
      'play-failed': 'error.play-failed',
      'autoplay-blocked': 'error.autoplay-blocked',
    }

    function errorText(code) {
      const key = typeof code === 'string' ? ERROR_KEYS[code] : null
      return key ? t(key) : t('error.generic')
    }

    /* ------------------------------------------------------------------ */
    /* Small stores                                                        */
    /* ------------------------------------------------------------------ */

    function createStore(initial) {
      let snapshot = initial
      const listeners = new Set()
      return {
        getSnapshot: () => snapshot,
        subscribe: (listener) => {
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
        set: (patch) => {
          const next = Object.assign({}, snapshot, patch)
          let changed = false
          for (const key of Object.keys(next)) {
            if (next[key] !== snapshot[key]) {
              changed = true
              break
            }
          }
          if (!changed) return
          snapshot = next
          for (const listener of Array.from(listeners)) {
            try {
              listener()
            } catch (error) {
              /* a failing subscriber must not break the others */
            }
          }
        },
      }
    }

    /** Bumped whenever the host locale changes, so slot copy follows the switch. */
    const localeRevision = createStore({ revision: 0 })

    function useLocaleRevision() {
      const state = useSyncExternalStore(localeRevision.subscribe, localeRevision.getSnapshot)
      return state.revision
    }

    /* ------------------------------------------------------------------ */
    /* HTTP client                                                         */
    /* ------------------------------------------------------------------ */

    function endpoint(path) {
      const relative = ROUTE_PREFIX + String(path || '')
      try {
        const url = new URL(relative, document.baseURI)
        // Keep the query string: /voices?provider=minimax needs it.
        return url.pathname + url.search
      } catch (error) {
        return '/' + relative
      }
    }

    function failure(code, message) {
      const error = new Error(typeof message === 'string' && message ? message : String(code))
      error.code = typeof code === 'string' && code ? code : 'provider-error'
      return error
    }

    function codeOf(error) {
      if (error && typeof error.code === 'string' && error.code) return error.code
      return 'network'
    }

    async function readJSON(response) {
      try {
        return await response.json()
      } catch (error) {
        return null
      }
    }

    function codeFromBody(body) {
      if (body && typeof body === 'object' && typeof body.error === 'string' && body.error) return body.error
      return null
    }

    async function callJSON(path, options) {
      let response
      try {
        response = await fetch(endpoint(path), Object.assign({ credentials: 'same-origin' }, options))
      } catch (error) {
        throw failure('network')
      }
      const body = await readJSON(response)
      if (!response.ok) {
        throw failure(codeFromBody(body) || (response.status === 401 || response.status === 403
          ? 'api-key-rejected'
          : 'provider-error'))
      }
      if (body === null || typeof body !== 'object') throw failure('provider-error')
      return body
    }

    function apiGetConfig() {
      return callJSON('config', { headers: { accept: 'application/json' } })
    }

    function apiSaveConfig(patch) {
      return callJSON('config', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(patch || {}),
      })
    }

    function apiGetVoices(provider) {
      return callJSON('voices?provider=' + encodeURIComponent(provider), { headers: { accept: 'application/json' } })
    }

    function apiGetHistory() {
      return callJSON('history', { headers: { accept: 'application/json' } })
    }

    function apiClearHistory() {
      return callJSON('history', { method: 'DELETE', headers: { accept: 'application/json' } })
    }

    /* ------------------------------------------------------------------ */
    /* Text preparation                                                    */
    /* ------------------------------------------------------------------ */

    const SENTENCE_END = '。！？!?；;…\n'

    /** Strip fenced code, inline code, markup and emphasis before speaking. */
    function plainText(value) {
      let text = typeof value === 'string' ? value : ''
      if (text.length === 0) return ''
      try {
        text = text.replace(/```[\s\S]*?```/g, ' ')
        text = text.replace(/~~~[\s\S]*?~~~/g, ' ')
        text = text.replace(/`([^`]*)`/g, '$1')
        text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        text = text.replace(/<[^>]+>/g, ' ')
        text = text.replace(/^\s{0,3}#{1,6}\s+/gm, '')
        text = text.replace(/^\s{0,3}>\s?/gm, '')
        text = text.replace(/^\s{0,3}[-*+]\s+/gm, '')
        text = text.replace(/^\s{0,3}\d+[.)]\s+/gm, '')
        text = text.replace(/\*\*([\s\S]*?)\*\*/g, '$1')
        text = text.replace(/__([\s\S]*?)__/g, '$1')
        text = text.replace(/~~([\s\S]*?)~~/g, '$1')
        text = text.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?]|$)/g, '$1$2')
        text = text.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?]|$)/g, '$1$2')
        text = text.replace(/^\s*\|.*\|\s*$/gm, ' ')
        text = text.replace(/[ \t]+/g, ' ')
        text = text.replace(/\n{3,}/g, '\n\n')
      } catch (error) {
        /* keep whatever we already have */
      }
      return text.trim()
    }

    function clampNumber(value, minimum, maximum, fallback) {
      const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''))
      if (!Number.isFinite(parsed)) return fallback
      if (parsed < minimum) return minimum
      if (parsed > maximum) return maximum
      return parsed
    }

    function chunkLimit(value) {
      return Math.round(clampNumber(value, 200, 4000, 1800))
    }

    function hardSplit(piece, limit) {
      const parts = []
      let rest = piece
      while (rest.length > limit) {
        let cut = -1
        const floor = Math.floor(limit * 0.5)
        for (let index = Math.min(limit, rest.length - 1); index > floor; index -= 1) {
          const char = rest.charAt(index)
          if (char === ' ' || char === '\n' || char === ',' || char === '，' || char === '、') {
            cut = index + 1
            break
          }
        }
        if (cut <= 0) cut = limit
        parts.push(rest.slice(0, cut))
        rest = rest.slice(cut)
      }
      if (rest.length > 0) parts.push(rest)
      return parts
    }

    /** Split prepared text at sentence boundaries into ordered speakable chunks. */
    function splitForSpeech(value, maxChars) {
      const text = plainText(value)
      if (text.length === 0) return []
      const limit = chunkLimit(maxChars)
      const sentences = []
      let buffer = ''
      for (let index = 0; index < text.length; index += 1) {
        const char = text.charAt(index)
        buffer += char
        if (SENTENCE_END.indexOf(char) >= 0) {
          sentences.push(buffer)
          buffer = ''
        }
      }
      if (buffer.length > 0) sentences.push(buffer)
      const chunks = []
      let current = ''
      for (const sentence of sentences) {
        if (sentence.length > limit) {
          if (current.trim().length > 0) {
            chunks.push(current.trim())
            current = ''
          }
          for (const part of hardSplit(sentence, limit)) {
            if (part.trim().length > 0) chunks.push(part.trim())
          }
          continue
        }
        if (current.length + sentence.length > limit && current.trim().length > 0) {
          chunks.push(current.trim())
          current = ''
        }
        current += sentence
      }
      if (current.trim().length > 0) chunks.push(current.trim())
      return chunks.filter((chunk) => chunk.length > 0)
    }

    /* ------------------------------------------------------------------ */
    /* Chat text extraction                                                */
    /* ------------------------------------------------------------------ */

    function assistantBlocksText(blocks) {
      try {
        if (!Array.isArray(blocks)) return ''
        const parts = []
        for (const block of blocks) {
          if (!block || typeof block !== 'object') continue
          if (block.kind === 'text' && typeof block.text === 'string' && block.text.length > 0) {
            parts.push(block.text)
          }
        }
        return parts.join('\n\n')
      } catch (error) {
        return ''
      }
    }

    function chatNodeList(chat) {
      try {
        if (!chat || typeof chat !== 'object') return []
        const legacy = chat.legacy
        if (legacy && Array.isArray(legacy.nodes)) return legacy.nodes
        const nodes = chat.nodes
        if (Array.isArray(nodes)) return nodes
        if (nodes && typeof nodes.values === 'function') return Array.from(nodes.values())
      } catch (error) {
        return []
      }
      return []
    }

    function messageTextFromChat(chat, messageId) {
      if (typeof messageId !== 'string' || messageId.length === 0) return ''
      try {
        for (const node of chatNodeList(chat)) {
          if (!node || typeof node !== 'object') continue
          if (node.kind !== 'assistant' || node.messageId !== messageId) continue
          const text = plainText(assistantBlocksText(node.blocks))
          if (text.length > 0) return text
        }
      } catch (error) {
        return ''
      }
      return ''
    }

    function assistantNodeTime(chat, messageId) {
      if (typeof messageId !== 'string' || messageId.length === 0) return null
      try {
        for (const node of chatNodeList(chat)) {
          if (!node || typeof node !== 'object') continue
          if (node.kind !== 'assistant' || node.messageId !== messageId) continue
          if (typeof node.time === 'number' && Number.isFinite(node.time)) return node.time
          return null
        }
      } catch (error) {
        return null
      }
      return null
    }

    function latestAssistantText(chat) {
      try {
        const list = chatNodeList(chat)
        for (let index = list.length - 1; index >= 0; index -= 1) {
          const node = list[index]
          if (!node || typeof node !== 'object' || node.kind !== 'assistant') continue
          const text = plainText(assistantBlocksText(node.blocks))
          if (text.length > 0) return text
        }
      } catch (error) {
        return ''
      }
      return ''
    }

    const selectLatestAssistantText = (chat) => latestAssistantText(chat)

    /** Message id of the newest assistant row: only that reply may auto-read. */
    function latestAssistantMessageId(chat) {
      try {
        const list = chatNodeList(chat)
        for (let index = list.length - 1; index >= 0; index -= 1) {
          const node = list[index]
          if (!node || typeof node !== 'object' || node.kind !== 'assistant') continue
          if (typeof node.messageId === 'string' && node.messageId.length > 0) return node.messageId
        }
      } catch (error) {
        return ''
      }
      return ''
    }

    /**
     * Message ids that automatic reading already handled. This is client memory only:
     * a page reload may replay the newest reply once, which beats silently never speaking.
     * It also keeps a re-render from starting the same reply twice.
     */
    const autoReadLog = (() => {
      const seen = new Set()
      const order = []
      return {
        has(id) {
          return typeof id === 'string' && seen.has(id)
        },
        mark(id) {
          if (typeof id !== 'string' || id.length === 0 || seen.has(id)) return
          seen.add(id)
          order.push(id)
          if (order.length > 200) {
            const oldest = order.shift()
            seen.delete(oldest)
          }
        },
      }
    })()

    /**
     * Last assistant text seen by the transcript actions. The main panel cannot
     * always bind the Chat snapshot, and the Conversation unmounts while the
     * sidebar panel owns the central column, so actions publish what they see.
     */
    const assistantCache = (() => {
      const store = createStore({ sessionId: null, messageId: null, text: '', time: null })
      return {
        getSnapshot: store.getSnapshot,
        subscribe: store.subscribe,
        report: (input) => {
          try {
            if (!input || typeof input.text !== 'string' || input.text.length === 0) return
            const current = store.getSnapshot()
            const time = typeof input.time === 'number' ? input.time : null
            if (current.text.length > 0 && time !== null && typeof current.time === 'number' && time < current.time) return
            if (current.text === input.text && current.messageId === input.messageId) return
            store.set({
              sessionId: typeof input.sessionId === 'string' ? input.sessionId : null,
              messageId: typeof input.messageId === 'string' ? input.messageId : null,
              text: input.text,
              time,
            })
          } catch (error) {
            /* publishing is best effort */
          }
        },
      }
    })()

    /* ------------------------------------------------------------------ */
    /* Config store                                                        */
    /* ------------------------------------------------------------------ */

    const configStore = (() => {
      const store = createStore({
        status: 'idle',
        config: null,
        credentials: null,
        providers: null,
        version: null,
        error: null,
      })
      let pending = null

      function apply(body) {
        store.set({
          status: 'ready',
          config: body && body.config ? body.config : null,
          credentials: body && body.credentials ? body.credentials : null,
          providers: body && body.providers ? body.providers : null,
          version: body && typeof body.version === 'string' ? body.version : null,
          error: null,
        })
      }

      async function load(force) {
        if (pending) return pending
        const current = store.getSnapshot()
        if (!force && current.status === 'ready') return current
        if (!force && current.status === 'loading') return current
        store.set({ status: 'loading', error: null })
        pending = (async () => {
          try {
            apply(await apiGetConfig())
          } catch (error) {
            store.set({ status: 'error', error: codeOf(error) })
          } finally {
            pending = null
          }
          return store.getSnapshot()
        })()
        return pending
      }

      async function save(patch) {
        const body = await apiSaveConfig(patch)
        const current = store.getSnapshot()
        store.set({
          status: 'ready',
          config: body && body.config ? body.config : current.config,
          credentials: body && body.credentials ? body.credentials : current.credentials,
          providers: current.providers,
          error: null,
        })
        return store.getSnapshot()
      }

      return { subscribe: store.subscribe, getSnapshot: store.getSnapshot, load, save }
    })()

    function useConfigSnapshot() {
      return useSyncExternalStore(configStore.subscribe, configStore.getSnapshot)
    }

    function speechRequestFromConfig(config) {
      const request = {}
      if (!config || typeof config !== 'object') return request
      try {
        if (config.provider === 'xiaomi') {
          const xiaomi = config.xiaomi && typeof config.xiaomi === 'object' ? config.xiaomi : {}
          request.provider = 'xiaomi'
          if (typeof xiaomi.voice === 'string' && xiaomi.voice) request.voiceId = xiaomi.voice
          if (typeof xiaomi.model === 'string' && xiaomi.model) request.model = xiaomi.model
          request.speed = 1
          return request
        }
        const minimax = config.minimax && typeof config.minimax === 'object' ? config.minimax : {}
        request.provider = 'minimax'
        if (typeof minimax.voiceId === 'string' && minimax.voiceId) request.voiceId = minimax.voiceId
        if (typeof minimax.model === 'string' && minimax.model) request.model = minimax.model
        request.speed = clampNumber(minimax.speed, 0.5, 2, 1)
        request.format = minimax.format === 'wav' ? 'wav' : 'mp3'
      } catch (error) {
        return {}
      }
      return request
    }

    function maxCharsFromConfig(config) {
      if (!config || typeof config !== 'object') return 1800
      return chunkLimit(config.maxCharsPerRequest)
    }

    function enabledFromConfig(config) {
      return Boolean(config && typeof config === 'object' && config.enabled === true)
    }

    /** Whether the session is still producing the reply, so auto-read waits for the end. */
    function sessionRunning(session) {
      try {
        if (!session || typeof session !== 'object') return false
        if (session.running === true) return true
        return session.status === 'running' || session.status === 'busy'
      } catch (error) {
        return false
      }
    }

    /* ------------------------------------------------------------------ */
    /* Player                                                              */
    /* ------------------------------------------------------------------ */

    const IDLE = 'idle'
    const LOADING = 'loading'
    const PLAYING = 'playing'
    const ERROR = 'error'

    /** Browsers reject audible playback without a user gesture (NotAllowedError). */
    function isAutoplayBlocked(error) {
      try {
        if (!error) return false
        if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return true
        return /not allowed|user gesture|interact/i.test(String(error.message ?? ''))
      } catch (issue) {
        return false
      }
    }

    const player = (() => {
      const store = createStore({
        ownerKey: null,
        status: IDLE,
        code: null,
        index: 0,
        total: 0,
        finishRevision: 0,
      })
      let generation = 0
      let controller = null
      let audio = null
      let objectUrl = null

      function emit(patch) {
        store.set(patch)
      }

      function releaseAudio() {
        if (audio) {
          const element = audio
          audio = null
          try {
            element.onended = null
            element.onerror = null
            element.pause()
            element.removeAttribute('src')
          } catch (error) {
            /* releasing is best effort */
          }
        }
        if (objectUrl) {
          const url = objectUrl
          objectUrl = null
          try {
            URL.revokeObjectURL(url)
          } catch (error) {
            /* revoking is best effort */
          }
        }
      }

      function stop() {
        generation += 1
        const abort = controller
        controller = null
        if (abort) {
          try {
            abort.abort()
          } catch (error) {
            /* aborting is best effort */
          }
        }
        releaseAudio()
        const current = store.getSnapshot()
        if (current.status !== IDLE || current.ownerKey !== null) {
          emit({ ownerKey: null, status: IDLE, code: null, index: 0, total: 0 })
        }
      }

      function stopIfOwner(key) {
        if (store.getSnapshot().ownerKey === key) stop()
      }

      async function synthesize(chunk, request, expected) {
        const abort = new AbortController()
        controller = abort
        const body = { text: chunk }
        if (typeof request.provider === 'string' && request.provider) body.provider = request.provider
        if (typeof request.voiceId === 'string' && request.voiceId) body.voiceId = request.voiceId
        if (typeof request.model === 'string' && request.model) body.model = request.model
        if (typeof request.speed === 'number' && Number.isFinite(request.speed)) body.speed = request.speed
        if (request.format === 'wav' || request.format === 'mp3') body.format = request.format
        let response
        try {
          response = await fetch(endpoint('speak'), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
            credentials: 'same-origin',
            signal: abort.signal,
          })
        } catch (error) {
          throw failure('network')
        }
        if (expected !== generation) return null
        if (!response.ok) {
          const detail = await readJSON(response)
          throw failure(codeFromBody(detail) || (response.status === 401 || response.status === 403
            ? 'api-key-rejected'
            : 'provider-error'))
        }
        let blob
        try {
          blob = await response.blob()
        } catch (error) {
          throw failure('provider-error')
        }
        if (expected !== generation) return null
        if (!blob || blob.size === 0) throw failure('provider-error')
        return blob
      }

      function playClip(blob, rate, expected) {
        return new Promise((resolve, reject) => {
          let url = null
          try {
            url = URL.createObjectURL(blob)
          } catch (error) {
            reject(failure('play-failed'))
            return
          }
          objectUrl = url
          let element = null
          try {
            element = new Audio(url)
          } catch (error) {
            releaseAudio()
            reject(failure('play-failed'))
            return
          }
          audio = element
          try {
            element.playbackRate = clampNumber(rate, 0.5, 2, 1)
          } catch (error) {
            /* playbackRate is a hint */
          }
          let settled = false
          const settle = (fn, argument) => {
            if (settled) return
            settled = true
            try {
              element.onended = null
              element.onerror = null
            } catch (error) {
              /* best effort */
            }
            fn(argument)
          }
          element.onended = () => settle(resolve, undefined)
          element.onerror = () => settle(reject, failure('play-failed'))
          const started = () => {
            if (expected !== generation) return
            if (store.getSnapshot().status !== PLAYING) emit({ status: PLAYING })
          }
          try {
            const started_ = element.play()
            if (started_ && typeof started_.then === 'function') {
              started_.then(started, (error) => settle(reject, failure(isAutoplayBlocked(error) ? 'autoplay-blocked' : 'play-failed')))
            } else {
              started()
            }
          } catch (error) {
            settle(reject, failure(isAutoplayBlocked(error) ? 'autoplay-blocked' : 'play-failed'))
          }
        })
      }

      async function play(options) {
        const input = options && typeof options === 'object' ? options : {}
        const key = typeof input.ownerKey === 'string' && input.ownerKey ? input.ownerKey : 'panel'
        const running = store.getSnapshot().ownerKey === key
          && (store.getSnapshot().status === LOADING || store.getSnapshot().status === PLAYING)
        stop()
        if (running) return
        const expected = generation
        const chunks = splitForSpeech(input.text, input.maxChars)
        if (chunks.length === 0) {
          emit({ ownerKey: key, status: ERROR, code: 'no-text', index: 0, total: 0 })
          return
        }
        const request = input.request && typeof input.request === 'object' ? input.request : {}
        emit({ ownerKey: key, status: LOADING, code: null, index: 1, total: chunks.length })
        try {
          for (let index = 0; index < chunks.length; index += 1) {
            if (expected !== generation) return
            if (index > 0) emit({ index: index + 1, total: chunks.length })
            const blob = await synthesize(chunks[index], request, expected)
            if (expected !== generation || blob === null) return
            await playClip(blob, request.speed, expected)
            if (expected !== generation) return
            releaseAudio()
          }
          releaseAudio()
          emit({
            ownerKey: null,
            status: IDLE,
            code: null,
            index: 0,
            total: 0,
            finishRevision: store.getSnapshot().finishRevision + 1,
          })
        } catch (error) {
          if (expected !== generation) return
          releaseAudio()
          emit({
            ownerKey: key,
            status: ERROR,
            code: codeOf(error),
            index: 0,
            total: 0,
          })
        }
      }

      return {
        subscribe: store.subscribe,
        getSnapshot: store.getSnapshot,
        play,
        stop,
        stopIfOwner,
      }
    })()

    function usePlayerSnapshot() {
      return useSyncExternalStore(player.subscribe, player.getSnapshot)
    }

    /* ------------------------------------------------------------------ */
    /* Guards and shared hooks                                             */
    /* ------------------------------------------------------------------ */

    /** Keeps one throwing slot entry from blanking the whole slot. */
    class Guard extends React.Component {
      constructor(props) {
        super(props)
        this.state = { failed: false }
      }

      static getDerivedStateFromError() {
        return { failed: true }
      }

      componentDidCatch() {
        /* the entry renders null instead of propagating */
      }

      render() {
        if (this.state.failed) return null
        return this.props.children
      }
    }

    /**
     * Read a host-provided hook defensively. The same slot entry always receives
     * the same standard props, so the call order stays stable across renders.
     */
    function useHostHook(hook, selector, fallback) {
      if (typeof hook !== 'function') return fallback
      try {
        const value = hook(selector)
        return value === undefined || value === null ? fallback : value
      } catch (error) {
        return fallback
      }
    }

    /* ------------------------------------------------------------------ */
    /* Artwork                                                             */
    /* ------------------------------------------------------------------ */

    function SpeakerGlyph(props) {
      const input = props && typeof props === 'object' ? props : {}
      const raw = typeof input.size === 'number' && input.size > 0 ? input.size : 16
      const size = Math.round(raw)
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: input.weight,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
        focusable: 'false',
        style: { display: 'block', flex: 'none' },
      },
        h('path', { d: 'M4 9.6h3.2L12 5.4v13.2L7.2 14.4H4z' }),
        h('path', { d: 'M15.4 9.2a4 4 0 0 1 0 5.6' }),
        h('path', { d: 'M18.1 7.1a7.6 7.6 0 0 1 0 9.8' }),
      )
    }

    function SidebarIcon(props) {
      try {
        const input = props && typeof props === 'object' ? props : {}
        const raw = typeof input.size === 'number' && input.size > 0 ? input.size : 20
        const size = Math.round(raw)
        const active = input.active === true
        return h('svg', {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: active ? 1.95 : 1.55,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          focusable: 'false',
          style: { display: 'block', opacity: active ? 1 : 0.9 },
        },
          h('path', { d: 'M3.4 9.5h3.1L11 5.2v13.6L6.5 14.5H3.4z', fill: active ? 'currentColor' : 'none' }),
          h('path', { d: 'M14.4 9.6v4.8' }),
          h('path', { d: 'M17.2 7.6v8.8' }),
          h('path', { d: 'M20 10.2v3.6' }),
        )
      } catch (error) {
        return null
      }
    }

    /* ------------------------------------------------------------------ */
    /* Styles                                                              */
    /* ------------------------------------------------------------------ */

    const PANEL_CSS = `
.dsh-tts-root{height:100%;min-height:0;overflow:auto;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:14px;line-height:1.55}
.dsh-tts-page{max-width:880px;margin:0 auto;padding:28px 20px 48px;display:flex;flex-direction:column;gap:16px}
.dsh-tts-head{display:flex;flex-direction:column;gap:4px}
.dsh-tts-title{margin:0;font-size:18px;font-weight:600}
.dsh-tts-subtitle{margin:0;font-size:13px;color:var(--dsw-alias-label-secondary)}
.dsh-tts-card{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:14px}
.dsh-tts-card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.dsh-tts-card-title{margin:0;font-size:14px;font-weight:600}
.dsh-tts-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.dsh-tts-grid{display:flex;gap:12px;flex-wrap:wrap}
.dsh-tts-field{display:flex;flex-direction:column;gap:6px;flex:1 1 230px;min-width:180px}
.dsh-tts-label{font-size:12px;color:var(--dsw-alias-label-secondary)}
.dsh-tts-note{margin:0;font-size:12px;color:var(--dsw-alias-label-secondary)}
.dsh-tts-error{margin:0;font-size:12px;color:var(--dsw-alias-state-error-primary)}
.dsh-tts-ok{margin:0;font-size:12px;color:var(--dsw-alias-state-success-primary)}
.dsh-tts-input,.dsh-tts-select,.dsh-tts-textarea{font:inherit;font-size:13px;width:100%;box-sizing:border-box;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:7px 9px}
.dsh-tts-textarea{min-height:88px;resize:vertical;line-height:1.5}
.dsh-tts-input:focus-visible,.dsh-tts-select:focus-visible,.dsh-tts-textarea:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dsh-tts-button{font:inherit;font-size:13px;display:inline-flex;align-items:center;gap:6px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);padding:6px 14px;cursor:pointer}
.dsh-tts-button:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
.dsh-tts-button:disabled{opacity:.55;cursor:default}
.dsh-tts-button-primary{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.dsh-tts-button-primary:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
.dsh-tts-segment{display:inline-flex;gap:2px;padding:3px;border-radius:10px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1)}
.dsh-tts-segment-button{font:inherit;font-size:13px;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);padding:5px 14px;cursor:pointer}
.dsh-tts-segment-button[data-active='true']{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}
.dsh-tts-switch{position:relative;width:38px;height:22px;padding:0;border-radius:999px;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);flex:none}
.dsh-tts-switch[data-on='true']{background:var(--dsw-alias-brand-primary);border-color:transparent}
.dsh-tts-switch::after{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-bg-base);transition:transform .14s ease}
.dsh-tts-switch[data-on='true']::after{transform:translateX(16px)}
.dsh-tts-toggle{display:flex;align-items:center;gap:10px;cursor:pointer}
.dsh-tts-toggle-text{display:flex;flex-direction:column;gap:2px}
.dsh-tts-history{display:flex;flex-direction:column}
.dsh-tts-history-row{display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dsh-tts-history-row:last-child{border-bottom:none}
.dsh-tts-history-text{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-tts-history-meta{flex:none;font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dsh-tts-status{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary)}
.dsh-tts-spin{animation:dsh-tts-spin 1s linear infinite}
@keyframes dsh-tts-spin{to{transform:rotate(360deg)}}
`

    const ACTION_CSS = `
.dsh-tts-action{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 7px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}
.dsh-tts-action:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dsh-tts-action[data-active='true']{color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2)}
.dsh-tts-action:disabled{opacity:.55;cursor:default}
.dsh-tts-action-spin{animation:dsh-tts-action-spin 1s linear infinite}
@keyframes dsh-tts-action-spin{to{transform:rotate(360deg)}}
.dsh-tts-action-error{font-size:12px;color:var(--dsw-alias-state-error-primary);margin-left:6px}
.dsh-tts-sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
`

    /** One plugin-owned stylesheet; removed together with the plugin. */
    function installStyles() {
      try {
        if (typeof document === 'undefined' || !document.head) return () => {}
        const tag = document.createElement('style')
        tag.setAttribute('data-dsh-tts-style', NS)
        tag.textContent = PANEL_CSS + '\n' + ACTION_CSS
        document.head.appendChild(tag)
        return () => {
          try {
            tag.remove()
          } catch (error) {
            /* removal is best effort */
          }
        }
      } catch (error) {
        return () => {}
      }
    }

    /* ------------------------------------------------------------------ */
    /* Small controls                                                      */
    /* ------------------------------------------------------------------ */

    function Field(props) {
      const input = props && typeof props === 'object' ? props : {}
      return h('label', { className: 'dsh-tts-field' },
        h('span', { className: 'dsh-tts-label' }, input.label),
        input.children,
        input.hint ? h('span', { className: 'dsh-tts-note' }, input.hint) : null,
      )
    }

    function Toggle(props) {
      const input = props && typeof props === 'object' ? props : {}
      const on = input.checked === true
      return h('div', { className: 'dsh-tts-toggle' },
        h('button', {
          type: 'button',
          role: 'switch',
          'aria-checked': on,
          'aria-label': input.label,
          className: 'dsh-tts-switch',
          'data-on': on ? 'true' : 'false',
          onClick: () => {
            if (typeof input.onChange === 'function') input.onChange(!on)
          },
        }),
        h('span', { className: 'dsh-tts-toggle-text' },
          h('span', null, input.label),
          input.hint ? h('span', { className: 'dsh-tts-note' }, input.hint) : null,
        ),
      )
    }

    function SelectControl(props) {
      const input = props && typeof props === 'object' ? props : {}
      const options = Array.isArray(input.options) ? input.options : []
      return h('select', {
        className: 'dsh-tts-select',
        value: typeof input.value === 'string' ? input.value : '',
        disabled: input.disabled === true,
        onChange: (event) => {
          if (typeof input.onChange === 'function') input.onChange(event.target.value)
        },
      }, options.map((option) => h('option', {
        key: String(option.value),
        value: String(option.value),
      }, String(option.label))))
    }

    function optionList(values, current) {
      const seen = new Set()
      const list = []
      const push = (value) => {
        if (typeof value !== 'string' || value.length === 0) return
        if (seen.has(value)) return
        seen.add(value)
        list.push({ value, label: value })
      }
      for (const value of values) push(value)
      // Keep a stored value selectable even when the provider list dropped it.
      push(current)
      return list
    }

    function voiceOptions(voices, current) {
      const seen = new Set()
      const list = []
      const push = (id, name) => {
        if (typeof id !== 'string' || id.length === 0) return
        if (seen.has(id)) return
        seen.add(id)
        list.push({ value: id, label: typeof name === 'string' && name ? name : id })
      }
      for (const voice of voices) {
        if (typeof voice === 'string') push(voice, voice)
        else if (voice && typeof voice === 'object') push(voice.id, voice.name)
      }
      // Keep a stored voice selectable even when the voice list no longer has it.
      push(current, current)
      return list
    }

    function formatClock(value) {
      try {
        const date = new Date(value)
        if (Number.isNaN(date.getTime())) return ''
        return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
      } catch (error) {
        return ''
      }
    }

    /* ------------------------------------------------------------------ */
    /* Sidebar entry                                                       */
    /* ------------------------------------------------------------------ */

    function SidebarEntry(props) {
      return h(Guard, null, h(SidebarIcon, props))
    }

    /* ------------------------------------------------------------------ */
    /* Main panel                                                          */
    /* ------------------------------------------------------------------ */

    function draftFromConfig(config) {
      const source = config && typeof config === 'object' ? config : {}
      const minimax = source.minimax && typeof source.minimax === 'object' ? source.minimax : {}
      const xiaomi = source.xiaomi && typeof source.xiaomi === 'object' ? source.xiaomi : {}
      return {
        provider: source.provider === 'xiaomi' ? 'xiaomi' : 'minimax',
        enabled: source.enabled === true,
        autoRead: source.autoRead === true,
        minimax: {
          baseURL: typeof minimax.baseURL === 'string' ? minimax.baseURL : '',
          model: typeof minimax.model === 'string' ? minimax.model : '',
          voiceId: typeof minimax.voiceId === 'string' ? minimax.voiceId : '',
          speed: clampNumber(minimax.speed, 0.5, 2, 1),
          format: minimax.format === 'wav' ? 'wav' : 'mp3',
          apiKeyEnv: typeof minimax.apiKeyEnv === 'string' ? minimax.apiKeyEnv : 'MINIMAX_CN_API_KEY',
          apiKey: '',
        },
        xiaomi: {
          baseURL: typeof xiaomi.baseURL === 'string' ? xiaomi.baseURL : '',
          model: typeof xiaomi.model === 'string' ? xiaomi.model : '',
          voice: typeof xiaomi.voice === 'string' ? xiaomi.voice : '',
          instruction: typeof xiaomi.instruction === 'string' ? xiaomi.instruction : '',
          apiKeyEnv: typeof xiaomi.apiKeyEnv === 'string' ? xiaomi.apiKeyEnv : 'XIAOMI_MIMO_API_KEY',
          apiKey: '',
        },
      }
    }

    function patchFromDraft(draft, touched) {
      const patch = {
        provider: draft.provider === 'xiaomi' ? 'xiaomi' : 'minimax',
        enabled: draft.enabled === true,
        autoRead: draft.autoRead === true,
        minimax: {
          baseURL: draft.minimax.baseURL,
          model: draft.minimax.model,
          voiceId: draft.minimax.voiceId,
          speed: clampNumber(draft.minimax.speed, 0.5, 2, 1),
          format: draft.minimax.format === 'wav' ? 'wav' : 'mp3',
          apiKeyEnv: draft.minimax.apiKeyEnv,
        },
        xiaomi: {
          baseURL: draft.xiaomi.baseURL,
          model: draft.xiaomi.model,
          voice: draft.xiaomi.voice,
          instruction: draft.xiaomi.instruction,
          apiKeyEnv: draft.xiaomi.apiKeyEnv,
        },
      }
      if (touched && touched.minimax) patch.minimax.apiKey = draft.minimax.apiKey
      if (touched && touched.xiaomi) patch.xiaomi.apiKey = draft.xiaomi.apiKey
      return patch
    }

    function credentialName(config, credentials, provider) {
      try {
        const entry = credentials && typeof credentials === 'object' ? credentials[provider] : null
        if (!entry || entry.configured !== true) return null
        const source = typeof entry.source === 'string' ? entry.source : ''
        const separator = source.indexOf(':')
        if (separator >= 0) {
          const name = source.slice(separator + 1)
          if (name) return name
        }
        const configured = config && config[provider] && typeof config[provider].apiKeyEnv === 'string'
          ? config[provider].apiKeyEnv
          : ''
        if (configured) return configured
        return provider === 'xiaomi' ? 'XIAOMI_MIMO_API_KEY' : 'MINIMAX_CN_API_KEY'
      } catch (error) {
        return null
      }
    }

    function Panel(props) {
      return h(Guard, null, h(PanelInner, props && typeof props === 'object' ? props : {}))
    }

    function PanelInner(props) {
      // Re-render this slot entry when the host locale changes.
      useLocaleRevision()
      const configSnapshot = useConfigSnapshot()
      const playerState = usePlayerSnapshot()
      const [draft, setDraft] = useState(null)
      const [touched, setTouched] = useState({ minimax: false, xiaomi: false })
      const [saveState, setSaveState] = useState('idle')
      const [saveError, setSaveError] = useState(null)
      const [testText, setTestText] = useState('')
      const [hint, setHint] = useState(null)
      const [voices, setVoices] = useState(null)
      const [voicesLoading, setVoicesLoading] = useState(false)
      const [voicesFallback, setVoicesFallback] = useState(false)
      const [history, setHistory] = useState([])
      const [historyError, setHistoryError] = useState(null)
      const [clearing, setClearing] = useState(false)
      const savedTimer = useRef(null)
      const voicesRequested = useRef(false)
      const historyRevision = useRef(-1)

      const config = configSnapshot.config
      const credentials = configSnapshot.credentials
      const providers = configSnapshot.providers

      const chatText = useHostHook(
        props.useChat,
        selectLatestAssistantText,
        '',
      )
      const cachedAssistant = useSyncExternalStore(assistantCache.subscribe, assistantCache.getSnapshot)
      const latestText = typeof chatText === 'string' && chatText.length > 0
        ? chatText
        : (cachedAssistant && typeof cachedAssistant.text === 'string' ? cachedAssistant.text : '')

      useEffect(() => {
        void configStore.load(false)
      }, [])

      useEffect(() => {
        if (configSnapshot.status === 'ready' && draft === null) setDraft(draftFromConfig(config))
      }, [configSnapshot.status, config, draft])

      const refreshHistory = useCallback(async () => {
        try {
          const body = await apiGetHistory()
          const items = body && Array.isArray(body.items) ? body.items : []
          setHistory(items)
          setHistoryError(null)
        } catch (error) {
          setHistoryError(codeOf(error))
        }
      }, [])

      useEffect(() => {
        void refreshHistory()
      }, [refreshHistory])

      useEffect(() => {
        const revision = playerState.finishRevision
        if (revision === historyRevision.current) return
        historyRevision.current = revision
        if (revision > 0) void refreshHistory()
      }, [playerState.finishRevision, refreshHistory])

      useEffect(() => () => {
        if (savedTimer.current !== null) {
          clearTimeout(savedTimer.current)
          savedTimer.current = null
        }
      }, [])

      const loadVoices = useCallback(async () => {
        setVoicesLoading(true)
        setVoicesFallback(false)
        try {
          const body = await apiGetVoices('minimax')
          const list = body && Array.isArray(body.voices) ? body.voices : []
          if (list.length > 0) {
            setVoices(list)
          } else {
            setVoices([])
            setVoicesFallback(true)
          }
        } catch (error) {
          setVoices([])
          setVoicesFallback(true)
        } finally {
          setVoicesLoading(false)
        }
      }, [])

      useEffect(() => {
        if (!draft || draft.provider !== 'minimax') return
        if (voicesRequested.current) return
        voicesRequested.current = true
        void loadVoices()
      }, [draft, loadVoices])

      useEffect(() => () => player.stopIfOwner('panel'), [])

      const update = useCallback((patch) => {
        setDraft((current) => {
          if (!current) return current
          const next = Object.assign({}, current, patch)
          if (patch && patch.minimax) next.minimax = Object.assign({}, current.minimax, patch.minimax)
          if (patch && patch.xiaomi) next.xiaomi = Object.assign({}, current.xiaomi, patch.xiaomi)
          return next
        })
      }, [])

      const markTouched = useCallback((provider) => {
        setTouched((current) => (current[provider] ? current : Object.assign({}, current, { [provider]: true })))
      }, [])

      const handleSave = useCallback(async () => {
        if (!draft) return
        setSaveState('saving')
        setSaveError(null)
        if (savedTimer.current !== null) {
          clearTimeout(savedTimer.current)
          savedTimer.current = null
        }
        try {
          const snapshot = await configStore.save(patchFromDraft(draft, touched))
          setDraft(draftFromConfig(snapshot.config))
          setTouched({ minimax: false, xiaomi: false })
          setSaveState('saved')
          savedTimer.current = setTimeout(() => {
            savedTimer.current = null
            setSaveState('idle')
          }, 2200)
        } catch (error) {
          setSaveState('error')
          setSaveError(codeOf(error))
        }
      }, [draft, touched])

      const speakText = useCallback((text, key) => {
        const source = draft || draftFromConfig(config)
        void player.play({
          ownerKey: key,
          text,
          request: speechRequestFromConfig(source),
          maxChars: maxCharsFromConfig(config),
        })
      }, [draft, config])

      const handleTestRead = useCallback(() => {
        const text = plainText(testText)
        if (text.length === 0) {
          setHint('test.empty')
          return
        }
        setHint(null)
        speakText(text, 'panel')
      }, [testText, speakText])

      const handleLatestReply = useCallback(() => {
        if (latestText.length === 0) {
          setHint('test.noReply')
          return
        }
        setHint(null)
        speakText(latestText, 'panel')
      }, [latestText, speakText])

      const handleClearHistory = useCallback(async () => {
        setClearing(true)
        try {
          const body = await apiClearHistory()
          setHistory(body && Array.isArray(body.items) ? body.items : [])
          setHistoryError(null)
        } catch (error) {
          setHistoryError(codeOf(error))
        } finally {
          setClearing(false)
        }
      }, [])

      const provider = draft ? draft.provider : 'minimax'
      const panelBusy = playerState.ownerKey === 'panel'
        && (playerState.status === LOADING || playerState.status === PLAYING)
      const minimaxMeta = providers && providers.minimax && typeof providers.minimax === 'object'
        ? providers.minimax
        : {}
      const xiaomiMeta = providers && providers.xiaomi && typeof providers.xiaomi === 'object'
        ? providers.xiaomi
        : {}
      const minimaxVoices = Array.isArray(voices) && voices.length > 0
        ? voices
        : (Array.isArray(minimaxMeta.defaultVoices) ? minimaxMeta.defaultVoices : [])
      const xiaomiVoices = Array.isArray(xiaomiMeta.voices) ? xiaomiMeta.voices : []
      const minimaxModels = Array.isArray(minimaxMeta.models) ? minimaxMeta.models : []
      const xiaomiModels = Array.isArray(xiaomiMeta.models) ? xiaomiMeta.models : []
      const minimaxKeyName = credentialName(config, credentials, 'minimax')
      const xiaomiKeyName = credentialName(config, credentials, 'xiaomi')

      const header = h('div', { className: 'dsh-tts-head' },
        h('h2', { className: 'dsh-tts-title' }, t('panel.title')),
        h('p', { className: 'dsh-tts-subtitle' }, t('panel.subtitle')),
      )

      if (configSnapshot.status !== 'ready' || draft === null) {
        const message = configSnapshot.status === 'error' ? errorText(configSnapshot.error) : t('panel.loading')
        return h('div', { className: 'dsh-tts-root' },
          h('div', { className: 'dsh-tts-page' },
            header,
            h('div', { className: 'dsh-tts-card' },
              h('p', { className: configSnapshot.status === 'error' ? 'dsh-tts-error' : 'dsh-tts-note' }, message),
              configSnapshot.status === 'error'
                ? h('div', { className: 'dsh-tts-row' },
                  h('button', {
                    type: 'button',
                    className: 'dsh-tts-button',
                    onClick: () => {
                      void configStore.load(true)
                    },
                  }, t('panel.retry')),
                )
                : null,
            ),
          ),
        )
      }

      const providerCard = h('section', { className: 'dsh-tts-card' },
        h('div', { className: 'dsh-tts-card-head' },
          h('h3', { className: 'dsh-tts-card-title' }, t('provider.label')),
        ),
        h('div', { className: 'dsh-tts-row' },
          h('div', { className: 'dsh-tts-segment', role: 'group', 'aria-label': t('provider.label') },
            h('button', {
              type: 'button',
              className: 'dsh-tts-segment-button',
              'data-active': provider === 'minimax' ? 'true' : 'false',
              'aria-pressed': provider === 'minimax',
              onClick: () => update({ provider: 'minimax' }),
            }, t('provider.minimax')),
            h('button', {
              type: 'button',
              className: 'dsh-tts-segment-button',
              'data-active': provider === 'xiaomi' ? 'true' : 'false',
              'aria-pressed': provider === 'xiaomi',
              onClick: () => update({ provider: 'xiaomi' }),
            }, t('provider.xiaomi')),
          ),
        ),
        h('p', { className: 'dsh-tts-note' }, t(provider === 'xiaomi' ? 'provider.xiaomiHint' : 'provider.minimaxHint')),
      )

      const sharedCard = h('section', { className: 'dsh-tts-card' },
        h('div', { className: 'dsh-tts-card-head' },
          h('h3', { className: 'dsh-tts-card-title' }, t('settings.title')),
        ),
        h(Toggle, {
          checked: draft.enabled,
          label: t('settings.enabled'),
          hint: t('settings.enabledHint'),
          onChange: (value) => update({ enabled: value }),
        }),
        h(Toggle, {
          checked: draft.autoRead,
          label: t('settings.autoRead'),
          hint: t('settings.autoReadHint'),
          onChange: (value) => update({ autoRead: value }),
        }),
      )

      const secretField = (providerId, keyName, current) => h(Field, {
        label: t('settings.apiKey'),
        hint: t('settings.apiKeyKeep'),
      },
      h('input', {
        className: 'dsh-tts-input',
        type: 'password',
        autocomplete: 'off',
        spellCheck: false,
        placeholder: keyName ? t('settings.apiKeyConfigured', { name: keyName }) : t('settings.apiKeyPlaceholder'),
        value: current,
        onChange: (event) => {
          markTouched(providerId)
          if (providerId === 'xiaomi') update({ xiaomi: { apiKey: event.target.value } })
          else update({ minimax: { apiKey: event.target.value } })
        },
      }))

      const minimaxFields = h('div', { className: 'dsh-tts-grid' },
        h(Field, { label: t('settings.baseURL') },
          h('input', {
            className: 'dsh-tts-input',
            type: 'text',
            spellCheck: false,
            value: draft.minimax.baseURL,
            onChange: (event) => update({ minimax: { baseURL: event.target.value } }),
          }),
        ),
        h(Field, { label: t('settings.model') },
          h(SelectControl, {
            value: draft.minimax.model,
            options: optionList(minimaxModels, draft.minimax.model),
            onChange: (value) => update({ minimax: { model: value } }),
          }),
        ),
        h(Field, {
          label: t('settings.voice'),
          hint: voicesLoading
            ? t('settings.voiceLoading')
            : (voicesFallback ? t('settings.voiceFallback') : null),
        },
          h(SelectControl, {
            value: draft.minimax.voiceId,
            options: voiceOptions(minimaxVoices, draft.minimax.voiceId),
            onChange: (value) => update({ minimax: { voiceId: value } }),
          }),
        ),
        h(Field, { label: t('settings.speed', { value: draft.minimax.speed.toFixed(1) }) },
          h('input', {
            className: 'dsh-tts-input',
            type: 'range',
            min: 0.5,
            max: 2,
            step: 0.1,
            value: draft.minimax.speed,
            onChange: (event) => update({ minimax: { speed: clampNumber(event.target.value, 0.5, 2, 1) } }),
          }),
        ),
        h(Field, { label: t('settings.format') },
          h(SelectControl, {
            value: draft.minimax.format,
            options: [{ value: 'mp3', label: 'mp3' }, { value: 'wav', label: 'wav' }],
            onChange: (value) => update({ minimax: { format: value } }),
          }),
        ),
        h(Field, { label: t('settings.apiKeyEnv') },
          h('input', {
            className: 'dsh-tts-input',
            type: 'text',
            spellCheck: false,
            value: draft.minimax.apiKeyEnv,
            onChange: (event) => update({ minimax: { apiKeyEnv: event.target.value } }),
          }),
        ),
        secretField('minimax', minimaxKeyName, draft.minimax.apiKey),
      )

      const xiaomiFields = h('div', { className: 'dsh-tts-grid' },
        h(Field, { label: t('settings.baseURL') },
          h('input', {
            className: 'dsh-tts-input',
            type: 'text',
            spellCheck: false,
            value: draft.xiaomi.baseURL,
            onChange: (event) => update({ xiaomi: { baseURL: event.target.value } }),
          }),
        ),
        h(Field, { label: t('settings.model') },
          h(SelectControl, {
            value: draft.xiaomi.model,
            options: optionList(xiaomiModels, draft.xiaomi.model),
            onChange: (value) => update({ xiaomi: { model: value } }),
          }),
        ),
        h(Field, { label: t('settings.voice') },
          h(SelectControl, {
            value: draft.xiaomi.voice,
            options: voiceOptions(xiaomiVoices, draft.xiaomi.voice),
            onChange: (value) => update({ xiaomi: { voice: value } }),
          }),
        ),
        h(Field, { label: t('settings.apiKeyEnv') },
          h('input', {
            className: 'dsh-tts-input',
            type: 'text',
            spellCheck: false,
            value: draft.xiaomi.apiKeyEnv,
            onChange: (event) => update({ xiaomi: { apiKeyEnv: event.target.value } }),
          }),
        ),
        secretField('xiaomi', xiaomiKeyName, draft.xiaomi.apiKey),
        h(Field, { label: t('settings.instruction') },
          h('textarea', {
            className: 'dsh-tts-textarea',
            value: draft.xiaomi.instruction,
            onChange: (event) => update({ xiaomi: { instruction: event.target.value } }),
          }),
        ),
      )

      const settingsCard = h('section', { className: 'dsh-tts-card' },
        provider === 'minimax' ? minimaxFields : xiaomiFields,
        h('div', { className: 'dsh-tts-row' },
          h('button', {
            type: 'button',
            className: 'dsh-tts-button dsh-tts-button-primary',
            disabled: saveState === 'saving',
            onClick: () => {
              void handleSave()
            },
          }, t(saveState === 'saving' ? 'settings.saving' : 'settings.save')),
          saveState === 'saved' ? h('span', { className: 'dsh-tts-ok' }, t('settings.saved')) : null,
          saveState === 'error' && saveError
            ? h('span', { className: 'dsh-tts-error' }, t('settings.saveError', { message: errorText(saveError) }))
            : null,
        ),
      )

      const testCard = h('section', { className: 'dsh-tts-card' },
        h('div', { className: 'dsh-tts-card-head' },
          h('h3', { className: 'dsh-tts-card-title' }, t('test.title')),
        ),
        h('textarea', {
          className: 'dsh-tts-textarea',
          placeholder: t('test.placeholder'),
          value: testText,
          onChange: (event) => {
            setTestText(event.target.value)
            setHint(null)
          },
        }),
        h('div', { className: 'dsh-tts-row' },
          h('button', {
            type: 'button',
            className: 'dsh-tts-button dsh-tts-button-primary',
            disabled: panelBusy,
            onClick: handleTestRead,
          },
          h(SpeakerGlyph, { size: 14, weight: 1.9 }),
          t('test.read')),
          h('button', {
            type: 'button',
            className: 'dsh-tts-button',
            disabled: playerState.status === IDLE,
            onClick: () => player.stop(),
          }, t('test.stop')),
          h('button', {
            type: 'button',
            className: 'dsh-tts-button',
            disabled: panelBusy,
            onClick: handleLatestReply,
          }, t('test.latest')),
          panelBusy
            ? h('span', { className: 'dsh-tts-status', role: 'status' },
              h('span', { className: 'dsh-tts-spin', style: { display: 'inline-block' } }, h(SpeakerGlyph, { size: 14, weight: 1.9 })),
              playerState.status === LOADING
                ? t('test.busy')
                : t('test.progress', { index: playerState.index, total: playerState.total }))
            : null,
        ),
        playerState.ownerKey === 'panel' && playerState.status === ERROR && playerState.code
          ? h('p', { className: 'dsh-tts-error', role: 'status' }, errorText(playerState.code))
          : null,
        hint ? h('p', { className: 'dsh-tts-note', role: 'status' }, t(hint)) : null,
      )

      const historyRows = history.length === 0
        ? h('p', { className: 'dsh-tts-note' }, t('history.empty'))
        : h('div', { className: 'dsh-tts-history' }, history.map((item, index) => {
          const id = item && typeof item.id === 'string' ? item.id : 'row-' + index
          const key = 'history:' + id
          const itemBusy = playerState.ownerKey === key
            && (playerState.status === LOADING || playerState.status === PLAYING)
          const voice = item && typeof item.voice === 'string' && item.voice ? item.voice : t('history.unknownVoice')
          const providerLabel = item && item.provider === 'xiaomi' ? t('provider.xiaomi') : t('provider.minimax')
          const clock = item ? formatClock(item.createdAt) : ''
          return h('div', { className: 'dsh-tts-history-row', key },
            h('span', { className: 'dsh-tts-history-text', title: item && typeof item.text === 'string' ? item.text : '' },
              item && typeof item.text === 'string' ? item.text : ''),
            h('span', { className: 'dsh-tts-history-meta' },
              t('history.meta', { provider: providerLabel, voice }),
              clock ? ' · ' + clock : ''),
            h('button', {
              type: 'button',
              className: 'dsh-tts-button',
              'aria-label': itemBusy ? t('test.stop') : t('history.replay'),
              onClick: () => {
                if (itemBusy) {
                  player.stop()
                  return
                }
                speakText(item && typeof item.text === 'string' ? item.text : '', key)
              },
            }, itemBusy ? t('test.stop') : t('history.replay')),
          )
        }))

      const historyCard = h('section', { className: 'dsh-tts-card' },
        h('div', { className: 'dsh-tts-card-head' },
          h('h3', { className: 'dsh-tts-card-title' }, t('history.title')),
          h('div', { className: 'dsh-tts-row' },
            h('button', {
              type: 'button',
              className: 'dsh-tts-button',
              onClick: () => {
                void refreshHistory()
              },
            }, t('history.refresh')),
            h('button', {
              type: 'button',
              className: 'dsh-tts-button',
              disabled: clearing || history.length === 0,
              onClick: () => {
                void handleClearHistory()
              },
            }, t(clearing ? 'history.clearing' : 'history.clear')),
          ),
        ),
        historyError
          ? h('p', { className: 'dsh-tts-error', role: 'status' }, t('history.clearError', { message: errorText(historyError) }))
          : null,
        historyRows,
      )

      return h('div', { className: 'dsh-tts-root' },
        h('div', { className: 'dsh-tts-page' },
          header,
          providerCard,
          sharedCard,
          settingsCard,
          testCard,
          historyCard,
        ),
      )
    }

    /* ------------------------------------------------------------------ */
    /* Per-message read-aloud action                                       */
    /* ------------------------------------------------------------------ */

    function ReadAloudAction(props) {
      return h(Guard, null, h(ReadAloudActionInner, props && typeof props === 'object' ? props : {}))
    }

    function ReadAloudActionInner(props) {
      useLocaleRevision()
      const messageId = typeof props.messageId === 'string' ? props.messageId : ''
      const sessionId = typeof props.sessionId === 'string' ? props.sessionId : null
      const configSnapshot = useConfigSnapshot()
      const playerState = usePlayerSnapshot()
      const selector = useMemo(() => (chat) => messageTextFromChat(chat, messageId), [messageId])
      const timeSelector = useMemo(() => (chat) => assistantNodeTime(chat, messageId), [messageId])
      const latestSelector = useMemo(() => (chat) => latestAssistantMessageId(chat), [])
      const text = useHostHook(props.useChat, selector, '')
      const nodeTime = useHostHook(props.useChat, timeSelector, null)
      const latestId = useHostHook(props.useChat, latestSelector, '')
      const running = useHostHook(props.useSession, sessionRunning, false)
      const ownerKey = 'message:' + messageId
      const autoKey = 'auto:' + messageId
      const autoRead = configSnapshot.status === 'ready'
        && enabledFromConfig(configSnapshot.config)
        && configSnapshot.config.autoRead === true

      useEffect(() => {
        void configStore.load(false)
      }, [])

      useEffect(() => {
        assistantCache.report({ sessionId, messageId, text, time: nodeTime })
      }, [sessionId, messageId, text, nodeTime])

      useEffect(() => () => player.stopIfOwner(ownerKey), [ownerKey])
      useEffect(() => () => player.stopIfOwner(autoKey), [autoKey])

      // Automatic reading: the newest finished reply speaks once, and only when the
      // player is idle, so a manual read-aloud or an older reply is never interrupted.
      useEffect(() => {
        if (!autoRead) return undefined
        if (messageId === '' || messageId !== latestId) return undefined
        if (running) return undefined
        if (typeof text !== 'string' || text.length === 0) return undefined
        if (autoReadLog.has(messageId)) return undefined
        if (playerState.ownerKey !== null) return undefined
        const config = configSnapshot.config
        const timer = window.setTimeout(() => {
          if (autoReadLog.has(messageId)) return
          if (player.getSnapshot().ownerKey !== null) return
          autoReadLog.mark(messageId)
          void player.play({
            ownerKey: autoKey,
            text,
            request: speechRequestFromConfig(config),
            maxChars: maxCharsFromConfig(config),
          })
        }, 400)
        return () => window.clearTimeout(timer)
      }, [autoKey, autoRead, configSnapshot, latestId, messageId, playerState.ownerKey, running, text])

      if (typeof text !== 'string' || text.length === 0) return null
      if (configSnapshot.status === 'ready' && !enabledFromConfig(configSnapshot.config)) return null

      const active = playerState.ownerKey === ownerKey
        && (playerState.status === LOADING || playerState.status === PLAYING)
      const failed = playerState.ownerKey === ownerKey && playerState.status === ERROR
      // Automatic playback reports on its own owner key, so the row shows why nothing played.
      const autoFailed = playerState.ownerKey === autoKey && playerState.status === ERROR
      const autoBlocked = autoFailed && playerState.code === 'autoplay-blocked'
      const label = active
        ? (playerState.status === LOADING ? t('action.loading') : t('action.stop'))
        : t('action.play')

      return h('span', { key: 'dsh-tts-read' },
        h('button', {
          type: 'button',
          className: 'dsh-tts-action',
          'data-active': active ? 'true' : 'false',
          'aria-label': label,
          'aria-pressed': active,
          title: label,
          onClick: () => {
            void player.play({
              ownerKey,
              text,
              request: speechRequestFromConfig(configSnapshot.config),
              maxChars: maxCharsFromConfig(configSnapshot.config),
            })
          },
        },
        h('span', {
          className: active && playerState.status === LOADING ? 'dsh-tts-action-spin' : undefined,
          style: { display: 'inline-flex' },
        }, h(SpeakerGlyph, { size: 14, weight: 1.9 })),
        h('span', { className: 'dsh-tts-sr' }, label),
        ),
        failed && playerState.code
          ? h('span', { className: 'dsh-tts-action-error', role: 'status' }, errorText(playerState.code))
          : null,
        autoFailed && playerState.code
          ? h('span', { className: 'dsh-tts-action-error', role: 'status' }, autoBlocked ? t('action.autoplayBlocked') : errorText(playerState.code))
          : null,
      )
    }

    /* ------------------------------------------------------------------ */
    /* Registrations                                                       */
    /* ------------------------------------------------------------------ */

    function registerSlot(ctx, slotName, label, register) {
      ctx.effect(() => {
        let disposeEntry = null
        let disposeInject = null
        try {
          disposeInject = ctx.slots.inject(slotName, () => {
            try {
              disposeEntry = register()
            } catch (error) {
              disposeEntry = null
            }
            return disposeEntry
          })
        } catch (error) {
          disposeInject = null
        }
        return () => {
          if (typeof disposeEntry === 'function') {
            try {
              disposeEntry()
            } catch (error) {
              /* disposal is best effort */
            }
            disposeEntry = null
          }
          if (typeof disposeInject === 'function') {
            try {
              disposeInject()
            } catch (error) {
              /* disposal is best effort */
            }
            disposeInject = null
          }
        }
      }, 'dsh-tts-web: ' + label)
    }

    function apply(ctx) {
      ctx.effect(() => {
        try {
          return ctx.locale.register(NS, 'zh', ZH)
        } catch (error) {
          return () => {}
        }
      }, 'dsh-tts-web: zh dictionary')
      ctx.effect(() => {
        try {
          return ctx.locale.register(NS, 'en', EN)
        } catch (error) {
          return () => {}
        }
      }, 'dsh-tts-web: en dictionary')

      ctx.effect(() => {
        try {
          boundTranslate = ctx.locale.bind(NS)
        } catch (error) {
          boundTranslate = null
        }
        const revision = localeRevision.getSnapshot().revision
        localeRevision.set({ revision: revision + 1 })
        const off = ctx.locale.subscribe(() => {
          localeRevision.set({ revision: localeRevision.getSnapshot().revision + 1 })
        })
        return () => {
          if (typeof off === 'function') {
            try {
              off()
            } catch (error) {
              /* disposal is best effort */
            }
          }
          boundTranslate = null
        }
      }, 'dsh-tts-web: translator')

      ctx.effect(() => installStyles(), 'dsh-tts-web: styles')

      registerSlot(ctx, 'sidebar.panellist', 'sidebar entry', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: NS,
        order: 40,
        label: () => t('nav.label'),
      }, SidebarEntry))

      registerSlot(ctx, 'main', 'main panel', () => ctx.slots.register({
        name: 'main',
        key: NS,
        locale: NS,
      }, Panel))

      registerSlot(ctx, 'conversation.chat.assistant-actions', 'message action', () => ctx.slots.register({
        name: 'conversation.chat.assistant-actions',
        id: NS + '-read',
        order: 5,
        locale: NS,
        label: () => t('action.label'),
      }, ReadAloudAction))

      ctx.effect(() => () => player.stop(), 'dsh-tts-web: player disposal')
    }

    return {
      inject: ['slots', 'locale'],
      apply,
    }
  },
})
