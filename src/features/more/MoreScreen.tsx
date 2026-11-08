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
        <ListRow title="Use soon" subtitle="What to use up before it goes bad" href="/use-soon" />
        <ListRow
          title="Settings"
          subtitle="Household, units, API keys and connecting your AI"
          href="/settings"
          last
        />
      </Card>
    </Screen>
  )
}
