import { InAppifyError, isInAppifyError } from './errors'
import { EventEmitter } from './internal/events'
import { data, HttpClient, type HttpRequest } from './internal/http'
import { mapAuth, mapCaptcha, mapCheckout, mapConfiguration, mapCustomerInfo, mapDiscount, mapOfferings, mapOtpChallenge } from './internal/mappers'
import { SessionStore } from './internal/session-store'
import { createId, isRecord, normalizeBaseUrl, safeRedirect, sleep } from './internal/utils'
import { IndexedDbStorage, type StorageAdapter } from './storage'
import { SDK_VERSION } from './version'
import type {
  AppConfiguration, AttributeValues, AuthResult, CaptchaChallenge, CheckEntitlementOptions, CheckoutResult, CurrentOfferingOptions, CustomerInfo, DiscountValidation, Entitlement,
  GetOfferingsOptions, InAppifyEvents, OfferingsResult, OtpChallenge, OtpRequestParams, PollCheckoutOptions,
  PurchaseOptions, PurchaseParams, RequestOptions, SyncAttribute,
  ReservedAttributeName,
} from './types'

const DEFAULT_BASE_URL = 'https://api.inappify.com/api/web/v1'
const TERMINAL_CHECKOUT_STATUSES = new Set(['Paid', 'Failed', 'Expired', 'Cancelled'])

export interface InAppifyOptions {
  apiKey: string
  baseUrl?: string
  storage?: StorageAdapter
  fetch?: typeof fetch
  requestTimeoutMs?: number
  offeringsCacheTtlMs?: number
  prefetchOfferings?: boolean
  country?: string
  appVersion?: string
}

interface SessionTokens {
  accessToken: string
  accessTokenExpiresAt: string
  refreshToken: string
  refreshTokenExpiresAt: string
}

export class InAppify {
  private readonly http: HttpClient
  private readonly sessions: SessionStore
  private readonly events = new EventEmitter<InAppifyEvents>()
  private readonly offeringsCacheTtlMs: number
  private readonly shouldPrefetchOfferings: boolean
  private readonly refreshLockName: string
  private accessToken: string | null = null
  private accessTokenExpiresAt = 0
  private refreshPromise: Promise<void> | null = null
  private offeringsPromise: Promise<OfferingsResult> | null = null
  private offeringsCache: { value: OfferingsResult; expiresAt: number } | null = null
  private customerCache: CustomerInfo | null = null
  private anonymous = true
  private _configuration: AppConfiguration | null = null
  private country: string
  private appVersion: string

  private constructor(private readonly apiKey: string, options: InAppifyOptions) {
    const baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL)
    const fetchImplementation = options.fetch ?? globalThis.fetch
    if (typeof fetchImplementation !== 'function') {
      throw new InAppifyError({ kind: 'configuration', code: 'FETCH_UNAVAILABLE', message: 'A Fetch API implementation is required.' })
    }
    const fetcher: typeof fetch = fetchImplementation.bind(globalThis)
    this.http = new HttpClient(baseUrl, fetcher, options.requestTimeoutMs ?? 15_000)
    const namespace = `inappify:${hash(`${baseUrl}:${apiKey}`)}`
    this.sessions = new SessionStore(options.storage ?? new IndexedDbStorage(), namespace)
    this.refreshLockName = `${namespace}:refresh`
    this.offeringsCacheTtlMs = options.offeringsCacheTtlMs ?? 5 * 60_000
    this.shouldPrefetchOfferings = options.prefetchOfferings ?? true
    this.country = (options.country ?? 'IR').trim().toUpperCase()
    this.appVersion = options.appVersion?.trim() ?? ''
  }

  static async configure(options: InAppifyOptions): Promise<InAppify> {
    if (!options.apiKey?.trim()) {
      throw new InAppifyError({ kind: 'configuration', code: 'API_KEY_REQUIRED', message: 'apiKey is required.' })
    }
    const client = new InAppify(options.apiKey.trim(), options)
    await client.initialize()
    return client
  }

  get configuration(): AppConfiguration {
    if (!this._configuration) throw new InAppifyError({ kind: 'configuration', code: 'NOT_CONFIGURED', message: 'The SDK is not configured.' })
    return this._configuration
  }

  get customerInfo(): CustomerInfo | null { return this.customerCache }
  get isAnonymous(): boolean { return this.anonymous }

  hasEntitlement(identifier: string): boolean {
    return this.getEntitlement(identifier) !== null
  }

  getEntitlement(identifier: string): Entitlement | null {
    const normalized = identifier.trim()
    if (!normalized || !this.customerCache) return null
    return this.customerCache.entitlements.find((entitlement) =>
      entitlement.identifier === normalized && isEntitlementActive(entitlement),
    ) ?? null
  }

  async checkEntitlement(identifier: string, options: CheckEntitlementOptions = {}): Promise<boolean> {
    if (options.forceRefresh ?? true) await this.getCustomerInfo({ signal: options.signal })
    return this.hasEntitlement(identifier)
  }

  on<TKey extends keyof InAppifyEvents>(event: TKey, listener: (payload: InAppifyEvents[TKey]) => void): () => void {
    return this.events.on(event, listener)
  }

  async getCustomerInfo(options: RequestOptions = {}): Promise<CustomerInfo> {
    const payload = await this.authenticatedRequest('customerInfo', { signal: options.signal })
    const body = data(payload)
    const info = mapCustomerInfo(body.customerInfo ?? payload.customerInfo)
    this.anonymous = info.originalAppUserId.startsWith('$InaAnonymousId_')
    this.customerCache = info
    this.events.emit('customerInfoUpdated', info)
    return info
  }

  async getOfferings(options: GetOfferingsOptions = {}): Promise<OfferingsResult> {
    this.assertFeature('offerings')
    if (!options.forceRefresh && this.offeringsCache && this.offeringsCache.expiresAt > Date.now()) return this.offeringsCache.value
    if (!options.forceRefresh && this.offeringsPromise) return this.offeringsPromise
    const pending = this.fetchOfferings(options.signal)
    this.offeringsPromise = pending
    try { return await pending } finally { if (this.offeringsPromise === pending) this.offeringsPromise = null }
  }

  async getCurrentOffering(options: CurrentOfferingOptions = {}): Promise<import('./types').Offering | null> {
    const offerings = await this.getOfferings({ forceRefresh: options.forceRefresh, signal: options.signal })
    return offerings.getCurrentOffering(options.placementIdentifier, options.context)
  }

  setTargetingContext(context: { country?: string | undefined; appVersion?: string | undefined }): void {
    if (context.country !== undefined) this.country = context.country.trim().toUpperCase()
    if (context.appVersion !== undefined) this.appVersion = context.appVersion.trim()
    this.invalidateOfferingsCache()
  }

  async updateAttributes(attributes: AttributeValues, options: RequestOptions = {}): Promise<AttributeValues> {
    this.assertFeature('attributes')
    const payload = await this.authenticatedRequest('customer/attributes', { method: 'PATCH', body: { attributes }, signal: options.signal })
    return this.afterAttributes(payload)
  }

  canSetReservedAttribute(attribute: ReservedAttributeName): boolean {
    return this.configuration.features.attributes && this.configuration.attributes.writableReserved.includes(attribute)
  }

  async setReservedAttribute(attribute: ReservedAttributeName, value: string, options: RequestOptions = {}): Promise<boolean> {
    if (!this.canSetReservedAttribute(attribute)) {
      throw new InAppifyError({ kind: 'configuration', code: 'ATTRIBUTE_NOT_WRITABLE', message: `${attribute} is not writable for this web app.` })
    }
    if (value.length > 250) {
      throw new InAppifyError({ kind: 'configuration', code: 'INVALID_ATTRIBUTE_VALUE', message: 'Attribute values cannot exceed 250 characters.' })
    }
    if (value === '') await this.deleteAttributes([attribute], options)
    else await this.updateAttributes({ [attribute]: value }, options)
    return true
  }

  async setEmail(email: string, options: RequestOptions = {}): Promise<boolean> {
    if (email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new InAppifyError({ kind: 'configuration', code: 'INVALID_ATTRIBUTE_VALUE', message: 'Email address is invalid.' })
    }
    return this.setReservedAttribute('$email', email, options)
  }

  setDisplayName(value: string, options: RequestOptions = {}): Promise<boolean> { return this.setReservedAttribute('$displayName', value, options) }
  setFcmToken(value: string, options: RequestOptions = {}): Promise<boolean> { return this.setReservedAttribute('$fcmTokens', value, options) }
  setApnsToken(value: string, options: RequestOptions = {}): Promise<boolean> { return this.setReservedAttribute('$apnsTokens', value, options) }
  setIdfa(value: string, options: RequestOptions = {}): Promise<boolean> { return this.setReservedAttribute('$idfa', value, options) }
  setIdfv(value: string, options: RequestOptions = {}): Promise<boolean> { return this.setReservedAttribute('$idfv', value, options) }
  setPhoneNumber(value: string, options: RequestOptions = {}): Promise<boolean> { return this.setReservedAttribute('$phoneNumber', value, options) }
  setCampaign(value: string, options: RequestOptions = {}): Promise<boolean> { return this.setReservedAttribute('$campaign', value, options) }
  setKeyword(value: string, options: RequestOptions = {}): Promise<boolean> { return this.setReservedAttribute('$keyword', value, options) }

  async deleteAttributes(keys: readonly string[], options: RequestOptions = {}): Promise<AttributeValues> {
    this.assertFeature('attributes')
    const payload = await this.authenticatedRequest('customer/attributes', { method: 'DELETE', body: { keys }, signal: options.signal })
    return this.afterAttributes(payload)
  }

  async syncAttributes(attributes: readonly SyncAttribute[], options: RequestOptions & { idempotencyKey?: string } = {}): Promise<AttributeValues> {
    this.assertFeature('attributes')
    const payload = await this.authenticatedRequest('customer/attributes/sync', {
      method: 'POST', body: { attributes }, headers: { 'Idempotency-Key': options.idempotencyKey ?? createId() }, signal: options.signal,
    })
    return this.afterAttributes(payload)
  }

  async validateDiscountCode(code: string, offeringIdentifier: string, options: RequestOptions = {}): Promise<DiscountValidation> {
    const payload = await this.authenticatedRequest('discounts/validate', { method: 'POST', body: { code, offering_identifier: offeringIdentifier }, signal: options.signal })
    return mapDiscount(data(payload))
  }

  async createCheckout(params: PurchaseParams, options: RequestOptions = {}): Promise<CheckoutResult> {
    this.assertFeature('checkout')
    const body = {
      offering_identifier: params.offeringIdentifier, package_identifier: params.packageIdentifier, product_identifier: params.productIdentifier,
      ...(params.discountCode === undefined ? {} : { discount_code: params.discountCode }), ...(params.country === undefined ? {} : { country: params.country }),
      ...((params.appVersion ?? this.appVersion) === '' ? {} : { app_version: params.appVersion ?? this.appVersion }), ...(params.isCrypto === undefined ? {} : { is_crypto: params.isCrypto }),
    }
    const payload = await this.authenticatedRequest('checkout-sessions', {
      method: 'POST', body, headers: { 'Idempotency-Key': params.idempotencyKey ?? createId() }, signal: options.signal,
    })
    const result = mapCheckout(data(payload))
    if (result.nextAction.type === 'complete') await this.refreshAfterPurchase()
    return result
  }

  async purchase(params: PurchaseParams, options: PurchaseOptions = {}): Promise<CheckoutResult> {
    const result = await this.createCheckout(params, { signal: options.signal })
    if ((options.redirect ?? true) && result.nextAction.type === 'redirect' && result.nextAction.url) safeRedirect(result.nextAction.url)
    return result
  }

  async getCheckoutStatus(checkoutId: string, options: RequestOptions = {}): Promise<CheckoutResult> {
    const payload = await this.authenticatedRequest(`checkout-sessions/${encodeURIComponent(checkoutId)}`, { signal: options.signal })
    const result = mapCheckout(data(payload))
    if (result.checkout.status === 'Paid') await this.refreshAfterPurchase()
    return result
  }

  async handlePaymentReturn(checkoutId: string, options: PollCheckoutOptions = {}): Promise<CheckoutResult> {
    const startedAt = Date.now(); const timeoutMs = options.timeoutMs ?? 60_000; const intervalMs = options.intervalMs ?? 1_500
    while (true) {
      const result = await this.getCheckoutStatus(checkoutId, { signal: options.signal })
      if (TERMINAL_CHECKOUT_STATUSES.has(result.checkout.status)) return result
      if (Date.now() - startedAt >= timeoutMs) {
        throw new InAppifyError({ kind: 'timeout', code: 'CHECKOUT_POLL_TIMEOUT', message: 'Payment status did not become final before the timeout.' })
      }
      await sleep(intervalMs, options.signal)
    }
  }

  async exchangeIdentityTicket(identityTicket: string, options: RequestOptions = {}): Promise<AuthResult> {
    this.assertAuthentication('external')
    const payload = await this.authenticatedRequest('auth/external/exchange', { method: 'POST', body: { identity_ticket: identityTicket }, signal: options.signal }, false)
    return this.applyAuthenticatedResponse(data(payload))
  }

  async loginWithIdentityTicket(identityTicket: string, options: RequestOptions = {}): Promise<AuthResult> {
    return this.exchangeIdentityTicket(identityTicket, options)
  }

  invalidateOfferingsCache(): void { this.offeringsCache = null }

  async createOtpCaptcha(options: RequestOptions = {}): Promise<CaptchaChallenge> {
    this.assertAuthentication('inappifyOtp')
    return mapCaptcha(data(await this.authenticatedRequest('auth/otp/captcha', { method: 'POST', signal: options.signal })))
  }

  async requestOtp(params: OtpRequestParams, options: RequestOptions = {}): Promise<OtpChallenge> {
    this.assertAuthentication('inappifyOtp')
    const body = { phone: params.phone, ...(params.captchaKey === undefined ? {} : { captcha_key: params.captchaKey }), ...(params.captchaAnswer === undefined ? {} : { captcha_answer: params.captchaAnswer }) }
    return mapOtpChallenge(data(await this.authenticatedRequest('auth/otp/request', { method: 'POST', body, signal: options.signal })))
  }

  async verifyOtp(challengeId: string, code: string, options: RequestOptions = {}): Promise<AuthResult> {
    this.assertAuthentication('inappifyOtp')
    const payload = await this.authenticatedRequest('auth/otp/verify', { method: 'POST', body: { challenge_id: challengeId, code }, signal: options.signal }, false)
    return this.applyAuthenticatedResponse(data(payload))
  }

  async logout(options: RequestOptions = {}): Promise<void> {
    const payload = await this.authenticatedRequest('sessions/logout', { method: 'POST', signal: options.signal }, false)
    await this.applySession(data(payload))
    this.anonymous = true; this.invalidateCaches()
    await this.getCustomerInfo(options)
    this.events.emit('authenticationChanged', { isAnonymous: true, type: 'Anonymous', authenticatedAt: null })
  }

  private async initialize(): Promise<void> {
    const persisted = await this.sessions.getSession()
    if (persisted && Date.parse(persisted.refreshTokenExpiresAt) > Date.now()) {
      try { await this.refreshSession() } catch { await this.sessions.clearSession(); await this.createAnonymousSession() }
    } else { await this.sessions.clearSession(); await this.createAnonymousSession() }
    await this.getCustomerInfo()
    if (this.shouldPrefetchOfferings && this.configuration.features.offerings) {
      try { await this.getOfferings() } catch { /* A later explicit call retries the prefetch. */ }
    }
  }

  private async createAnonymousSession(): Promise<void> {
    const installationId = await this.sessions.getInstallationId(createId)
    const payload = await this.http.request('sessions', { method: 'POST', body: { app_key: this.apiKey, installation_id: installationId } })
    await this.applySession(data(payload)); this.anonymous = true
  }

  private async authenticatedRequest(path: string, options: HttpRequest = {}, retry = true): Promise<Record<string, unknown>> {
    await this.ensureAccessToken()
    try { return await this.http.request(path, { ...options, token: this.accessToken ?? undefined }) }
    catch (error) {
      if (!retry || !isInAppifyError(error) || error.status !== 401) throw error
      await this.refreshSession()
      return this.http.request(path, { ...options, token: this.accessToken ?? undefined })
    }
  }

  private async ensureAccessToken(): Promise<void> {
    if (this.accessToken && this.accessTokenExpiresAt > Date.now() + 30_000) return
    await this.refreshSession()
  }

  private async refreshSession(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise
    const pending = this.withRefreshLock(async () => {
      const persisted = await this.sessions.getSession()
      if (!persisted || Date.parse(persisted.refreshTokenExpiresAt) <= Date.now()) {
        throw new InAppifyError({ kind: 'api', code: 'SESSION_EXPIRED', message: 'The InAppify session has expired.', status: 401 })
      }
      try { await this.refreshWithToken(persisted.refreshToken) }
      catch (error) { await this.sessions.clearSession(); this.accessToken = null; throw error }
    })
    this.refreshPromise = pending
    try { await pending } finally { if (this.refreshPromise === pending) this.refreshPromise = null }
  }

  private async refreshWithToken(refreshToken: string): Promise<void> {
    const payload = await this.http.request('sessions/refresh', { method: 'POST', body: { refresh_token: refreshToken } })
    await this.applySession(data(payload))
  }

  private withRefreshLock<T>(operation: () => Promise<T>): Promise<T> {
    if (typeof navigator !== 'undefined' && 'locks' in navigator) {
      return navigator.locks.request<Promise<T>>(this.refreshLockName, operation).then((result) => result)
    }
    return operation()
  }

  private async applySession(body: Record<string, unknown>): Promise<void> {
    const tokens = parseTokens(body)
    this.accessToken = tokens.accessToken; this.accessTokenExpiresAt = Date.parse(tokens.accessTokenExpiresAt)
    await this.sessions.setSession({ refreshToken: tokens.refreshToken, refreshTokenExpiresAt: tokens.refreshTokenExpiresAt })
    this._configuration = mapConfiguration(body.configuration)
    const customer = isRecord(body.customer) ? body.customer : null
    if (customer) this.anonymous = customer.is_anonymous === true
  }

  private async applyAuthenticatedResponse(body: Record<string, unknown>): Promise<AuthResult> {
    await this.applySession(body); const auth = mapAuth(body); this.anonymous = auth.isAnonymous; this.invalidateCaches()
    await this.getCustomerInfo()
    if (this.configuration.features.offerings) await this.getOfferings({ forceRefresh: true })
    this.events.emit('authenticationChanged', auth)
    return auth
  }

  private async fetchOfferings(signal?: AbortSignal): Promise<OfferingsResult> {
    const payload = await this.authenticatedRequest('offerings', { signal }); const result = mapOfferings(data(payload), this.targetingContext())
    this.offeringsCache = { value: result, expiresAt: Date.now() + this.offeringsCacheTtlMs }; this.events.emit('offeringsUpdated', result); return result
  }

  private afterAttributes(payload: Record<string, unknown>): AttributeValues {
    this.offeringsCache = null
    const body = data(payload)
    const values = isRecord(body.attributes) ? Object.freeze({ ...body.attributes }) as AttributeValues : {}
    if (this.customerCache) {
      this.customerCache = {
        ...this.customerCache,
        attributes: Object.entries(values).map(([key, value]) => ({ key, value })),
      }
      this.events.emit('customerInfoUpdated', this.customerCache)
    }
    return values
  }

  private async refreshAfterPurchase(): Promise<void> {
    await this.getCustomerInfo(); this.offeringsCache = null
  }

  private invalidateCaches(): void { this.customerCache = null; this.offeringsCache = null; this.offeringsPromise = null }

  private assertFeature(feature: keyof AppConfiguration['features']): void {
    if (!this.configuration.features[feature]) throw new InAppifyError({ kind: 'configuration', code: 'FEATURE_NOT_ENABLED', message: `The ${feature} feature is not enabled for this app.` })
  }

  private assertAuthentication(feature: 'external' | 'inappifyOtp'): void {
    if (!this.configuration.authentication[feature]) throw new InAppifyError({ kind: 'configuration', code: 'AUTHENTICATION_NOT_ENABLED', message: `The ${feature} authentication method is not enabled for this app.` })
  }

  private targetingContext(): import('./types').TargetingContext {
    const attributes = Object.fromEntries((this.customerCache?.attributes ?? []).map((attribute) => [attribute.key, attribute.value]))
    return {
      country: this.country, platform: this.configuration.app.storePlatform || this.configuration.app.platform || 'web',
      appId: this.configuration.app.id || null, appVersion: this.appVersion, sdkVersion: SDK_VERSION, attributes,
    }
  }
}

function parseTokens(body: Record<string, unknown>): SessionTokens {
  const accessToken = body.access_token; const accessExpires = body.access_token_expires_at; const refreshToken = body.refresh_token; const refreshExpires = body.refresh_token_expires_at
  if (![accessToken, accessExpires, refreshToken, refreshExpires].every((value) => typeof value === 'string')) {
    throw new InAppifyError({ kind: 'api', code: 'INVALID_SESSION_RESPONSE', message: 'The API returned an incomplete session.' })
  }
  return { accessToken: accessToken as string, accessTokenExpiresAt: accessExpires as string, refreshToken: refreshToken as string, refreshTokenExpiresAt: refreshExpires as string }
}

function hash(value: string): string {
  let result = 2166136261
  for (let index = 0; index < value.length; index += 1) { result ^= value.charCodeAt(index); result = Math.imul(result, 16777619) }
  return (result >>> 0).toString(36)
}

function isEntitlementActive(entitlement: Entitlement): boolean {
  if (!entitlement.isActive) return false
  if (!entitlement.expirationDate) return true
  const expiration = Date.parse(entitlement.expirationDate)
  return Number.isNaN(expiration) || expiration > Date.now()
}
