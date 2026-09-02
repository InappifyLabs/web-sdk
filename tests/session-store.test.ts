import { describe, expect, it } from 'vitest'

import { InAppifyError, MemoryStorage } from '../src'
import { SessionStore } from '../src/internal/session-store'

describe('SessionStore', () => {
  it('reads beta.1 and beta.2 records without deleting or rewriting them', async () => {
    const storage = new MemoryStorage()
    const raw = JSON.stringify({
      refreshToken: 'legacy-refresh',
      refreshTokenExpiresAt: '2026-12-01T00:00:00.000Z',
    })
    await storage.setItem('legacy:session', raw)

    const session = await new SessionStore(storage, 'legacy').getSession()

    expect(session).toMatchObject({
      refreshToken: 'legacy-refresh',
      isAnonymous: null,
      revision: 0,
      storageValue: raw,
    })
    expect(await storage.getItem('legacy:session')).toBe(raw)
  })

  it('surfaces corrupted persisted data instead of treating it as a missing session', async () => {
    const storage = new MemoryStorage()
    await storage.setItem('corrupt:session', '{not-json')

    await expect(new SessionStore(storage, 'corrupt').getSession())
      .rejects.toEqual(expect.objectContaining<Partial<InAppifyError>>({
        kind: 'storage',
        code: 'STORAGE_CORRUPTED',
      }))
  })

  it('does not remove a newer session when compare-and-delete uses an older record', async () => {
    const storage = new MemoryStorage()
    const store = new SessionStore(storage, 'race')
    await store.setSession({
      refreshToken: 'old-refresh',
      refreshTokenExpiresAt: '2026-12-01T00:00:00.000Z',
      isAnonymous: false,
      revision: 1,
    })
    const oldSession = await store.getSession()
    expect(oldSession).not.toBeNull()

    await store.setSession({
      refreshToken: 'new-refresh',
      refreshTokenExpiresAt: '2026-12-01T00:00:00.000Z',
      isAnonymous: false,
      revision: 2,
    })

    expect(await store.clearSessionIfMatches(oldSession!)).toBe(false)
    expect((await store.getSession())?.refreshToken).toBe('new-refresh')
  })
})
