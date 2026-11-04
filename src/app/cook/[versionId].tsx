import React from 'react'

import { AuthGate } from '@/features/account/AuthGate'
import { CookScreen } from '@/features/cook/CookScreen'

export default function Cook() {
  return (
    <AuthGate>
      <CookScreen />
    </AuthGate>
  )
}
