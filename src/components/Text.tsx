import React from 'react'
import { Text as RNText, type TextProps, type TextStyle } from 'react-native'

import { colors, fontSize, fonts } from '@/theme/tokens'

export type TextVariant = 'display' | 'h1' | 'h2' | 'h3' | 'body' | 'bodyStrong' | 'small' | 'label'

const variants: Record<TextVariant, TextStyle> = {
  display: {
    fontFamily: fonts.display,
    fontSize: fontSize.display,
    lineHeight: 40,
    color: colors.ink,
  },
  h1: { fontFamily: fonts.display, fontSize: fontSize.h1, lineHeight: 34, color: colors.ink },
  h2: { fontFamily: fonts.display, fontSize: fontSize.xl, lineHeight: 26, color: colors.ink },
  h3: { fontFamily: fonts.bodySemiBold, fontSize: fontSize.lg, lineHeight: 22, color: colors.ink },
  body: { fontFamily: fonts.body, fontSize: fontSize.md, lineHeight: 21, color: colors.ink },
  bodyStrong: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.md,
    lineHeight: 21,
    color: colors.ink,
  },
  small: { fontFamily: fonts.body, fontSize: fontSize.sm, lineHeight: 18, color: colors.muted },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.xs,
    lineHeight: 16,
    color: colors.muted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
}

export interface Props extends TextProps {
  variant?: TextVariant
  color?: string
  align?: TextStyle['textAlign']
}

export function Text({ variant = 'body', color, align, style, ...rest }: Props) {
  return (
    <RNText
      {...rest}
      style={[
        variants[variant],
        color ? { color } : null,
        align ? { textAlign: align } : null,
        style,
      ]}
    />
  )
}
