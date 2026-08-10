import { InAppifyError } from '../errors'

export function normalizeBaseUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, '')
  let url: URL
  try { url = new URL(normalized) } catch {
    throw new InAppifyError({ kind: 'configuration', code: 'INVALID_BASE_URL', message: 'baseUrl must be an absolute HTTP(S) URL.' })
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new InAppifyError({ kind: 'configuration', code: 'INVALID_BASE_URL', message: 'baseUrl must use HTTP or HTTPS.' })
  }
  return normalized
}

export function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16)
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16)
  })
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function string(value: unknown, fallback = ''): string { return typeof value === 'string' ? value : fallback }
export function nullableString(value: unknown): string | null { return typeof value === 'string' ? value : null }
export function number(value: unknown, fallback = 0): number { return typeof value === 'number' && Number.isFinite(value) ? value : fallback }
export function boolean(value: unknown): boolean { return value === true }
export function array(value: unknown): unknown[] { return Array.isArray(value) ? value : [] }

export function sleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError(signal)); return }
    const timer = setTimeout(resolve, milliseconds)
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(abortError(signal)) }, { once: true })
  })
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new DOMException('The operation was aborted.', 'AbortError')
}

export function safeRedirect(url: string): void {
  let target: URL
  try { target = new URL(url, typeof location === 'undefined' ? undefined : location.href) } catch {
    throw new InAppifyError({ kind: 'api', code: 'INVALID_REDIRECT_URL', message: 'The payment redirect URL is invalid.' })
  }
  if (!['https:', 'http:'].includes(target.protocol)) {
    throw new InAppifyError({ kind: 'api', code: 'INVALID_REDIRECT_URL', message: 'The payment redirect URL uses an unsupported protocol.' })
  }
  if (typeof window === 'undefined') {
    throw new InAppifyError({ kind: 'configuration', code: 'NAVIGATION_UNAVAILABLE', message: 'Automatic redirect is only available in a browser.' })
  }
  window.location.assign(target.href)
}
