import * as Linking from 'expo-linking'
import React from 'react'

import { Button, Card, Disclaimer, Screen, SectionHeader, Text } from '@/components'

import { ABOUT_PARAGRAPHS, SUPPORT_EMAIL } from './copy'

/** About and support. Public: it is the App Store support URL, so it works signed out. */
export function AboutScreen() {
  return (
    <Screen
      title="About Tavshil"
      subtitle="And how to get help."
      back={{ label: 'Back', href: '/' }}
    >
      <Card>
        {ABOUT_PARAGRAPHS.map((p) => (
          <Text key={p}>{p}</Text>
        ))}
        <Disclaimer />
      </Card>
      <Card>
        <SectionHeader title="Support" hint="Questions, bugs and ideas are all welcome." />
        <Text>
          Email <Text variant="bodyStrong">{SUPPORT_EMAIL}</Text> and we will get back to you.
        </Text>
        <Button
          label="Email support"
          variant="soft"
          onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Tavshil%20support`)}
        />
      </Card>
      <Card>
        <SectionHeader title="Your data" />
        <Button label="Privacy policy" variant="secondary" href="/privacy" />
        <Button label="Delete account and data" variant="danger" href="/delete-account" />
      </Card>
    </Screen>
  )
}
