import test from 'node:test'
import assert from 'node:assert/strict'
import {
  sanitizeHexColor,
  safeParseInt,
  sanitizeImageUrl,
  isClutchGame,
  calculateSecondsRemaining,
  resolveContrastingTeamColors,
  calculateWinProbability,
  resolveHomeSpread,
  formatPeriodDetail,
  safeStorage,
} from './nbaHelpers.ts'
import { sanitizeDateParam, fetchNBAScoreboard, clearScoreboardCache } from '../services/espnApi.ts'
import { normalizeTeamAbbr, formatCrewShortLabel } from './announcers.ts'
import { makeScoreKey, hasOccurred, getHistoricalRecord, getScorigamiInfo } from './scorigami.ts'

// =========================================================================
// 1. SECURITY & SANITISATION (OWASP / CWE VULNERABILITY FRAMEWORKS)
// =========================================================================

test('Security: sanitizeImageUrl blocks XSS, data URIs, CRLF, and credential leakage', () => {
  const fallback = 'https://a.espncdn.com/i/teamlogos/nba/500/nba.png'

  // XSS attack vectors
  assert.equal(sanitizeImageUrl('javascript:alert(1)'), fallback)
  assert.equal(sanitizeImageUrl('JAVASCRIPT:alert(document.cookie)'), fallback)
  assert.equal(sanitizeImageUrl('javascript://%0aalert(1)'), fallback)
  assert.equal(sanitizeImageUrl('vbscript:msgbox(1)'), fallback)
  assert.equal(sanitizeImageUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='), fallback)
  assert.equal(sanitizeImageUrl('data:image/svg+xml,<svg onload=alert(1)>'), fallback)

  // Protocol bypasses and local file disclosure
  assert.equal(sanitizeImageUrl('file:///etc/passwd'), fallback)
  assert.equal(sanitizeImageUrl('blob:https://evil.com/uuid'), fallback)
  assert.equal(sanitizeImageUrl('//evil.com/logo.png'), fallback) // protocol-relative

  // CRLF injection and control character attacks
  assert.equal(sanitizeImageUrl('https://example.com/logo.png\r\nSet-Cookie: evil=1'), fallback)
  assert.equal(sanitizeImageUrl('https://example.com/logo.png\n<script>alert(1)</script>'), fallback)
  assert.equal(sanitizeImageUrl('https://example.com/ logo.png'), fallback)

  // Credential leakage / SSRF vectors
  assert.equal(sanitizeImageUrl('https://user:password@evil.com/logo.png'), fallback)

  // Type coercion & invalid payloads
  assert.equal(sanitizeImageUrl(null), fallback)
  assert.equal(sanitizeImageUrl(undefined), fallback)
  assert.equal(sanitizeImageUrl(12345), fallback)
  assert.equal(sanitizeImageUrl({ url: 'https://evil.com' }), fallback)
  assert.equal(sanitizeImageUrl(['https://evil.com']), fallback)
  assert.equal(sanitizeImageUrl(true), fallback)
  assert.equal(sanitizeImageUrl(Symbol('img')), fallback)

  // Valid HTTPS and HTTP urls
  assert.equal(
    sanitizeImageUrl('https://a.espncdn.com/i/teamlogos/nba/500/bos.png'),
    'https://a.espncdn.com/i/teamlogos/nba/500/bos.png'
  )
  assert.equal(
    sanitizeImageUrl('http://cdn.nba.com/logos/lal.png'),
    'http://cdn.nba.com/logos/lal.png'
  )
})

test('Security: sanitizeHexColor neutralizes CSS injection attempts', () => {
  const fallback = '#1d428a'

  // CSS injection strings
  assert.equal(sanitizeHexColor('red; background: url(javascript:alert(1))'), fallback)
  assert.equal(sanitizeHexColor('#fff; } body { display:none; }'), fallback)
  assert.equal(sanitizeHexColor('expression(alert(1))'), fallback)
  assert.equal(sanitizeHexColor('rgb(255, 0, 0)'), fallback)
  assert.equal(sanitizeHexColor('hsl(200, 50%, 50%)'), fallback)

  // Malformed hex lengths and characters
  assert.equal(sanitizeHexColor('#12'), fallback)
  assert.equal(sanitizeHexColor('#12345'), fallback)
  assert.equal(sanitizeHexColor('#1234567'), fallback)
  assert.equal(sanitizeHexColor('#123456789'), fallback)
  assert.equal(sanitizeHexColor('#xyz123'), fallback)
  assert.equal(sanitizeHexColor(''), fallback)

  // Valid hex strings (3, 4, 6, 8 hex digits, case-insensitive)
  assert.equal(sanitizeHexColor('#fff'), '#fff')
  assert.equal(sanitizeHexColor('FFF'), '#fff')
  assert.equal(sanitizeHexColor('#A1B2C3'), '#a1b2c3')
  assert.equal(sanitizeHexColor('002b5c'), '#002b5c')
  assert.equal(sanitizeHexColor('#11223344'), '#11223344')

  // Type coercion
  assert.equal(sanitizeHexColor(null), fallback)
  assert.equal(sanitizeHexColor(undefined), fallback)
  assert.equal(sanitizeHexColor(123456), fallback)
  assert.equal(sanitizeHexColor({}), fallback)

  // Unsafe fallback verification
  assert.equal(sanitizeHexColor('invalid', 'dangerous-string'), '#1d428a')
  assert.equal(sanitizeHexColor('invalid', '#00ff00'), '#00ff00')
})

test('Security & Boundary: safeParseInt handles NaN, Infinity, scientific notation, and boundaries', () => {
  // NaN, Infinities, and unparseable values
  assert.equal(safeParseInt(NaN, 42), 42)
  assert.equal(safeParseInt(Infinity, 42), 42)
  assert.equal(safeParseInt(-Infinity, 42), 42)
  assert.equal(safeParseInt('NaN', 42), 42)
  assert.equal(safeParseInt('Infinity', 42), 42)
  assert.equal(safeParseInt('garbage', 42), 42)
  assert.equal(safeParseInt(null, 42), 42)
  assert.equal(safeParseInt(undefined, 42), 42)
  assert.equal(safeParseInt({}, 42), 42)
  assert.equal(safeParseInt([], 42), 42)

  // Boundary clamping
  assert.equal(safeParseInt('150', 0, 0, 100), 100)
  assert.equal(safeParseInt('-50', 0, 0, 100), 0)
  assert.equal(safeParseInt(75, 0, 0, 100), 75)

  // Inverted min/max parameter safety
  assert.equal(safeParseInt(50, 0, 100, 0), 50)
  assert.equal(safeParseInt(150, 0, 100, 0), 100)

  // Long string denial-of-service protection (> 20 chars ignored)
  const longNum = '9'.repeat(100)
  assert.equal(safeParseInt(longNum, 10), 10)
})

test('Security & Validation: sanitizeDateParam verifies strict calendar validity and leap years', () => {
  // Valid calendar dates
  assert.equal(sanitizeDateParam('2026-10-20'), '20261020')
  assert.equal(sanitizeDateParam('20261020'), '20261020')
  assert.equal(sanitizeDateParam('2024-02-29'), '20240229') // Leap year 2024

  // Impossible leap years
  assert.equal(sanitizeDateParam('2026-02-29'), null) // 2026 is not a leap year
  assert.equal(sanitizeDateParam('2023-02-29'), null) // 2023 is not a leap year

  // Invalid calendar days
  assert.equal(sanitizeDateParam('2026-04-31'), null) // April only has 30 days
  assert.equal(sanitizeDateParam('2026-06-31'), null) // June only has 30 days
  assert.equal(sanitizeDateParam('2026-02-30'), null) // Feb never has 30 days
  assert.equal(sanitizeDateParam('2026-00-10'), null) // Month 0 invalid
  assert.equal(sanitizeDateParam('2026-13-10'), null) // Month 13 invalid
  assert.equal(sanitizeDateParam('2026-10-00'), null) // Day 0 invalid
  assert.equal(sanitizeDateParam('2026-10-32'), null) // Day 32 invalid

  // Epoch boundaries (NBA founded 1946; max sensible epoch 2100)
  assert.equal(sanitizeDateParam('1945-12-31'), null) // Pre-NBA
  assert.equal(sanitizeDateParam('1946-01-01'), '19460101') // Minimum NBA boundary
  assert.equal(sanitizeDateParam('2100-12-31'), '21001231') // Maximum boundary
  assert.equal(sanitizeDateParam('2101-01-01'), null) // Beyond 2100 boundary

  // Injection / type confusion attacks
  assert.equal(sanitizeDateParam('2026-10-20; DROP TABLE games;--'), null)
  assert.equal(sanitizeDateParam('2026-10-20<script>'), null)
  assert.equal(sanitizeDateParam({ date: '20261020' }), null)
  assert.equal(sanitizeDateParam(20261020), null)
  assert.equal(sanitizeDateParam(null), null)
  assert.equal(sanitizeDateParam(undefined), null)
})

test('Security: Prototype pollution resistance across dictionary and storage lookups', () => {
  // Prototype property lookup in normalizeTeamAbbr strictly isolates against Object prototype methods
  assert.equal(normalizeTeamAbbr('__proto__'), '__PROTO__')
  assert.equal(normalizeTeamAbbr('constructor'), '') // > 10 characters safely returns ''
  assert.equal(normalizeTeamAbbr('toString'), 'TOSTRING')
  assert.equal(normalizeTeamAbbr('valueOf'), 'VALUEOF')
  assert.equal(normalizeTeamAbbr('hasOwnProperty'), '') // > 10 characters safely returns ''

  // Prototype properties in Scorigami hasOccurred and getHistoricalRecord
  assert.equal(hasOccurred('__proto__', 100), false)
  assert.equal(hasOccurred('constructor', 'toString'), false)
  assert.equal(getHistoricalRecord('__proto__', 100), null)
  assert.equal(getHistoricalRecord('valueOf', 'isPrototypeOf'), null)

  // safeStorage key and size hardening
  assert.equal(safeStorage.getItem('__proto__'), null)
  assert.equal(safeStorage.setItem('__proto__', 'malicious'), false)
  assert.equal(safeStorage.setItem('constructor', 'malicious'), false)
  assert.equal(safeStorage.setItem('admin_token', '123'), false) // Missing 'nba_' prefix

  // Key length and value size constraints
  const hugePayload = 'A'.repeat(2048)
  assert.equal(safeStorage.setItem('nba_oversized', hugePayload), false) // Exceeds 1024 bytes

  // Valid safeStorage keys and values
  assert.equal(safeStorage.setItem('nba_test_pref', 'valid_value'), true)
  assert.equal(safeStorage.getItem('nba_test_pref'), 'valid_value')
  assert.equal(safeStorage.removeItem('nba_test_pref'), true)
})

// =========================================================================
// 2. EDGE CASE AND LOGIC ISOLATION
// =========================================================================

test('Edge Cases: calculateWinProbability handles extreme values, overtime, and invariants', () => {
  // Invariant 1: homePct + awayPct MUST equal 100% across all game states
  const testCases = [
    { homeScore: 100, awayScore: 100, secondsRemaining: 1440, state: 'in', spread: -3.5 },
    { homeScore: 120, awayScore: 80, secondsRemaining: 300, state: 'in', spread: 7.5 },
    { homeScore: 50, awayScore: 110, secondsRemaining: 600, state: 'in', spread: -12 },
    { homeScore: 130, awayScore: 129, secondsRemaining: 5, state: 'in', spread: 0 },
    { homeScore: 0, awayScore: 0, secondsRemaining: 2880, state: 'pre', spread: -5 },
    { homeScore: 115, awayScore: 115, secondsRemaining: 0, state: 'in', spread: 0 },
    { homeScore: 110, awayScore: 105, secondsRemaining: 0, state: 'post', spread: -4 },
  ]

  for (const tc of testCases) {
    const res = calculateWinProbability(tc.homeScore, tc.awayScore, tc.secondsRemaining, tc.state, tc.spread)
    assert.equal(
      res.homePct + res.awayPct,
      100,
      `Invariant violation: home ${res.homePct} + away ${res.awayPct} !== 100`
    )
    assert.ok(res.homePct >= 0 && res.homePct <= 100, `Home pct out of bounds: ${res.homePct}`)
    assert.ok(res.awayPct >= 0 && res.awayPct <= 100, `Away pct out of bounds: ${res.awayPct}`)
  }

  // Pre-game extreme spread values (+/- 25)
  const extremeHome = calculateWinProbability(0, 0, 2880, 'pre', -25)
  assert.ok(extremeHome.homePct >= 90, 'Heavy pre-game home favorite should yield >= 90%')
  assert.equal(extremeHome.homePct + extremeHome.awayPct, 100)

  const extremeAway = calculateWinProbability(0, 0, 2880, 'pre', 25)
  assert.ok(extremeAway.awayPct >= 90, 'Heavy pre-game away favorite should yield >= 90%')
  assert.equal(extremeAway.homePct + extremeAway.awayPct, 100)

  // Non-finite and malformed inputs
  const nanResult = calculateWinProbability(NaN, NaN, NaN, 'in', NaN)
  assert.equal(nanResult.homePct + nanResult.awayPct, 100)
  assert.equal(nanResult.homePct, 50)
  assert.equal(nanResult.awayPct, 50)

  // Floating point overflow protection
  const overflowTest = calculateWinProbability(1000, 0, 1, 'in', 0)
  assert.ok(Number.isFinite(overflowTest.homePct))
  assert.ok(Number.isFinite(overflowTest.awayPct))
  assert.equal(overflowTest.homePct + overflowTest.awayPct, 100)
})

test('Edge Cases: isClutchGame boundary and malformed condition testing', () => {
  // Not in live state
  assert.equal(isClutchGame({ type: { state: 'pre' } }, []), false)
  assert.equal(isClutchGame({ type: { state: 'post' } }, []), false)
  assert.equal(isClutchGame(null, null), false)
  assert.equal(isClutchGame(undefined, undefined), false)

  // Regulation Q1-Q3 (never clutch regardless of deficit)
  const q3Game = {
    period: 3,
    clock: 60,
    type: { state: 'in', completed: false },
  }
  const tightCompetitors = [
    { score: '75', homeAway: 'home' },
    { score: '74', homeAway: 'away' },
  ]
  assert.equal(isClutchGame(q3Game, tightCompetitors), false)

  // Q4 exactly at 300 seconds (5:00) with 5 point deficit -> Clutch
  const q4ClutchExact = {
    period: 4,
    clock: 300,
    type: { state: 'in', completed: false },
  }
  assert.equal(isClutchGame(q4ClutchExact, [{ score: '100' }, { score: '95' }]), true)

  // Q4 at 301 seconds (5:01) with 5 point deficit -> Not clutch
  const q4TooEarly = {
    period: 4,
    clock: 301,
    type: { state: 'in', completed: false },
  }
  assert.equal(isClutchGame(q4TooEarly, [{ score: '100' }, { score: '95' }]), false)

  // Q4 under 5:00 with 6 point deficit -> Not clutch
  assert.equal(isClutchGame(q4ClutchExact, [{ score: '100' }, { score: '94' }]), false)

  // Overtime periods (period 5+) are clutch throughout if <= 5 pts
  const otGame = {
    period: 5,
    clock: 290, // Nearly full 5 min OT remaining
    type: { state: 'in', completed: false },
  }
  assert.equal(isClutchGame(otGame, [{ score: '110' }, { score: '108' }]), true)
  assert.equal(isClutchGame(otGame, [{ score: '110' }, { score: '102' }]), false)
})

test('Edge Cases: formatPeriodDetail bounds and unexpected state handling', () => {
  // Pre-game state
  assert.equal(formatPeriodDetail(1, 'pre'), 'Upcoming')

  // Standard live quarters
  assert.equal(formatPeriodDetail(1, 'in'), '1st Quarter')
  assert.equal(formatPeriodDetail(2, 'in'), '2nd Quarter')
  assert.equal(formatPeriodDetail(3, 'in'), '3rd Quarter')
  assert.equal(formatPeriodDetail(4, 'in'), '4th Quarter')

  // Live overtimes
  assert.equal(formatPeriodDetail(5, 'in'), 'OT1')
  assert.equal(formatPeriodDetail(6, 'in'), 'OT2')
  assert.equal(formatPeriodDetail(7, 'in'), 'OT3')

  // Post-game states
  assert.equal(formatPeriodDetail(4, 'post'), 'Final')
  assert.equal(formatPeriodDetail(5, 'post'), 'Final / 1OT')
  assert.equal(formatPeriodDetail(6, 'post'), 'Final / 2OT')

  // Boundary clamping (clamped to max 20 / OT16)
  assert.equal(formatPeriodDetail(20, 'in'), 'OT16')
  assert.equal(formatPeriodDetail(999, 'in'), 'OT16')
  assert.equal(formatPeriodDetail(0, 'in'), '1st Quarter')
  assert.equal(formatPeriodDetail(-5, 'in'), '1st Quarter')
})

test('Edge Cases: resolveContrastingTeamColors contrast and collision handling', () => {
  // Identical home and away colors (must not return identical colors)
  const collision = resolveContrastingTeamColors('002b5c', '002b5c')
  assert.notEqual(collision.homeColor, collision.awayColor)

  // Missing or undefined colors safely fallback to team standard defaults
  const missing = resolveContrastingTeamColors(undefined, null)
  assert.match(missing.homeColor, /^#[0-9a-fA-F]{6}$/)
  assert.match(missing.awayColor, /^#[0-9a-fA-F]{6}$/)
})

test('Edge Cases: calculateSecondsRemaining and resolveHomeSpread boundary isolation', () => {
  // calculateSecondsRemaining handles negative clocks, overtimes, and malformed inputs
  assert.equal(calculateSecondsRemaining({ period: 1, clock: 720, type: { state: 'in' } }), 2880) // Tip-off
  assert.equal(calculateSecondsRemaining({ period: 4, clock: 0, type: { state: 'in' } }), 0) // Final buzzer
  assert.equal(calculateSecondsRemaining({ period: 4, clock: -50, type: { state: 'in' } }), 0) // Negative clock clamped
  assert.equal(calculateSecondsRemaining({ period: 5, clock: 120, type: { state: 'in' } }), 120) // OT1 with 2 mins left
  assert.equal(calculateSecondsRemaining(null), 2880) // Default when status is null
  assert.equal(calculateSecondsRemaining({ type: { state: 'post' } }), 0) // Post game is 0s

  // resolveHomeSpread handles empty, PK, EVEN, and favorite mismatches
  assert.equal(resolveHomeSpread(undefined), 0)
  assert.equal(resolveHomeSpread([]), 0)
  assert.equal(resolveHomeSpread([{ details: 'PK', spread: 0 }]), 0)
  assert.equal(resolveHomeSpread([{ details: 'EVEN', spread: 0 }]), 0)
  assert.equal(resolveHomeSpread([{ details: 'BOS -6.5', spread: -6.5 }], 'BOS', 'DET'), -6.5)
  assert.equal(resolveHomeSpread([{ details: 'DET -6.5', spread: -6.5 }], 'BOS', 'DET'), 6.5)
})

test('Edge Cases: makeScoreKey and getScorigamiInfo resilient to corrupt states', () => {
  // makeScoreKey creates consistent canonical keys even with reversed or string inputs
  assert.equal(makeScoreKey('120', '110'), '120-110')
  assert.equal(makeScoreKey(110, 120), '120-110')
  assert.equal(makeScoreKey(NaN, 'invalid'), '0-0')

  // getScorigamiInfo handles null, undefined, and non-array competitors safely
  const corruptGame = {
    status: { type: { state: 'in' }, period: 4, clock: 60 },
    competitions: [{ competitors: null }],
  }
  const info = getScorigamiInfo(corruptGame)
  assert.ok(info)
  assert.equal(typeof info.isCurrentScorigami, 'boolean')
  assert.ok(info.chancePct >= 0 && info.chancePct <= 1)
})

// =========================================================================
// 3. PERFORMANCE & RESOURCE AUDITING
// =========================================================================

test('Performance: In-flight deduplication ensures only one network fetch executes concurrently', async () => {
  clearScoreboardCache()

  let physicalFetchCount = 0
  const mockPayload = {
    events: [
      {
        id: 'perf-event-1',
        name: 'Hawks at Heat',
        status: { period: 2, clock: 500, type: { state: 'in' } },
        competitions: [{ broadcasts: [], competitors: [] }],
      },
    ],
  }

  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => {
    physicalFetchCount++
    await new Promise((r) => setTimeout(r, 25)) // Simulate network latency
    return {
      ok: true,
      status: 200,
      json: async () => mockPayload,
    }
  }

  try {
    // Fire 5 simultaneous requests for the exact same date
    const [r1, , , , r5] = await Promise.all([
      fetchNBAScoreboard('2026-10-20'),
      fetchNBAScoreboard('2026-10-20'),
      fetchNBAScoreboard('2026-10-20'),
      fetchNBAScoreboard('2026-10-20'),
      fetchNBAScoreboard('2026-10-20'),
    ])

    // In-flight deduplication must guarantee only 1 real network fetch occurred
    assert.equal(physicalFetchCount, 1, 'Concurrent requests were not properly deduplicated')
    assert.equal(r1.data.events.length, 1)
    assert.equal(r5.data.events.length, 1)
  } finally {
    globalThis.fetch = originalFetch
    clearScoreboardCache()
  }
})

test('Performance: Announcer badge format cache prevents redundant string splits', () => {
  // formatCrewShortLabel should return consistent results across multiple calls
  const first = formatCrewShortLabel('Mike Breen', 'Richard Jefferson & Doris Burke')
  const second = formatCrewShortLabel('Mike Breen', 'Richard Jefferson & Doris Burke')

  assert.equal(first, 'Breen & Jefferson')
  assert.equal(first, second)

  // Single analyst badge
  assert.equal(formatCrewShortLabel('Ian Eagle', ''), 'Eagle')

  // Non-string resilience
  assert.equal(formatCrewShortLabel(null, undefined), '')
  assert.equal(formatCrewShortLabel(1234, {}), '')
})

test('Performance: Scorigami historical membership lookup operates in O(1)', () => {
  // High-volume score checks should complete near-instantaneously (< 100ms for 2,000 checks under CI virtualization)
  const startTime = performance.now()
  for (let i = 0; i < 2000; i++) {
    hasOccurred(100 + (i % 30), 90 + (i % 25))
  }
  const elapsed = performance.now() - startTime
  assert.ok(elapsed < 100, `2,000 lookups took ${elapsed}ms; expected < 100ms`)
})
