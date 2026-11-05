import React, { useEffect, useState } from 'react'
import { Platform, StyleSheet, View } from 'react-native'

import {
  Badge,
  Button,
  Card,
  Loading,
  Screen,
  SectionHeader,
  Segmented,
  Text,
  TextField,
} from '@/components'
import { signOut, useAccount } from '@/features/account/store'
import { api } from '@/lib/api/client'
import { stale, useApiKeys, useApiMutation, useHouseholdInfo, usePrefs } from '@/lib/api/hooks'
import type { CreatedApiKey } from '@/lib/api/types'
import { MCP_URL, OPENAPI_URL, REST_URL } from '@/lib/config'
import { setUnits } from '@/lib/prefs'
import { colors, radius, space } from '@/theme/tokens'

async function copy(text: string): Promise<boolean> {
  try {
    await globalThis.navigator?.clipboard?.writeText(text)
    return true
  } catch {
    return false
  }
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <Button
      label={done ? 'Copied' : label}
      variant="secondary"
      small
      onPress={async () => {
        setDone(await copy(text))
        setTimeout(() => setDone(false), 2000)
      }}
    />
  )
}

export function SettingsScreen() {
  return (
    <Screen title="Settings" subtitle="Your household, how amounts are shown, and your AI.">
      <HouseholdCard />
      <UnitsCard />
      <ConnectCard />
      <KeysCard />
      <AccountCard />
    </Screen>
  )
}

// ---- Household ----

function HouseholdCard() {
  const { data } = useHouseholdInfo()
  const [name, setName] = useState('')
  const [place, setPlace] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [tz, setTz] = useState('')
  const [israel, setIsrael] = useState<'diaspora' | 'israel'>('diaspora')
  const [message, setMessage] = useState<string | null>(null)
  const [geoBusy, setGeoBusy] = useState(false)

  useEffect(() => {
    if (!data) return
    setName(data.name)
    setPlace(data.location.name ?? '')
    setLat(String(data.location.lat))
    setLng(String(data.location.lng))
    setTz(data.location.timeZone)
    setIsrael(data.location.israel ? 'israel' : 'diaspora')
  }, [data])

  const save = useApiMutation(
    () =>
      api.updateHousehold({
        name: name.trim(),
        location: {
          lat: Number(lat),
          lng: Number(lng),
          timeZone: tz.trim(),
          israel: israel === 'israel',
          ...(place.trim() && { name: place.trim() }),
        },
      }),
    stale.settings,
  )

  const useMyLocation = () => {
    const geo = globalThis.navigator?.geolocation
    if (!geo) return setMessage('This browser can’t share a location. Enter the numbers instead.')
    setGeoBusy(true)
    geo.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(4))
        setLng(pos.coords.longitude.toFixed(4))
        setTz(Intl.DateTimeFormat().resolvedOptions().timeZone)
        setMessage('Location filled in. Check the Israel setting, then save.')
        setGeoBusy(false)
      },
      () => {
        setMessage('Couldn’t get your location. Enter the numbers instead.')
        setGeoBusy(false)
      },
      { timeout: 10_000 },
    )
  }

  const valid =
    !!name.trim() &&
    Number.isFinite(Number(lat)) &&
    Math.abs(Number(lat)) <= 90 &&
    Number.isFinite(Number(lng)) &&
    Math.abs(Number(lng)) <= 180 &&
    !!lat &&
    !!lng &&
    !!tz.trim()

  if (!data) return <Loading />
  return (
    <Card>
      <SectionHeader
        title="Household"
        hint="The location sets the Hebrew calendar, candle lighting, holidays and seasons like Pesach."
      />
      {!data.locationSet ? (
        <Badge label="Location not set: using New York until you save one" tone="warn" />
      ) : null}
      <TextField label="Household name" value={name} onChangeText={setName} />
      <TextField
        label="Place (optional)"
        value={place}
        onChangeText={setPlace}
        placeholder="e.g. Teaneck"
      />
      <View style={styles.row}>
        <TextField label="Latitude" value={lat} onChangeText={setLat} keyboardType="numeric" />
        <TextField label="Longitude" value={lng} onChangeText={setLng} keyboardType="numeric" />
        <TextField
          label="Time zone"
          value={tz}
          onChangeText={setTz}
          placeholder="America/New_York"
        />
      </View>
      <View style={styles.row}>
        <Segmented
          options={[
            { value: 'diaspora', label: 'Outside Israel' },
            { value: 'israel', label: 'In Israel' },
          ]}
          value={israel}
          onChange={setIsrael}
        />
        {Platform.OS === 'web' ? (
          <Button
            label="Use my location"
            variant="secondary"
            loading={geoBusy}
            onPress={useMyLocation}
          />
        ) : null}
      </View>
      {message ? <Text variant="small">{message}</Text> : null}
      {save.error ? (
        <Text color={colors.danger} accessibilityRole="alert">
          {(save.error as Error).message}
        </Text>
      ) : null}
      {save.isSuccess ? <Text color={colors.accent}>Saved.</Text> : null}
      <Button
        label="Save household"
        disabled={!valid}
        loading={save.isPending}
        onPress={() => {
          setMessage(null)
          save.mutate(undefined)
        }}
      />
    </Card>
  )
}

// ---- Units ----

function UnitsCard() {
  const { data } = usePrefs()
  const set = useApiMutation(
    (system: 'us' | 'metric') => api.setPrefs({ system }),
    [['prefs'], ['recipe'], ['version']],
  )
  return (
    <Card>
      <SectionHeader title="Display units" hint="Recipes and shopping show amounts this way." />
      <Segmented
        options={[
          { value: 'us', label: 'US (cups, oz)' },
          { value: 'metric', label: 'Metric (g, ml)' },
        ]}
        value={data?.system ?? 'metric'}
        onChange={(system) => {
          setUnits(system)
          set.mutate(system)
        }}
      />
    </Card>
  )
}

// ---- Connect your AI ----

function Code({ children }: { children: string }) {
  return (
    <View style={styles.code}>
      <Text selectable style={styles.mono}>
        {children}
      </Text>
    </View>
  )
}

function ConnectCard() {
  return (
    <Card>
      <SectionHeader
        title="Connect your AI"
        hint="Bishul is built to be used through your own AI. It adds recipes, plans meals and reads your lists for you."
      />
      <Text variant="h3">Claude</Text>
      <Text>
        In Claude, open Settings, then Connectors, then Add custom connector. Paste this address and
        sign in with your Baderech account when asked.
      </Text>
      <View style={styles.row}>
        <View style={{ flex: 1, minWidth: 220 }}>
          <Code>{MCP_URL}</Code>
        </View>
        <CopyButton text={MCP_URL} label="Copy address" />
      </View>
      <Text variant="h3">Scripts and other tools</Text>
      <Text>Create an API key below and send it as a bearer token. The base address is:</Text>
      <View style={styles.row}>
        <View style={{ flex: 1, minWidth: 220 }}>
          <Code>{REST_URL}</Code>
        </View>
        <CopyButton text={REST_URL} />
      </View>
      <Code>{'Authorization: Bearer bsk_…'}</Code>
      <Text>
        The full description of every call is the OpenAPI document at{' '}
        <Text variant="bodyStrong" selectable>
          {OPENAPI_URL}
        </Text>
        .
      </Text>
      <CopyButton text={OPENAPI_URL} label="Copy OpenAPI address" />
    </Card>
  )
}

// ---- API keys ----

function KeysCard() {
  const keys = useApiKeys()
  const [scope, setScope] = useState<'read' | 'write'>('write')
  const [fresh, setFresh] = useState<CreatedApiKey | null>(null)
  const create = useApiMutation(async (s: 'read' | 'write') => {
    const k = await api.createApiKey(s)
    setFresh(k)
    return k
  }, stale.keys)
  const revoke = useApiMutation((id: string) => api.revokeApiKey(id), stale.keys)

  return (
    <Card>
      <SectionHeader
        title="API keys"
        hint="For scripts and other tools. A read key can look but not change; a read-write key can do both."
      />
      {fresh ? (
        <Card tone="accent">
          <Text variant="h3" color={colors.accent}>
            Copy your key now
          </Text>
          <Text>It is shown only once. Store it somewhere safe.</Text>
          <Code>{fresh.key}</Code>
          <View style={styles.row}>
            <CopyButton text={fresh.key} label="Copy key" />
            <Button label="I’ve saved it" variant="ghost" small onPress={() => setFresh(null)} />
          </View>
        </Card>
      ) : null}
      {keys.isLoading ? <Loading /> : null}
      {(keys.data ?? []).length === 0 && !keys.isLoading ? (
        <Text color={colors.muted}>No API keys yet.</Text>
      ) : null}
      {(keys.data ?? []).map((k) => (
        <View key={k.id} style={styles.keyRow}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong">{k.prefix}…</Text>
            <Text variant="small">
              {k.scope === 'write' ? 'Read and write' : 'Read only'} · created{' '}
              {new Date(k.createdAt).toLocaleDateString()}
              {k.lastUsedAt
                ? ` · last used ${new Date(k.lastUsedAt).toLocaleDateString()}`
                : ' · never used'}
            </Text>
          </View>
          <Button
            label="Revoke"
            variant="danger"
            small
            accessibilityLabel={`Revoke key ${k.prefix}`}
            loading={revoke.isPending && revoke.variables === k.id}
            onPress={() => revoke.mutate(k.id)}
          />
        </View>
      ))}
      <View style={styles.row}>
        <Segmented
          options={[
            { value: 'write', label: 'Read and write' },
            { value: 'read', label: 'Read only' },
          ]}
          value={scope}
          onChange={setScope}
        />
        <Button
          label="Create API key"
          loading={create.isPending}
          onPress={() => create.mutate(scope)}
        />
      </View>
      {create.error ? <Text color={colors.danger}>{(create.error as Error).message}</Text> : null}
    </Card>
  )
}

// ---- Account ----

function AccountCard() {
  const { user } = useAccount()
  return (
    <Card>
      <SectionHeader title="Account" />
      <Text>
        Signed in as <Text variant="bodyStrong">{user?.name || user?.email}</Text>
        {user?.name && user?.email ? ` (${user.email})` : ''}.
      </Text>
      <Button label="Sign out" variant="secondary" onPress={() => void signOut()} />
    </Card>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'flex-end' },
  keyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  code: {
    backgroundColor: colors.subtle,
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.md,
  },
  mono: {
    fontFamily: Platform.select({
      web: 'ui-monospace, Menlo, Consolas, monospace',
      default: 'Courier',
    }),
    fontSize: 14,
    color: colors.ink,
  },
})
