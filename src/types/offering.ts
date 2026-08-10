export interface ProductPrice {
  amount: number
  currency: string
  originalAmount: number | null
  discountAmount: number | null
}

export interface StoreProduct {
  identifier: string
  name: string | null
  trialDays: number | null
  prices: ProductPrice[]
}

export interface OfferingPackage {
  identifier: string
  packageType: number
  description: string | null
  entitlement: string | null
  name: string
  discountPercent: number
  product: StoreProduct
}

export interface Offering {
  identifier: string
  isDefault: boolean
  serverDescription: string | null
  metadata: Readonly<Record<string, unknown>>
  packages: OfferingPackage[]
}

export interface OfferingsResult {
  readonly all: readonly Offering[]
  readonly current: Offering | null
  readonly rules: readonly import('./targeting').TargetingRule[]
  readonly forceVersion: number
  readonly fetchedAt: string
  getCurrentOffering(placementIdentifier?: string, context?: Partial<import('./targeting').TargetingContext>): Offering | null
}

export interface GetOfferingsOptions { forceRefresh?: boolean | undefined; signal?: AbortSignal | undefined }
