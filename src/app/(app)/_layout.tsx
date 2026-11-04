import { Slot } from 'expo-router'
import React from 'react'

import { Shell } from '@/components'
import { AuthGate } from '@/features/account/AuthGate'
import { useSyncPrefs } from '@/features/settings/useSyncPrefs'

function Synced({ children }: { children: React.ReactNode }) {
  useSyncPrefs()
  return <>{children}</>
}

export default function AppLayout() {
  return (
    <AuthGate>
      <Synced>
        <Shell>
          <Slot />
        </Shell>
      </Synced>
    </AuthGate>
  )
}
