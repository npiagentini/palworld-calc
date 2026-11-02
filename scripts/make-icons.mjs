// Draws the app icon (a spotted egg on a dark tile) as PNGs with no image
// dependencies. Re-run after changing the design: node scripts/make-icons.mjs

import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const BG = [27, 33, 48]
const EGG = [244, 236, 214]
const SPOT = [94, 170, 140]

function crc32(buf) {
  let c = ~0
  for (const b of buf) {
    c ^= b
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function pixel(x, y) {
  // egg: ellipse, narrower towards the top
  const ry = 0.36
  const dy = (y - 0.54) / ry
  const rx = 0.27 * (dy < 0 ? 1 + 0.18 * dy : 1)
  const dx = (x - 0.5) / rx
  if (dx * dx + dy * dy > 1) return BG
  const spots = [[0.42, 0.42, 0.06], [0.58, 0.58, 0.075], [0.45, 0.7, 0.05], [0.6, 0.36, 0.04]]
  for (const [sx, sy, r] of spots) if ((x - sx) ** 2 + (y - sy) ** 2 < r * r) return SPOT
  return EGG
}

function png(size, file) {
  const rows = []
  const ss = 3 // supersampling for smooth edges
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3)
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0]
      for (let i = 0; i < ss; i++)
        for (let j = 0; j < ss; j++) {
          const c = pixel((x + (i + 0.5) / ss) / size, (y + (j + 0.5) / ss) / size)
          acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]
        }
      for (let k = 0; k < 3; k++) row[1 + x * 3 + k] = Math.round(acc[k] / (ss * ss))
    }
    rows.push(row)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // RGB
  const out = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ])
  writeFileSync(new URL(`../public/${file}`, import.meta.url), out)
}

png(192, 'icon-192.png')
png(512, 'icon-512.png')
png(180, 'apple-touch-icon.png')
console.log('icons written to public/')
