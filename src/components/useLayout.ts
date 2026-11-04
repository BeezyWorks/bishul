import { useWindowDimensions } from 'react-native'

import { size } from '@/theme/tokens'

export function useLayout() {
  const { width } = useWindowDimensions()
  return { width, wide: width >= size.wideBreakpoint, phone: width < 600 }
}
