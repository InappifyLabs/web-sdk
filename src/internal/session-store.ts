import type { StorageAdapter } from '../storage'
import { InAppifyError } from '../errors'

export interface PersistedSession {
  refreshToken: string
  refreshTokenExpiresAt: string
  isAnonymous: boolean | null
  revision: number
  refreshIdempotencyKey?: string | undefined
  storageValue?: string | undefined
}

export class SessionStore {
  constructor(private readonly storage: StorageAdapter, private readonly prefix: string) {}

  async getSession(): Promise<PersistedSession | null> {
    const raw = await this.storage.getItem(this.sessionKey)
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as Partial<PersistedSession>
      if (typeof parsed.refreshToken !== 'string' || typeof parsed.refreshTokenExpiresAt !== 'string') throw new Error('Invalid session record.')
      return {
        refreshToken: parsed.refreshToken,
        refreshTokenExpiresAt: parsed.refreshTokenExpiresAt,
        isAnonymous: typeof parsed.isAnonymous === 'boolean' ? parsed.isAnonymous : null,
        revision: typeof parsed.revision === 'number' && Number.isSafeInteger(parsed.revision) ? parsed.revision : 0,
        ...(typeof parsed.refreshIdempotencyKey === 'string' ? { refreshIdempotencyKey: parsed.refreshIdempotencyKey } : {}),
        storageValue: raw,
      }
    } catch (cause) {
      throw new InAppifyError({ kind: 'storage', code: 'STORAGE_CORRUPTED', message: 'The persisted InAppify session is invalid.', cause })
    }
  }

  async setSession(session: PersistedSession): Promise<void> {
    await this.storage.setItem(this.sessionKey, this.serialize(session))
  }

  async replaceSessionIfMatches(expected: PersistedSession, session: PersistedSession): Promise<boolean> {
    const expectedValue = expected.storageValue ?? this.serialize(expected)
    const nextValue = this.serialize(session)
    if (this.storage.compareAndSetItem) return this.storage.compareAndSetItem(this.sessionKey, expectedValue, nextValue)
    if (await this.storage.getItem(this.sessionKey) !== expectedValue) return false
    await this.storage.setItem(this.sessionKey, nextValue)
    return true
  }

  async clearSessionIfMatches(expected: PersistedSession): Promise<boolean> {
    const expectedValue = expected.storageValue ?? this.serialize(expected)
    if (this.storage.compareAndRemoveItem) return this.storage.compareAndRemoveItem(this.sessionKey, expectedValue)
    if (await this.storage.getItem(this.sessionKey) !== expectedValue) return false
    await this.storage.removeItem(this.sessionKey)
    return true
  }

  async clearSession(): Promise<void> { await this.storage.removeItem(this.sessionKey) }

  async getInstallationId(factory: () => string): Promise<string> {
    const key = `${this.prefix}:installation`
    const existing = await this.storage.getItem(key)
    if (existing) return existing
    const created = factory()
    await this.storage.setItem(key, created)
    return created
  }

  private get sessionKey(): string { return `${this.prefix}:session` }

  private serialize(session: PersistedSession): string {
    return JSON.stringify({
      refreshToken: session.refreshToken,
      refreshTokenExpiresAt: session.refreshTokenExpiresAt,
      isAnonymous: session.isAnonymous,
      revision: session.revision,
      ...(session.refreshIdempotencyKey === undefined ? {} : { refreshIdempotencyKey: session.refreshIdempotencyKey }),
    })
  }
}
