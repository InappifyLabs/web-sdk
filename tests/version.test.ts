import { describe, expect, it } from 'vitest'

import { SDK_VERSION } from '../src'

describe('SDK_VERSION', () => {
  it('exposes the current package version', () => {
    expect(SDK_VERSION).toBe('0.1.0')
  })
})
