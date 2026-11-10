import { useRouter, type Href } from 'expo-router'
import React from 'react'
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'

import { colors, radius, size, space, fonts, fontSize } from '@/theme/tokens'

import { Icon, type IconName } from './Icon'
import { Text } from './Text'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft'

interface Props {
  label: string
  icon?: IconName
  onPress?: () => void
  /** Navigates instead of calling onPress. */
  href?: string
  variant?: ButtonVariant
  small?: boolean
  /** Shows only the icon (the label becomes its accessibility label). */
  iconOnly?: boolean
  disabled?: boolean
  loading?: boolean
  full?: boolean
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
  testID?: string
}

const palette: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.accent, fg: colors.onAccent, border: colors.accent },
  secondary: { bg: colors.surface, fg: colors.ink, border: colors.line },
  ghost: { bg: 'transparent', fg: colors.accent, border: 'transparent' },
  soft: { bg: colors.accentSoft, fg: colors.accent, border: colors.accentSoft },
  danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerSoft },
}

export function Button({
  label,
  icon,
  onPress,
  href,
  variant = 'primary',
  small,
  iconOnly,
  disabled,
  loading,
  full,
  accessibilityLabel,
  style,
  testID,
}: Props) {
  const router = useRouter()
  const p = palette[variant]
  const off = disabled || loading
  return (
    <Pressable
      testID={testID}
      accessibilityRole={href ? 'link' : 'button'}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!off }}
      disabled={off}
      onPress={() => (href ? router.push(href as Href) : onPress?.())}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.base,
        small && styles.small,
        iconOnly && styles.iconOnly,
        full && styles.full,
        { backgroundColor: p.bg, borderColor: p.border },
        (pressed || hovered) && !off && styles.active,
        off && styles.off,
        style,
      ]}
    >
      {icon && !loading ? <Icon name={icon} size={small ? 15 : 18} color={p.fg} /> : null}
      {iconOnly && icon ? null : (
        <Text
          style={{
            fontFamily: fonts.bodySemiBold,
            fontSize: small ? fontSize.sm : fontSize.md,
            color: p.fg,
          }}
        >
          {loading ? 'Working...' : label}
        </Text>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    minHeight: size.touch,
    paddingHorizontal: space.xl,
    borderRadius: radius.button,
    borderWidth: 1,
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  small: { paddingHorizontal: space.lg },
  iconOnly: { width: size.touch, paddingHorizontal: 0 },
  full: { alignSelf: 'stretch' },
  active: { opacity: 0.85 },
  off: { opacity: 0.45 },
})
