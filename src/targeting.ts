import type { Offering, OfferingsResult, TargetingCondition, TargetingContext, TargetingRule } from './types'

export class Offerings implements OfferingsResult {
  readonly all: readonly Offering[]
  readonly rules: readonly TargetingRule[]
  readonly forceVersion: number
  readonly fetchedAt: string

  constructor(options: {
    offerings: readonly Offering[]
    rules: readonly TargetingRule[]
    forceVersion: number
    context: TargetingContext
    fetchedAt?: string
  }) {
    this.all = Object.freeze([...options.offerings])
    this.rules = Object.freeze([...options.rules].sort((left, right) => left.sort - right.sort))
    this.forceVersion = options.forceVersion
    this.fetchedAt = options.fetchedAt ?? new Date().toISOString()
    this.context = freezeContext(options.context)
  }

  private readonly context: TargetingContext

  get current(): Offering | null { return this.getCurrentOffering() }

  getCurrentOffering(placementIdentifier?: string, context: Partial<TargetingContext> = {}): Offering | null {
    const effectiveContext = { ...this.context, ...context, attributes: context.attributes ?? this.context.attributes }
    const matchingRule = this.rules.find((rule) => rule.conditions.every((condition) => evaluateTargetingCondition(condition, effectiveContext)))
    if (!matchingRule) return this.defaultOffering()

    if (placementIdentifier && matchingRule.placements) {
      const placement = matchingRule.placements.offerings.find((item) => item.placementIdentifier === placementIdentifier)
      const placementOffering = this.findOffering(placement?.offeringIdentifier)
      if (placementOffering) return placementOffering

      const fallback = this.findOffering(matchingRule.placements.fallbackOfferingIdentifier)
      if (fallback) return fallback
    }

    return this.findOffering(matchingRule.defaultOfferingIdentifier) ?? this.defaultOffering()
  }

  private defaultOffering(): Offering | null { return this.all.find((offering) => offering.isDefault) ?? null }

  private findOffering(identifier: string | null | undefined): Offering | null {
    return identifier ? this.all.find((offering) => offering.identifier === identifier) ?? null : null
  }
}

export function evaluateTargetingCondition(condition: TargetingCondition, context: TargetingContext): boolean {
  if (condition.field === 'any_audience') return true
  if (!condition.operator) return false

  switch (condition.field) {
    case 'country':
      return evaluateOperator(context.country.toUpperCase(), condition.operator, normalizeCountryValue(condition.value))
    case 'platform':
      return evaluatePlatform(context.platform, condition.operator, condition.value)
    case 'custom_attribute': {
      const key = condition.context === null ? '' : String(condition.context)
      const value = context.attributes[key]
      if (value === null || value === undefined || value === '') return false
      return evaluateOperator(value, condition.operator, condition.value)
    }
    case 'app_config':
      return context.appId !== null && evaluateOperator(context.appId, condition.operator, condition.value)
    case 'app_version':
      if (!matchesAppContext(condition.context, context.appId)) return false
      return evaluateVersion(context.appVersion, condition.operator, condition.value)
    case 'sdk_version':
      return evaluateVersion(context.sdkVersion, condition.operator, condition.value)
    default:
      return false
  }
}

export function compareVersions(left: string, right: string): number {
  const leftParts = versionParts(left); const rightParts = versionParts(right)
  const length = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (difference !== 0) return difference < 0 ? -1 : 1
  }
  return 0
}

function evaluateVersion(left: string, operator: string, rawRight: unknown): boolean {
  if (!left) return false
  const right = isUnknownArray(rawRight) ? rawRight[0] : rawRight
  if (typeof right !== 'string' && typeof right !== 'number') return false
  if (!isValidVersion(left) || !isValidVersion(String(right))) return false
  const comparison = compareVersions(left, String(right))
  switch (operator) {
    case '>': return comparison > 0
    case '<': return comparison < 0
    case '>=': return comparison >= 0
    case '<=': return comparison <= 0
    case '=': return comparison === 0
    case '!=': return comparison !== 0
    default: return false
  }
}

function evaluateOperator(left: string | number, operator: string, right: unknown): boolean {
  switch (operator) {
    case '>': return comparable(left, right, (a, b) => a > b)
    case '<': return comparable(left, right, (a, b) => a < b)
    case '>=': return comparable(left, right, (a, b) => a >= b)
    case '<=': return comparable(left, right, (a, b) => a <= b)
    case '=': return equal(left, right)
    case '!=': return !equal(left, right)
    case 'in': return isUnknownArray(right) && right.some((item) => equal(left, item))
    case 'not in': return isUnknownArray(right) && !right.some((item) => equal(left, item))
    default: return false
  }
}

function evaluatePlatform(platform: string | number, operator: string, right: unknown): boolean {
  const aliases: Array<string | number> = [platform]
  if (platform === 3 || String(platform).toLowerCase() === 'web') aliases.push(3, '3', 'web')
  if (operator === 'in') return isUnknownArray(right) && aliases.some((left) => right.some((item) => equal(left, item)))
  if (operator === 'not in') return isUnknownArray(right) && aliases.every((left) => !right.some((item) => equal(left, item)))
  return aliases.some((left) => evaluateOperator(left, operator, right))
}

function normalizeCountryValue(value: unknown): unknown {
  return isUnknownArray(value) ? value.map((item) => typeof item === 'string' ? item.toUpperCase() : item) : typeof value === 'string' ? value.toUpperCase() : value
}

function matchesAppContext(conditionAppId: string | number | null, currentAppId: string | number | null): boolean {
  return conditionAppId === null || conditionAppId === '' || (currentAppId !== null && equal(currentAppId, conditionAppId))
}

function equal(left: unknown, right: unknown): boolean {
  if (typeof left === 'number' && typeof right === 'string' && right.trim() !== '') return left === Number(right)
  if (typeof left === 'string' && typeof right === 'number' && left.trim() !== '') return Number(left) === right
  return left === right
}

function comparable(left: string | number, right: unknown, compare: (left: number, right: number) => boolean): boolean {
  const leftNumber = Number(left); const rightNumber = Number(right)
  return Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && compare(leftNumber, rightNumber)
}

function versionParts(version: string): number[] {
  const core = version.trim().replace(/^v/i, '').split(/[+-]/, 1)[0] ?? ''
  if (!/^\d+(?:\.\d+)*$/.test(core)) return []
  return core.split('.').map(Number)
}

function isValidVersion(version: string): boolean {
  return versionParts(version).length > 0
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

function freezeContext(context: TargetingContext): TargetingContext {
  return Object.freeze({ ...context, attributes: Object.freeze({ ...context.attributes }) })
}
