export interface RequestOptions { signal?: AbortSignal | undefined }
export type AttributeValues = Readonly<Record<string, string>>
export interface SyncAttribute { key: string; value: string | null }

export interface InAppifyEvents {
  customerInfoUpdated: import('./customer').CustomerInfo
  offeringsUpdated: import('./offering').OfferingsResult
  authenticationChanged: import('./auth').AuthResult
}
