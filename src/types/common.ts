export interface RequestOptions { signal?: AbortSignal | undefined }
export type AttributeValues = Readonly<Record<string, string>>
export interface SyncAttribute { key: string; value: string | null }
export type SessionState = 'anonymous' | 'authenticated' | 'refreshing' | 'temporarily-unavailable' | 'recovery-required'
export interface SessionStateChange { state: SessionState; reason?: string | undefined; retryable: boolean }

export interface InAppifyEvents {
  customerInfoUpdated: import('./customer').CustomerInfo
  offeringsUpdated: import('./offering').OfferingsResult
  authenticationChanged: import('./auth').AuthResult
  sessionStateChanged: SessionStateChange
  consumableDelivered: import('./consumable').ConsumableDelivery
}
