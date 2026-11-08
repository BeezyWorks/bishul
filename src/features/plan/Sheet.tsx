import React from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native'

import { Button, Card, Text } from '@/components'
import { colors, space } from '@/theme/tokens'

/** A centred dialog over a dimmed page. Used for the day menu, "Host a meal…" and the in-place dish editor. */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={styles.backdrop}
        />
        <Card style={styles.card}>
          <View style={styles.head}>
            <Text variant="h3" accessibilityRole="header" style={{ flex: 1 }}>
              {title}
            </Text>
            <Button label="Close" variant="ghost" small onPress={onClose} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
            {children}
          </ScrollView>
        </Card>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.ink,
    opacity: 0.4,
  },
  card: { width: '100%', maxWidth: 520, maxHeight: '88%' },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  body: { gap: space.md },
})
