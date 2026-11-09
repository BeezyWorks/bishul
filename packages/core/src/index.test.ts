import { describe, expect, it } from 'vitest'

import { VERSION } from './index'

describe('@tavshil/core', () => {
  it('has a version', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
