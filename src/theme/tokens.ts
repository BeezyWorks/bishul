export const colors = {
  ground: '#FBFAF7',
  surface: '#FFFFFF',
  subtle: '#F4F3EE',
  ink: '#1D201C',
  muted: '#5C625A',
  line: '#E4E2DA',
  accent: '#2E6A4E',
  accentSoft: '#E7F0EA',
  onAccent: '#FFFFFF',
  danger: '#A3261B',
  dangerSoft: '#FBEAE7',
  warn: '#7A4E00',
  warnSoft: '#FBF1DC',
  info: '#1F4F86',
  infoSoft: '#E6EEF8',
  // Cooking mode (dark)
  cookBg: '#151816',
  cookSurface: '#212622',
  cookLine: '#363C37',
  cookInk: '#F4F2EA',
  cookMuted: '#A9AFA5',
  cookAccent: '#7FC8A0',
} as const

export const fonts = {
  display: 'BricolageGrotesque_700Bold',
  body: 'InstrumentSans_400Regular',
  bodyMedium: 'InstrumentSans_500Medium',
  bodySemiBold: 'InstrumentSans_600SemiBold',
} as const

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, huge: 48 } as const

export const radius = { card: 14, input: 12, pill: 999, tile: 12 } as const

export const size = {
  touch: 44,
  maxContent: 1120,
  wideBreakpoint: 900,
  navHeight: 64,
  tabBarHeight: 64,
  gutterPhone: 16,
  gutterWide: 32,
} as const

export const fontSize = {
  xs: 12,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  h1: 28,
  display: 34,
  cook: 30,
  cookTimer: 64,
} as const

export type Tone = 'neutral' | 'danger' | 'warn' | 'info' | 'accent' | 'muted'

/** Foreground / background pair for each tone. */
export const tones: Record<Tone, { fg: string; bg: string }> = {
  neutral: { fg: colors.ink, bg: colors.subtle },
  muted: { fg: colors.muted, bg: colors.subtle },
  danger: { fg: colors.danger, bg: colors.dangerSoft },
  warn: { fg: colors.warn, bg: colors.warnSoft },
  info: { fg: colors.info, bg: colors.infoSoft },
  accent: { fg: colors.accent, bg: colors.accentSoft },
}
