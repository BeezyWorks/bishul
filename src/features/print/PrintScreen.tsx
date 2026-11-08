import { useLocalSearchParams } from 'expo-router'
import React, { useMemo, useState } from 'react'
import { Platform, ScrollView, StyleSheet, View } from 'react-native'

import { Button, Checkbox, Empty, Loading, Segmented, Text } from '@/components'
import { useHosted } from '@/lib/api/hooks'
import { colors, size, space } from '@/theme/tokens'

import { buildSheet, hasRecipeNames, sheetBody, sheetCss, sheetDocument, type Paper } from './sheet'

const noPrint = { dataSet: { noprint: '1' } } as object

export function PrintScreen() {
  const { key } = useLocalSearchParams<{ key: string }>()
  const hosted = useHosted(key ?? '')
  const [foodNotes, setFoodNotes] = useState(true)
  const [recipeNames, setRecipeNames] = useState(false)
  const [paperPick, setPaperPick] = useState<Paper | null>(null)
  const [busy, setBusy] = useState(false)

  const page = hosted.data
  const paper: Paper = paperPick ?? page?.paper ?? 'letter'
  const sheet = useMemo(
    () => (page ? buildSheet(page, { foodNotes, recipeNames, paper }) : null),
    [page, foodNotes, recipeNames, paper],
  )

  if (hosted.isLoading) return <Loading />
  if (!page || !sheet) return <Empty>This menu could not be found.</Empty>

  const print = async () => {
    if (Platform.OS === 'web') {
      window.print()
      return
    }
    setBusy(true)
    try {
      const Print = await import('expo-print')
      await Print.printAsync({
        html: sheetDocument(sheet, paper),
        // Points: Letter 612 x 792, A4 595 x 842.
        width: paper === 'a4' ? 595 : 612,
        height: paper === 'a4' ? 842 : 792,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.options} {...noPrint}>
        <Text variant="h2">Print menu</Text>
        <View style={styles.check}>
          <Checkbox checked={foodNotes} onChange={setFoodNotes} label="Include food notes" />
          <Text>Include food notes</Text>
        </View>
        {hasRecipeNames(page) ? (
          <Segmented
            options={[
              { value: 'dish', label: 'Dish names' },
              { value: 'recipe', label: 'Recipe names' },
            ]}
            value={recipeNames ? 'recipe' : 'dish'}
            onChange={(v) => setRecipeNames(v === 'recipe')}
          />
        ) : null}
        <Segmented
          options={[
            { value: 'letter', label: 'Letter' },
            { value: 'a4', label: 'A4' },
          ]}
          value={paper}
          onChange={(v) => setPaperPick(v)}
        />
        <Button
          label={Platform.OS === 'web' ? 'Print' : 'Print or share'}
          onPress={print}
          loading={busy}
        />
      </View>
      {Platform.OS === 'web' ? (
        <View>
          {React.createElement('style' as never, {
            dangerouslySetInnerHTML: { __html: sheetCss(paper) },
          })}
          {React.createElement('div' as never, {
            dangerouslySetInnerHTML: { __html: sheetBody(sheet) },
          })}
        </View>
      ) : (
        <View style={styles.paper}>
          <Text variant="h1" align="center">
            {sheet.title}
          </Text>
          <Text align="center">{sheet.range}</Text>
          {sheet.days.map((d, i) => (
            <View key={i} style={styles.day}>
              {d.label ? (
                <Text variant="h2" color={colors.accent}>
                  {d.label}
                </Text>
              ) : null}
              {d.meals.map((m) => (
                <View key={m.id} style={styles.meal}>
                  <Text variant="h3">{m.name}</Text>
                  <Text variant="small">{m.detail}</Text>
                  {m.courses.map((c) => (
                    <Text key={c.label}>
                      {c.label}: {c.dishes.join(', ')}
                    </Text>
                  ))}
                  {m.note ? <Text color={colors.danger}>{m.note}</Text> : null}
                </View>
              ))}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  check: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  root: { flex: 1, backgroundColor: colors.subtle },
  content: {
    padding: space.lg,
    gap: space.lg,
    maxWidth: size.maxContent,
    alignSelf: 'center',
    width: '100%',
  },
  options: {
    gap: space.md,
    backgroundColor: colors.surface,
    padding: space.lg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'flex-start',
  },
  paper: { backgroundColor: colors.surface, padding: space.xl, gap: space.md },
  day: { gap: space.sm },
  meal: { gap: space.xs },
})
