// dsh-tts-web — Host half.
// Serves the same-origin synthesis API the sidebar panel and the per-message
// read-aloud action use, and owns the plugin's durable settings store.
import { registerRoutes } from './lib/routes.js'
import { SettingsStore } from './lib/settings.js'

export const name = 'dsh-tts-web'

/** The browser carrier must exist; credentials are optional and resolved per request. */
export const inject = ['webServer']

export function apply(ctx, config) {
  const store = new SettingsStore(typeof config?.settingsPath === 'string' ? config.settingsPath : undefined)
  try {
    store.load()
  } catch (error) {
    ctx.logger?.warn?.('dsh-tts-web cannot read its settings: %s', error?.message ?? error)
  }

  ctx.effect(
    () => registerRoutes(ctx, { store, credentials: ctx.get('credentials') }),
    'dsh-tts-web: synthesis routes',
  )
}
