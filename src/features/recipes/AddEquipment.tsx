import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { Button, Segmented, Text, TextField } from '@/components'
import { useSaveVersion } from '@/lib/api/hooks'
import type { Kind, RecipeVersion } from '@/lib/api/types'
import { space } from '@/theme/tokens'

type Designation = Kind | 'pesach'

/**
 * "+ Add" in the Equipment card: name the item and say what it is kept for. Saves in place (shown at once), so it
 * is kept in the version's edit history like any other edit.
 */
export function AddEquipment({ v, onClose }: { v: RecipeVersion; onClose: () => void }) {
  const save = useSaveVersion(v.recipeId)
  const [name, setName] = useState('')
  const [designation, setDesignation] = useState<Designation>(v.kind)

  const item = name.replace(/\s+/g, ' ').trim()
  const have = v.equipment.some((e) => e.name.toLowerCase() === item.toLowerCase())
  const submit = () => {
    if (!item) return
    if (!have)
      save.mutate({
        versionId: v.id,
        edit: { equipment: [...v.equipment, { name: item, designation }] },
      })
    onClose()
  }
  return (
    <View style={styles.form}>
      <TextField
        label="Equipment"
        value={name}
        onChangeText={setName}
        placeholder="e.g. 9×13 pan, stand mixer"
        autoFocus
        onSubmitEditing={submit}
      />
      <View style={styles.group}>
        <Text variant="label">Kept for</Text>
        <Segmented
          options={[
            { value: 'meat', label: 'Meat' },
            { value: 'dairy', label: 'Dairy' },
            { value: 'parve', label: 'Parve' },
            { value: 'pesach', label: 'Pesach' },
          ]}
          value={designation}
          onChange={setDesignation}
        />
      </View>
      {have ? <Text variant="small">Already listed.</Text> : null}
      <View style={styles.row}>
        <Button label="Add" small disabled={!item || have} onPress={submit} />
        <Button label="Cancel" small variant="ghost" onPress={onClose} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  form: { gap: space.md },
  group: { gap: space.xs },
  row: { flexDirection: 'row', gap: space.sm },
})
