/**
 * The fridge sheet as data and as HTML. The same HTML is shown on the web (inside the page, with a print
 * stylesheet) and handed to expo-print on native. It carries no personal information: only dish titles,
 * course labels, meal names, times, a headcount number and the server's food notes.
 */
import type { HostedMeal, HostedPage } from '@/lib/api/types'
import { addDays, dayNum, longDate, monthName, weekdayName } from '@/lib/dates'
import { timeLabel } from '@/lib/plan'
import { colors } from '@/theme/tokens'

export type Paper = 'letter' | 'a4'

export interface SheetOptions {
  foodNotes: boolean
  /** Recipe names (the saved recipe's title) instead of the dish names on the menu. */
  recipeNames: boolean
  paper: Paper
}

export interface SheetCourse {
  label: string
  dishes: string[]
}
export interface SheetMeal {
  id: string
  name: string
  /** "Wednesday night · 8:15 pm · 11 people" */
  detail: string
  courses: SheetCourse[]
  note: string
}
export interface SheetDay {
  label: string
  meals: SheetMeal[]
}
export interface Sheet {
  title: string
  range: string
  days: SheetDay[]
  printed: string
}

const sentence = (s: string) => {
  const t = s.trim()
  if (!t) return ''
  const c = t.charAt(0).toUpperCase() + t.slice(1)
  return /[.!?]$/.test(c) ? c : `${c}.`
}

/** "Wednesday 21 – Shabbat 24 April 2027" */
export function rangeText(from: string, to: string): string {
  if (from === to) return `${longDate(from)} ${from.slice(0, 4)}`
  const sameMonth = from.slice(0, 7) === to.slice(0, 7)
  if (sameMonth) {
    return `${weekdayName(from)} ${dayNum(from)} – ${weekdayName(to)} ${dayNum(to)} ${monthName(+to.slice(5, 7) - 1)} ${to.slice(0, 4)}`
  }
  const sameYear = from.slice(0, 4) === to.slice(0, 4)
  return `${longDate(from)}${sameYear ? '' : ` ${from.slice(0, 4)}`} – ${longDate(to)} ${to.slice(0, 4)}`
}

/** Whether the data can tell recipe names from dish names (otherwise the option is hidden). */
export function hasRecipeNames(page: HostedPage): boolean {
  return page.days.some((d) =>
    d.meals.some((m) =>
      m.menu.some((c) =>
        c.items.some((i) => !!i.versionTitle && i.versionTitle.trim() !== i.title.trim()),
      ),
    ),
  )
}

function mealDetail(m: HostedMeal): string {
  const parts: string[] = []
  const when = `${weekdayName(m.date)}${m.part === 'night' ? ' night' : ''}`
  parts.push(when)
  if (m.timeText) parts.push(timeLabel(m.timeText))
  const n = m.headcount.total
  if (n > 0) parts.push(`${n} ${n === 1 ? 'person' : 'people'}`)
  return parts.join(' · ')
}

export function buildSheet(page: HostedPage, opts: SheetOptions): Sheet {
  const days: SheetDay[] = []
  for (const d of page.days) {
    const meals: SheetMeal[] = []
    for (const m of d.meals) {
      const courses = m.menu
        .map((c) => ({
          label: c.label,
          dishes: c.items
            .map((i) => (opts.recipeNames && i.versionTitle ? i.versionTitle : i.title).trim())
            .filter(Boolean),
        }))
        .filter((c) => c.dishes.length > 0)
      if (courses.length === 0) continue
      meals.push({
        id: m.id ?? `${m.date}-${m.slot}`,
        name: m.name,
        detail: mealDetail(m),
        courses,
        note: opts.foodNotes ? (m.foodNotes ?? []).map(sentence).filter(Boolean).join(' ') : '',
      })
    }
    if (meals.length) days.push({ label: d.label, meals })
  }
  return {
    title: page.title,
    range: rangeText(page.from, page.to || addDays(page.from, 0)),
    days,
    printed: `Bishul · printed ${longDate(page.today)}`,
  }
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const DISPLAY =
  "'BricolageGrotesque_700Bold', 'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif"
const BODY = "'InstrumentSans_400Regular', 'Instrument Sans', ui-sans-serif, system-ui, sans-serif"

export function sheetCss(paper: Paper): string {
  return `
.fridge-sheet{box-sizing:border-box;background:${colors.surface};color:#000;font-family:${BODY};font-size:13px;line-height:1.35;padding:36px 40px;max-width:760px;margin:0 auto;text-align:left}
.fridge-sheet *{box-sizing:border-box}
.fridge-sheet h1{font-family:${DISPLAY};font-weight:700;font-size:32px;text-align:center;margin:0;color:#000}
.fridge-sheet .fs-sub{text-align:center;font-size:13px;color:#000;margin:4px 0 18px}
.fridge-sheet .fs-day{margin-top:18px}
.fridge-sheet .fs-day>h2{font-family:${DISPLAY};font-weight:700;font-size:19px;margin:0 0 6px;color:${colors.accent};border-bottom:2px solid ${colors.accent};padding-bottom:3px}
.fridge-sheet .fs-meal{margin-top:12px;break-inside:avoid;page-break-inside:avoid}
.fridge-sheet .fs-mh{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;margin-bottom:5px}
.fridge-sheet .fs-mh b{font-family:${DISPLAY};font-weight:700;font-size:15px}
.fridge-sheet .fs-mh span{font-size:12px}
.fridge-sheet .fs-cols{display:flex;flex-wrap:wrap;gap:6px 22px;align-items:flex-start}
.fridge-sheet .fs-col{flex:1 1 150px;min-width:140px}
.fridge-sheet .fs-cn{font-size:10px;letter-spacing:.08em;text-transform:uppercase;border-bottom:1px solid #000;padding-bottom:2px;margin-bottom:3px}
.fridge-sheet .fs-d{display:flex;align-items:flex-start;gap:8px;padding:2px 0}
.fridge-sheet .fs-box{flex:none;width:12px;height:12px;border:1.5px solid #000;border-radius:2px;margin-top:2px}
.fridge-sheet .fs-note{margin-top:5px;color:${colors.danger};font-weight:600;font-size:12px}
.fridge-sheet .fs-foot{margin-top:22px;text-align:center;font-size:11px}
.fridge-sheet .fs-empty{text-align:center;margin-top:24px}
@page{size:${paper === 'a4' ? 'A4' : 'letter'};margin:14mm}
@media print{
  html,body,#root,body *:has([data-printroot]){height:auto!important;min-height:0!important;overflow:visible!important;position:static!important;display:block!important;background:#fff!important}
  [data-noprint]{display:none!important}
  .fridge-sheet{max-width:none;padding:0;margin:0;box-shadow:none}
}
`
}

export function sheetBody(sheet: Sheet): string {
  const days = sheet.days
    .map((d) => {
      const meals = d.meals
        .map((m) => {
          const cols = m.courses
            .map(
              (c) =>
                `<div class="fs-col"><div class="fs-cn">${esc(c.label)}</div>${c.dishes
                  .map(
                    (x) =>
                      `<div class="fs-d"><span class="fs-box"></span><span>${esc(x)}</span></div>`,
                  )
                  .join('')}</div>`,
            )
            .join('')
          return `<div class="fs-meal"><div class="fs-mh"><b>${esc(m.name)}</b><span>${esc(m.detail)}</span></div><div class="fs-cols">${cols}</div>${
            m.note ? `<div class="fs-note">${esc(m.note)}</div>` : ''
          }</div>`
        })
        .join('')
      return `<div class="fs-day">${d.label ? `<h2>${esc(d.label)}</h2>` : ''}${meals}</div>`
    })
    .join('')
  return `<div class="fridge-sheet" data-printroot="1"><h1>${esc(sheet.title)}</h1><div class="fs-sub">${esc(
    sheet.range,
  )}</div>${days || '<div class="fs-empty">Nothing is planned yet.</div>'}<div class="fs-foot">${esc(sheet.printed)}</div></div>`
}

/** A full HTML document for expo-print. */
export function sheetDocument(sheet: Sheet, paper: Paper): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0}${sheetCss(paper)}</style></head><body>${sheetBody(sheet)}</body></html>`
}
