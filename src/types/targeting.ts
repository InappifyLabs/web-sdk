import type { Offering } from './offering'

export type TargetingField = string
export type TargetingOperator = string

export interface TargetingCondition {
  field: TargetingField
  operator: TargetingOperator | null
  value: unknown
  context: string | number | null
}

export interface PlacementOffering {
  placementIdentifier: string
  offeringIdentifier: string
}

export interface PlacementRule {
  fallbackOfferingIdentifier: string | null
  offerings: readonly PlacementOffering[]
}

export interface TargetingRule {
  defaultOfferingIdentifier: string | null
  sort: number
  conditions: readonly TargetingCondition[]
  placements: PlacementRule | null
}

export interface TargetingContext {
  country: string
  platform: string | number
  appId: string | number | null
  appVersion: string
  sdkVersion: string
  attributes: Readonly<Record<string, string | null>>
}

export interface CurrentOfferingOptions {
  placementIdentifier?: string | undefined
  context?: Partial<TargetingContext> | undefined
  forceRefresh?: boolean | undefined
  signal?: AbortSignal | undefined
}

export interface OfferingResolver {
  getCurrentOffering(placementIdentifier?: string, context?: Partial<TargetingContext>): Offering | null
}
