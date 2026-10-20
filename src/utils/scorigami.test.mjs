import test from 'node:test'
import assert from 'node:assert/strict'
import {
  makeScoreKey,
  hasOccurred,
  getHistoricalRecord,
  formatHistoricalDate,
  getScorigamiInfo,
} from './scorigami.ts'

test('makeScoreKey creates canonical hi-lo pairing with strict number sanitization', () => {
  assert.equal(makeScoreKey(98, 102), '102-98')
  assert.equal(makeScoreKey(102, 98), '102-98')
  assert.equal(makeScoreKey(115, 110), '115-110')
  assert.equal(makeScoreKey(124, 124), '124-124')

  // Boundary conditions & invalid types
  assert.equal(makeScoreKey('98', '102'), '102-98')
  assert.equal(makeScoreKey(NaN, 100), '100-0')
  assert.equal(makeScoreKey(-10, -50), '0-0')
  assert.equal(makeScoreKey(null, undefined), '0-0')
  assert.equal(makeScoreKey(105.7, 99.2), '105-99')
})

test('hasOccurred correctly detects known historic NBA scores and is prototype-safe', () => {
  assert.equal(hasOccurred(108, 102), true)
  assert.equal(hasOccurred(112, 106), true)
  assert.equal(hasOccurred(186, 184), true) // Historic 1983 triple OT
  assert.equal(hasOccurred(176, 175), true) // Historic 2023 2OT

  // Novel scores
  assert.equal(hasOccurred(153, 129), false)
  assert.equal(hasOccurred(147, 133), false)
  assert.equal(hasOccurred(167, 151), false)
  assert.equal(hasOccurred(195, 180), false)
  assert.equal(hasOccurred(121, 113), true)

  // Prototype key collision safety
  assert.equal(hasOccurred('toString', 'valueOf'), false)
  assert.equal(hasOccurred('constructor', '__proto__'), false)
})

test('getHistoricalRecord retrieves record tuples or null with prototype safety', () => {
  const record108_102 = getHistoricalRecord(108, 102)
  assert.ok(record108_102)
  assert.equal(Array.isArray(record108_102), true)
  assert.equal(typeof record108_102[0], 'number') // Occurrences count

  // Unknown score
  assert.equal(getHistoricalRecord(153, 129), null)

  // Prototype property lookup safety
  assert.equal(getHistoricalRecord('constructor', 0), null)
  assert.equal(getHistoricalRecord('toString', 0), null)
})

test('formatHistoricalDate safely formats dates and handles malformed strings', () => {
  assert.match(formatHistoricalDate('1983-12-13'), /Dec 13, 1983/)
  assert.match(formatHistoricalDate('2024-04-14'), /Apr 14, 2024/)

  // Edge cases and invalid data types
  assert.equal(formatHistoricalDate(''), '')
  assert.equal(formatHistoricalDate(null), '')
  assert.equal(formatHistoricalDate(undefined), '')
  assert.equal(formatHistoricalDate(12345), '')
  assert.equal(formatHistoricalDate('invalid-date'), 'invalid-date')
})

test('getScorigamiInfo accurately handles Pistons 121 - 113 Celtics as 68x prior non-Scorigami', () => {
  const info = getScorigamiInfo(121, 113, 0, 'post', 'DET', 'BOS')
  assert.equal(info.isCurrentScorigami, false)
  assert.equal(info.chancePct, 0)
  assert.equal(info.currentOccurrences, 69)
  assert.equal(info.chanceLabel, 'No Scorigami (Happened 68x before)')
  assert.match(info.whenScenario, /Final: No Scorigami. This score has happened 68 times before/)
  assert.match(info.whenScenario, /Oklahoma City Thunder vs Cleveland Cavaliers/)
  assert.match(info.whenScenario, /Feb 22, 2026/)
  assert.equal(info.lastGameSummary, 'Oklahoma City Thunder vs Cleveland Cavaliers on Feb 22, 2026')
})

test('getScorigamiInfo for post-game occurred score returns historical record', () => {
  const info = getScorigamiInfo(108, 102, 0, 'post', 'MIN', 'DEN')
  assert.equal(info.isCurrentScorigami, false)
  assert.equal(info.chancePct, 0)
  assert.equal(info.currentOccurrences > 0, true)
  assert.match(info.chanceLabel, /No Scorigami/)
  assert.match(info.whenScenario, /Final: No Scorigami/)
  assert.equal(info.pointsNeededHome, 0)
  assert.equal(info.pointsNeededAway, 0)
})

test('getScorigamiInfo for post-game novel score announces Scorigami', () => {
  const info = getScorigamiInfo(153, 129, 0, 'post', 'BOS', 'DET')
  assert.equal(info.isCurrentScorigami, true)
  assert.equal(info.chancePct, 1)
  assert.match(info.chanceLabel, /100% — Historical NBA Scorigami!/)
  assert.match(info.whenScenario, /Final: Official NBA Scorigami!/)
})

test('getScorigamiInfo for pre-game returns projected novelty baseline', () => {
  const info = getScorigamiInfo(0, 0, 2880, 'pre', 'OKC', 'SAS')
  assert.equal(info.isCurrentScorigami, false)
  assert.equal(info.chancePct, 0.078)
  assert.match(info.chanceLabel, /7.8% Novelty Chance/)
  assert.ok(info.mostLikelyNovel)
  assert.equal(info.pointsNeededHome > 0, true)
  assert.equal(info.pointsNeededAway > 0, true)
})

test('getScorigamiInfo for live game provides dynamic probability and target scores', () => {
  // Late in 4th quarter with novel score
  const novelLiveInfo = getScorigamiInfo(153, 129, 60, 'in', 'BOS', 'DET')
  assert.equal(novelLiveInfo.isCurrentScorigami, true)
  assert.equal(novelLiveInfo.chancePct, 0.72)
  assert.match(novelLiveInfo.whenScenario, /🔥 Current score/)

  // 4th quarter with occurred score (102-98 has occurred 140+ times)
  const normalLiveInfo = getScorigamiInfo(102, 98, 300, 'in', 'BOS', 'DET')
  assert.ok(normalLiveInfo.mostLikelyNovel)
  assert.match(normalLiveInfo.chanceLabel, /% Novelty Chance/)
  assert.match(normalLiveInfo.whenScenario, /Target novel score/)

  // Early quarter (Q1)
  const q1Info = getScorigamiInfo(24, 22, 2400, 'in', 'BOS', 'DET')
  assert.equal(q1Info.chancePct, 0.08)
})

test('getScorigamiInfo handles boundary and invalid inputs safely', () => {
  const infoNaN = getScorigamiInfo(NaN, 'invalid', -50, 'in')
  assert.ok(infoNaN)
  assert.equal(typeof infoNaN.chancePct, 'number')

  // Cache hit validation
  const infoCached = getScorigamiInfo(NaN, 'invalid', -50, 'in')
  assert.deepEqual(infoCached, infoNaN)
})
