export interface CustomerAttribute { key: string; value: string | null }

export interface Entitlement {
  identifier: string
  isActive: boolean
  isSandbox: boolean
  periodType: string | null
  purchaseDate: string | null
  expirationDate: string | null
  ownershipType: string | null
  entitlementType: string | null
  purchaseStoreRefHash: string | null
  purchaseStoreTime: number | null
}

export interface Transaction {
  number: string | null
  status: number | null
  amount: number | null
  transactionDate: string | null
  trackingNumber: string | null
  isCryptoGate: boolean
  packageName: string | null
  storePurchaseRefId: string | null
  isTrial: boolean
}

export interface CustomerInfo {
  originalAppUserId: string
  firstSeen: string
  requestDate: string
  latestExpirationDate: string | null
  hasUsedTrial: boolean
  entitlements: Entitlement[]
  transactions: Transaction[]
  attributes: CustomerAttribute[]
}

export interface CheckEntitlementOptions {
  forceRefresh?: boolean | undefined
  signal?: AbortSignal | undefined
}

export type ReservedAttributeName =
  | '$email'
  | '$displayName'
  | '$fcmTokens'
  | '$apnsTokens'
  | '$idfa'
  | '$idfv'
  | '$phoneNumber'
  | '$campaign'
  | '$keyword'
