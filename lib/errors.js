// Typed failures shared by the Host providers and the HTTP routes.
export class TtsError extends Error {
  constructor(code, message = '', status = 502, provider = null) {
    super(message || code)
    this.name = 'TtsError'
    this.code = code
    this.status = status
    this.provider = provider
  }
}

/** Map provider/upstream failures onto the public error codes the panel localizes. */
export function upstreamError(status, detail, provider) {
  if (status === 401 || status === 403) return new TtsError('api-key-rejected', detail, 401, provider)
  if (status === 429) return new TtsError('rate-limited', detail, 429, provider)
  if (status === 408 || status === 504) return new TtsError('provider-timeout', detail, 504, provider)
  return new TtsError('provider-error', detail, status >= 400 && status < 600 ? 502 : 502, provider)
}

export function publicError(error) {
  if (error instanceof TtsError) {
    return { error: error.code, message: error.message, status: error.status, provider: error.provider }
  }
  const message = error instanceof Error ? error.message : String(error)
  return { error: 'provider-error', message, status: 502, provider: null }
}
