import React from 'react'
import { Platform } from 'react-native'
import Svg, { Path } from 'react-native-svg'

export type IconName =
  | 'edit'
  | 'share'
  | 'link'
  | 'plus'
  | 'play'
  | 'trash'
  | 'pause'
  | 'reset'
  | 'bellOff'
  | 'close'
  | 'minus'
  | 'more'
  | 'print'
  | 'cart'
  | 'calendar'

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
  pause: ['M7 4h3v16H7z', 'M14 4h3v16h-3z'],
  reset: ['M1 4v6h6', 'M3.51 15a9 9 0 1 0 2.13-9.36L1 10'],
  bellOff: [
    'M13.73 21a2 2 0 0 1-3.46 0',
    'M18.63 13A17.89 17.89 0 0 1 18 8',
    'M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14',
    'M18 8a6 6 0 0 0-9.33-5',
    'M1 1l22 22',
  ],
  print: [
    'M6 9V2h12v7',
    'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2',
    'M6 14h12v8H6z',
  ],
  cart: [
    'M9 22a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
    'M20 22a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
    'M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6',
  ],
  calendar: [
    'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
    'M16 2v4',
    'M8 2v4',
    'M3 10h18',
  ],
  minus: ['M5 12h14'],
  more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  trash: [
    'M3 6h18',
    'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
    'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6',
    'M10 11v6',
    'M14 11v6',
  ],
}

// Decorative: hidden from screen readers. The iOS prop is not a DOM attribute, so the web uses aria.
const hidden =
  Platform.OS === 'web'
    ? ({ 'aria-hidden': true } as const)
    : ({ accessibilityElementsHidden: true } as const)

export function Icon({ name, size = 18, color }: { name: IconName; size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...hidden}>
      {paths[name].map((d) => (
        <Path
          key={d}
          d={d}
          stroke={color}
          strokeWidth={name === 'more' ? 4 : 2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill={name === 'play' || name === 'pause' ? color : 'none'}
        />
      ))}
    </Svg>
  )
}
