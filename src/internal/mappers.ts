import type { AuthResult, CaptchaChallenge, CheckoutResult, ConsumableDelivery, CustomerInfo, DiscountValidation, Offering, OfferingsResult, OtpChallenge, TargetingContext, TargetingRule } from '../types'
import { InAppifyError } from '../errors'
import { Offerings } from '../targeting'
import { array, boolean, isRecord, nullableString, number, string } from './utils'

export function mapConfiguration(value: unknown): import('../types').AppConfiguration {
  const root = isRecord(value) ? value : {}
  const app = isRecord(root.app) ? root.app : {}
  const authentication = isRecord(root.authentication) ? root.authentication : {}
  const captcha = isRecord(authentication.captcha) ? authentication.captcha : {}
  const features = isRecord(root.features) ? root.features : {}
  const attributes = isRecord(root.attributes) ? root.attributes : {}
  return {
    app: {
      id: number(app.id), identifier: string(app.identifier), platform: number(app.platform), storePlatform: number(app.store_platform ?? app.platform),
      displayName: nullableString(app.display_name), logo: nullableString(app.logo), icon: nullableString(app.icon),
    },
    authentication: {
      anonymous: boolean(authentication.anonymous), external: boolean(authentication.external), inappifyOtp: boolean(authentication.inappify_otp),
      captcha: { enabled: boolean(captcha.enabled), provider: string(captcha.provider), mode: nullableString(captcha.mode), refreshEndpoint: nullableString(captcha.refresh_endpoint) },
    },
    features: {
      attributes: boolean(features.attributes), offerings: boolean(features.offerings), checkout: boolean(features.checkout),
      realPayment: boolean(features.real_payment), freePurchase: boolean(features.free_purchase), anonymousPurchase: boolean(features.anonymous_purchase), trial: boolean(features.trial),
    },
    attributes: {
      writable: Object.freeze(array(attributes.writable).filter((item): item is string => typeof item === 'string')),
      writableReserved: Object.freeze(array(attributes.writable_reserved).filter((item): item is import('../types').ReservedAttributeName => isReservedAttribute(item))),
    },
  }
}

function isReservedAttribute(value: unknown): value is import('../types').ReservedAttributeName {
  return typeof value === 'string' && ['$email', '$displayName', '$fcmTokens', '$apnsTokens', '$idfa', '$idfv', '$phoneNumber', '$campaign', '$keyword'].includes(value)
}

export function mapCustomerInfo(value: unknown): CustomerInfo {
  const root = isRecord(value) ? value : {}
  return {
    originalAppUserId: string(root.originalAppUserId), firstSeen: string(root.firstSeen), requestDate: string(root.requestDate),
    latestExpirationDate: nullableString(root.latestExpirationDate), hasUsedTrial: boolean(root.hasUsedTrial),
    entitlements: array(root.entitlements).map((item) => {
      const row = isRecord(item) ? item : {}
      return {
        identifier: string(row.identifier), isActive: boolean(row.is_active), isSandbox: boolean(row.is_sandbox),
        periodType: nullableString(row.period_type), purchaseDate: nullableString(row.purchase_date), expirationDate: nullableString(row.expiration_date),
        ownershipType: nullableString(row.ownership_type), entitlementType: nullableString(row.entitlement_type),
        purchaseStoreRefHash: nullableString(row.purchase_store_ref_hash), purchaseStoreTime: typeof row.purchase_store_time === 'number' ? row.purchase_store_time : null,
      }
    }),
    transactions: array(root.transactions).map((item) => {
      const row = isRecord(item) ? item : {}
      return {
        number: nullableString(row.number), status: typeof row.status === 'number' ? row.status : null, amount: typeof row.amount === 'number' ? row.amount : null,
        amountVariance: typeof row.amountVariance === 'number' ? row.amountVariance : null,
        transactionDate: nullableString(row.transactionDate), trackingNumber: nullableString(row.trackingNumber), isCryptoGate: boolean(row.isCryptoGate),
        packageName: nullableString(row.packageName), storePurchaseRefId: nullableString(row.storePurchaseRefId), isTrial: boolean(row.isTrial),
      }
    }),
    attributes: array(root.attributes).map((item) => { const row = isRecord(item) ? item : {}; return { key: string(row.key), value: nullableString(row.value) } }),
  }
}

export function mapOffering(value: unknown): Offering {
  const root = isRecord(value) ? value : {}
  const metadata = isRecord(root.metadata) ? root.metadata : {}
  return {
    identifier: string(root.identifier), isDefault: boolean(root.isDefault ?? root.is_default),
    serverDescription: nullableString(root.serverDescription ?? root.server_description), metadata,
    packages: array(root.packages).map((item) => {
      const row = isRecord(item) ? item : {}; const product = isRecord(row.product) ? row.product : {}
      return {
        identifier: string(row.identifier), packageType: number(row.packageType ?? row.package_type), description: nullableString(row.description),
        entitlement: nullableString(row.entitlement), name: string(row.name, string(row.identifier)), discountPercent: number(row.discountPercent ?? row.discount_percent),
        product: {
          identifier: string(product.identifier), name: nullableString(product.name), trialDays: typeof (product.trialDays ?? product.trial_days) === 'number' ? number(product.trialDays ?? product.trial_days) : null,
          prices: array(product.prices).map((item) => { const price = isRecord(item) ? item : {}; return {
            amount: number(price.amount ?? price.price), currency: string(price.currency),
            originalAmount: typeof (price.original_amount ?? price.originPrice) === 'number' ? number(price.original_amount ?? price.originPrice) : null,
            discountAmount: typeof (price.discount_amount ?? price.discountAmount) === 'number' ? number(price.discount_amount ?? price.discountAmount) : null,
          } }),
        },
      }
    }),
  }
}

export function mapOfferings(value: unknown, context: TargetingContext): OfferingsResult {
  const root = isRecord(value) ? value : {}; const offerings = array(root.offerings).map(mapOffering)
  return new Offerings({ offerings, rules: array(root.rules).map(mapTargetingRule), forceVersion: number(root.forceVersion), context })
}

export function mapTargetingRule(value: unknown): TargetingRule {
  const root = isRecord(value) ? value : {}; const placements = isRecord(root.placements) ? root.placements : null
  return {
    defaultOfferingIdentifier: nullableString(root.default_offering), sort: number(root.sort),
    conditions: Object.freeze(array(root.conditions).map((item) => {
      const condition = isRecord(item) ? item : {}
      return Object.freeze({ field: string(condition.field), operator: nullableString(condition.operator), value: decodeConditionValue(condition.value), context: typeof condition.context === 'number' || typeof condition.context === 'string' ? condition.context : null })
    })),
    placements: placements ? {
      fallbackOfferingIdentifier: nullableString(placements.fallback_offering_id),
      offerings: Object.freeze(array(placements.placement_offerings).map((item) => {
        const placement = isRecord(item) ? item : {}
        return Object.freeze({ placementIdentifier: string(placement.placement_identifier), offeringIdentifier: string(placement.offering_identifier) })
      }).filter((item) => item.placementIdentifier !== '' && item.offeringIdentifier !== '')),
    } : null,
  }
}

function decodeConditionValue(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) as unknown } catch { return value }
}

export function mapCheckout(value: unknown): CheckoutResult {
  const root = isRecord(value) ? value : {}; const checkout = isRecord(root.checkout) ? root.checkout : {}; const price = isRecord(root.price) ? root.price : {}; const next = isRecord(root.next_action) ? root.next_action : {}
  return {
    checkout: { id: string(checkout.id), status: string(checkout.status), expiresAt: string(checkout.expires_at) },
    price: { originalAmount: number(price.original_amount), discountAmount: number(price.discount_amount), finalAmount: number(price.final_amount), currency: string(price.currency) },
    nextAction: { type: string(next.type), url: nullableString(next.url) },
  }
}

export function mapConsumableDelivery(value: unknown): ConsumableDelivery {
  const root = isRecord(value) ? value : {}
  const deliveryId = number(root.deliveryId)
  const status = string(root.status)
  const source = string(root.source)
  const productIdentifier = string(root.productIdentifier)

  if (!Number.isSafeInteger(deliveryId) || deliveryId <= 0 ||
      !['DELIVERY_REQUIRED', 'CONSUME_REQUIRED', 'COMPLETED'].includes(status) ||
      !['direct', 'bazar', 'myket'].includes(source) || productIdentifier === '') {
    throw new InAppifyError({
      kind: 'api',
      code: 'INVALID_CONSUMABLE_DELIVERY_RESPONSE',
      message: 'The API returned an invalid consumable delivery.',
    })
  }

  return {
    deliveryId,
    status: status as ConsumableDelivery['status'],
    source: source as ConsumableDelivery['source'],
    paymentId: typeof root.paymentId === 'number' && Number.isSafeInteger(root.paymentId) ? root.paymentId : null,
    transactionId: nullableString(root.transactionId),
    productIdentifier,
    alreadyDelivered: boolean(root.alreadyDelivered),
    consumeAttempts: Math.max(0, number(root.consumeAttempts)),
  }
}

export function mapDiscount(value: unknown): DiscountValidation {
  const root = isRecord(value) ? value : {}; const discount = isRecord(root.discount) ? root.discount : {}
  return { discount: { code: string(discount.code), isValid: boolean(discount.isValid), percent: typeof discount.percent === 'number' ? discount.percent : null }, offering: mapOffering(root.offering) }
}

export function mapCaptcha(value: unknown): CaptchaChallenge {
  const root = isRecord(value) ? value : {}; return { captchaKey: string(root.captcha_key), captchaImage: string(root.captcha_image), expiresIn: number(root.expires_in) }
}

export function mapOtpChallenge(value: unknown): OtpChallenge {
  const root = isRecord(value) ? value : {}; const result: OtpChallenge = { challengeId: string(root.challenge_id), status: string(root.status) }
  if (typeof root.expires_at === 'string') result.expiresAt = root.expires_at
  if (typeof root.expires_in === 'number') result.expiresIn = root.expires_in
  return result
}

export function mapAuth(value: unknown): AuthResult {
  const root = isRecord(value) ? value : {}; const customer = isRecord(root.customer) ? root.customer : {}; const session = isRecord(root.session) ? root.session : {}
  return { isAnonymous: boolean(customer.is_anonymous), type: nullableString(session.type), authenticatedAt: nullableString(session.authenticated_at) }
}
