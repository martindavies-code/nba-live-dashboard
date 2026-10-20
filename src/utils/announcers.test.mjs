import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveAnnouncingCrew } from './announcers.ts'

test('resolveAnnouncingCrew matches all major national broadcast networks', () => {
  // ABC
  const abcCrew = resolveAnnouncingCrew({ broadcasts: [{ market: 'National', names: ['ABC'] }] })
  assert.equal(abcCrew.network, 'ABC')
  assert.equal(abcCrew.playByPlay, 'Mike Breen')
  assert.match(abcCrew.colorAnalyst, /Doris Burke/)
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

  // NBC
  const nbcCrew = resolveAnnouncingCrew({ broadcasts: [{ market: 'National', names: ['NBC'] }] })
  assert.equal(nbcCrew.network, 'NBC Sports')
  assert.equal(nbcCrew.playByPlay, 'Noah Eagle')

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

  // New York Knicks
  const nykCrew = resolveAnnouncingCrew({ broadcasts: [] }, 'NYK', 'PHI')
  assert.equal(nykCrew.network, 'MSG Network')
  assert.match(nykCrew.playByPlay, /Mike Breen/)
  assert.match(nykCrew.colorAnalyst, /Walt "Clyde" Frazier/)

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
