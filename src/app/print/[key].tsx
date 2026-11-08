import React from 'react'

import { AuthGate } from '@/features/account/AuthGate'
import { PrintScreen } from '@/features/print/PrintScreen'

export default function Print() {
  return (
    <AuthGate>
      <PrintScreen />
    </AuthGate>
  )
}
