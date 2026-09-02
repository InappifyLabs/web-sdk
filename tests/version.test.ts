import { describe, expect, it } from 'vitest'

import { SDK_VERSION } from '../src'

describe('SDK_VERSION', () => {
  it('exposes the current prerelease version', () => {
    expect(SDK_VERSION).toBe('0.1.0-beta.3')
  })
})
