import type { Offering } from './offering'

export type CheckoutStatus = string

export interface CheckoutResult {
  checkout: { id: string; status: CheckoutStatus; expiresAt: string }
  price: { originalAmount: number; discountAmount: number; finalAmount: number; currency: string }
  nextAction: { type: string; url: string | null }
}

export interface PurchaseParams {
  offeringIdentifier: string
  packageIdentifier: string
  productIdentifier: string
  discountCode?: string
  country?: string
  appVersion?: string
  isCrypto?: boolean
  idempotencyKey?: string
}

export interface PurchaseOptions { redirect?: boolean | undefined; signal?: AbortSignal | undefined }
export interface PollCheckoutOptions { intervalMs?: number | undefined; timeoutMs?: number | undefined; signal?: AbortSignal | undefined }
export interface DiscountValidation {
  discount: { code: string; isValid: boolean; percent: number | null }
  offering: Offering
}
