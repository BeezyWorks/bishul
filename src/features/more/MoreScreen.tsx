import React from 'react'

import { Card, ListRow, Screen } from '@/components'

export function MoreScreen() {
  return (
    <Screen title="More">
      <Card>
        <ListRow
          title="Prep schedule"
          subtitle="What to do when, for accepted meals"
          href="/prep"
        />
        <ListRow title="People" subtitle="Your household and contacts" href="/people" />
        <ListRow
          title="Pantry"
          subtitle="What you have and what expires soon"
          href="/pantry"
          last
        />
      </Card>
    </Screen>
  )
}
