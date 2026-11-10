import { useRouter, type Href } from 'expo-router'
import React from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { colors, fonts, size, space } from '@/theme/tokens'

import { Icon } from './Icon'
import { Text } from './Text'
import { useLayout } from './useLayout'

interface Props {
  title?: string
  subtitle?: string
  eyebrow?: string
  back?: { label: string; href: string }
  actions?: React.ReactNode
  children: React.ReactNode
}

/** A page: centred column, responsive gutters, optional heading row. */
export function Screen({ title, subtitle, eyebrow, back, actions, children }: Props) {
  const { wide } = useLayout()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const gutter = wide ? size.gutterWide : size.gutterPhone
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={{
        paddingHorizontal: gutter,
        paddingTop: (wide ? space.xxl : space.xl) + insets.top,
        paddingBottom: space.huge * 1.5,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.inner}>
        {back ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push(back.href as Href)}
            style={styles.back}
          >
            <View style={styles.backInner}>
              <Icon name="back" size={16} color={colors.accent} />
              <Text variant="small" color={colors.accent} style={styles.backText}>
                {back.label}
              </Text>
            </View>
          </Pressable>
        ) : null}
        {title ? (
          <View style={styles.head}>
            <View style={styles.headText}>
              {eyebrow ? <Text variant="label">{eyebrow}</Text> : null}
              <Text variant={wide ? 'display' : 'h1'} accessibilityRole="header">
                {title}
              </Text>
              {subtitle ? <Text color={colors.muted}>{subtitle}</Text> : null}
            </View>
            {actions ? <View style={styles.actions}>{actions}</View> : null}
          </View>
        ) : null}
        {children}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.ground },
  inner: { width: '100%', maxWidth: size.maxContent, alignSelf: 'center', gap: space.xl },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: space.md,
  },
  // Without a cap, a wrapping row of buttons sizes to its content and runs off a narrow screen.
  actions: { maxWidth: '100%' },
  headText: { flexShrink: 1, gap: 4 },
  backInner: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  backText: { fontFamily: fonts.bodySemiBold },
  back: { minHeight: size.touch, justifyContent: 'center', marginBottom: -space.lg },
})
