import { describe, expect, it } from 'vitest'

import {
  addTime,
  newTimer,
  pauseTimer,
  remainingSec,
  resetTimer,
  startTimer,
  timerStatus,
  trayTimers,
} from './timers'

const make = (stepIndex = 0, totalSec = 600) =>
  newTimer({ versionId: 'v1', stepIndex, label: 'Simmer', totalSec })

describe('cook timers', () => {
  it('counts down from a timestamp, so backgrounding cannot drift it', () => {
    const t = startTimer(make(), 1_000)
    expect(timerStatus(t, 1_000)).toBe('running')
    expect(remainingSec(t, 1_000 + 250_000)).toBe(350)
    expect(remainingSec(t, 1_000 + 599_100)).toBe(1)
    expect(timerStatus(t, 1_000 + 600_000)).toBe('done')
  })

  it('pauses and resumes with the time left', () => {
    const paused = pauseTimer(startTimer(make(), 0), 120_000)
    expect(timerStatus(paused, 999_999)).toBe('paused')
    expect(remainingSec(paused, 999_999)).toBe(480)
    const resumed = startTimer(paused, 1_000_000)
    expect(remainingSec(resumed, 1_060_000)).toBe(420)
  })

  it('restarts from the full time once it has rung, and resets', () => {
    const rung = startTimer(make(0, 60), 0)
    expect(timerStatus(rung, 61_000)).toBe('done')
    const again = startTimer(rung, 61_000)
    expect(remainingSec(again, 61_000)).toBe(60)
    expect(timerStatus(resetTimer(again), 70_000)).toBe('idle')
  })

  it('adds time to a running, paused or finished timer', () => {
    expect(remainingSec(addTime(startTimer(make(), 0), 100_000, 60), 100_000)).toBe(560)
    const done = startTimer(make(0, 60), 0)
    expect(remainingSec(addTime(done, 90_000, 60), 90_000)).toBe(60)
    expect(timerStatus(addTime(done, 90_000, 60), 90_000)).toBe('running')
    expect(remainingSec(addTime(make(), 0, -9999), 0)).toBe(1)
  })

  it('orders the tray: rung first, then soonest, then paused; idle is hidden', () => {
    const now = 100_000
    const running = startTimer(make(1, 300), now)
    const sooner = startTimer(make(2, 60), now)
    const rung = startTimer(make(3, 30), 0)
    const paused = pauseTimer(startTimer(make(4, 500), 0), 10_000)
    const idle = make(5)
    expect(trayTimers([idle, paused, running, sooner, rung], now).map((t) => t.stepIndex)).toEqual([
      3, 2, 1, 4,
    ])
  })
})
