import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { getScorigamiInfo, makeScoreKey, hasOccurred } from './scorigami.ts'
import { formatCrewShortLabel } from './announcers.ts'
import { fetchNBAScoreboard, clearScoreboardCache } from '../services/espnApi.ts'

test('Mechanical Performance: Scorigami matrix lookup and candidate search operates in sub-millisecond speeds', () => {
  const start = performance.now()
  const iterations = 500

  for (let i = 0; i < iterations; i++) {
    const home = 90 + (i % 40)
    const away = 85 + (i % 40)
    const sec = 120 + (i % 600)
    const info = getScorigamiInfo(home, away, sec, 'in', 'BOS', 'DET')
    assert.ok(info.chanceLabel)
  }

  const durationMs = performance.now() - start
  const avgUs = (durationMs / iterations) * 1000

  // 500 calculations should complete well within sub-millisecond per-call bounds (< 300ms total under CI virtualization)
  assert.ok(
    durationMs < 300,
    `Expected 500 scorigami evaluations in < 300ms, took ${durationMs.toFixed(2)}ms (${avgUs.toFixed(2)}µs/call)`
  )
})

test('Mechanical Performance: makeScoreKey and hasOccurred execute efficiently on thousands of scores', () => {
  const start = performance.now()
  for (let h = 80; h <= 140; h++) {
    for (let a = 80; a <= 140; a++) {
      const key = makeScoreKey(h, a)
      const occurred = hasOccurred(h, a)
      assert.ok(typeof key === 'string')
      assert.ok(typeof occurred === 'boolean')
    }
  }
  const durationMs = performance.now() - start
  // 3,721 pairs evaluated in < 150ms
  assert.ok(durationMs < 150, `Evaluated 3,721 score keys in ${durationMs.toFixed(2)}ms`)
})

test('Mechanical Performance: formatCrewShortLabel caches results to avoid repeated string splits', () => {
  const pbp = 'Mike Breen'
  const color = 'Richard Jefferson & Tim Legler'

  const first = formatCrewShortLabel(pbp, color)
  assert.equal(first, 'Breen & Jefferson')

  const start = performance.now()
  for (let i = 0; i < 2000; i++) {
    const cached = formatCrewShortLabel(pbp, color)
    assert.equal(cached, 'Breen & Jefferson')
  }
  const durationMs = performance.now() - start
  assert.ok(durationMs < 150, `2000 cached crew label calls took ${durationMs.toFixed(2)}ms`)
})

test('Mechanical Performance: fetchNBAScoreboard deduplicates concurrent in-flight fetches', async () => {
  clearScoreboardCache()

  // Fire two concurrent calls simultaneously without AbortSignal
  const promiseA = fetchNBAScoreboard('2026-03-29')
  const promiseB = fetchNBAScoreboard('2026-03-29')

  // Both should reference the exact same in-flight Promise
  assert.equal(promiseA, promiseB, 'Concurrent calls for the same date must share the identical in-flight promise')

  const [resA, resB] = await Promise.all([promiseA, promiseB])
  assert.ok(Array.isArray(resA.data.events))
  assert.equal(resA.data, resB.data, 'Both deduplicated results must share the exact data reference')
  clearScoreboardCache()
})

test('Mechanical Performance: index.html implements resource hints and non-blocking font stylesheets', () => {
  const htmlPath = path.resolve(process.cwd(), 'index.html')
  const html = fs.readFileSync(htmlPath, 'utf8')

  assert.ok(html.includes('rel="dns-prefetch" href="https://site.api.espn.com"'), 'Must have dns-prefetch for ESPN')
  assert.ok(html.includes('rel="preconnect" href="https://site.api.espn.com"'), 'Must have preconnect for ESPN')
  assert.ok(html.includes('rel="dns-prefetch" href="https://a.espncdn.com"'), 'Must have dns-prefetch for ESPN CDN logos')
  assert.ok(html.includes('media="print" onload="this.media=\'all\'"'), 'Google Fonts must load asynchronously')
  assert.ok(html.includes('<noscript>'), 'Must provide fallback <noscript> for fonts')
})

test('Mechanical Performance: vite.config.ts configures vendor and data chunk splitting', () => {
  const viteConfigPath = path.resolve(process.cwd(), 'vite.config.ts')
  const config = fs.readFileSync(viteConfigPath, 'utf8')

  assert.ok(config.includes('vendor-react'), 'Must split React vendor chunk')
  assert.ok(config.includes('scorigami-data'), 'Must split static scorigami dataset')
  assert.ok(config.includes('target: \'es2022\''), 'Must target modern es2022 output')
})
