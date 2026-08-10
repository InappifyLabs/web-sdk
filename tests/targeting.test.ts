import { describe, expect, it } from 'vitest'

import { Offerings, compareVersions, evaluateTargetingCondition } from '../src/targeting'
import type { Offering, TargetingCondition, TargetingContext, TargetingRule } from '../src'

const defaultContext: TargetingContext = {
  country: 'IR', platform: 3, appId: 42, appVersion: '1.10.2', sdkVersion: '0.1.0-beta.0',
  attributes: { plan: 'gold', language: 'fa' },
}

const offerings: Offering[] = [
  offering('default', true), offering('iran'), offering('home'), offering('fallback'), offering('gold'),
]

describe('targeting', () => {
  it('selects the first matching rule by sort and requires every condition to match', () => {
    const result = create([
      rule(20, 'gold', [condition('custom_attribute', 'in', ['gold'], 'plan')]),
      rule(10, 'iran', [condition('country', 'in', ['IR']), condition('app_config', 'in', [42])]),
      rule(5, 'home', [condition('country', 'in', ['US']), condition('any_audience', null, null)]),
    ])

    expect(result.current?.identifier).toBe('iran')
  })

  it('resolves placement, placement fallback, rule default, and global default in order', () => {
    const targeted = create([{ ...rule(1, 'iran', [condition('any_audience', null, null)]), placements: {
      fallbackOfferingIdentifier: 'fallback', offerings: [{ placementIdentifier: 'home_banner', offeringIdentifier: 'home' }],
    } }])

    expect(targeted.getCurrentOffering('home_banner')?.identifier).toBe('home')
    expect(targeted.getCurrentOffering('unknown')?.identifier).toBe('fallback')
    expect(targeted.getCurrentOffering()?.identifier).toBe('iran')

    const brokenReferences = create([{ ...rule(1, 'missing', [condition('any_audience', null, null)]), placements: {
      fallbackOfferingIdentifier: 'also-missing', offerings: [{ placementIdentifier: 'home_banner', offeringIdentifier: 'missing' }],
    } }])
    expect(brokenReferences.getCurrentOffering('home_banner')?.identifier).toBe('default')
  })

  it('supports web platform aliases and customer attributes', () => {
    expect(evaluateTargetingCondition(condition('platform', 'in', [3]), defaultContext)).toBe(true)
    expect(evaluateTargetingCondition(condition('platform', 'in', ['web']), defaultContext)).toBe(true)
    expect(evaluateTargetingCondition(condition('custom_attribute', '=', 'fa', 'language'), defaultContext)).toBe(true)
    expect(evaluateTargetingCondition(condition('custom_attribute', 'not in', ['blocked'], 'missing'), defaultContext)).toBe(false)
  })

  it('compares semantic version segments and respects app-version context', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBe(1)
    expect(compareVersions('1.10', '1.10.0')).toBe(0)
    expect(compareVersions('2.0.0-beta.1', '2.0.0')).toBe(0)
    expect(evaluateTargetingCondition(condition('app_version', '>=', '1.10.0', 42), defaultContext)).toBe(true)
    expect(evaluateTargetingCondition(condition('app_version', '>=', '1.0.0', 99), defaultContext)).toBe(false)
    expect(evaluateTargetingCondition(condition('sdk_version', '>=', '0.1.0'), defaultContext)).toBe(true)
  })

  it('allows an explicit context override without mutating the stored context', () => {
    const result = create([rule(1, 'iran', [condition('country', 'in', ['IR'])])])
    expect(result.getCurrentOffering()?.identifier).toBe('iran')
    expect(result.getCurrentOffering(undefined, { country: 'US' })?.identifier).toBe('default')
    expect(result.getCurrentOffering()?.identifier).toBe('iran')
  })
})

function create(rules: TargetingRule[]): Offerings {
  return new Offerings({ offerings, rules, forceVersion: 1, context: defaultContext })
}

function offering(identifier: string, isDefault = false): Offering {
  return { identifier, isDefault, serverDescription: null, metadata: {}, packages: [] }
}

function rule(sort: number, defaultOfferingIdentifier: string, conditions: TargetingCondition[]): TargetingRule {
  return { sort, defaultOfferingIdentifier, conditions, placements: null }
}

function condition(field: string, operator: string | null, value: unknown, context: string | number | null = null): TargetingCondition {
  return { field, operator, value, context }
}
