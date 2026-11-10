import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio'

import { getAlarmSound, type AlarmSoundId } from '@/lib/prefs'

import { ALARM_SOUNDS } from './sounds'

let player: AudioPlayer | null = null
let playing: AlarmSoundId | null = null
let modeSet = false

function load(id: AlarmSoundId, loop: boolean) {
  if (!modeSet) {
    modeSet = true
    void setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers' })
  }
  if (!player) player = createAudioPlayer(ALARM_SOUNDS[id].source)
  else if (playing !== id) player.replace(ALARM_SOUNDS[id].source)
  playing = id
  player.loop = loop
  void player.seekTo(0)
  player.play()
}

/**
 * Rings until `stopAlarm`, looping: a timer is something you must not miss. Plays through the
 * silent switch.
 */
export function startAlarm() {
  try {
    load(getAlarmSound(), true)
  } catch (e) {
    // A sound that will not play must never break the on-screen timer.
    console.warn('Alarm sound failed', e)
  }
}

/** One play of a sound, for trying it out in settings. */
export function previewAlarm(id: AlarmSoundId) {
  try {
    load(id, false)
  } catch {
    // Nothing to do.
  }
}

export function stopAlarm() {
  try {
    player?.pause()
  } catch {
    // Already stopped.
  }
}
