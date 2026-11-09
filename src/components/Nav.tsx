import { useRouter, usePathname, type Href } from 'expo-router'
import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context'

import { colors, fontSize, fonts, radius, size, space } from '@/theme/tokens'

import { Text } from './Text'
import { useLayout } from './useLayout'

const isActive = (path: string, href: string) =>
  href === '/'
    ? path === '/' || path.startsWith('/meal') || path.startsWith('/hosted')
    : path === href || path.startsWith(`${href}/`)

const TOP = [
  { href: '/', label: 'Plan' },
  { href: '/recipes', label: 'Recipes' },
  { href: '/shopping', label: 'Shopping' },
  { href: '/people', label: 'People' },
  { href: '/more', label: 'More' },
] as const

/** Wide screens: a top bar with every section. */
export function TopNav() {
  const path = usePathname()
  const router = useRouter()
  const { top } = useSafeAreaInsets()
  return (
    <View style={[styles.top, { height: size.navHeight + top, paddingTop: top }]} role="navigation">
      <Pressable
        accessibilityRole="link"
        onPress={() => router.push('/' as Href)}
        style={styles.brand}
      >
        <Text variant="h2" color={colors.accent}>
          Tavshil
        </Text>
      </Pressable>
      <View style={styles.topLinks}>
        {TOP.map((n) => {
          const on = isActive(path, n.href)
          return (
            <Pressable
              key={n.href}
              accessibilityRole="link"
              accessibilityState={{ selected: on }}
              onPress={() => router.push(n.href as Href)}
              style={[styles.topLink, on && styles.topOn]}
            >
              <Text
                style={{
                  fontFamily: on ? fonts.bodySemiBold : fonts.bodyMedium,
                  fontSize: fontSize.md,
                  color: on ? colors.accent : colors.ink,
                }}
              >
                {n.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const TABS = TOP

/** Phones: bottom tabs. Prep and Use soon live under More. */
export function BottomTabs() {
  const path = usePathname()
  const router = useRouter()
  const more = ['/more', '/prep', '/use-soon', '/settings']
  const { bottom } = useSafeAreaInsets()
  return (
    <View
      style={[styles.tabs, { height: size.tabBarHeight + bottom, paddingBottom: bottom }]}
      accessibilityRole="tablist"
    >
      {TABS.map((t) => {
        const on =
          t.href === '/more'
            ? more.some((m) => path === m || path.startsWith(`${m}/`))
            : isActive(path, t.href)
        return (
          <Pressable
            key={t.href}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => router.push(t.href as Href)}
            style={styles.tab}
          >
            <View style={[styles.tabBar, on && { backgroundColor: colors.accent }]} />
            <Text
              style={{
                fontFamily: on ? fonts.bodySemiBold : fonts.bodyMedium,
                fontSize: fontSize.xs + 1,
                color: on ? colors.accent : colors.muted,
              }}
            >
              {t.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { wide } = useLayout()
  const insets = useSafeAreaInsets()
  // The nav bars absorb the top and bottom insets, so screens inside must not add them again.
  const inner = { ...insets, top: wide ? 0 : insets.top, bottom: 0 }
  return (
    <View style={styles.shell}>
      {wide ? <TopNav /> : null}
      <View style={styles.body}>
        <SafeAreaInsetsContext.Provider value={inner}>{children}</SafeAreaInsetsContext.Provider>
      </View>
      {wide ? null : <BottomTabs />}
    </View>
  )
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.ground },
  body: { flex: 1 },
  top: {
    height: size.navHeight,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: size.gutterWide,
    gap: space.xl,
  },
  brand: { minHeight: size.touch, justifyContent: 'center' },
  topLinks: { flexDirection: 'row', gap: space.xs, flex: 1 },
  topLink: {
    minHeight: size.touch,
    paddingHorizontal: space.lg,
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  topOn: { backgroundColor: colors.accentSoft },
  tabs: {
    height: size.tabBarHeight,
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
  },
  tab: { flex: 1, minHeight: size.touch, alignItems: 'center', justifyContent: 'center', gap: 6 },
  tabBar: { width: 24, height: 4, borderRadius: 2, backgroundColor: 'transparent' },
})
