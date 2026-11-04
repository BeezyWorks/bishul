import { describe, expect, it } from 'vitest'

import { api, nextFriday, rpc, sign, tool } from './helpers'

const EXPECTED = [
  'get_household', 'get_calendar', 'get_meal', 'get_dining_brief', 'plan_meal', 'update_meal', 'delete_meal',
  'get_suggestions', 'suggest_menu', 'accept_meals', 'get_menu', 'get_prep_schedule', 'search_recipes', 'get_recipe',
  'import_recipe', 'save_recipe', 'save_variation', 'scale_recipe', 'get_people', 'save_person', 'set_constraints',
  'get_pantry', 'update_pantry', 'get_shopping_list', 'update_shopping_list', 'update_ingredient', 'manage_dimensions',
  'share_recipe', 'share_profile', 'save_shared_recipe', 'revoke_link',
]

describe('MCP', () => {
  it('initializes with instructions and lists tools with schemas and descriptions', async () => {
    const token = await sign('mcp-a')
    const init = await rpc(token, 'initialize', { protocolVersion: '2025-06-18' })
    expect(init.data.result.capabilities).toMatchObject({ tools: {}, prompts: {} })
    expect(init.data.result.instructions).toMatch(/dining brief|brief/i)
    const { tools } = (await rpc(token, 'tools/list')).data.result
    const names = tools.map((t: any) => t.name)
    for (const n of EXPECTED) expect(names, n).toContain(n)
    for (const t of tools) {
      expect(t.description.length, t.name).toBeGreaterThan(20)
      expect(t.inputSchema.type, t.name).toBe('object')
    }
    const prompts = (await rpc(token, 'prompts/list')).data.result.prompts
    expect(prompts.map((p: any) => p.name)).toContain('meal_planning')
    const got = (await rpc(token, 'prompts/get', { name: 'meal_planning' })).data.result
    expect(got.messages[0].content.text.length).toBeGreaterThan(50)
  })

  it('plans a meal and returns its dining brief for a guest with a strict allergy', async () => {
    const who = 'mcp-b'
    const token = await sign(who)
    const salad = await tool(token, 'import_recipe', {
      title: 'Tahini salad', course: 'salad', category: 'parve', servings: 4,
      ingredients: ['3 tbsp tahini', '2 tomatoes'], steps: ['Mix'],
      ingredientData: { tahini: { category: 'parve', allergens: ['sesame'] } },
    })
    expect(salad.isError).toBe(false)
    const versionId = salad.data.version.id
    const noa = await tool(token, 'save_person', { name: 'Noa', newContactHousehold: 'Levi family' })
    const noaId = noa.data.id ?? noa.data.person?.id
    await tool(token, 'set_constraints', { personId: noaId, add: [{ tagType: 'allergen', tag: 'sesame', severity: 'strict' }] })
    const date = await nextFriday(who)
    const meal = await tool(token, 'plan_meal', { date, name: 'Shabbat lunch', personIds: [noaId], items: [{ versionId }] })
    expect(meal.isError).toBe(false)
    const mealId = meal.data.meal.id
    const brief = await tool(token, 'get_dining_brief', { mealId })
    expect(brief.isError).toBe(false)
    expect(JSON.stringify(brief.data)).toMatch(/sesame/i)
    // The web app sees the same meal (one service layer).
    expect((await api(who, 'GET', `/meals/${mealId}`)).meal.id).toBe(mealId)
    // MCP-entered ingredient data is AI-filled.
    const rec = await api(who, 'GET', `/versions/${versionId}`)
    expect(rec.version.ingredients.find((i: any) => /tahini/i.test(i.name)).ingredient.allergens[0].source).toBe('ai')
  })

  it('reports bad arguments and unknown tools without crashing', async () => {
    const token = await sign('mcp-c')
    const bad = await tool(token, 'plan_meal', { date: 'tomorrow' })
    expect(bad.isError).toBe(true)
    const { data } = await rpc(token, 'tools/call', { name: 'no_such_tool', arguments: {} })
    expect(data.error ?? data.result.isError).toBeTruthy()
  })
})
