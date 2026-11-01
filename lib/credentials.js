// API-key resolution. An inline key wins; otherwise the configured environment
// reference is resolved through the Host credential service (which reads the
// DSH credential store first and ambient environment variables after it).
import { TtsError } from './errors.js'

function inlineKey(settings, provider) {
  return typeof settings[provider]?.apiKey === 'string' ? settings[provider].apiKey.trim() : ''
}

function envName(settings, provider) {
  return typeof settings[provider]?.apiKeyEnv === 'string' ? settings[provider].apiKeyEnv.trim() : ''
}

/** Resolve the value to send upstream, or throw the code the panel localizes. */
export async function resolveApiKey(settings, provider, credentials) {
  const key = inlineKey(settings, provider)
  if (key !== '') return { value: key, source: 'settings' }
  const name = envName(settings, provider)
  if (name === '') throw new TtsError('api-key-not-configured', 'Configure an API key or an environment variable name.', 409, provider)
  if (credentials !== undefined && credentials !== null) {
    try {
      const resolved = await credentials.resolve(name)
      if (resolved !== undefined && resolved !== null && typeof resolved.value === 'string' && resolved.value !== '') {
        return { value: resolved.value, source: `credential:${resolved.source ?? name}` }
      }
    } catch {
      // fall through to the process environment
    }
  }
  const ambient = process.env[name]
  if (typeof ambient === 'string' && ambient.trim() !== '') return { value: ambient.trim(), source: `process-env:${name}` }
  throw new TtsError('api-key-not-configured', `No credential is configured for ${name}.`, 409, provider)
}

/** Describe configuration state for the panel without exposing the secret. */
export async function describeApiKey(settings, provider, credentials) {
  const key = inlineKey(settings, provider)
  if (key !== '') return { configured: true, source: 'settings' }
  const name = envName(settings, provider)
  if (name === '') return { configured: false, source: null }
  if (credentials !== undefined && credentials !== null) {
    try {
      const info = await credentials.describe(name)
      if (info !== undefined && info !== null && info.configured === true) {
        return { configured: true, source: `credential:${info.source ?? name}` }
      }
    } catch {
      // fall through to the process environment
    }
  }
  const ambient = process.env[name]
  if (typeof ambient === 'string' && ambient.trim() !== '') return { configured: true, source: `process-env:${name}` }
  return { configured: false, source: null }
}
