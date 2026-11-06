import React from 'react'

import { colors, space } from '@/theme/tokens'

import { Text } from './Text'

/** The name of a part of the recipe ("Cake"), one size smaller for a part inside a part. */
export function PartHeading({ heading }: { heading: { depth: number; title: string } | null }) {
  if (!heading) return null
  return (
    <Text
      variant={heading.depth === 0 ? 'label' : 'bodyStrong'}
      color={heading.depth === 0 ? colors.accent : colors.ink}
      accessibilityRole="header"
      style={{ marginTop: space.md, marginBottom: space.xs, paddingLeft: heading.depth * space.md }}
    >
      {heading.title}
    </Text>
  )
}
