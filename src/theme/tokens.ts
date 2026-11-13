import { Platform } from 'react-native'

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
  scrim: 'rgba(29, 32, 28, 0.5)',
  // Cooking mode (dark)
  cookBg: '#151816',
  cookSurface: '#212622',
  cookLine: '#363C37',
  cookInk: '#F4F2EA',
  cookMuted: '#A9AFA5',
  cookAccent: '#7FC8A0',
  cookAlert: '#F2B84B',
  cookDanger: '#F27B6E',
  cookAlertSoft: '#8A6A2A',
} as const

/** The app-icon pot, drawn in code for the loader. Illustration colours, not UI colours. */
export const pot = {
  body: '#C23B2E',
  sheen: '#D9564A',
  rim: '#9E2C24',
  mouth: '#4A1612',
  stew: '#6E3B1F',
  stewShine: '#7E4626',
  bubble: '#8A5530',
  bubbleRing: '#E6D3AA',
  chunk: '#D6A85E',
  chunkShine: '#E7C27F',
} as const

/** Third-party sign-in branding; fixed by Apple's and Google's guidelines, not themeable. */
export const brand = {
  appleBg: '#000000',
  appleFg: '#FFFFFF',
  googleBg: '#FFFFFF',
  googleFg: '#1F1F1F',
  googleBorder: '#747775',
} as const

/**
 * On the web a family that has not loaded (or never does) must fall back to a sans, not the browser's
 * default serif, so each face carries a fallback stack there. Native needs the bare family name.
 */
const SANS =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
const face = (name: string) => (Platform.OS === 'web' ? `${name}, ${SANS}` : name)

export const fonts = {
  display: face('BricolageGrotesque_700Bold'),
  body: face('InstrumentSans_400Regular'),
  bodyMedium: face('InstrumentSans_500Medium'),
  bodySemiBold: face('InstrumentSans_600SemiBold'),
} as const

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, huge: 48 } as const

export const radius = { card: 14, input: 12, pill: 999, tile: 12, button: 6 } as const

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
