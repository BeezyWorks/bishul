import { useLocalSearchParams, useRouter, type Href } from 'expo-router'
import React, { useEffect, useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Deep import: the app needs only the timer maths, not the calendar engine behind the index.
import { remainingSec, timerId, timerStatus } from '@tavshil/core/src/cook'

import { Checkbox, Segmented, Text } from '@/components'
import { useVersion } from '@/lib/api/hooks'
import { useMeasure, useUnits } from '@/lib/prefs'
import { formatAmount, formatClock, portionLabel } from '@/lib/units'
import { colors, fontSize, fonts, radius, size, space } from '@/theme/tokens'

import { cookHref } from './notifications'
import { timerActions, useTray, type CookTimerEntry } from './timers'

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

export function CookScreen() {
  const insets = useSafeAreaInsets()
  const {
    versionId,
    scale: scaleParam,
    step: stepParam,
  } = useLocalSearchParams<{
    versionId: string
    scale?: string
    step?: string
  }>()
  const router = useRouter()
  const { data } = useVersion(versionId)
  const [units, setUnits] = useUnits()
  const [measure, setMeasure] = useMeasure()
  const [showAll, setShowAll] = useState(false)
  const [i, setI] = useState(() => Math.max(0, Number(stepParam) || 0))
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const awake = useWakeLock()
  const scale = Number(scaleParam) || 1
  const step = data?.version.steps[i]
  const total = data?.version.steps.length ?? 0
  const { all, tray, now } = useTray()
  // Opened from a timer (its notification or its chip): jump to that step.
  useEffect(() => {
    if (stepParam === undefined) return
    const n = Number(stepParam)
    if (Number.isFinite(n)) setI(Math.max(0, Math.min(Math.max(0, total - 1), n)))
  }, [stepParam, total])

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
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <Text color={colors.cookMuted} style={{ padding: space.xl }}>
          Loading...
        </Text>
      </View>
    )
  const { version, recipe } = data
  const lines = showAll
    ? version.ingredients
    : version.ingredients.filter((l) => step.ingredientIds.includes(l.id))
  const last = i === total - 1
  const exit = () => router.replace(`/recipes/${recipe.id}` as Href)

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
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
            { value: 'us', label: 'US' },
          ]}
          value={units}
          onChange={setUnits}
        />
        <Segmented
          dark
          options={[
            { value: 'auto', label: 'Auto' },
            { value: 'weight', label: 'Weight' },
            { value: 'volume', label: 'Volume' },
          ]}
          value={measure}
          onChange={setMeasure}
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

      {tray.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.trayScroll}
          contentContainerStyle={styles.tray}
        >
          {tray.map((t) => (
            <TimerChip
              key={t.id}
              entry={t}
              now={now}
              current={t.versionId === version.id && t.stepIndex === i}
              showRecipe={t.versionId !== version.id}
              onPress={() =>
                t.versionId === version.id
                  ? setI(t.stepIndex)
                  : router.navigate(
                      cookHref({ versionId: t.versionId, step: t.stepIndex, scale: t.scale }),
                    )
              }
            />
          ))}
        </ScrollView>
      ) : null}

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.inner}>
          <Text style={styles.count}>
            Step {i + 1} of {total}
            {step.section ? ` · ${step.section}` : ''}
          </Text>
          <Text style={styles.stepText}>{step.text}</Text>

          {step.timerSec ? (
            <StepTimer
              entry={all.find((e) => e.id === timerId(version.id, i))}
              now={now}
              plannedSec={step.timerSec}
              onStart={() =>
                timerActions.start({
                  versionId: version.id,
                  stepIndex: i,
                  label: `Step ${i + 1}`,
                  totalSec: step.timerSec!,
                  recipeTitle: recipe.title,
                  scale,
                })
              }
            />
          ) : null}

          <View style={styles.ings}>
            <View style={styles.ingHead}>
              <Text style={styles.label}>{showAll ? 'All ingredients' : 'For this step'}</Text>
              <Pressable accessibilityRole="button" onPress={() => setShowAll(!showAll)}>
                <Text style={styles.link}>{showAll ? 'This step only' : 'Show all'}</Text>
              </Pressable>
            </View>
            {lines.length === 0 ? <Text style={styles.sub}>No ingredients needed.</Text> : null}
            {lines.map((l) => {
              const portion = showAll ? undefined : step.portions?.[l.id]
              const a = formatAmount(
                portion ? { ...l, amount: l.amount * portion } : l,
                scale,
                units,
                measure,
              )
              const whole = portion ? formatAmount(l, scale, units, measure).text : ''
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
                    {portion ? (
                      <Text style={[styles.ing, { color: colors.cookMuted }]}>
                        {`  (${portionLabel(portion)} of ${whole})`}
                      </Text>
                    ) : null}
                  </Text>
                </View>
              )
            })}
          </View>
        </View>
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: space.lg + insets.bottom }]}>
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

function TimerChip({
  entry,
  now,
  current,
  showRecipe,
  onPress,
}: {
  entry: CookTimerEntry
  now: number
  current: boolean
  showRecipe: boolean
  onPress: () => void
}) {
  const status = timerStatus(entry, now)
  const done = status === 'done'
  const text = done ? colors.cookBg : colors.cookInk
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Timer for step ${entry.stepIndex + 1}, ${
        done ? 'time is up' : `${formatClock(remainingSec(entry, now))} left`
      }. Go to step.`}
      onPress={onPress}
      style={[
        styles.chip,
        current && { borderColor: colors.cookAccent },
        done && { backgroundColor: colors.cookAlert, borderColor: colors.cookAlert },
      ]}
    >
      <Text style={[styles.chipStep, { color: done ? colors.cookBg : colors.cookMuted }]}>
        {showRecipe ? `${entry.recipeTitle} · ` : ''}Step {entry.stepIndex + 1}
        {status === 'paused' ? ' · paused' : ''}
      </Text>
      <Text style={[styles.chipClock, { color: text }]}>
        {done ? 'Time is up' : formatClock(remainingSec(entry, now))}
      </Text>
    </Pressable>
  )
}

function StepTimer({
  entry,
  now,
  plannedSec,
  onStart,
}: {
  entry: CookTimerEntry | undefined
  now: number
  plannedSec: number
  onStart: () => void
}) {
  const status = entry ? timerStatus(entry, now) : 'idle'
  const left = entry ? remainingSec(entry, now) : plannedSec
  return (
    <View style={styles.timer}>
      <Text style={styles.clock} accessibilityLiveRegion="polite">
        {status === 'done' ? 'Time is up' : formatClock(left)}
      </Text>
      <View style={styles.timerBtns}>
        <Pressable
          accessibilityRole="button"
          onPress={status === 'running' ? () => timerActions.pause(entry!.id) : onStart}
          style={[styles.tBtn, { backgroundColor: colors.cookAccent }]}
        >
          <Text style={[styles.tBtnText, { color: colors.cookBg }]}>
            {status === 'running'
              ? 'Pause'
              : status === 'paused'
                ? 'Resume'
                : status === 'done'
                  ? 'Restart'
                  : 'Start timer'}
          </Text>
        </Pressable>
        {entry && status !== 'idle' ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => timerActions.addMinute(entry.id)}
            style={styles.tBtn}
          >
            <Text style={styles.tBtnText}>+1 min</Text>
          </Pressable>
        ) : null}
        {entry && status !== 'idle' ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => timerActions.reset(entry.id)}
            style={styles.tBtn}
          >
            <Text style={styles.tBtnText}>Reset</Text>
          </Pressable>
        ) : null}
      </View>
      {status === 'running' ? (
        <Text style={styles.sub}>Keeps running if you change step or leave the app.</Text>
      ) : null}
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
  trayScroll: { flexGrow: 0, marginTop: space.md },
  tray: { gap: space.sm, paddingHorizontal: space.lg },
  chip: {
    minHeight: size.touch,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cookLine,
    backgroundColor: colors.cookSurface,
    justifyContent: 'center',
  },
  chipStep: { fontFamily: fonts.bodySemiBold, fontSize: fontSize.xs },
  chipClock: { fontFamily: fonts.display, fontSize: fontSize.xl, fontVariant: ['tabular-nums'] },
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
  ingHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { fontFamily: fonts.bodySemiBold, fontSize: fontSize.sm, color: colors.cookAccent },
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
