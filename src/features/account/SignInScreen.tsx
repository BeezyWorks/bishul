import React, { useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'

import { Button, Card, Text, TextField, useLayout } from '@/components'
import { DEV_AUTH } from '@/lib/config'
import { colors, size, space } from '@/theme/tokens'

import { requestPasswordReset, signInDev, signInEmail, signInWith, signUpEmail } from './store'

type Mode = 'signIn' | 'signUp' | 'forgot'

/** Signed-out landing: what Bishul is, and the shared BeezyWorks sign-in. */
export function SignInScreen() {
  const { wide } = useLayout()
  const [mode, setMode] = useState<Mode>('signIn')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      if (mode === 'signIn') await signInEmail(email.trim(), password)
      else if (mode === 'signUp') {
        await signUpEmail(name.trim(), email.trim(), password)
        setNotice('Check your email to confirm your address, then sign in.')
        setMode('signIn')
      } else {
        await requestPasswordReset(email.trim())
        setNotice('If that address has an account, a reset link is on its way.')
        setMode('signIn')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }
  const ready =
    !!email.trim() &&
    (mode === 'forgot' ||
      (!!password && (mode === 'signIn' || (!!name.trim() && password.length >= 8))))

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, wide && styles.contentWide]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.hero, wide && { flex: 1 }]}>
        <Text variant="h2" color={colors.accent}>
          Bishul
        </Text>
        <Text variant={wide ? 'display' : 'h1'} accessibilityRole="header">
          Plan Shabbat for these guests.
        </Text>
        <Text color={colors.muted}>
          Recipes, guests and their constraints, the menu, the shopping list and the prep schedule
          for a kosher home. Bishul checks every dish against who is coming, and it works with your
          own AI.
        </Text>
        <Text variant="small">
          It’s on the host: Bishul helps you avoid serving the wrong thing, but it can’t guarantee a
          dish is safe.
        </Text>
      </View>

      <Card style={[styles.card, wide && { flex: 1 }]}>
        <Text variant="h2" accessibilityRole="header">
          {mode === 'signIn'
            ? 'Sign in'
            : mode === 'signUp'
              ? 'Create your account'
              : 'Reset password'}
        </Text>
        <Text variant="small">
          With your BeezyWorks account, the same one as Beitecha and the Siddur.
        </Text>
        {mode !== 'forgot' ? (
          <View style={styles.providers}>
            <Button
              label="Continue with Google"
              variant="secondary"
              full
              onPress={() => signInWith('google')}
            />
            <Button
              label="Continue with Apple"
              variant="secondary"
              full
              onPress={() => signInWith('apple')}
            />
          </View>
        ) : null}
        {mode === 'signUp' ? (
          <TextField label="Your name" value={name} onChangeText={setName} autoComplete="name" />
        ) : null}
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
        />
        {mode !== 'forgot' ? (
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
            onSubmitEditing={() => ready && submit()}
            hint={mode === 'signUp' ? 'At least 8 characters.' : undefined}
          />
        ) : null}
        {error ? (
          <Text color={colors.danger} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        {notice ? <Text color={colors.accent}>{notice}</Text> : null}
        <Button
          label={
            mode === 'signIn' ? 'Sign in' : mode === 'signUp' ? 'Create account' : 'Send reset link'
          }
          full
          loading={busy}
          disabled={!ready}
          onPress={submit}
        />
        <View style={styles.links}>
          {mode === 'signIn' ? (
            <>
              <Button
                label="Create an account"
                variant="ghost"
                small
                onPress={() => setMode('signUp')}
              />
              <Button
                label="Forgot password?"
                variant="ghost"
                small
                onPress={() => setMode('forgot')}
              />
            </>
          ) : (
            <Button
              label="Back to sign in"
              variant="ghost"
              small
              onPress={() => setMode('signIn')}
            />
          )}
        </View>
        {DEV_AUTH ? (
          <Button
            label="Continue as a dev user"
            variant="secondary"
            full
            onPress={() => signInDev('Dev')}
          />
        ) : null}
      </Card>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.ground },
  content: {
    width: '100%',
    maxWidth: size.maxContent,
    alignSelf: 'center',
    padding: size.gutterPhone,
    paddingTop: space.huge,
    gap: space.xxl,
  },
  contentWide: { flexDirection: 'row', alignItems: 'flex-start', padding: size.gutterWide },
  hero: { gap: space.md },
  card: { gap: space.md, maxWidth: 480, width: '100%' },
  providers: { gap: space.sm },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
})
