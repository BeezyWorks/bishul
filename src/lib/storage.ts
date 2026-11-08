import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

/**
 * Small key-value storage that never throws. localStorage on the web; the iOS keychain on a
 * device, where localStorage does not exist and the sign-in token must survive a relaunch.
 */
export const storage = {
  get(key: string): string | null {
    try {
      if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) ?? null
      return SecureStore.getItem(key)
    } catch {
      return null
    }
  },
  set(key: string, value: string | null) {
    try {
      if (Platform.OS === 'web') {
        if (value === null) globalThis.localStorage?.removeItem(key)
        else globalThis.localStorage?.setItem(key, value)
      } else if (value === null) void SecureStore.deleteItemAsync(key)
      else SecureStore.setItem(key, value)
    } catch {
      // Storage unavailable: nothing persists, which is fine.
    }
  },
}
