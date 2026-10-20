import test from 'node:test'
import assert from 'node:assert/strict'
import {
  makeScoreKey,
  hasOccurred,
  getHistoricalRecord,
  getScorigamiInfo,
} from './scorigami.ts'

test('makeScoreKey creates canonical hi-lo pairing', () => {
  assert.equal(makeScoreKey(98, 102), '102-98')
  assert.equal(makeScoreKey(115, 110), '115-110')
  assert.equal(makeScoreKey(124, 124), '124-124')
})

test('hasOccurred correctly detects known historic NBA finals', () => {
  assert.equal(hasOccurred(108, 102), true)
  assert.equal(hasOccurred(112, 106), true)
  assert.equal(hasOccurred(186, 184), true) // Historic 1983 triple OT
  assert.equal(hasOccurred(176, 175), true) // Historic 2023 2OT
})

test('hasOccurred returns false for novel impossible/rare scores', () => {
  assert.equal(hasOccurred(153, 129), false)
  assert.equal(hasOccurred(147, 133), false)
  assert.equal(hasOccurred(139, 119), false)
})

test('getScorigamiInfo for post-game occurred score returns historical record', () => {
  const info = getScorigamiInfo(108, 102, 0, 'post', 'MIN', 'DEN')
  assert.equal(info.isCurrentScorigami, false)
  assert.equal(info.chancePct, 0)
  assert.equal(info.currentOccurrences > 0, true)
  assert.match(info.whenScenario, /Final: Has occurred/)
})

test('getScorigamiInfo for post-game novel score announces Scorigami', () => {
  const info = getScorigamiInfo(153, 129, 0, 'post', 'BOS', 'DET')
  assert.equal(info.isCurrentScorigami, true)
  assert.equal(info.chancePct, 1)
  assert.match(info.chanceLabel, /100% — Historical NBA Scorigami!/)
})

test('getScorigamiInfo for live game provides nearest novel score target', () => {
  const info = getScorigamiInfo(96, 94, 240, 'in', 'BOS', 'DET')
  assert.ok(info.mostLikelyNovel)
  assert.ok(info.chanceLabel)
  assert.ok(info.whenScenario)
})
