import React from 'react'
import Svg, { Path } from 'react-native-svg'

export type IconName = 'edit' | 'share' | 'link' | 'plus' | 'play'

// 24x24 stroke icons (Feather-style), drawn in the current text colour.
const paths: Record<IconName, string[]> = {
  edit: ['M12 20h9', 'M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z'],
  share: ['M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8', 'M16 6l-4-4-4 4', 'M12 2v13'],
  link: [
    'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71',
    'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  ],
  plus: ['M12 5v14', 'M5 12h14'],
  play: ['M6 4l14 8-14 8z'],
}

export function Icon({ name, size = 18, color }: { name: IconName; size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden>
      {paths[name].map((d) => (
        <Path
          key={d}
          d={d}
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill={name === 'play' ? color : 'none'}
        />
      ))}
    </Svg>
  )
}
