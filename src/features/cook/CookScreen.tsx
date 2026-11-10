import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake'
import { useLocalSearchParams, useRouter, type Href } from 'expo-router'
import React, { useEffect, useRef, useState } from 'react'
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Deep import: the app needs only the timer maths, not the calendar engine behind the index.
import { remainingSec, timerId, timerStatus } from '@tavshil/core/src/cook'

import { Checkbox, Segmented, Text, useLayout } from '@/components'
import { Icon } from '@/components/Icon'
import { useSaveVersion, useVersion } from '@/lib/api/hooks'
import { useKeepAwakePref, useMeasure, useUnits } from '@/lib/prefs'
import { formatAmount, formatClock, portionLabel } from '@/lib/units'
import { colors, fontSize, fonts, radius, size, space } from '@/theme/tokens'

import { cookHref } from './notifications'
import { timerActions, useTray, type CookTimerEntry } from './timers'

const WAKE_TAG = 'cook-mode'

type WakeLockSentinel = { release: () => Promise<void> }

/**
 * Keeps the screen on while cooking, if the setting allows (it does by default). The Wake Lock API
 * on the web, expo-keep-awake on a device. Returns whether it is holding the screen on.
 */
function useWakeLock() {
  const [enabled] = useKeepAwakePref()
  const [active, setActive] = useState(false)
  useEffect(() => {
    if (!enabled) return
    if (Platform.OS !== 'web') {
      void activateKeepAwakeAsync(WAKE_TAG)
        .then(() => setActive(true))
        .catch(() => setActive(false))
      return () => {
        setActive(false)
        void deactivateKeepAwake(WAKE_TAG)
      }
    }
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
      setActive(false)
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release().catch(() => undefined)
    }
  }, [enabled])
  return enabled && active
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
  const { all, tray, now, ringingIds } = useTray()
  const { phone } = useLayout()
  const saveVersion = useSaveVersion(data?.recipe.id ?? '')
  // Labels edited here, shown at once while the saved recipe catches up.
  const [labels, setLabels] = useState<Record<string, string>>({})
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
  /** Name the timer now, and keep the name on the step so the next cook starts with it. */
  const saveLabel = (stepId: string, stepIndex: number, label: string) => {
    setLabels((cur) => ({ ...cur, [stepId]: label }))
    timerActions.setLabel(timerId(version.id, stepIndex), label || `Step ${stepIndex + 1}`)
    const lineOf = new Map(version.ingredients.map((l, n) => [l.id, n]))
    saveVersion.mutate({
      versionId: version.id,
      edit: {
        steps: version.steps.map((s) => {
          const name = s.id === stepId ? label : s.timerLabel
          return {
            text: s.text,
            section: s.section,
            ...(s.timerSec && {
              timerMin: s.timerSec / 60,
              ...(name?.trim() && { timerLabel: name.trim() }),
            }),
            // Send the links back as they are, or editing a label would drop them.
            uses: s.ingredientIds
              .filter((id) => lineOf.has(id))
              .map((id) => ({
                line: lineOf.get(id)!,
                ...((s.portions?.[id] ?? 1) < 1 && { portion: s.portions![id] }),
              }))
              .sort((a, b) => a.line - b.line),
          }
        }),
      },
    })
  }
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

      <View style={[styles.main, phone && { flexDirection: 'column' }]}>
        {tray.length > 0 ? (
          <ScrollView
            horizontal={phone}
            style={phone ? styles.sideStrip : styles.side}
            contentContainerStyle={phone ? styles.sideStripContent : styles.sideContent}
          >
            {tray.map((t) => (
              <TimerCard
                key={t.id}
                entry={t}
                now={now}
                ringing={ringingIds.has(t.id)}
                current={t.versionId === version.id && t.stepIndex === i}
                showRecipe={t.versionId !== version.id}
                onGo={() =>
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
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body}>
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
                label={labels[step.id] ?? step.timerLabel ?? ''}
                onLabel={(label) => saveLabel(step.id, i, label)}
                onStart={() =>
                  timerActions.start({
                    versionId: version.id,
                    stepIndex: i,
                    label: (labels[step.id] ?? step.timerLabel) || `Step ${i + 1}`,
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
      </View>

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

/**
 * The buttons for a timer, edge to edge with no gaps: start / pause, minus and plus, reset.
 * Plus and minus open 1 / 5 / 10 and keep them open a few seconds after the last tap, so tapping
 * +1 three times adds three minutes. `compact` shows icons only (the side column); the side card
 * also passes `onDismiss`, which for a timer still going has to be held.
 */
function TimerControls({
  entry,
  status,
  primaryLabel,
  onStart,
  compact,
  onDismiss,
  onActivity,
  stacked,
}: {
  entry: CookTimerEntry | undefined
  status: ReturnType<typeof timerStatus>
  primaryLabel: string
  onStart: () => void
  compact?: boolean
  onDismiss?: () => void
  /** Called on every press, so a card can keep its controls open while they are in use. */
  onActivity?: () => void
  /** Full width under the clock rather than a column beside it. */
  stacked?: boolean
}) {
  const [mode, setMode] = useState<'add' | 'sub' | null>(null)
  const [hint, setHint] = useState(false)
  const timeouts = useRef<{
    mode?: ReturnType<typeof setTimeout>
    hint?: ReturnType<typeof setTimeout>
  }>({})
  useEffect(
    () => () => {
      clearTimeout(timeouts.current.mode)
      clearTimeout(timeouts.current.hint)
    },
    [],
  )
  const open = (m: 'add' | 'sub') => {
    onActivity?.()
    setMode(m)
    clearTimeout(timeouts.current.mode)
    timeouts.current.mode = setTimeout(() => setMode(null), 3500)
  }
  const active = !!entry && status !== 'idle'
  const running = status === 'running'
  const done = status === 'done'
  const iconSize = compact ? 22 : 22
  const label = (text: string, color: string) =>
    compact ? null : <Text style={[styles.tBtnText, { color }]}>{text}</Text>

  return (
    <View style={compact ? styles.ctlCompact : stacked ? styles.ctlStacked : styles.ctl}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={primaryLabel}
        onPress={() => {
          onActivity?.()
          if (running) timerActions.pause(entry!.id)
          else onStart()
        }}
        style={[styles.ctlBtn, running ? styles.ctlPause : styles.ctlGo]}
      >
        <Icon
          name={running ? 'pause' : 'play'}
          size={iconSize}
          color={running ? colors.cookInk : colors.cookBg}
        />
        {label(primaryLabel, running ? colors.cookInk : colors.cookBg)}
      </Pressable>

      {active ? (
        <View style={styles.ctlRow}>
          {mode ? (
            [1, 5, 10].map((min) => (
              <Pressable
                key={min}
                accessibilityRole="button"
                accessibilityLabel={`${mode === 'add' ? 'Add' : 'Take off'} ${min} ${
                  min === 1 ? 'minute' : 'minutes'
                }`}
                onPress={() => {
                  timerActions.addSeconds(entry!.id, (mode === 'add' ? 1 : -1) * min * 60)
                  open(mode)
                }}
                style={[styles.ctlBtn, styles.ctlCell]}
              >
                <Text
                  style={[
                    styles.cardAmount,
                    { color: mode === 'add' ? colors.cookAccent : colors.cookInk },
                  ]}
                >
                  {mode === 'add' ? '+' : '−'}
                  {min}
                </Text>
              </Pressable>
            ))
          ) : (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Take off time"
                disabled={done}
                onPress={() => open('sub')}
                style={[styles.ctlBtn, styles.ctlCell]}
              >
                <Icon
                  name="minus"
                  size={iconSize}
                  color={done ? colors.cookLine : colors.cookInk}
                />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add time"
                onPress={() => open('add')}
                style={[styles.ctlBtn, styles.ctlCell]}
              >
                <Icon name="plus" size={iconSize} color={colors.cookAccent} />
              </Pressable>
            </>
          )}
        </View>
      ) : null}

      {active ? (
        <View style={styles.ctlRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reset timer"
            onPress={() => {
              onActivity?.()
              timerActions.reset(entry!.id)
            }}
            style={[styles.ctlBtn, styles.ctlCell]}
          >
            <Icon name="reset" size={iconSize} color={colors.cookAlert} />
            {label('Reset', colors.cookAlert)}
          </Pressable>
          {onDismiss ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss timer"
              accessibilityHint={done ? undefined : 'Hold to dismiss a timer that is still going'}
              // Up: one tap. Still going: hold, so it can't be dismissed by accident.
              onPress={
                done
                  ? onDismiss
                  : () => {
                      setHint(true)
                      clearTimeout(timeouts.current.hint)
                      timeouts.current.hint = setTimeout(() => setHint(false), 1800)
                    }
              }
              onLongPress={done ? undefined : onDismiss}
              delayLongPress={700}
              style={[styles.ctlBtn, styles.ctlCell]}
            >
              <Icon name="close" size={iconSize} color={colors.cookDanger} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {hint ? <Text style={styles.holdHint}>Hold to dismiss</Text> : null}
    </View>
  )
}

/**
 * Opens and closes its content with a slide and a fade. The content is measured once, so the
 * height can animate; while closed it is hidden from touch and screen readers.
 */
function Collapse({ open, children }: { open: boolean; children: React.ReactNode }) {
  const [height, setHeight] = useState(0)
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current
  useEffect(() => {
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: open ? 260 : 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start()
  }, [open, progress])
  return (
    <Animated.View
      pointerEvents={open ? 'auto' : 'none'}
      {...(Platform.OS === 'web'
        ? { 'aria-hidden': !open }
        : {
            accessibilityElementsHidden: !open,
            importantForAccessibility: open ? ('auto' as const) : ('no-hide-descendants' as const),
          })}
      style={{
        overflow: 'hidden',
        opacity: progress,
        height: progress.interpolate({ inputRange: [0, 1], outputRange: [0, height] }),
      }}
    >
      <View
        style={{ position: 'absolute', top: 0, left: 0, right: 0 }}
        onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
      >
        {children}
      </View>
    </Animated.View>
  )
}

/**
 * A small timer in the side column: the time and its name, and a three-dots button that opens the
 * full controls. They fold away again after a few seconds untouched. While the alarm is going the
 * card pulses (tap it to shut it up), and a timer that is up keeps its controls open.
 */
function TimerCard({
  entry,
  now,
  ringing,
  current,
  showRecipe,
  onGo,
}: {
  entry: CookTimerEntry
  now: number
  ringing: boolean
  current: boolean
  showRecipe: boolean
  onGo: () => void
}) {
  const { phone } = useLayout()
  const status = timerStatus(entry, now)
  const done = status === 'done'
  const [expanded, setExpanded] = useState(false)
  const fold = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  /** Open, and (re)start the countdown to folding away again. */
  const poke = () => {
    setExpanded(true)
    clearTimeout(fold.current)
    fold.current = setTimeout(() => setExpanded(false), 6000)
  }
  useEffect(() => () => clearTimeout(fold.current), [])
  const showControls = expanded || done

  const flash = useRef(new Animated.Value(0)).current
  // A slow, eased pulse rather than a hard flash. With Reduce Motion on, it holds still.
  const [reduceMotion, setReduceMotion] = useState(false)
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion)
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion)
    return () => sub.remove()
  }, [])
  useEffect(() => {
    if (!ringing || reduceMotion) {
      flash.setValue(0)
      return
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(flash, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
        Animated.timing(flash, {
          toValue: 0,
          duration: 800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: false,
        }),
      ]),
    )
    pulse.start()
    return () => pulse.stop()
  }, [ringing, reduceMotion, flash])
  // The pulse is a layer behind the content, so only the card's colour moves, not its buttons.
  const pulse = flash.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.cookAlert, colors.cookAlertSoft],
  })
  // A label that names the step already says which; only an unnamed timer needs it spelled out.
  const sub = [showRecipe ? entry.recipeTitle : '', status === 'paused' ? 'paused' : '']
    .filter(Boolean)
    .join(' · ')
  const text = done ? colors.cookBg : colors.cookInk
  const muted = done ? colors.cookBg : colors.cookMuted
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: done ? colors.cookAlert : colors.cookSurface },
        current && !done && { borderColor: colors.cookAccent },
        phone && { width: 156 },
      ]}
    >
      {done && ringing ? (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: pulse }]}
        />
      ) : null}
      <View style={styles.cardHead}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${entry.label}, ${
            done ? 'time is up' : `${formatClock(remainingSec(entry, now))} left`
          }. ${ringing ? 'Tap to silence.' : 'Go to step.'}`}
          onPress={ringing ? () => timerActions.silence() : onGo}
          style={styles.cardTap}
        >
          <Text style={[styles.cardClock, { color: text }]} numberOfLines={1} adjustsFontSizeToFit>
            {done ? '0:00' : formatClock(remainingSec(entry, now))}
          </Text>
          <Text style={[styles.cardLabel, { color: text }]} numberOfLines={2}>
            {entry.label}
          </Text>
          {sub ? (
            <Text style={[styles.cardSub, { color: muted }]} numberOfLines={1}>
              {sub}
            </Text>
          ) : null}
        </Pressable>
        {done ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={expanded ? 'Hide timer controls' : 'Show timer controls'}
            accessibilityState={{ expanded }}
            onPress={() => {
              if (expanded) {
                clearTimeout(fold.current)
                setExpanded(false)
              } else poke()
            }}
            style={styles.cardDots}
          >
            <Icon name="more" size={20} color={colors.cookMuted} />
          </Pressable>
        )}
      </View>
      <Collapse open={showControls}>
        <TimerControls
          compact
          entry={entry}
          status={status}
          primaryLabel={
            status === 'running'
              ? 'Pause'
              : status === 'paused'
                ? 'Resume'
                : done
                  ? 'Restart'
                  : 'Start'
          }
          onStart={() =>
            timerActions.start({
              versionId: entry.versionId,
              stepIndex: entry.stepIndex,
              label: entry.label,
              totalSec: entry.totalSec,
              recipeTitle: entry.recipeTitle,
              scale: entry.scale,
            })
          }
          onDismiss={() => timerActions.clear(entry.id)}
          onActivity={poke}
        />
      </Collapse>
    </View>
  )
}

function StepTimer({
  entry,
  now,
  plannedSec,
  label,
  onLabel,
  onStart,
}: {
  entry: CookTimerEntry | undefined
  now: number
  plannedSec: number
  /** The timer's saved name; empty when it has none. */
  label: string
  /** Rename it, saving the name on the step for next time. */
  onLabel: (label: string) => void
  onStart: () => void
}) {
  const status = entry ? timerStatus(entry, now) : 'idle'
  const left = entry ? remainingSec(entry, now) : plannedSec
  const text = status === 'done' ? 'Time is up' : formatClock(left)
  // The clock gets whatever width the buttons leave, and the type size follows it, so the minutes
  // are never clipped, whatever the device or orientation. Tabular digits are about 0.6em wide.
  const [clockWidth, setClockWidth] = useState(0)
  const clockSize = clockWidth
    ? Math.max(28, Math.min(fontSize.cookTimer, Math.floor(clockWidth / (text.length * 0.62))))
    : fontSize.cookTimer
  // Under about 460 wide there is no room beside the clock: the buttons go underneath.
  const [cardWidth, setCardWidth] = useState(1000)
  const stacked = cardWidth < 460
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(label)
  const commit = () => {
    setEditing(false)
    const next = draft.trim()
    if (next !== label.trim()) onLabel(next)
  }
  return (
    <View style={styles.timer} onLayout={(e) => setCardWidth(e.nativeEvent.layout.width)}>
      <View style={[styles.timerRow, stacked && { flexDirection: 'column' }]}>
        <View style={styles.clockBox} onLayout={(e) => setClockWidth(e.nativeEvent.layout.width)}>
          {editing ? (
            <TextInput
              autoFocus
              accessibilityLabel="Timer label"
              value={draft}
              onChangeText={setDraft}
              onBlur={commit}
              onSubmitEditing={commit}
              returnKeyType="done"
              maxLength={60}
              placeholder="Name this timer"
              placeholderTextColor={colors.cookMuted}
              style={styles.labelInput}
            />
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={label ? `Timer label: ${label}. Edit.` : 'Name this timer'}
              onPress={() => {
                setDraft(label)
                setEditing(true)
              }}
              style={styles.labelRow}
            >
              <Text style={styles.labelText} numberOfLines={1}>
                {label || 'Name this timer'}
              </Text>
              <Icon name="edit" size={16} color={colors.cookMuted} />
            </Pressable>
          )}
          <Text
            style={[styles.clock, { fontSize: clockSize, lineHeight: clockSize * 1.1 }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            accessibilityLiveRegion="polite"
          >
            {text}
          </Text>
        </View>
        <TimerControls
          entry={entry}
          status={status}
          primaryLabel={
            status === 'running'
              ? 'Pause'
              : status === 'paused'
                ? 'Resume'
                : status === 'done'
                  ? 'Restart'
                  : 'Start'
          }
          onStart={onStart}
          stacked={stacked}
        />
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
  main: { flex: 1, flexDirection: 'row' },
  side: { width: 156, flexGrow: 0, borderRightWidth: 1, borderRightColor: colors.cookLine },
  // On a phone the timers run along the top instead, so the step text keeps its width.
  sideStrip: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: colors.cookLine },
  sideStripContent: { gap: space.sm, padding: space.sm, alignItems: 'flex-start' },
  sideContent: { gap: space.sm, padding: space.sm },
  card: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.cookLine,
    overflow: 'hidden',
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start' },
  cardTap: { flex: 1, padding: space.md, gap: 2 },
  cardDots: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  cardClock: { fontFamily: fonts.display, fontSize: fontSize.xl, fontVariant: ['tabular-nums'] },
  cardLabel: { fontFamily: fonts.bodySemiBold, fontSize: fontSize.sm },
  cardSub: { fontFamily: fonts.body, fontSize: fontSize.xs },
  cardAmount: { fontFamily: fonts.bodySemiBold, fontSize: fontSize.lg, color: colors.cookAccent },
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
    overflow: 'hidden',
  },
  timerRow: { flexDirection: 'row', alignItems: 'stretch' },
  clockBox: { flex: 1, minWidth: 0, justifyContent: 'center', padding: space.xl, gap: space.xs },
  clock: {
    fontFamily: fonts.display,
    color: colors.cookInk,
    fontVariant: ['tabular-nums'],
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 32 },
  labelText: { fontFamily: fonts.bodySemiBold, fontSize: fontSize.md, color: colors.cookMuted },
  labelInput: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.md,
    color: colors.cookInk,
    minHeight: 32,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.cookAccent,
  },
  // The buttons run edge to edge, no gaps, divided by hairlines.
  ctl: { width: 168, borderLeftWidth: 1, borderLeftColor: colors.cookLine },
  ctlStacked: { borderTopWidth: 1, borderTopColor: colors.cookLine },
  ctlCompact: { borderTopWidth: 1, borderTopColor: colors.cookLine },
  ctlBtn: {
    flex: 1,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    backgroundColor: colors.cookBg,
  },
  ctlGo: { backgroundColor: colors.cookAccent },
  ctlPause: { backgroundColor: colors.cookLine },
  ctlRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.cookLine },
  ctlCell: { borderLeftWidth: 1, borderLeftColor: colors.cookLine },
  holdHint: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSize.xs,
    color: colors.cookBg,
    textAlign: 'center',
    paddingVertical: space.xs,
    backgroundColor: colors.cookAlert,
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
