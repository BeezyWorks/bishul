// Tiny ULID generator (no dependency). 26 chars of Crockford base32: 48-bit ms timestamp + 80 random bits, so ids
// sort by creation time and can be generated on the client for offline sync. Not monotonic within the same ms.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export function ulid(now: number = Date.now()): string {
  let time = ''
  let t = now
  for (let i = 0; i < 10; i++) {
    time = ALPHABET[t % 32] + time
    t = Math.floor(t / 32)
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  let rand = ''
  for (let i = 0; i < 16; i++) rand += ALPHABET[bytes[i] % 32]
  return time + rand
}
