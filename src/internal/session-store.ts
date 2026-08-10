import type { StorageAdapter } from '../storage'

export interface PersistedSession { refreshToken: string; refreshTokenExpiresAt: string }

export class SessionStore {
  constructor(private readonly storage: StorageAdapter, private readonly prefix: string) {}

  async getSession(): Promise<PersistedSession | null> {
    const raw = await this.storage.getItem(`${this.prefix}:session`)
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as Partial<PersistedSession>
      if (typeof parsed.refreshToken !== 'string' || typeof parsed.refreshTokenExpiresAt !== 'string') return null
      return { refreshToken: parsed.refreshToken, refreshTokenExpiresAt: parsed.refreshTokenExpiresAt }
    } catch { return null }
  }

  async setSession(session: PersistedSession): Promise<void> {
    await this.storage.setItem(`${this.prefix}:session`, JSON.stringify(session))
  }

  async clearSession(): Promise<void> { await this.storage.removeItem(`${this.prefix}:session`) }

  async getInstallationId(factory: () => string): Promise<string> {
    const key = `${this.prefix}:installation`
    const existing = await this.storage.getItem(key)
    if (existing) return existing
    const created = factory()
    await this.storage.setItem(key, created)
    return created
  }
}

