import React from 'react'

import { Button, Card, Screen, Text } from '@/components'

import { PRIVACY_SECTIONS, PRIVACY_UPDATED } from './copy'

/** The privacy policy. Public: reachable signed out, from the app and from the web. */
export function PrivacyScreen() {
  return (
    <Screen
      title="Privacy policy"
      subtitle={`Last updated ${PRIVACY_UPDATED}`}
      back={{ label: 'Back', href: '/' }}
    >
      <Card>
        {PRIVACY_SECTIONS.map((s) => (
          <React.Fragment key={s.title}>
            <Text variant="h2" accessibilityRole="header">
              {s.title}
            </Text>
            {s.paragraphs.map((p) => (
              <Text key={p}>{p}</Text>
            ))}
          </React.Fragment>
        ))}
        <Button label="Delete my account and data" variant="secondary" href="/delete-account" />
      </Card>
    </Screen>
  )
}
