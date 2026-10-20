import test from 'node:test'
import assert from 'node:assert/strict'
import {
  sanitizeHexColor,
  safeParseInt,
  isClutchGame,
  resolveContrastingTeamColors,
  formatPeriodDetail,
} from './nbaHelpers.ts'

test('sanitizeHexColor formats valid and invalid hex strings', () => {
  assert.equal(sanitizeHexColor('007a33'), '#007a33')
  assert.equal(sanitizeHexColor('#1d428a'), '#1d428a')
  assert.equal(sanitizeHexColor('', '#111111'), '#111111')
  assert.equal(sanitizeHexColor('invalid', '#222222'), '#222222')
})

test('safeParseInt parses strings and numbers safely', () => {
  assert.equal(safeParseInt('98'), 98)
  assert.equal(safeParseInt(104), 104)
  assert.equal(safeParseInt(null, 10), 10)
  assert.equal(safeParseInt('abc', 0), 0)
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

  const compsBlowout = [
    { score: '115', homeAway: 'home', id: '1', team: { id: '1', name: '', displayName: '', abbreviation: '', color: '', logo: '' } },
    { score: '95', homeAway: 'away', id: '2', team: { id: '2', name: '', displayName: '', abbreviation: '', color: '', logo: '' } },
  ]
  assert.equal(isClutchGame(statusClutch, compsBlowout), false)
})

test('resolveContrastingTeamColors handles matching team colors', () => {
  const { homeColor, awayColor } = resolveContrastingTeamColors('006bb6', '006bb6')
  assert.notEqual(homeColor.toLowerCase(), awayColor.toLowerCase())
})
