# Host / Client boundary

How the two halves of `dsh-tts-web` cooperate. This file is for contributors; it is not
part of the installed runtime surface.

## Halves

| Path | Half | Responsibility |
| --- | --- | --- |
| `index.js`, `lib/*.js` | Host | Same-origin synthesis routes, provider calls, settings store, credential resolution |
| `client.js` | Web Client | Sidebar entry, panel page, per-message read-aloud action, audio playback |
| `package.json`, `cordis.patch.yml`, `locale/*.json`, `icon.svg` | Bundle | Manifest, activation row, plugin display metadata |

`client.js` must not `require()` any `@deepseek-ai/*` package — only `react` and browser APIs.
No build step, no CSS files, no CDN: the browser bundle is loaded through
`window.__ModuleLoader__.load({ id, factory(require) {...} })`.

## HTTP endpoints (same origin)

Absolute paths under `/plugins/dsh-tts-web/`; the client resolves them with
`new URL('plugins/dsh-tts-web/…', document.baseURI)` and keeps the query string.

### `GET /plugins/dsh-tts-web/config`

```json
{
  "config": {
    "provider": "minimax",
    "enabled": true,
    "autoRead": false,
    "maxCharsPerRequest": 1800,
    "minimax": {
      "baseURL": "https://api.minimaxi.com",
      "model": "speech-2.6-hd",
      "voiceId": "female-shaonv",
      "speed": 1, "vol": 1, "pitch": 0,
      "format": "mp3",
      "languageBoost": "auto",
      "emotion": "",
      "apiKey": "",
      "apiKeyEnv": "MINIMAX_CN_API_KEY",
      "groupId": ""
    },
    "xiaomi": {
      "baseURL": "https://api.xiaomimimo.com/v1",
      "model": "mimo-v2.5-tts",
      "voice": "冰糖",
      "format": "mp3",
      "instruction": "请忠实朗读原文…",
      "apiKey": "",
      "apiKeyEnv": "XIAOMI_MIMO_API_KEY"
    }
  },
  "credentials": {
    "minimax": { "configured": true, "source": "credential:MINIMAX_CN_API_KEY" },
    "xiaomi": { "configured": false, "source": null }
  },
  "providers": {
    "minimax": { "models": ["speech-2.6-hd"], "defaultVoices": [{ "id": "female-shaonv", "name": "少女音色" }] },
    "xiaomi": { "models": ["mimo-v2.5-tts", "mimo-v2.5-tts-voicedesign"], "voices": ["冰糖"] }
  },
  "version": "0.1.0"
}
```

`apiKey` is always returned empty; `credentials.<provider>.configured` drives the panel
placeholder. `source` is a label such as `credential:NAME`, `process-env:NAME`, or `settings`.

### `POST /plugins/dsh-tts-web/config`

Partial config of the same shape. Omitting `apiKey` preserves the stored key; `apiKey: ""` clears it.
Returns `{ config, credentials }`.

### `POST /plugins/dsh-tts-web/speak`

```json
{ "text": "...", "provider": "minimax | xiaomi", "voiceId": "optional", "model": "optional", "speed": 1.0, "format": "mp3 | wav" }
```

Success: `audio/mpeg` or `audio/wav` bytes with `x-tts-provider`, `x-tts-voice`,
`x-tts-format`, `x-tts-duration-ms`, `x-tts-text-length`, `cache-control: no-store`.
Failure: JSON `{ error, message, provider }` with a non-2xx status. Public error codes:
`api-key-not-configured`, `api-key-rejected`, `voice-required`, `no-text`, `text-too-long`,
`rate-limited`, `provider-timeout`, `provider-error`, `audio-too-large`, `invalid-format`,
`invalid-request`, `network`, `origin-rejected`, `disabled`.

### `GET /plugins/dsh-tts-web/voices?provider=minimax`

`{ provider, voices: [{ id, name, description? }], cached: boolean }`. Upstream failure still
returns 200 with the built-in fallback list plus `error`, so the panel degrades instead of breaking.

### `GET | DELETE /plugins/dsh-tts-web/history`

`{ items: [{ id, text, provider, voice, createdAt, durationMs }] }`, newest first, at most 30
entries, text truncated to 500 characters. `DELETE` clears the list.

## Client registrations

```js
window.__ModuleLoader__.load({
  id: 'dsh-tts-web',
  factory(require) {
    const React = require('react')
    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register(
          { name: 'sidebar.panellist', id: 'dsh-tts-web', order: 40, label: () => t('nav.label') },
          SidebarIcon, // owner props: { size, active }
        ))
        ctx.slots.inject('main', () => ctx.slots.register(
          { name: 'main', key: 'dsh-tts-web', locale: 'dsh-tts-web' },
          Panel,
        ))
        ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register(
          { name: 'conversation.chat.assistant-actions', id: 'dsh-tts-web-read', order: 5, label: () => t('action.label') },
          ReadAloudAction, // owner props: { messageId }; standard props include sessionId, useChat, useSession
        ))
      },
    }
  },
})
```

Facts this design relies on (verified against the running Harness):

- `sidebar.panellist` is a root-scoped list; its `id` addresses the matching `main` keyed entry.
  The icon component receives `{ size, active }`; `label` may be a thunk and is re-read on every
  projection, so locale switches need no re-registration.
- Client services available to a dynamic bundle: `layout`, `locale`, `sessions`, `slots`, `theme`, `timer`.
- `ctx.locale.register(ns, locale, dict)` + `ctx.locale.bind(ns)`; dictionaries are **flat** key maps
  and built-in locale ids are `zh` and `en`.
- Style with `--dsw-alias-*` theme tokens only. A throwing component blanks its slot entry, so every
  component guards host values and renders `null` instead of throwing.

## Assistant text extraction

The Chat snapshot carries assistant rows. The client reads defensively and accepts the first
non-empty result: `chat.legacy.nodes` (`kind === 'assistant'` + matching `messageId`, text from
`blocks`), then `chat.nodes` as an array or Map with the same shape, then nothing — in which case
the per-message action hides itself and the panel falls back to its own text box.

Markdown (fenced code, inline code, images/links, HTML, emphasis) is stripped before speaking.
Because the Conversation unmounts while the sidebar panel owns the central column, transcript
actions also publish the latest assistant text into a module-level cache the panel can read.

Long text is split at sentence boundaries into chunks no longer than `maxCharsPerRequest`;
chunks are requested and played in order, and one stop control cancels the whole sequence.
