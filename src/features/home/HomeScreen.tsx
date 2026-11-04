import React, { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { API_URL } from '@/lib/config'
import { colors, fonts } from '@/theme/tokens'

type Status = 'checking' | 'ok' | 'down'

export function HomeScreen() {
  const [status, setStatus] = useState<Status>('checking')

  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then((r) => r.json())
      .then((b: { ok?: boolean }) => setStatus(b.ok ? 'ok' : 'down'))
      .catch(() => setStatus('down'))
  }, [])

  const label = { checking: 'Checking the API...', ok: 'API reachable', down: 'API not reachable' }[
    status
  ]
  const tone = status === 'ok' ? colors.accent : status === 'down' ? colors.danger : colors.muted
  const soft =
    status === 'ok' ? colors.accentSoft : status === 'down' ? colors.dangerSoft : colors.subtle

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Bishul</Text>
      <View style={[styles.pill, { backgroundColor: soft }]}>
        <Text style={[styles.pillText, { color: tone }]}>{label}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    backgroundColor: colors.ground,
  },
  title: { fontFamily: fonts.display, fontSize: 48, color: colors.ink },
  pill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999 },
  pillText: { fontFamily: fonts.bodyMedium, fontSize: 14 },
})
