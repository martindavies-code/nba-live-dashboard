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
  formatPeriodDetail,
  safeStorage,
} from './nbaHelpers.ts'

test('sanitizeHexColor formats valid 3, 4, 6, 8 char hex strings', () => {
  assert.equal(sanitizeHexColor('007a33'), '#007a33')
  assert.equal(sanitizeHexColor('#1d428a'), '#1d428a')
  assert.equal(sanitizeHexColor('fff'), '#fff')
  assert.equal(sanitizeHexColor('#A1B2'), '#a1b2')
  assert.equal(sanitizeHexColor('1d428aFF'), '#1d428aff')
})

test('sanitizeHexColor handles invalid inputs, non-strings, and CSS injection attempts', () => {
  assert.equal(sanitizeHexColor('', '#111111'), '#111111')
  assert.equal(sanitizeHexColor(null, '#222222'), '#222222')
  assert.equal(sanitizeHexColor(undefined, '#333333'), '#333333')
  assert.equal(sanitizeHexColor(12345, '#444444'), '#444444')
  assert.equal(sanitizeHexColor({}, '#555555'), '#555555')
  assert.equal(sanitizeHexColor(['red'], '#666666'), '#666666')
  assert.equal(sanitizeHexColor('invalid-hex', '#777777'), '#777777')
  assert.equal(sanitizeHexColor('red; background: url(evil.com)', '#888888'), '#888888')
  assert.equal(sanitizeHexColor('<script>', '#999999'), '#999999')
  // Fallback itself invalid -> default fallback
  assert.equal(sanitizeHexColor('xyz', 'not-a-hex'), '#1d428a')
})

test('safeParseInt parses strings, numbers, and respects min/max boundaries', () => {
  assert.equal(safeParseInt('98'), 98)
  assert.equal(safeParseInt(104), 104)
  assert.equal(safeParseInt('  42  '), 42)
  assert.equal(safeParseInt(null, 10), 10)
  assert.equal(safeParseInt(undefined, 5), 5)
  assert.equal(safeParseInt('abc', 0), 0)
  assert.equal(safeParseInt('', 7), 7)
  assert.equal(safeParseInt(NaN, 0), 0)
  assert.equal(safeParseInt(Infinity, 0), 0)
  assert.equal(safeParseInt(-Infinity, 0), 0)
  assert.equal(safeParseInt(104.9, 0), 104)
  assert.equal(safeParseInt({}, 3), 3)

  // Bounds checks
  assert.equal(safeParseInt(150, 0, 0, 100), 100)
  assert.equal(safeParseInt(-25, 0, 0, 100), 0)
  assert.equal(safeParseInt('50', 0, 10, 80), 50)
})

test('sanitizeImageUrl validates protocols and prevents injection', () => {
  assert.equal(
    sanitizeImageUrl('https://a.espncdn.com/logo.png'),
    'https://a.espncdn.com/logo.png'
  )
  assert.equal(
    sanitizeImageUrl('http://sports.cdn/team.png'),
    'http://sports.cdn/team.png'
  )
  assert.equal(
    sanitizeImageUrl('javascript:alert(1)'),
    'https://a.espncdn.com/i/teamlogos/nba/500/nba.png'
  )
  assert.equal(
    sanitizeImageUrl('data:text/html,<script>alert(1)</script>'),
    'https://a.espncdn.com/i/teamlogos/nba/500/nba.png'
  )
  assert.equal(
    sanitizeImageUrl('', 'https://fallback.com/logo.png'),
    'https://fallback.com/logo.png'
  )
  assert.equal(
    sanitizeImageUrl(null, 'https://fallback.com/logo.png'),
    'https://fallback.com/logo.png'
  )
})

test('isClutchGame correctly flags <= 5 pt deficit late in 4th or OT', () => {
  const statusClutch = {
    clock: 180,
    displayClock: '3:00',
    period: 4,
    type: { state: 'in', completed: false, description: '', detail: '', shortDetail: '', id: '2', name: '' },
  }
  const compsClutch = [
    { score: '98', homeAway: 'home', id: '1', team: { id: '1', name: '', displayName: '', abbreviation: '', color: '', logo: '' } },
    { score: '96', homeAway: 'away', id: '2', team: { id: '2', name: '', displayName: '', abbreviation: '', color: '', logo: '' } },
  ]
  assert.equal(isClutchGame(statusClutch, compsClutch), true)

  // Blowout in 4th under 5 mins
  const compsBlowout = [
    { score: '115', homeAway: 'home', id: '1', team: { id: '1', name: '', displayName: '', abbreviation: '', color: '', logo: '' } },
    { score: '95', homeAway: 'away', id: '2', team: { id: '2', name: '', displayName: '', abbreviation: '', color: '', logo: '' } },
  ]
  assert.equal(isClutchGame(statusClutch, compsBlowout), false)

  // 4th quarter with > 5 minutes (clock = 360)
  const statusEarly4th = { ...statusClutch, clock: 360 }
  assert.equal(isClutchGame(statusEarly4th, compsClutch), false)

  // 3rd quarter close game -> not clutch yet
  const statusQ3 = { ...statusClutch, period: 3, clock: 100 }
  assert.equal(isClutchGame(statusQ3, compsClutch), false)

  // Overtime close game (period 5) -> clutch
  const statusOT = { ...statusClutch, period: 5, clock: 200 }
  assert.equal(isClutchGame(statusOT, compsClutch), true)

  // Overtime blowout -> not clutch
  assert.equal(isClutchGame(statusOT, compsBlowout), false)

  // Malformed inputs
  assert.equal(isClutchGame(null, compsClutch), false)
  assert.equal(isClutchGame(statusClutch, null), false)
  assert.equal(isClutchGame(statusClutch, []), false)
  assert.equal(isClutchGame({ ...statusClutch, type: null }, compsClutch), false)
  assert.equal(isClutchGame({ ...statusClutch, type: { state: 'post' } }, compsClutch), false)
})

test('calculateSecondsRemaining derives correct total seconds remaining', () => {
  // Pre-game -> 2880
  assert.equal(calculateSecondsRemaining({ period: 0, clock: 0, displayClock: '', type: { state: 'pre' } }), 2880)
  // Post-game -> 0
  assert.equal(calculateSecondsRemaining({ period: 4, clock: 0, displayClock: '', type: { state: 'post' } }), 0)
  // Q1 with 600s left in period -> 600 + (3 * 720) = 2760
  assert.equal(calculateSecondsRemaining({ period: 1, clock: 600, displayClock: '', type: { state: 'in' } }), 2760)
  // Q2 with 360s left in period -> 360 + (2 * 720) = 1800
  assert.equal(calculateSecondsRemaining({ period: 2, clock: 360, displayClock: '', type: { state: 'in' } }), 1800)
  // Q3 with 100s left in period -> 100 + (1 * 720) = 820
  assert.equal(calculateSecondsRemaining({ period: 3, clock: 100, displayClock: '', type: { state: 'in' } }), 820)
  // Q4 with 258s left -> 258
  assert.equal(calculateSecondsRemaining({ period: 4, clock: 258, displayClock: '', type: { state: 'in' } }), 258)
  // OT (period 5) with 120s left -> 120
  assert.equal(calculateSecondsRemaining({ period: 5, clock: 120, displayClock: '', type: { state: 'in' } }), 120)
  // Null status -> 2880
  assert.equal(calculateSecondsRemaining(null), 2880)
})

test('resolveContrastingTeamColors handles matching and distinct team colors', () => {
  const { homeColor, awayColor } = resolveContrastingTeamColors('006bb6', '006bb6')
  assert.notEqual(homeColor.toLowerCase(), awayColor.toLowerCase())
  assert.equal(awayColor.toLowerCase(), '#f59e0b')

  const distinct = resolveContrastingTeamColors('007a33', '1d428a')
  assert.equal(distinct.homeColor, '#007a33')
  assert.equal(distinct.awayColor, '#1d428a')
})

test('calculateWinProbability calculates dynamic probabilities and bounds', () => {
  // Post-game
  const postHomeWin = calculateWinProbability(110, 105, 0, 'post')
  assert.equal(postHomeWin.homePct, 100)
  assert.equal(postHomeWin.awayPct, 0)

  const postAwayWin = calculateWinProbability(99, 104, 0, 'post')
  assert.equal(postAwayWin.homePct, 0)
  assert.equal(postAwayWin.awayPct, 100)

  const postTie = calculateWinProbability(100, 100, 0, 'post')
  assert.equal(postTie.homePct, 50)
  assert.equal(postTie.awayPct, 50)

  // Pre-game with favorite spread (-5)
  const preFav = calculateWinProbability(0, 0, 2880, 'pre', -5)
  assert.equal(preFav.homePct > 50, true)
  assert.equal(preFav.homePct + preFav.awayPct, 100)

  // Live game tied
  const liveTied = calculateWinProbability(90, 90, 1440, 'in')
  assert.equal(liveTied.homePct, 50)
  assert.equal(liveTied.awayPct, 50)

  // Live game blowout late
  const liveBlowout = calculateWinProbability(115, 90, 120, 'in')
  assert.equal(liveBlowout.homePct >= 95, true)
})

test('formatPeriodDetail formats various quarter and overtime states', () => {
  assert.equal(formatPeriodDetail(0, 'pre'), 'Upcoming')
  assert.equal(formatPeriodDetail(4, 'post'), 'Final')
  assert.equal(formatPeriodDetail(5, 'post'), 'Final / 1OT')
  assert.equal(formatPeriodDetail(6, 'post'), 'Final / 2OT')
  assert.equal(formatPeriodDetail(1, 'in'), '1st Quarter')
  assert.equal(formatPeriodDetail(2, 'in'), '2nd Quarter')
  assert.equal(formatPeriodDetail(3, 'in'), '3rd Quarter')
  assert.equal(formatPeriodDetail(4, 'in'), '4th Quarter')
  assert.equal(formatPeriodDetail(5, 'in'), 'OT1')
  assert.equal(formatPeriodDetail(6, 'in'), 'OT2')
})

test('safeStorage handles missing or restricted localStorage safely', () => {
  // Should not throw even if localStorage operations fail or in non-browser context
  assert.doesNotThrow(() => {
    safeStorage.setItem('test_key', 'test_val')
    safeStorage.getItem('test_key')
  })
})
