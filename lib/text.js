// Speech text preparation: assistant Markdown is not readable aloud verbatim.
// The Host cleans it once so every provider receives the same spoken form.

const FENCED_CODE = /```[\s\S]*?```/g
const INDENTED_CODE = /^(?: {4,}|\t)\S.*$/gm
const HTML_TAG = /<\/?[a-z][^>]*>/gi
const IMAGE = /!\[([^\]]*)\]\([^)]*\)/g
const LINK = /\[([^\]]+)\]\([^)]*\)/g
const BARE_URL = /https?:\/\/\S+/g
const INLINE_CODE = /`([^`]*)`/g
const EMPHASIS = /(\*\*\*|\*\*|\*|___|__|_|~~)/g
const LIST_MARKER = /^\s{0,3}(?:[-*+]|\d{1,3}[.)])\s+/gm
const HEADING_MARKER = /^\s{0,3}#{1,6}\s+/gm
const QUOTE_MARKER = /^\s{0,3}>\s?/gm
const TABLE_RULE = /^\s*\|?[\s:|-]{3,}\|?\s*$/gm
const TABLE_PIPE = /\s*\|\s*/g
const HTML_ENTITY = /&(?:nbsp|amp|lt|gt|quot|#39);/g

const ENTITIES = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }

/** Turn Markdown-ish assistant output into the plain text a voice should read. */
export function prepareSpeechText(input) {
  if (typeof input !== 'string') return ''
  let text = input.replace(/\r\n?/g, '\n')
  text = text.replace(FENCED_CODE, '\n')
  text = text.replace(INDENTED_CODE, '')
  text = text.replace(IMAGE, '$1')
  text = text.replace(LINK, '$1')
  text = text.replace(BARE_URL, '')
  text = text.replace(INLINE_CODE, '$1')
  text = text.replace(HTML_TAG, '')
  text = text.replace(TABLE_RULE, '')
  text = text.replace(QUOTE_MARKER, '')
  text = text.replace(HEADING_MARKER, '')
  text = text.replace(LIST_MARKER, '')
  text = text.replace(TABLE_PIPE, '，')
  text = text.replace(EMPHASIS, '')
  text = text.replace(HTML_ENTITY, (entity) => ENTITIES[entity] ?? ' ')
  text = text.replace(/[ \t\u00a0]+/g, ' ')
  text = text.replace(/ ?\n ?/g, '\n')
  text = text.replace(/\n{2,}/g, '\n')
  return text.trim()
}

/** Cut at a sentence boundary near the limit so a provider never receives a half sentence mid-word. */
export function clampSpeechText(text, limit) {
  const trimmed = text.trim()
  if (trimmed.length <= limit) return trimmed
  const window = trimmed.slice(0, limit)
  const boundary = Math.max(
    window.lastIndexOf('。'),
    window.lastIndexOf('！'),
    window.lastIndexOf('？'),
    window.lastIndexOf('. '),
    window.lastIndexOf('! '),
    window.lastIndexOf('? '),
    window.lastIndexOf('\n'),
  )
  if (boundary > limit * 0.5) return window.slice(0, boundary + 1).trim()
  return window.trim()
}

/** Split one long text into provider-sized chunks, preferring sentence boundaries. */
export function splitSpeechText(text, limit) {
  const chunks = []
  let rest = text.trim()
  while (rest.length > limit) {
    const head = rest.slice(0, limit)
    const boundary = Math.max(
      head.lastIndexOf('。'),
      head.lastIndexOf('！'),
      head.lastIndexOf('？'),
      head.lastIndexOf('. '),
      head.lastIndexOf('! '),
      head.lastIndexOf('? '),
      head.lastIndexOf('；'),
      head.lastIndexOf('; '),
      head.lastIndexOf('\n'),
    )
    const end = boundary > limit * 0.4 ? boundary + 1 : limit
    chunks.push(rest.slice(0, end).trim())
    rest = rest.slice(end).trim()
  }
  if (rest.length > 0) chunks.push(rest)
  return chunks.filter((chunk) => chunk.length > 0)
}
