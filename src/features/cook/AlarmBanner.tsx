import { usePathname, useRouter } from 'expo-router'
import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Text } from '@/components'
import { Icon } from '@/components/Icon'
import { colors, fontSize, fonts, radius, size, space } from '@/theme/tokens'

import { cookHref } from './notifications'
import { timerActions, type CookTimerEntry } from './timers'

/**
 * Shown on every screen except cooking mode while a timer's alarm is going. Tapping it silences the alarm and opens
 * the step the timer belongs to.
 */
export function AlarmBanner({ entry }: { entry: CookTimerEntry | undefined }) {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  // Cooking mode has its own timer column, which rings and flashes in place.
  const inCookMode = usePathname().startsWith('/cook')
  if (!entry || inCookMode) return null
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + space.sm }]}>
      <Pressable
        accessibilityRole="alert"
        accessibilityLabel={`Time is up: ${entry.label}, ${entry.recipeTitle}, step ${
          entry.stepIndex + 1
        }. Tap to silence and go to the step.`}
        onPress={() => {
          timerActions.silence()
          router.navigate(
            cookHref({ versionId: entry.versionId, step: entry.stepIndex, scale: entry.scale }),
          )
        }}
        style={styles.banner}
      >
        <Icon name="bellOff" size={26} color={colors.cookBg} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            Time is up: {entry.label}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {entry.recipeTitle} · step {entry.stepIndex + 1}. Tap to silence.
          </Text>
        </View>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    zIndex: 1000,
    alignItems: 'center',
  },
  banner: {
    width: '100%',
    maxWidth: 640,
    minHeight: size.touch + space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.card,
    backgroundColor: colors.cookAlert,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  title: { fontFamily: fonts.display, fontSize: fontSize.xl, color: colors.cookBg },
  sub: { fontFamily: fonts.bodySemiBold, fontSize: fontSize.sm, color: colors.cookBg },
})
