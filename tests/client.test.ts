import { describe, expect, it, vi } from 'vitest'

import { InAppify, InAppifyError, MemoryStorage } from '../src'

const configuration = {
  app: { id: 42, identifier: 'web', platform: 3, store_platform: 3, display_name: 'Web App', logo: null, icon: null },
  authentication: { anonymous: true, external: true, inappify_otp: true, captcha: { enabled: false, provider: 'inappify', mode: null, refresh_endpoint: null } },
  features: { attributes: true, offerings: true, checkout: true, real_payment: true, free_purchase: true, anonymous_purchase: true, trial: true },
  attributes: { writable: ['language'], writable_reserved: ['$email', '$displayName'] },
}

function session(access = 'access-1', refresh = 'refresh-1') {
  return { status: true, data: {
    access_token: access, access_token_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    refresh_token: refresh, refresh_token_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    customer: { is_anonymous: true }, configuration,
  } }
}

function customer(entitlements: unknown[] = []) {
  return { status: true, data: { customerInfo: {
    originalAppUserId: '$InaAnonymousId_123', firstSeen: '2026-01-01T00:00:00+00:00', requestDate: '2026-01-01T00:00:00+00:00',
    latestExpirationDate: null, hasUsedTrial: false, entitlements, transactions: [], attributes: [],
  } } }
}

function offerings() {
  return { status: true, data: { forceVersion: 1, rules: [{
    default_offering: 'default', sort: 1, conditions: [{ field: 'any_audience', operator: null, value: null, context: null }],
    placements: { fallback_offering_id: 'default', placement_offerings: [{ placement_identifier: 'home_banner', offering_identifier: 'home' }] },
  }], offerings: [{
    identifier: 'default', isDefault: true, serverDescription: 'Default', metadata: {}, packages: [{
      identifier: 'monthly', packageType: 1, entitlement: 'premium', name: 'Monthly', description: null, discountPercent: 10,
      product: { identifier: 'premium_monthly', name: 'Premium', trialDays: 7, prices: [{ amount: 90_000, originPrice: 100_000, currency: 'IRR' }] },
    }],
  }, { identifier: 'home', isDefault: false, serverDescription: 'Home', metadata: {}, packages: [] }] } }
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
}

function mockFetch(handler: (url: string, init?: RequestInit) => Response): typeof fetch {
  return vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    return Promise.resolve(handler(url, init))
  })
}

describe('InAppify', () => {
  it('binds a caller-provided fetch implementation to the global receiver', async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = []
    const responses = [json(session(), 201), json(customer())]
    const brandCheckedFetch: typeof fetch = function (this: unknown, input, init) {
      expect(this).toBe(globalThis)
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      requests.push({ url, init })
      const response = responses.shift()
      if (!response) throw new Error(`Unexpected request: ${url}`)
      return Promise.resolve(response)
    }

    const sdk = await InAppify.configure({
      apiKey: 'public-key',
      baseUrl: 'https://inappify.test/api/web/v1',
      fetch: brandCheckedFetch,
      storage: new MemoryStorage(),
      prefetchOfferings: false,
    })

    expect(sdk.customerInfo).not.toBeNull()
    expect(requests.map(({ url }) => url)).toEqual([
      'https://inappify.test/api/web/v1/sessions',
      'https://inappify.test/api/web/v1/customerInfo',
    ])
    expect(requests[0]?.init).toMatchObject({ method: 'POST', credentials: 'omit' })
    expect(requests[0]?.init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('binds the default global fetch implementation to the global receiver', async () => {
    const originalFetch = globalThis.fetch
    const responses = [json(session(), 201), json(customer())]
    const nativeFetch: typeof fetch = vi.fn(function (this: unknown) {
      expect(this).toBe(globalThis)
      const response = responses.shift()
      if (!response) throw new Error('Unexpected fetch request.')
      return Promise.resolve(response)
    })
    globalThis.fetch = nativeFetch

    try {
      const sdk = await InAppify.configure({
        apiKey: 'public-key',
        baseUrl: 'https://inappify.test/api/web/v1',
        storage: new MemoryStorage(),
        prefetchOfferings: false,
      })

      expect(sdk.customerInfo).not.toBeNull()
      expect(nativeFetch).toHaveBeenCalledTimes(2)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('keeps FETCH_UNAVAILABLE when no fetch implementation exists', async () => {
    const originalFetch = globalThis.fetch
    Reflect.deleteProperty(globalThis, 'fetch')

    try {
      await expect(InAppify.configure({
        apiKey: 'public-key',
        storage: new MemoryStorage(),
        prefetchOfferings: false,
      })).rejects.toMatchObject({ kind: 'configuration', code: 'FETCH_UNAVAILABLE' })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('configures an anonymous session and prefetches cached offerings', async () => {
    let offeringsRequests = 0
    const fetcher = mockFetch((path) => {
      if (path.endsWith('/sessions')) return json(session(), 201)
      if (path.endsWith('/customerInfo')) return json(customer())
      if (path.endsWith('/offerings')) { offeringsRequests += 1; return json(offerings()) }
      return json({ status: false, code: 'NOT_FOUND' }, 404)
    })

    const sdk = await InAppify.configure({ apiKey: 'public-key', fetch: fetcher, storage: new MemoryStorage() })
    const first = await sdk.getOfferings()
    const second = await sdk.getOfferings()

    expect(sdk.configuration.app.displayName).toBe('Web App')
    expect(sdk.isAnonymous).toBe(true)
    expect(first.current?.identifier).toBe('default')
    expect(first.all[0]?.packages[0]?.product.prices[0]?.originalAmount).toBe(100_000)
    expect(second).toBe(first)
    expect(offeringsRequests).toBe(1)
    await expect(sdk.getCurrentOffering({ placementIdentifier: 'home_banner' })).resolves.toMatchObject({ identifier: 'home' })
  })

  it('restores a session by rotating the persisted refresh token', async () => {
    const storage = new MemoryStorage()
    let sessionCreates = 0
    let refreshes = 0
    const fetcher = mockFetch((path) => {
      if (path.endsWith('/sessions')) { sessionCreates += 1; return json(session(`access-${sessionCreates}`, `refresh-${sessionCreates}`), 201) }
      if (path.endsWith('/sessions/refresh')) { refreshes += 1; return json(session('restored-access', 'rotated-refresh')) }
      if (path.endsWith('/customerInfo')) return json(customer())
      if (path.endsWith('/offerings')) return json(offerings())
      return json({}, 404)
    })

    await InAppify.configure({ apiKey: 'public-key', fetch: fetcher, storage, prefetchOfferings: false })
    await InAppify.configure({ apiKey: 'public-key', fetch: fetcher, storage, prefetchOfferings: false })

    expect(sessionCreates).toBe(1)
    expect(refreshes).toBe(1)
  })

  it('retries one unauthorized request after a token refresh', async () => {
    let customerRequests = 0
    let refreshes = 0
    const fetcher = mockFetch((path) => {
      if (path.endsWith('/sessions')) return json(session(), 201)
      if (path.endsWith('/sessions/refresh')) { refreshes += 1; return json(session('access-2', 'refresh-2')) }
      if (path.endsWith('/offerings')) return json(offerings())
      if (path.endsWith('/customerInfo')) {
        customerRequests += 1
        if (customerRequests === 2) return json({ status: false, code: 'UNAUTHENTICATED', message: 'Unauthorized' }, 401)
        return json(customer())
      }
      return json({}, 404)
    })

    const sdk = await InAppify.configure({ apiKey: 'public-key', fetch: fetcher, storage: new MemoryStorage(), prefetchOfferings: false })
    await sdk.getCustomerInfo()

    expect(refreshes).toBe(1)
    expect(customerRequests).toBe(3)
  })

  it('creates an idempotent checkout without navigating when redirect is disabled', async () => {
    let idempotencyKey = ''
    const fetcher = mockFetch((path, init) => {
      if (path.endsWith('/sessions')) return json(session(), 201)
      if (path.endsWith('/customerInfo')) return json(customer())
      if (path.endsWith('/offerings')) return json(offerings())
      if (path.endsWith('/checkout-sessions')) {
        idempotencyKey = new Headers(init?.headers).get('Idempotency-Key') ?? ''
        return json({ status: true, data: {
          checkout: { id: 'checkout-1', status: 'PendingPayment', expires_at: '2026-01-01T00:00:00Z' },
          price: { original_amount: 100_000, discount_amount: 10_000, final_amount: 90_000, currency: 'IRR' },
          next_action: { type: 'redirect', url: 'https://pay.inappify.com/buy/redirect/token' },
        } }, 201)
      }
      return json({}, 404)
    })

    const sdk = await InAppify.configure({ apiKey: 'public-key', fetch: fetcher, storage: new MemoryStorage() })
    const result = await sdk.purchase({ offeringIdentifier: 'default', packageIdentifier: 'monthly', productIdentifier: 'premium_monthly' }, { redirect: false })

    expect(result.nextAction.type).toBe('redirect')
    expect(result.price.finalAmount).toBe(90_000)
    expect(idempotencyKey).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('returns structured API errors', async () => {
    const fetcher = mockFetch(() => json({ status: false, code: 'WEB_APP_NOT_FOUND', message: 'Unavailable' }, 404))
    const promise = InAppify.configure({ apiKey: 'invalid', fetch: fetcher, storage: new MemoryStorage() })
    await expect(promise).rejects.toMatchObject({ code: 'WEB_APP_NOT_FOUND', status: 404, kind: 'api' } satisfies Partial<InAppifyError>)
  })

  it('checks active, permanent, missing, and expired entitlements', async () => {
    let customerRequests = 0
    const entitlements = [
      { identifier: 'premium', is_active: true, is_sandbox: false, expiration_date: new Date(Date.now() + 60_000).toISOString() },
      { identifier: 'lifetime', is_active: true, is_sandbox: false, expiration_date: '' },
      { identifier: 'expired', is_active: true, is_sandbox: false, expiration_date: new Date(Date.now() - 60_000).toISOString() },
      { identifier: 'inactive', is_active: false, is_sandbox: false, expiration_date: '' },
    ]
    const fetcher = mockFetch((path) => {
      if (path.endsWith('/sessions')) return json(session(), 201)
      if (path.endsWith('/customerInfo')) { customerRequests += 1; return json(customer(entitlements)) }
      return json({}, 404)
    })

    const sdk = await InAppify.configure({ apiKey: 'public-key', fetch: fetcher, storage: new MemoryStorage(), prefetchOfferings: false })

    expect(sdk.hasEntitlement('premium')).toBe(true)
    expect(sdk.getEntitlement('lifetime')?.identifier).toBe('lifetime')
    expect(sdk.hasEntitlement('expired')).toBe(false)
    expect(sdk.hasEntitlement('inactive')).toBe(false)
    expect(sdk.hasEntitlement('missing')).toBe(false)
    await expect(sdk.checkEntitlement('premium')).resolves.toBe(true)
    expect(customerRequests).toBe(2)
  })

  it('writes only server-allowlisted reserved attributes through typed helpers', async () => {
    let writtenAttributes: Record<string, string> = {}
    const fetcher = mockFetch((path, init) => {
      if (path.endsWith('/sessions')) return json(session(), 201)
      if (path.endsWith('/customerInfo')) return json(customer())
      if (path.endsWith('/customer/attributes')) {
        const requestBody = typeof init?.body === 'string' ? init.body : '{}'
        const request = JSON.parse(requestBody) as { attributes: Record<string, string> }
        writtenAttributes = request.attributes
        return json({ status: true, data: { attributes: writtenAttributes } })
      }
      return json({}, 404)
    })
    const sdk = await InAppify.configure({ apiKey: 'public-key', fetch: fetcher, storage: new MemoryStorage(), prefetchOfferings: false })

    expect(sdk.canSetReservedAttribute('$email')).toBe(true)
    expect(sdk.canSetReservedAttribute('$phoneNumber')).toBe(false)
    const customerBeforeWrite = sdk.customerInfo
    await expect(sdk.setEmail('user@example.com')).resolves.toBe(true)
    expect(writtenAttributes).toEqual({ $email: 'user@example.com' })
    expect(sdk.customerInfo?.entitlements).toEqual(customerBeforeWrite?.entitlements)
    expect(sdk.customerInfo?.attributes).toEqual([{ key: '$email', value: 'user@example.com' }])
    await expect(sdk.setEmail('invalid')).rejects.toMatchObject({ code: 'INVALID_ATTRIBUTE_VALUE' })
    await expect(sdk.setPhoneNumber('09120000000')).rejects.toMatchObject({ code: 'ATTRIBUTE_NOT_WRITABLE' })
  })
})
