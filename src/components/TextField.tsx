import React from 'react'
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native'

import { colors, fontSize, fonts, radius, size, space } from '@/theme/tokens'

import { Text } from './Text'

interface Props extends Omit<TextInputProps, 'style'> {
  label?: string
  hint?: string
}

export function TextField({ label, hint, accessibilityLabel, ...rest }: Props) {
  return (
    <View style={styles.wrap}>
      {label ? <Text variant="label">{label}</Text> : null}
      <TextInput
        accessibilityLabel={accessibilityLabel ?? label ?? rest.placeholder}
        placeholderTextColor={colors.muted}
        {...rest}
        style={styles.input}
      />
      {hint ? <Text variant="small">{hint}</Text> : null}
    </View>
  )
}

export function SearchField({
  value,
  onChangeText,
  placeholder = 'Search',
}: {
  value: string
  onChangeText: (t: string) => void
  placeholder?: string
}) {
  return (
    <View style={styles.search}>
      <Text color={colors.muted}>{'⌕'}</Text>
      <TextInput
        accessibilityLabel={placeholder}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        style={[styles.input, styles.searchInput]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 6, flexGrow: 1, flexShrink: 1 },
  input: {
    minHeight: size.touch,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.input,
    backgroundColor: colors.surface,
    paddingHorizontal: space.lg,
    fontFamily: fonts.body,
    fontSize: fontSize.md,
    color: colors.ink,
  },
  search: {
    minHeight: size.touch,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  searchInput: { flex: 1, borderWidth: 0, paddingHorizontal: 0, backgroundColor: 'transparent' },
})
