import { Slot } from 'expo-router'
import React from 'react'

import { Shell } from '@/components'

export default function AppLayout() {
  return (
    <Shell>
      <Slot />
    </Shell>
  )
}
