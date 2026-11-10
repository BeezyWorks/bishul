const sharp = require(process.argv[2])
const fs = require('fs')
const G = '#2E6A4E',
  GOLD = '#DDBE68',
  CREAM = '#F5EEDC'
const flame = (x, y, s = 1) =>
  `<path transform="translate(${x} ${y}) scale(${s})" d="M0 0c-34-26-40-72-8-122 4 30 16 44 28 56 22 22 18 50-20 66z" fill="${GOLD}"/>`
const pot = (
  cx,
  cy,
  s,
  body = '',
) => `<g transform="translate(${cx} ${cy}) scale(${s}) translate(-512 -600)">
  <g fill="none" stroke="#8E2A22" stroke-width="30" stroke-linecap="round">
    <path d="M262 640h-56c-30 0-30 54 0 54h66"/><path d="M762 640h56c30 0 30 54 0 54h-66"/></g>
  <path d="M250 612h524v70c0 118-80 190-262 190S250 800 250 682z" fill="#C23B2E"/>
  <path d="M292 690c0 70 40 120 108 144-80-30-108-90-108-144z" fill="#D9564A"/>
  ${body}
  <path d="M236 612c0-120 120-210 276-210s276 90 276 210z" fill="#D04436"/>
  <path d="M290 590c10-70 80-128 170-146-70 30-120 80-130 146z" fill="#E36A5C"/>
  <rect x="226" y="592" width="572" height="40" rx="20" fill="#8E2A22"/>
  <rect x="496" y="376" width="32" height="40" fill="#C9A24E"/>
  <circle cx="512" cy="360" r="38" fill="${GOLD}"/><circle cx="500" cy="348" r="11" fill="#F3E3A8"/>
</g>`
const candle = (x, top) => `<g>
  <rect x="${x - 20}" y="${top}" width="40" height="${700 - top}" rx="6" fill="${CREAM}"/>
  ${flame(x, top - 14, 0.75)}
  <path d="M${x - 46} 700h92l-18 22h-56z" fill="${GOLD}"/>
  <rect x="${x - 10}" y="722" width="20" height="90" fill="${GOLD}"/>
  <path d="M${x - 56} 840c0-22 24-34 56-34s56 12 56 34z" fill="${GOLD}"/></g>`
const lines = (y) =>
  [0, 1, 2]
    .map((i) => `<rect x="300" y="${y + i * 46}" width="424" height="22" rx="11" fill="${CREAM}"/>`)
    .join('')
const wrap = (inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="${G}"/>${inner}</svg>`

const v = {
  // A: flames rise from the lid like steam
  'a-steam-flames': wrap(
    `${flame(392, 330)}<g transform="translate(1024 0) scale(-1 1)">${flame(392, 330)}</g>${pot(512, 640, 1)}`,
  ),
  // B: pot flanked by two Shabbat candlesticks
  'b-candlesticks': wrap(`${candle(178, 330)}${candle(846, 330)}${pot(512, 640, 0.92)}`),
  // C: gold bet on the pot, like the family's letter marks
  'c-bet': wrap(
    `${pot(512, 560, 1.05, `<text x="512" y="820" text-anchor="middle" font-family="Times New Roman, serif" font-weight="700" font-size="190" fill="${GOLD}">ב</text>`)}`,
  ),
  // D: steam-flames + the Halacha cream lines under the pot (a set table)
  'd-lines': wrap(
    `<g transform="translate(0 -60)">${flame(410, 300, 0.85)}<g transform="translate(1024 0) scale(-1 1)">${flame(410, 300, 0.85)}</g>${pot(512, 560, 0.85)}</g>${lines(760)}`,
  ),
}
;(async () => {
  const tiles = []
  for (const [k, svg] of Object.entries(v)) {
    fs.writeFileSync(`drafts/${k}.svg`, svg)
    const buf = await sharp(Buffer.from(svg), { density: 200 }).resize(1024, 1024).png().toBuffer()
    await sharp(buf).toFile(`drafts/${k}.png`)
    // rounded preview like the home screen
    const mask = Buffer.from(
      '<svg width="440" height="440"><rect width="440" height="440" rx="98" fill="#fff"/></svg>',
    )
    tiles.push(
      await sharp(buf)
        .resize(440, 440)
        .composite([{ input: mask, blend: 'dest-in' }])
        .png()
        .toBuffer(),
    )
  }
  const W = 40 + tiles.length * 480
  await sharp({ create: { width: W, height: 680, channels: 4, background: '#ECE9E1' } })
    .composite([
      ...tiles.map((t, i) => ({ input: t, left: 40 + i * 480, top: 40 })),
      ...tiles
        .map((t, i) => ({
          input: Buffer.from(`<svg width="120" height="120">${''}</svg>`),
          left: 0,
          top: 0,
        }))
        .slice(0, 0),
      ...(await Promise.all(
        tiles.map(async (t, i) => ({
          input: await sharp(t).resize(120, 120).png().toBuffer(),
          left: 40 + i * 480 + 160,
          top: 510,
        })),
      )),
      {
        input: Buffer.from(
          `<svg width="${W}" height="680">${Object.keys(v)
            .map(
              (k, i) =>
                `<text x="${40 + i * 480 + 220}" y="660" text-anchor="middle" font-family="Helvetica" font-size="26" fill="#333">${k[0].toUpperCase()}</text>`,
            )
            .join('')}</svg>`,
        ),
        left: 0,
        top: 0,
      },
    ])
    .png()
    .toFile('drafts/sheet.png')
  console.log('ok')
})()
