import React, { useState } from 'react'

import { Button, Card, Screen, Text, TextField } from '@/components'
import { SignInScreen } from '@/features/account/SignInScreen'
import { deleteAccount, useAccount } from '@/features/account/store'
import { colors } from '@/theme/tokens'

import { DELETE_EFFECTS, SUPPORT_EMAIL } from './copy'

/** Delete your account and data. Public URL for the App Store and web; signed-out visitors sign in first. */
export function DeleteAccountScreen() {
  const { status, user } = useAccount()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (done)
    return (
      <Screen title="Account deleted">
        <Card>
          <Text>Your account and data have been deleted. Thank you for using Tavshil.</Text>
          <Button label="Back to the start" href="/" />
        </Card>
      </Screen>
    )
  if (status === 'signedOut')
    return <SignInScreen returnTo="/delete-account" reason="Sign in to delete your account" />

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      await deleteAccount(password.trim() || undefined)
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen
      title="Delete account"
      subtitle="Permanently delete your account and your data."
      back={{ label: 'Settings', href: '/settings' }}
    >
      <Card>
        <Text variant="bodyStrong">Signed in as {user?.email}</Text>
        <Text>Deleting your account:</Text>
        {DELETE_EFFECTS.map((e) => (
          <Text key={e}>• {e}</Text>
        ))}
        <TextField
          label="Password (if you sign in with email)"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          hint="Leave empty if you use Apple or Google. If asked, sign out, sign in again and retry."
        />
        {error ? (
          <Text color={colors.danger} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <Button label="Delete my account and data" variant="danger" loading={busy} onPress={run} />
        <Text variant="small">
          Can’t sign in? Email {SUPPORT_EMAIL} from the address on your account and we will delete
          it for you.
        </Text>
      </Card>
    </Screen>
  )
}
