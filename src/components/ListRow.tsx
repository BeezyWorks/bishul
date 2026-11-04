import { useRouter, type Href } from 'expo-router'
import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import { colors, size, space } from '@/theme/tokens'

import { Text } from './Text'

interface Props {
  title: string
  subtitle?: string
  /** Extra content under the title (badges, chips). */
  children?: React.ReactNode
  right?: React.ReactNode
  href?: string
  onPress?: () => void
  last?: boolean
}

/** A row inside a Card. Tappable when it has href or onPress. */
export function ListRow({ title, subtitle, children, right, href, onPress, last }: Props) {
  const router = useRouter()
  const body = (
    <>
      <View style={styles.main}>
        <Text variant="bodyStrong">{title}</Text>
        {subtitle ? <Text variant="small">{subtitle}</Text> : null}
        {children}
      </View>
      {right ?? (href || onPress ? <Text color={colors.muted}>{'›'}</Text> : null)}
    </>
  )
  const style = [styles.row, !last && styles.divider]
  if (href || onPress)
    return (
      <Pressable
        accessibilityRole={href ? 'link' : 'button'}
        onPress={() => (href ? router.push(href as Href) : onPress?.())}
        style={style}
      >
        {body}
      </Pressable>
    )
  return <View style={style}>{body}</View>
}

const styles = StyleSheet.create({
  row: {
    minHeight: size.touch,
    paddingVertical: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.line },
  main: { flex: 1, gap: 4 },
})
