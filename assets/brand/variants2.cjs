const sharp = require(process.argv[2])
const fs = require('fs')
const G = '#2E6A4E', GOLD = '#DDBE68', RED = '#C23B2E', RED_D = '#9E2C24', RED_L = '#D9564A'
const wrap = (inner, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><defs>${defs}</defs><rect width="1024" height="1024" fill="${G}"/>${inner}</svg>`
// enamelled loop handle: a rounded tab with a hole, tucked behind the body
const handle = (x, y, dir) => {
  const ox = dir < 0 ? x - 78 : x - 12
  return `<path fill-rule="evenodd" fill="${RED_D}" d="M${ox + 28} ${y}h34a28 28 0 0 1 28 28v0a28 28 0 0 1-28 28h-34a28 28 0 0 1-28-28v0a28 28 0 0 1 28-28z
   M${dir < 0 ? ox + 22 : ox + 46} ${y + 17}h22a11 11 0 0 1 0 22h-22a11 11 0 0 1 0-22z"/>`
}

// ---- lidded pot (refined) ----
const lidded = (cx, cy, s) => `<g transform="translate(${cx} ${cy}) scale(${s}) translate(-512 -600)">
  ${handle(250, 636, -1)}${handle(774, 636, 1)}
  <path d="M250 612h524v70c0 118-80 190-262 190S250 800 250 682z" fill="${RED}"/>
  <path d="M292 690c0 70 40 120 108 144-80-30-108-90-108-144z" fill="${RED_L}"/>
  <path d="M236 612c0-120 120-210 276-210s276 90 276 210z" fill="#D04436"/>
  <path d="M290 590c10-70 80-128 170-146-70 30-120 80-130 146z" fill="#E36A5C"/>
  <rect x="226" y="592" width="572" height="40" rx="20" fill="${RED_D}"/>
  <path d="M488 404c0-14 10-22 24-22s24 8 24 22z" fill="#B48D3E"/>
  <rect x="500" y="380" width="24" height="16" fill="#C9A24E"/>
  <ellipse cx="512" cy="364" rx="44" ry="26" fill="${GOLD}"/>
  <ellipse cx="498" cy="356" rx="14" ry="7" fill="#F3E3A8"/>
</g>`

// ---- open pot of cholent ----
const cholent = (ry) => {
  const cx = 512, cy = 470, rx = 300
  const iry = ry - 16, sy = cy + ry * 0.28, sry = iry - 10
  const beans = []
  const pal = ['#5A2E18', '#9C5A33', '#E6D3AA', '#5A2E18', '#B5733F']
  let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280
  for (let i = 0; i < 46; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd())
    const x = cx + Math.cos(a) * r * 240, y = sy + Math.sin(a) * r * sry * 0.92
    beans.push(`<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="15" ry="${(10 * ry / 80).toFixed(1)}" transform="rotate(${(rnd() * 50 - 25).toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)})" fill="${pal[i % pal.length]}"/>`)
  }
  const k = ry / 80 // squash factor for things lying in the stew
  const potato = (x, y, w) => `<ellipse cx="${x}" cy="${y}" rx="${w}" ry="${w * 0.75 * k}" fill="#D6A85E"/><ellipse cx="${x - w * 0.25}" cy="${y - w * 0.2 * k}" rx="${w * 0.45}" ry="${w * 0.28 * k}" fill="#E7C27F"/>`
  const egg = (x, y) => `<ellipse cx="${x}" cy="${y}" rx="44" ry="${32 * k}" fill="#7E4A27"/><ellipse cx="${x - 12}" cy="${y - 9 * k}" rx="18" ry="${9 * k}" fill="#A8703F"/>`
  const half = (x, y) => `<ellipse cx="${x}" cy="${y}" rx="44" ry="${32 * k}" fill="#EFE3C8" stroke="#8E5A33" stroke-width="7"/><ellipse cx="${x}" cy="${y + 2}" rx="18" ry="${16 * k}" fill="#E8B63C"/>`
  const meat = (x, y) => `<rect x="${x - 46}" y="${y - 26 * k}" width="92" height="${52 * k}" rx="${20 * k}" fill="#6A301C"/><path d="M${x - 34} ${y - 4 * k}h68" stroke="#C78B6A" stroke-width="${6 * k + 2}" stroke-linecap="round"/>`
  return {
    defs: `<clipPath id="mouth"><ellipse cx="${cx}" cy="${cy + 4}" rx="${rx - 30}" ry="${iry}"/></clipPath>`,
    svg: `
  ${handle(214, cy + 40, -1)}${handle(810, cy + 40, 1)}
  <path d="M212 ${cy}L224 680C236 800 354 862 512 862S788 800 800 680L812 ${cy}z" fill="${RED}"/>
  <path d="M262 ${cy + 70}c-4 120 30 220 130 268-110-34-150-140-130-268z" fill="${RED_L}"/>
  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${RED_D}"/>
  <ellipse cx="${cx}" cy="${cy + 4}" rx="${rx - 30}" ry="${iry}" fill="#4A1612"/>
  <g clip-path="url(#mouth)">
    <ellipse cx="${cx}" cy="${sy}" rx="270" ry="${sry}" fill="#6E3B1F"/>
    <ellipse cx="${cx - 60}" cy="${sy - 6}" rx="150" ry="${sry * 0.45}" fill="#7E4626"/>
    ${beans.join('')}
    ${potato(350, sy - 6 * k, 46)}${potato(684, sy + 2 * k, 40)}${potato(560, sy + 30 * k, 34)}
    ${meat(560, sy - 18 * k)}
    ${egg(430, sy + 14 * k)}${half(654, sy - 24 * k)}
  </g>`,
  }
}
const steam = (y) => [[420, 0], [512, -30], [604, 0]].map(([x, d]) =>
  `<path d="M${x} ${y + d}c-28-30 28-52 0-86s28-52 0-86" fill="none" stroke="#F5EEDC" stroke-width="20" stroke-linecap="round" opacity=".8"/>`).join('')

const c80 = cholent(80), c120 = cholent(120)
const v = {
  'e-lidded': wrap(lidded(512, 620, 1)),
  'f-cholent': wrap(`<g transform="translate(512 512) scale(1.08) translate(-512 -630)">${c80.svg}</g>`, c80.defs),
  'g-cholent-steam': wrap(`<g transform="translate(0 70)">${steam(330)}${c80.svg}</g>`, c80.defs),
  'h-cholent-top': wrap(`<g transform="translate(512 512) scale(1.08) translate(-512 -600)">${c120.svg}</g>`, c120.defs),
}
;(async () => {
  const tiles = []
  for (const [k, svg] of Object.entries(v)) {
    fs.writeFileSync(`drafts/${k}.svg`, svg)
    const buf = await sharp(Buffer.from(svg), { density: 200 }).resize(1024, 1024).png().toBuffer()
    await sharp(buf).toFile(`drafts/${k}.png`)
    const mask = Buffer.from('<svg width="440" height="440"><rect width="440" height="440" rx="98" fill="#fff"/></svg>')
    tiles.push(await sharp(buf).resize(440, 440).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer())
  }
  const W = 40 + tiles.length * 480
  await sharp({ create: { width: W, height: 680, channels: 4, background: '#ECE9E1' } })
    .composite([
      ...tiles.map((t, i) => ({ input: t, left: 40 + i * 480, top: 40 })),
      ...await Promise.all(tiles.map(async (t, i) => ({ input: await sharp(t).resize(120, 120).png().toBuffer(), left: 40 + i * 480 + 160, top: 510 }))),
      { input: Buffer.from(`<svg width="${W}" height="680">${Object.keys(v).map((k, i) => `<text x="${40 + i * 480 + 220}" y="660" text-anchor="middle" font-family="Helvetica" font-size="26" fill="#333">${k[0].toUpperCase()}</text>`).join('')}</svg>`), left: 0, top: 0 },
    ]).png().toFile('drafts/sheet2.png')
  console.log('ok')
})()
