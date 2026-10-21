import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formatGameKickoff,
  formatGameKickoffLong,
  getTimeZoneAbbr,
  resolveTimeZone,
  getNBASlateDate,
  TIMEZONE_OPTIONS,
} from './timezone.ts'

test('resolveTimeZone maps known modes correctly', () => {
  assert.equal(resolveTimeZone('Europe/London'), 'Europe/London')
  assert.equal(resolveTimeZone('America/New_York'), 'America/New_York')
  assert.ok(typeof resolveTimeZone('auto') === 'string')
})

test('TIMEZONE_OPTIONS defines expected options with London as default', () => {
  assert.equal(TIMEZONE_OPTIONS.length, 3)
  assert.equal(TIMEZONE_OPTIONS[0].id, 'Europe/London')
  assert.equal(TIMEZONE_OPTIONS[0].flag, '🇬🇧')
})

test('formatGameKickoff formats ISO dates into London (BST/GMT) time', () => {
  // Oct 21, 2026 at 23:00 UTC = Oct 22, 2026 at 00:00 BST (+01:00)
  const resultBST = formatGameKickoff('2026-10-21T23:00Z', 'Europe/London')
  assert.match(resultBST, /Thu 22 Oct • 00:00 BST/)

  // Winter date: Jan 15, 2026 at 23:30 UTC = Jan 15, 2026 at 23:30 GMT (+00:00)
  const resultGMT = formatGameKickoff('2026-01-15T23:30Z', 'Europe/London')
  assert.match(resultGMT, /Thu 15 Jan • 23:30 GMT/)
})

test('formatGameKickoff formats ISO dates into US Eastern (EDT/EST) time', () => {
  // Oct 21, 2026 at 23:00 UTC = Oct 21, 2026 at 7:00 PM EDT (-04:00)
  const resultEDT = formatGameKickoff('2026-10-21T23:00Z', 'America/New_York')
  assert.match(resultEDT, /Wed, Oct 21 • 7:00 PM EDT/)

  // Winter date: Jan 15, 2026 at 23:30 UTC = Jan 15, 2026 at 6:30 PM EST (-05:00)
  const resultEST = formatGameKickoff('2026-01-15T23:30Z', 'America/New_York')
  assert.match(resultEST, /Thu, Jan 15 • 6:30 PM EST/)
})

test('formatGameKickoff options: time-only format', () => {
  const timeOnlyLondon = formatGameKickoff('2026-10-21T23:00Z', 'Europe/London', { includeDate: false })
  assert.equal(timeOnlyLondon, '00:00 BST')

  const timeOnlyUS = formatGameKickoff('2026-10-21T23:00Z', 'America/New_York', { includeDate: false })
  assert.equal(timeOnlyUS, '7:00 PM EDT')
})

test('formatGameKickoffLong formats long description for Hero banner', () => {
  const longBST = formatGameKickoffLong('2026-10-21T23:00Z', 'Europe/London')
  assert.match(longBST, /Thu, 22 Oct at 00:00 BST/)

  const longUS = formatGameKickoffLong('2026-10-21T23:00Z', 'America/New_York')
  assert.match(longUS, /Wed, Oct 21 at 7:00 PM EDT/)
})

test('getTimeZoneAbbr returns expected abbreviations', () => {
  assert.equal(getTimeZoneAbbr('2026-10-21T23:00Z', 'Europe/London'), 'BST')
  assert.equal(getTimeZoneAbbr('2026-01-15T23:30Z', 'Europe/London'), 'GMT')
  assert.equal(getTimeZoneAbbr('2026-10-21T23:00Z', 'America/New_York'), 'EDT')
  assert.equal(getTimeZoneAbbr('2026-01-15T23:30Z', 'America/New_York'), 'EST')
})

test('getNBASlateDate preserves US Eastern game day for late-night UK viewers', () => {
  // Oct 22, 2026 at 02:00 BST = Oct 21, 2026 at 21:00 EDT (Oct 21 NBA slate)
  const lateNightUK = new Date('2026-10-22T01:00:00Z') // 2:00 AM BST
  const slateDate = getNBASlateDate(lateNightUK)
  assert.equal(slateDate, '2026-10-21')
})

test('formatGameKickoff handles invalid and empty inputs gracefully', () => {
  assert.equal(formatGameKickoff(''), 'Scheduled')
  assert.equal(formatGameKickoff('invalid-date'), 'Scheduled')
  assert.equal(formatGameKickoff(undefined), 'Scheduled')
})
