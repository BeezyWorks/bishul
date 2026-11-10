import type { AlarmSoundId } from '@/lib/prefs'

/**
 * The alarm sounds. `file` is the bundled name the notification plays (listed in app.json), and
 * `source` is the same file for the in-app player. Regenerate with scripts/generate-alarm-sounds.py.
 */
export const ALARM_SOUNDS: Record<AlarmSoundId, { label: string; file: string; source: number }> = {
  bell: {
    label: 'Bell',
    file: 'alarm-bell.wav',
    source: require('../../../assets/sounds/alarm-bell.wav'),
  },
  chimes: {
    label: 'Chimes',
    file: 'alarm-chimes.wav',
    source: require('../../../assets/sounds/alarm-chimes.wav'),
  },
  marimba: {
    label: 'Marimba',
    file: 'alarm-marimba.wav',
    source: require('../../../assets/sounds/alarm-marimba.wav'),
  },
  beeps: {
    label: 'Beeps',
    file: 'alarm-beeps.wav',
    source: require('../../../assets/sounds/alarm-beeps.wav'),
  },
}
