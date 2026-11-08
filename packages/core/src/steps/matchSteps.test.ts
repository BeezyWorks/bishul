import { describe, expect, it } from 'vitest'

import { matchStepsToIngredients } from './matchSteps'

describe('matchStepsToIngredients', () => {
  it('links each step to the ingredients it names, in any singular or plural form', () => {
    const uses = matchStepsToIngredients(
      [{ name: 'egg' }, { name: 'all-purpose flour' }, { name: 'tomatoes' }],
      [{ text: 'Beat the eggs.' }, { text: 'Fold in the flour and the chopped tomato.' }],
    )
    expect(uses).toEqual([[{ ingredient: 0 }], [{ ingredient: 1 }, { ingredient: 2 }]])
  })

  it('prefers the longer name, so "brown sugar" does not also match "sugar"', () => {
    const uses = matchStepsToIngredients(
      [{ name: 'sugar' }, { name: 'brown sugar' }],
      [{ text: 'Cream the butter with the brown sugar.' }, { text: 'Sprinkle with sugar.' }],
    )
    expect(uses).toEqual([[{ ingredient: 1 }], [{ ingredient: 0 }]])
  })

  it('does not guess a shared last word', () => {
    const uses = matchStepsToIngredients(
      [{ name: 'brown sugar' }, { name: 'white sugar' }],
      [{ text: 'Add the sugar.' }],
    )
    expect(uses).toEqual([[]])
  })

  it('keeps each part to its own ingredients', () => {
    const uses = matchStepsToIngredients(
      [
        { name: 'butter', section: 'Base' },
        { name: 'flour', section: 'Base' },
        { name: 'butter', section: 'Frosting' },
        { name: 'icing sugar', section: 'Frosting' },
      ],
      [
        { text: 'Rub the butter into the flour.', section: 'Base' },
        { text: 'Beat the butter and icing sugar until pale.', section: 'Frosting' },
      ],
    )
    expect(uses).toEqual([
      [{ ingredient: 0 }, { ingredient: 1 }],
      [{ ingredient: 2 }, { ingredient: 3 }],
    ])
  })

  it('hands lines with the same name to the steps in turn when the steps are not in parts', () => {
    const uses = matchStepsToIngredients(
      [
        { name: 'sugar', section: 'Base' },
        { name: 'sugar', section: 'Filling' },
      ],
      [{ text: 'Mix the base sugar in.' }, { text: 'Stir sugar into the filling.' }],
    )
    expect(uses).toEqual([[{ ingredient: 0 }], [{ ingredient: 1 }]])
  })

  it('splits a divided ingredient between the steps that use it', () => {
    const uses = matchStepsToIngredients(
      [{ name: 'butter', original: '4 tbsp butter, divided' }, { name: 'onion' }],
      [
        { text: 'Melt half the butter and fry the onion.' },
        { text: 'Finish with the rest of the butter.' },
      ],
    )
    expect(uses).toEqual([
      [{ ingredient: 0, portion: 0.5 }, { ingredient: 1 }],
      [{ ingredient: 0, portion: 0.5 }],
    ])
  })

  it('gives an undivided ingredient to the first step that names it', () => {
    const uses = matchStepsToIngredients(
      [{ name: 'salt' }],
      [{ text: 'Salt the water.' }, { text: 'Taste and add salt.' }],
    )
    expect(uses).toEqual([[{ ingredient: 0 }], []])
  })
})
