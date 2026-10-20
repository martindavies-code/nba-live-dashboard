import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveAnnouncingCrew,
  formatCrewShortLabel,
  normalizeTeamAbbr,
} from './announcers.ts'

test('resolveAnnouncingCrew matches all major national broadcast networks', () => {
  // ABC
  const abcCrew = resolveAnnouncingCrew({ broadcasts: [{ market: 'National', names: ['ABC'] }] })
  assert.equal(abcCrew.network, 'ABC')
  assert.equal(abcCrew.playByPlay, 'Mike Breen')
  assert.match(abcCrew.colorAnalyst, /Richard Jefferson/)
  assert.equal(abcCrew.sidelineReporter, 'Lisa Salters')

  // ESPN
  const espnCrew = resolveAnnouncingCrew({ broadcasts: [{ market: 'National', names: ['ESPN'] }] })
  assert.equal(espnCrew.network, 'ESPN')
  assert.ok(espnCrew.playByPlay)

  // TNT
  const tntCrew = resolveAnnouncingCrew({ broadcasts: [{ market: 'National', names: ['TNT'] }] })
  assert.equal(tntCrew.network, 'TNT Sports')
  assert.equal(tntCrew.playByPlay, 'Kevin Harlan')
  assert.match(tntCrew.colorAnalyst, /Reggie Miller/)

  // NBC Lead Crew #1
  const nbcCrew = resolveAnnouncingCrew({ broadcasts: [{ market: 'National', names: ['NBC'] }] })
  assert.equal(nbcCrew.network, 'NBC Sports')
  assert.equal(nbcCrew.playByPlay, 'Mike Tirico')
  assert.match(nbcCrew.colorAnalyst, /Grant Hill/)
  assert.equal(nbcCrew.sidelineReporter, 'Maria Taylor')

  // Peacock
  const peacockCrew = resolveAnnouncingCrew({ broadcasts: [{ market: 'National', names: ['Peacock'] }] })
  assert.equal(peacockCrew.network, 'Peacock')

  // Prime Video
  const primeCrew = resolveAnnouncingCrew({ broadcasts: [{ market: 'National', names: ['Prime Video'] }] })
  assert.equal(primeCrew.network, 'Prime Video')
  assert.equal(primeCrew.playByPlay, 'Ian Eagle')

  // NBA TV
  const nbaTvCrew = resolveAnnouncingCrew({ broadcasts: [{ market: 'National', names: ['NBA TV'] }] })
  assert.equal(nbaTvCrew.network, 'NBA TV')
  assert.equal(nbaTvCrew.playByPlay, 'Ian Eagle')
})

test('resolveAnnouncingCrew resolves distinct crews across same-network slate with no double-booking', () => {
  const assignedCrews = new Set()

  // 1. Afternoon game (19:00 UTC / 3 PM EDT) - e.g. Boston @ Detroit
  const afternoonCrew = resolveAnnouncingCrew(
    { broadcasts: [{ market: 'National', names: ['NBC'] }] },
    'DET',
    'BOS',
    { gameDate: '2026-10-20T19:00Z', gameIndex: 0, assignedCrews }
  )
  assert.equal(afternoonCrew.playByPlay, 'Terry Gannon')
  assert.match(afternoonCrew.colorAnalyst, /Brad Daugherty/)
  assert.equal(formatCrewShortLabel(afternoonCrew.playByPlay, afternoonCrew.colorAnalyst), 'Gannon & Daugherty')

  // 2. Primetime game (23:00 UTC / 7 PM EDT) - e.g. Philadelphia @ New York
  const primetimeCrew = resolveAnnouncingCrew(
    { broadcasts: [{ market: 'National', names: ['NBC'] }] },
    'NY',
    'PHI',
    { gameDate: '2026-10-20T23:00Z', gameIndex: 1, assignedCrews }
  )
  assert.equal(primetimeCrew.playByPlay, 'Mike Tirico')
  assert.match(primetimeCrew.colorAnalyst, /Grant Hill/)
  assert.equal(formatCrewShortLabel(primetimeCrew.playByPlay, primetimeCrew.colorAnalyst), 'Tirico & Hill')

  // 3. Late primetime game (01:30 UTC / 9:30 PM EDT) - e.g. OKC @ San Antonio
  const lateCrew = resolveAnnouncingCrew(
    { broadcasts: [{ market: 'National', names: ['NBC'] }] },
    'SA',
    'OKC',
    { gameDate: '2026-10-21T01:30Z', gameIndex: 2, assignedCrews }
  )
  assert.equal(lateCrew.playByPlay, 'Noah Eagle')
  assert.match(lateCrew.colorAnalyst, /Reggie Miller/)
  assert.equal(formatCrewShortLabel(lateCrew.playByPlay, lateCrew.colorAnalyst), 'Eagle & Miller')

  // Verify all 3 games received completely distinct crews
  const commentators = [afternoonCrew.playByPlay, primetimeCrew.playByPlay, lateCrew.playByPlay]
  assert.equal(new Set(commentators).size, 3)
})

test('formatCrewShortLabel formats single and multi-analyst broadcast teams into concise badges', () => {
  assert.equal(formatCrewShortLabel('Terry Gannon', 'Brad Daugherty & Austin Rivers'), 'Gannon & Daugherty')
  assert.equal(formatCrewShortLabel('Noah Eagle', 'Reggie Miller & Jamal Crawford'), 'Eagle & Miller')
  assert.equal(formatCrewShortLabel('Mike Tirico', 'Grant Hill'), 'Tirico & Hill')
  assert.equal(formatCrewShortLabel('Mike Breen', 'Richard Jefferson & Tim Legler'), 'Breen & Jefferson')
  assert.equal(formatCrewShortLabel('Kevin Harlan', 'Reggie Miller & Stan Van Gundy'), 'Harlan & Miller')
  assert.equal(formatCrewShortLabel('Mike Tirico', ''), 'Tirico')
  assert.equal(formatCrewShortLabel('', 'Grant Hill'), '')
  assert.equal(formatCrewShortLabel(undefined, undefined), '')
})

test('normalizeTeamAbbr maps non-standard abbreviations and handles edge cases', () => {
  assert.equal(normalizeTeamAbbr('NY'), 'NYK')
  assert.equal(normalizeTeamAbbr('SA'), 'SAS')
  assert.equal(normalizeTeamAbbr('GS'), 'GSW')
  assert.equal(normalizeTeamAbbr('NO'), 'NOP')
  assert.equal(normalizeTeamAbbr('UTAH'), 'UTA')
  assert.equal(normalizeTeamAbbr('WSH'), 'WAS')
  assert.equal(normalizeTeamAbbr('BOS'), 'BOS')
  assert.equal(normalizeTeamAbbr(''), '')
  assert.equal(normalizeTeamAbbr(null), '')
  assert.equal(normalizeTeamAbbr(undefined), '')
})

test('resolveAnnouncingCrew handles case insensitivity and partial network matching', () => {
  const crew = resolveAnnouncingCrew({ broadcasts: [{ market: 'National', names: ['espn national feed'] }] })
  assert.equal(crew.network, 'ESPN')
})

test('resolveAnnouncingCrew resolves franchise local RSN crews', () => {
  // Boston Celtics
  const bosCrew = resolveAnnouncingCrew({ broadcasts: [] }, 'BOS', 'DET')
  assert.equal(bosCrew.network, 'NBC Sports Boston')
  assert.equal(bosCrew.playByPlay, 'Drew Carter')
  assert.match(bosCrew.colorAnalyst, /Brian Scalabrine/)

  // New York Knicks with normalized abbreviation 'NY'
  const nykCrew = resolveAnnouncingCrew({ broadcasts: [] }, 'NY', 'PHI')
  assert.equal(nykCrew.network, 'MSG Network')
  assert.match(nykCrew.playByPlay, /Mike Breen/)
  assert.match(nykCrew.colorAnalyst, /Walt "Clyde" Frazier/)

  // San Antonio Spurs with normalized abbreviation 'SA'
  const sasCrew = resolveAnnouncingCrew({ broadcasts: [] }, 'SA', 'OKC')
  assert.match(sasCrew.network, /FanDuel Sports Network/)
  assert.match(sasCrew.playByPlay, /Dan Weiss/)

  // Golden State Warriors
  const gswCrew = resolveAnnouncingCrew({ broadcasts: [] }, 'GSW', 'LAL')
  assert.equal(gswCrew.network, 'NBC Sports Bay Area')

  // Los Angeles Lakers
  const lalCrew = resolveAnnouncingCrew({ broadcasts: [] }, 'LAL', 'GSW')
  assert.equal(lalCrew.network, 'Spectrum SportsNet')
})

test('resolveAnnouncingCrew falls back to away team RSN or default crew', () => {
  // Away team fallback when home team is unknown
  const awayFallback = resolveAnnouncingCrew({ broadcasts: [] }, 'UNKNOWN_HOME', 'BOS')
  assert.equal(awayFallback.network, 'NBC Sports Boston')
  assert.equal(awayFallback.market, 'Away Regional')

  // Default fallback when both teams unknown
  const defaultCrew = resolveAnnouncingCrew({ broadcasts: [] }, 'AAA', 'BBB')
  assert.equal(defaultCrew.market, 'Regional / League Pass')
  assert.equal(defaultCrew.playByPlay, 'Broadcast Team')
})

test('resolveAnnouncingCrew extracts officiating crew or generates stable pseudo-hash', () => {
  // Feed officials provided
  const withOfficials = resolveAnnouncingCrew({
    broadcasts: [],
    officials: [
      { displayName: 'Scott Foster', fullName: 'Scott Foster' },
      { displayName: 'Tony Brothers', fullName: 'Tony Brothers' },
      { displayName: 'Zach Zarba', fullName: 'Zach Zarba' },
    ],
  }, 'BOS', 'DET')

  assert.equal(withOfficials.officials?.length, 3)
  assert.equal(withOfficials.officials?.[0]?.name, 'Scott Foster')
  assert.equal(withOfficials.officials?.[0]?.role, 'Crew Chief')

  // Generated pseudo-hash officials
  const withoutOfficials = resolveAnnouncingCrew({ broadcasts: [] }, 'BOS', 'DET')
  assert.equal(withoutOfficials.officials?.length, 3)
  assert.ok(withoutOfficials.officials?.[0]?.name)
  assert.ok(withoutOfficials.officials?.[1]?.name)
  assert.ok(withoutOfficials.officials?.[2]?.name)
})

test('resolveAnnouncingCrew handles null, undefined, and malformed inputs gracefully', () => {
  assert.doesNotThrow(() => {
    resolveAnnouncingCrew(null, null, null)
    resolveAnnouncingCrew(undefined, 123, {})
    resolveAnnouncingCrew({ broadcasts: null, officials: null }, '', '')
  })
})
