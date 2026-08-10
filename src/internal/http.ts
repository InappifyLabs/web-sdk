import { InAppifyError } from '../errors'
import { isRecord, string } from './utils'

export interface HttpRequest {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  headers?: Readonly<Record<string, string>>
  token?: string | undefined
  signal?: AbortSignal | undefined
}

export class HttpClient {
  constructor(private readonly baseUrl: string, private readonly fetcher: typeof fetch, private readonly timeoutMs: number) {}

  async request(path: string, options: HttpRequest = {}): Promise<Record<string, unknown>> {
    const timeout = new AbortController()
    const timer = setTimeout(() => timeout.abort(), this.timeoutMs)
    const signal = options.signal ? AbortSignal.any([options.signal, timeout.signal]) : timeout.signal
    try {
      const response = await this.fetcher(`${this.baseUrl}/${path.replace(/^\//, '')}`, {
        method: options.method ?? 'GET',
        headers: {
          Accept: 'application/json',
          ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
          ...options.headers,
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        signal,
        credentials: 'omit',
      })
      const payload = await this.parse(response)
      if (!response.ok || payload.status === false) {
        throw new InAppifyError({
          kind: 'api', code: string(payload.code, `HTTP_${response.status}`),
          message: string(payload.message, `InAppify API request failed with status ${response.status}.`),
          status: response.status, details: payload.details, requestId: response.headers.get('x-request-id'),
        })
      }
      return payload
    } catch (error) {
      if (error instanceof InAppifyError) throw error
      if (timeout.signal.aborted && !options.signal?.aborted) {
        throw new InAppifyError({ kind: 'timeout', code: 'REQUEST_TIMEOUT', message: 'The InAppify API request timed out.', cause: error })
      }
      throw new InAppifyError({ kind: 'network', code: 'NETWORK_ERROR', message: 'The InAppify API could not be reached.', cause: error })
    } finally { clearTimeout(timer) }
  }

  private async parse(response: Response): Promise<Record<string, unknown>> {
    const text = await response.text()
    if (!text) return {}
    try {
      const parsed: unknown = JSON.parse(text)
      return isRecord(parsed) ? parsed : { data: parsed }
    } catch {
      throw new InAppifyError({ kind: 'api', code: 'INVALID_RESPONSE', message: 'The InAppify API returned invalid JSON.', status: response.status })
    }
  }
}

export function data(payload: Record<string, unknown>): Record<string, unknown> {
  return isRecord(payload.data) ? payload.data : payload
}
