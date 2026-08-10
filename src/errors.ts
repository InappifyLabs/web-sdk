export type InAppifyErrorKind = 'api' | 'network' | 'timeout' | 'configuration' | 'storage'

export class InAppifyError extends Error {
  readonly kind: InAppifyErrorKind
  readonly code: string
  readonly status: number | null
  readonly details: unknown
  readonly requestId: string | null
  override readonly cause?: unknown

  constructor(options: {
    message: string
    code: string
    kind: InAppifyErrorKind
    status?: number | null
    details?: unknown
    requestId?: string | null
    cause?: unknown
  }) {
    super(options.message)
    this.name = 'InAppifyError'
    this.kind = options.kind
    this.code = options.code
    this.status = options.status ?? null
    this.details = options.details
    this.requestId = options.requestId ?? null
    this.cause = options.cause
  }
}

export function isInAppifyError(error: unknown): error is InAppifyError {
  return error instanceof InAppifyError
}

