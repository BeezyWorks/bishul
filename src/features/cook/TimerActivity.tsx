import { HStack, Image, Text, VStack } from '@expo/ui/swift-ui'
import { font, foregroundStyle, monospacedDigit, padding } from '@expo/ui/swift-ui/modifiers'
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets'

/** What the lock screen and Dynamic Island show. Times are epoch ms so the system counts down itself. */
export interface TimerActivityProps {
  label: string
  recipeTitle: string
  /** Epoch ms when it rings; null while paused. */
  endsAtMs: number | null
  /** Seconds left while paused. */
  leftSec: number
}

/**
 * Runs in the widget runtime: no hooks, and nothing from module scope. Everything it needs is
 * declared inside the function or arrives in props.
 */
const TimerActivity = (props: TimerActivityProps, environment: LiveActivityEnvironment) => {
  'widget'
  const accent = environment.isLuminanceReduced ? '#FFFFFF' : '#2E6A4E'
  const clock = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = String(sec % 60).padStart(2, '0')
    return `${m}:${s}`
  }
  const running = props.endsAtMs !== null
  const countdown = (size: number) =>
    running ? (
      <Text
        timerInterval={{ lower: new Date(), upper: new Date(props.endsAtMs as number) }}
        countsDown
        modifiers={[font({ weight: 'bold', size }), monospacedDigit(), foregroundStyle(accent)]}
      />
    ) : (
      <Text modifiers={[font({ weight: 'bold', size }), monospacedDigit()]}>
        {clock(props.leftSec)} paused
      </Text>
    )

  return {
    banner: (
      <HStack modifiers={[padding({ all: 14 })]}>
        <VStack alignment="leading">
          <Text modifiers={[font({ weight: 'semibold', size: 15 })]}>{props.label}</Text>
          <Text modifiers={[font({ size: 13 })]}>{props.recipeTitle}</Text>
        </VStack>
        {countdown(28)}
      </HStack>
    ),
    compactLeading: <Image systemName="timer" color={accent} />,
    compactTrailing: countdown(14),
    minimal: <Image systemName="timer" color={accent} />,
    expandedLeading: (
      <VStack modifiers={[padding({ all: 12 })]}>
        <Image systemName="timer" color={accent} />
      </VStack>
    ),
    expandedCenter: (
      <VStack modifiers={[padding({ all: 12 })]}>
        <Text modifiers={[font({ weight: 'semibold', size: 15 })]}>{props.label}</Text>
      </VStack>
    ),
    expandedTrailing: <VStack modifiers={[padding({ all: 12 })]}>{countdown(22)}</VStack>,
    expandedBottom: (
      <VStack modifiers={[padding({ all: 12 })]}>
        <Text modifiers={[font({ size: 13 })]}>{props.recipeTitle}</Text>
      </VStack>
    ),
  }
}

export default createLiveActivity<TimerActivityProps>('TimerActivity', TimerActivity)
