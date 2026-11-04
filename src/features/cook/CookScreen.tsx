import { useLocalSearchParams, useRouter, type Href } from 'expo-router'
import React, { useEffect, useRef, useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native'

import { Checkbox, Segmented, Text } from '@/components'
import { useVersion } from '@/lib/api/hooks'
import { useUnits } from '@/lib/prefs'
import { formatAmount, formatClock } from '@/lib/units'
import { colors, fontSize, fonts, radius, size, space } from '@/theme/tokens'

type WakeLockSentinel = { release: () => Promise<void> }

/** Keeps the screen on while cooking (web, where the Wake Lock API exists). */
function useWakeLock() {
  const [active, setActive] = useState(false)
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const nav = (
      globalThis as {
        navigator?: { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinel> } }
      }
    ).navigator
    if (!nav?.wakeLock) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false
    const acquire = async () => {
      try {
        lock = await nav.wakeLock!.request('screen')
        if (!cancelled) setActive(true)
      } catch {
        setActive(false)
      }
    }
    void acquire()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release().catch(() => undefined)
    }
  }, [])
  return active
}

function useTimer(seconds: number | undefined, resetKey: unknown) {
  const [left, setLeft] = useState(seconds ?? 0)
  const [running, setRunning] = useState(false)
  const ref = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    setLeft(seconds ?? 0)
    setRunning(false)
  }, [resetKey, seconds])
  useEffect(() => {
    if (!running) return
    ref.current = setInterval(() => {
      setLeft((l) => {
        if (l <= 1) {
          setRunning(false)
          return 0
        }
        return l - 1
      })
    }, 1000)
    return () => {
      if (ref.current) clearInterval(ref.current)
    }
  }, [running])
  return {
    left,
    running,
    toggle: () => setRunning((r) => (left === 0 ? false : !r)),
    reset: () => {
      setRunning(false)
      setLeft(seconds ?? 0)
    },
  }
}

export function CookScreen() {
  const { versionId, scale: scaleParam } = useLocalSearchParams<{
    versionId: string
    scale?: string
  }>()
  const router = useRouter()
  const { data } = useVersion(versionId)
  const [units, setUnits] = useUnits()
  const [i, setI] = useState(0)
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const awake = useWakeLock()
  const scale = Number(scaleParam) || 1
  const step = data?.version.steps[i]
  const timer = useTimer(step?.timerSec, i)
  const total = data?.version.steps.length ?? 0

  const go = (n: number) => setI(Math.max(0, Math.min(total - 1, n)))
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setI((x) => Math.min(total - 1, x + 1))
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [total])

  if (!data || !step)
    return (
      <View style={styles.screen}>
        <Text color={colors.cookMuted} style={{ padding: space.xl }}>
          Loading...
        </Text>
      </View>
    )
  const { version, recipe } = data
  const lines = version.ingredients.filter((l) => step.ingredientIds.includes(l.id))
  const last = i === total - 1
  const exit = () => router.replace(`/recipes/${recipe.id}` as Href)

  return (
    <View style={styles.screen}>
      <View style={styles.top}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close cooking mode"
          onPress={exit}
          style={styles.close}
        >
          <Text color={colors.cookInk} style={styles.closeText}>
            Close
          </Text>
        </Pressable>
        <View style={{ flex: 1, minWidth: 120 }}>
          <Text numberOfLines={1} style={styles.title}>
            {recipe.title}
          </Text>
          <Text numberOfLines={1} style={styles.sub}>
            {version.label} {scale !== 1 ? `· ×${scale}` : ''} {awake ? '· Screen stays on' : ''}
          </Text>
        </View>
        <Segmented
          dark
          options={[
            { value: 'metric', label: 'Metric' },
            { value: 'us', label: 'Cups' },
          ]}
          value={units}
          onChange={setUnits}
        />
      </View>

      <View
        style={styles.progress}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 1, max: total, now: i + 1 }}
      >
        {version.steps.map((s, n) => (
          <View key={s.id} style={[styles.seg, n <= i && { backgroundColor: colors.cookAccent }]} />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.inner}>
          <Text style={styles.count}>
            Step {i + 1} of {total}
          </Text>
          <Text style={styles.stepText}>{step.text}</Text>

          {step.timerSec ? (
            <View style={styles.timer}>
              <Text style={styles.clock} accessibilityLiveRegion="polite">
                {formatClock(timer.left)}
              </Text>
              <View style={styles.timerBtns}>
                <Pressable
                  accessibilityRole="button"
                  onPress={timer.toggle}
                  style={[styles.tBtn, { backgroundColor: colors.cookAccent }]}
                >
                  <Text style={[styles.tBtnText, { color: colors.cookBg }]}>
                    {timer.left === 0 ? 'Time is up' : timer.running ? 'Pause' : 'Start timer'}
                  </Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={timer.reset} style={styles.tBtn}>
                  <Text style={styles.tBtnText}>Reset</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <View style={styles.ings}>
            <Text style={styles.label}>For this step</Text>
            {lines.length === 0 ? <Text style={styles.sub}>No ingredients needed.</Text> : null}
            {lines.map((l) => {
              const a = formatAmount(l, scale, units)
              return (
                <View key={l.id} style={styles.ingRow}>
                  <Checkbox
                    dark
                    label={`${l.name} ${a.text}`}
                    checked={!!checked[l.id]}
                    onChange={(v) => setChecked({ ...checked, [l.id]: v })}
                  />
                  <Text
                    style={[
                      styles.ing,
                      checked[l.id] && {
                        textDecorationLine: 'line-through',
                        color: colors.cookMuted,
                      },
                    ]}
                  >
                    <Text style={[styles.ing, { fontFamily: fonts.bodySemiBold }]}>
                      {a.approx ? '~' : ''}
                      {a.text}
                    </Text>
                    {'  '}
                    {l.name}
                    {l.prep ? `, ${l.prep}` : ''}
                  </Text>
                </View>
              )
            })}
          </View>
        </View>
      </ScrollView>

      <View style={styles.bottom}>
        <Pressable
          accessibilityRole="button"
          disabled={i === 0}
          onPress={() => go(i - 1)}
          style={[styles.nav, i === 0 && { opacity: 0.35 }]}
        >
          <Text style={styles.navText}>Back</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => (last ? exit() : go(i + 1))}
          style={[styles.nav, styles.navPrimary]}
        >
          <Text style={[styles.navText, { color: colors.cookBg }]}>{last ? 'Done' : 'Next'}</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cookBg },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    flexWrap: 'wrap',
  },
  close: {
    minHeight: size.touch,
    minWidth: size.touch,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cookLine,
  },
  closeText: { fontFamily: fonts.bodySemiBold, fontSize: fontSize.md },
  title: { fontFamily: fonts.display, fontSize: fontSize.xl, color: colors.cookInk },
  sub: { fontFamily: fonts.body, fontSize: fontSize.sm, color: colors.cookMuted },
  progress: { flexDirection: 'row', gap: 4, paddingHorizontal: space.lg },
  seg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.cookLine },
  body: { padding: space.lg, paddingBottom: space.huge },
  inner: { width: '100%', maxWidth: 820, alignSelf: 'center', gap: space.xl },
  count: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.md,
    color: colors.cookAccent,
    marginTop: space.lg,
  },
  stepText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSize.cook,
    lineHeight: 40,
    color: colors.cookInk,
  },
  timer: {
    backgroundColor: colors.cookSurface,
    borderRadius: radius.card,
    padding: space.xl,
    gap: space.lg,
    alignItems: 'center',
  },
  clock: {
    fontFamily: fonts.display,
    fontSize: fontSize.cookTimer,
    color: colors.cookInk,
    fontVariant: ['tabular-nums'],
  },
  timerBtns: { flexDirection: 'row', gap: space.md, flexWrap: 'wrap', justifyContent: 'center' },
  tBtn: {
    minHeight: 56,
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cookLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tBtnText: { fontFamily: fonts.bodySemiBold, fontSize: fontSize.lg, color: colors.cookInk },
  ings: {
    gap: space.xs,
    backgroundColor: colors.cookSurface,
    borderRadius: radius.card,
    padding: space.lg,
  },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.xs,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.cookMuted,
  },
  ingRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  ing: { fontFamily: fonts.body, fontSize: fontSize.xl, color: colors.cookInk, flex: 1 },
  bottom: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.lg,
    borderTopWidth: 1,
    borderTopColor: colors.cookLine,
  },
  nav: {
    flex: 1,
    minHeight: 64,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cookLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navPrimary: { backgroundColor: colors.cookAccent, borderColor: colors.cookAccent },
  navText: { fontFamily: fonts.bodySemiBold, fontSize: fontSize.xl, color: colors.cookInk },
})
