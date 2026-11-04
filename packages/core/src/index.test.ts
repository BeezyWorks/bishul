import { describe, expect, it } from 'vitest'

import { VERSION } from './index'

describe('@bishul/core', () => {
  it('has a version', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
