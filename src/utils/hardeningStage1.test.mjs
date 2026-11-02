import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formatHistoricalDate,
  getScorigamiInfo,
} from './scorigami.ts'
import {
  formatCrewShortLabel,
  resolveAnnouncingCrew,
  NATIONAL_CREWS,
} from './announcers.ts'
import {
  getSavedTimeZone,
  setSavedTimeZone,
  getTimeZoneAbbr,
  formatGameKickoff,
  formatGameKickoffLong,
  getNBASlateDate,
  resolveTimeZone,
} from './timezone.ts'
import {
  resolveHomeSpread,
  calculateWinProbability,
  calculateSecondsRemaining,
  safeStorage,
} from './nbaHelpers.ts'
import {
  fetchNBAScoreboard,
  clearScoreboardCache,
} from '../services/espnApi.ts'
import {
  playWhistleSound,
  playSwishSound,
  playBuzzerSound,
  playTactileClick,
} from './audioFeedback.ts'

test('Stage 1 Hardening: audioFeedback.ts initial exception safety', () => {
  // Test error recovery when AudioContext constructor throws on very first instantiation
  globalThis.window = {
    AudioContext: function () {
      throw new Error('NotAllowedError')
    },
  }
  try {
    assert.doesNotThrow(() => {
      playWhistleSound()
      playSwishSound()
      playBuzzerSound()
      playTactileClick()
    })
  } finally {
    delete globalThis.window
  }
})

test('Stage 1 Hardening: scorigami.ts non-finite, out-of-range dates, and live novelty time horizons', () => {
  assert.equal(formatHistoricalDate('2024-xx-01'), '2024-xx-01')
  assert.equal(formatHistoricalDate('2024-13-01'), '2024-13-01')
  assert.equal(formatHistoricalDate('2024-00-10'), '2024-00-10')
  assert.equal(formatHistoricalDate('2024-05-32'), '2024-05-32')
  assert.equal(formatHistoricalDate('2024-05-00'), '2024-05-00')

  // Live novel game with safeSec between 90 and 600 (hits lines 271, 292-293)
  const novelMidGame = getScorigamiInfo(153, 129, 300, 'in', 'BOS', 'DET')
  assert.equal(novelMidGame.isCurrentScorigami, true)
  assert.equal(novelMidGame.chancePct, 0.45)
  assert.match(novelMidGame.whenScenario, /Target to maintain novelty/)

  // Live novel game with safeSec > 600 (hits line 273)
  const novelEarlyGame = getScorigamiInfo(153, 129, 1200, 'in', 'BOS', 'DET')
  assert.equal(novelEarlyGame.isCurrentScorigami, true)
  assert.equal(novelEarlyGame.chancePct, 0.08)
})

test('Stage 1 Hardening: announcers.ts formatCrewShortLabel branches and crew resolution depth chart', () => {
  assert.equal(formatCrewShortLabel('Mike Breen', 'TBA'), 'Breen')
  assert.equal(formatCrewShortLabel('Mike Breen', 'ASSIGNMENT TBA'), 'Breen')
  assert.equal(formatCrewShortLabel('Mike Breen', 'COLOR COMMENTARY'), 'Breen')
  assert.equal(formatCrewShortLabel('Breen', ''), 'Breen')
  assert.equal(formatCrewShortLabel('TBA', 'Doris Burke'), 'TBA')
  assert.equal(formatCrewShortLabel('BROADCAST TEAM', ''), 'TBA')
  assert.equal(formatCrewShortLabel('UNKNOWN', ''), 'TBA')
  assert.equal(formatCrewShortLabel('Bob Fitzgerald', 'Kelenna Azubuike / Chris Mullin'), 'Fitzgerald & Azubuike')
  assert.equal(formatCrewShortLabel('   ', 'Analyst'), '')
  assert.equal(formatCrewShortLabel('Mike Breen', '   '), 'Breen')
  assert.equal(formatCrewShortLabel('Breen', 'Frazier'), 'Breen & Frazier')

  // Hit windowIndex >= 0 with preferred window crew already assigned -> falls back to crews.find()
  const tntCrews = NATIONAL_CREWS.TNT
  const partialAssigned = new Set([tntCrews[0].playByPlay])
  const fallbackCandidate = resolveAnnouncingCrew(
    { broadcasts: [{ market: 'National', names: ['TNT'] }] },
    'MIA',
    'ORL',
    { gameDate: '2026-12-25T23:00Z', assignedCrews: partialAssigned }
  )
  assert.equal(fallbackCandidate.playByPlay, tntCrews[1].playByPlay)

  // Hit candidate === undefined in national crew resolution (lines 612-621)
  const allTntCrews = new Set(NATIONAL_CREWS.TNT.map((c) => c.playByPlay))
  const overbookedTnt = resolveAnnouncingCrew(
    { broadcasts: [{ market: 'National', names: ['TNT'] }] },
    'MIA',
    'ORL',
    { gameDate: '2026-12-25T20:00Z', assignedCrews: allTntCrews }
  )
  assert.equal(overbookedTnt.playByPlay, 'TBA')
  assert.equal(overbookedTnt.colorAnalyst, 'Booth assignment TBA')
})

test('Stage 1 Hardening: timezone.ts preferences, format branches, and Intl exception fallbacks', () => {
  safeStorage.removeItem('nba_dashboard_timezone')
  assert.equal(getSavedTimeZone(), 'Europe/London')

  setSavedTimeZone('America/New_York')
  assert.equal(getSavedTimeZone(), 'America/New_York')

  setSavedTimeZone('auto')
  assert.equal(getSavedTimeZone(), 'auto')

  setSavedTimeZone('Europe/London')
  assert.equal(getSavedTimeZone(), 'Europe/London')

  safeStorage.setItem('nba_dashboard_timezone', 'invalid-tz')
  assert.equal(getSavedTimeZone(), 'Europe/London')

  assert.equal(formatGameKickoffLong(''), 'Scheduled')
  assert.equal(formatGameKickoffLong(undefined), 'Scheduled')
  assert.equal(formatGameKickoffLong('invalid-date'), 'Scheduled')

  assert.equal(getTimeZoneAbbr('invalid-date', 'Europe/London'), 'BST')
  assert.equal(getTimeZoneAbbr('invalid-date', 'America/New_York'), 'ET')
  assert.ok(typeof getTimeZoneAbbr() === 'string')

  const slate = getNBASlateDate(new Date('2026-11-02T12:00:00Z'))
  assert.equal(slate, '2026-11-02')
  assert.equal(resolveTimeZone('invalid'), 'Europe/London')

  // Test Intl exception fallback branches
  const origDTF = Intl.DateTimeFormat
  try {
    Intl.DateTimeFormat = function () {
      throw new Error('Simulated Intl error')
    }

    assert.equal(resolveTimeZone('auto'), 'Europe/London')
    assert.equal(getTimeZoneAbbr('2026-10-21T23:00Z', 'Europe/London'), 'BST')
    assert.equal(getTimeZoneAbbr('2026-10-21T23:00Z', 'America/New_York'), 'ET')
    assert.equal(formatGameKickoff('2026-10-21T23:00Z'), '2026-10-21T23:00Z')
    assert.equal(formatGameKickoffLong('2026-10-21T23:00Z'), '2026-10-21T23:00Z')
    assert.ok(getNBASlateDate(new Date('2026-11-02T12:00:00Z')).startsWith('2026-11-02'))
  } finally {
    Intl.DateTimeFormat = origDTF
  }
})

test('Stage 1 Hardening: nbaHelpers.ts odds and spread edge cases', () => {
  // Odd spread with awayTeamOdds.favorite without matching details regex
  const spreadAwayFav = resolveHomeSpread([{ spread: -4.5, awayTeamOdds: { favorite: true } }])
  assert.equal(spreadAwayFav, 4.5)

  // Odd spread with homeTeamOdds.favorite without matching details regex
  const spreadHomeFav = resolveHomeSpread([{ spread: -4.5, homeTeamOdds: { favorite: true } }])
  assert.equal(spreadHomeFav, -4.5)

  // Spread with no details regex and no favorite flags
  const rawSpread = resolveHomeSpread([{ spread: -3.0 }])
  assert.equal(rawSpread, -3.0)

  // Spread with details EVEN
  const evenSpread = resolveHomeSpread([{ details: 'EVEN', spread: 0 }])
  assert.equal(evenSpread, 0)

  // Spread with unmatching team in details
  const unmatchingTeam = resolveHomeSpread([{ details: 'MIA -5', spread: -5 }], 'DET', 'BOS')
  assert.equal(unmatchingTeam, -5)
})

test('Stage 1 Hardening: nbaHelpers.ts dynamic win probability foul bonus, momentum, bounds, and defensive arithmetic guards', () => {
  // Bonus foul penalty adjustments (away fouls >= 5)
  const homeBonusAdvantage = calculateWinProbability(100, 100, 300, 'in', 0, {
    awayFouls: 5,
    homeFouls: 2,
    homeTeamId: 'h1',
    awayTeamId: 'a1',
  })
  assert.ok(homeBonusAdvantage.homePct > 50)

  // Bonus foul penalty adjustments (home fouls >= 5)
  const awayBonusAdvantage = calculateWinProbability(100, 100, 300, 'in', 0, {
    awayFouls: 2,
    homeFouls: 5,
    homeTeamId: 'h1',
    awayTeamId: 'a1',
  })
  assert.ok(awayBonusAdvantage.homePct < 50)

  // Momentum scoring run: Home run > 4
  const homeRun = calculateWinProbability(100, 100, 300, 'in', 0, {
    scoringRun: { points: 10, opponentPoints: 0, teamId: 'h1' },
    homeTeamId: 'h1',
    awayTeamId: 'a1',
  })
  assert.ok(homeRun.homePct > 50)

  // Momentum scoring run: Away run > 4
  const awayRun = calculateWinProbability(100, 100, 300, 'in', 0, {
    scoringRun: { points: 12, opponentPoints: 2, teamId: 'a1' },
    homeTeamId: 'h1',
    awayTeamId: 'a1',
  })
  assert.ok(awayRun.homePct < 50)

  // Insurmountable lead under 20 seconds (lead >= 8)
  const lateSafeHome = calculateWinProbability(110, 100, 15, 'in')
  assert.equal(lateSafeHome.homePct, 99)
  assert.equal(lateSafeHome.awayPct, 1)

  // Insurmountable deficit under 20 seconds (lead <= -8)
  const lateSafeAway = calculateWinProbability(100, 110, 15, 'in')
  assert.equal(lateSafeAway.homePct, 1)
  assert.equal(lateSafeAway.awayPct, 99)

  // Extreme deficit overflow guard (expTerm > 700) with safeSec > 20
  const extremeLoss = calculateWinProbability(10, 1500, 25, 'in')
  assert.equal(extremeLoss.homePct, 1)
  assert.equal(extremeLoss.awayPct, 99)

  // Extreme lead underflow guard (expTerm < -700) with safeSec > 20
  const extremeWin = calculateWinProbability(1500, 10, 25, 'in')
  assert.equal(extremeWin.homePct, 99)
  assert.equal(extremeWin.awayPct, 1)

  // Defensive arithmetic guards: test sigma / expectedFinalDiff non-finite fallback
  const origSqrt = Math.sqrt
  try {
    Math.sqrt = () => NaN
    const nonFiniteHomeLead = calculateWinProbability(105, 100, 300, 'in')
    assert.equal(nonFiniteHomeLead.homePct, 75)
    assert.equal(nonFiniteHomeLead.awayPct, 25)

    const nonFiniteAwayLead = calculateWinProbability(100, 105, 300, 'in')
    assert.equal(nonFiniteAwayLead.homePct, 25)
    assert.equal(nonFiniteAwayLead.awayPct, 75)

    const nonFiniteTie = calculateWinProbability(100, 100, 300, 'in')
    assert.equal(nonFiniteTie.homePct, 50)
    assert.equal(nonFiniteTie.awayPct, 50)
  } finally {
    Math.sqrt = origSqrt
  }

  // Defensive arithmetic guard: test isNaN(liveProb) fallback
  const origExp = Math.exp
  try {
    Math.exp = () => NaN
    const nanProbRes = calculateWinProbability(105, 100, 300, 'in')
    assert.equal(nanProbRes.homePct, 50)
    assert.equal(nanProbRes.awayPct, 50)
  } finally {
    Math.exp = origExp
  }
})

test('Stage 1 Hardening: nbaHelpers.ts safeStorage strict limits, validation, and storage exception fallback', () => {
  // Disallowed key
  assert.equal(safeStorage.getItem('not_nba_key'), null)
  assert.equal(safeStorage.setItem('not_nba_key', 'val'), false)
  assert.equal(safeStorage.removeItem('not_nba_key'), false)

  // Key length > 32
  const longKey = 'nba_' + 'a'.repeat(35)
  assert.equal(safeStorage.getItem(longKey), null)
  assert.equal(safeStorage.setItem(longKey, 'val'), false)

  // Value length > 1024
  const longValue = 'x'.repeat(1025)
  assert.equal(safeStorage.setItem('nba_test_long', longValue), false)

  // Valid set, get, remove
  assert.equal(safeStorage.setItem('nba_hardening_key', 'valid_value'), true)
  assert.equal(safeStorage.getItem('nba_hardening_key'), 'valid_value')
  assert.equal(safeStorage.removeItem('nba_hardening_key'), true)
  assert.equal(safeStorage.getItem('nba_hardening_key'), null)

  // Test globalThis.localStorage branch (lines 347-348)
  const memMap = new Map()
  const mockStorage = {
    getItem: (k) => memMap.get(k) ?? null,
    setItem: (k, v) => memMap.set(k, v),
    removeItem: (k) => memMap.delete(k),
  }
  globalThis.localStorage = mockStorage
  try {
    assert.equal(safeStorage.setItem('nba_global_key', 'stored_global'), true)
    assert.equal(safeStorage.getItem('nba_global_key'), 'stored_global')
    assert.equal(safeStorage.removeItem('nba_global_key'), true)
  } finally {
    delete globalThis.localStorage
  }

  // Test policy access exception (lines 350-351)
  globalThis.window = {}
  Object.defineProperty(globalThis.window, 'localStorage', {
    get() {
      throw new Error('Access Denied by Policy')
    },
    configurable: true,
  })
  try {
    assert.equal(safeStorage.setItem('nba_policy_key', 'in_memory_only'), true)
    assert.equal(safeStorage.getItem('nba_policy_key'), 'in_memory_only')
    assert.equal(safeStorage.removeItem('nba_policy_key'), true)
  } finally {
    delete globalThis.window
  }

  // Test storage quota / security exception handling
  const mockThrowingStorage = {
    getItem() {
      throw new Error('Blocked')
    },
    setItem() {
      throw new Error('QuotaExceeded')
    },
    removeItem() {
      throw new Error('Blocked')
    },
  }
  globalThis.window = { localStorage: mockThrowingStorage }

  try {
    assert.equal(safeStorage.setItem('nba_quota_key', 'in_memory_val'), true)
    assert.equal(safeStorage.getItem('nba_quota_key'), 'in_memory_val')
    assert.equal(safeStorage.removeItem('nba_quota_key'), true)
  } finally {
    delete globalThis.window
  }
})

test('Stage 1 Hardening: espnApi.ts HTTP error, stale cache, live TTL, cache eviction, and abort handling', async () => {
  clearScoreboardCache()
  const originalFetch = globalThis.fetch

  try {
    // 1. HTTP 500 error triggers fallback to mock
    globalThis.fetch = async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    })

    const httpErrRes = await fetchNBAScoreboard('2026-10-25')
    assert.equal(httpErrRes.isCached, true)
    assert.equal(httpErrRes.sourceId, 'mock-redundancy')

    // 2. Successful fetch of a live game (state = 'in')
    clearScoreboardCache()
    const livePayload = {
      events: [
        {
          id: 'live-ev-1',
          name: 'Live Game',
          status: { period: 2, clock: 300, type: { state: 'in', completed: false } },
          competitions: [
            {
              id: 'comp-1',
              competitors: [
                { id: '1', homeAway: 'home', score: '55', team: { abbreviation: 'BOS' } },
                { id: '2', homeAway: 'away', score: '50', team: { abbreviation: 'DET' } },
              ],
            },
          ],
        },
      ],
    }

    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => livePayload,
    })

    const liveRes = await fetchNBAScoreboard('2026-10-26')
    assert.equal(liveRes.isCached, false)
    assert.equal(liveRes.data.events.length, 1)

    // 3. Stale cache fallback: advance Date.now past expiresAt (TTL is 10s = 10,000ms)
    const realDateNow = Date.now
    try {
      Date.now = () => realDateNow() + 30_000 // simulate 30s elapsed -> cache expired

      globalThis.fetch = async () => {
        throw new Error('503 Service Unavailable')
      }

      const staleRes = await fetchNBAScoreboard('2026-10-26')
      assert.equal(staleRes.isCached, true)
      assert.equal(staleRes.sourceId, 'client-cache-stale')
    } finally {
      Date.now = realDateNow
    }

    // 4. Successful fetch with AbortSignal (lines 279-297 res path)
    const normalSignal = new AbortController().signal
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => livePayload,
    })
    const signalRes = await fetchNBAScoreboard('2026-10-29', normalSignal)
    assert.equal(signalRes.isCached, false)

    // 5. Direct caller with signal rejects when executeFetch rethrows AbortError (lines 292-294)
    clearScoreboardCache()
    const abortErr = new Error('The operation was aborted.')
    abortErr.name = 'AbortError'
    globalThis.fetch = () => Promise.reject(abortErr)

    const directAbortCtrl = new AbortController()
    const directAbortPromise = fetchNBAScoreboard('2026-10-31', directAbortCtrl.signal)
    await assert.rejects(() => directAbortPromise, (e) => e.name === 'AbortError')

    // 6. In-flight request abortion
    clearScoreboardCache()
    let resolveSlowFetch
    const slowFetchPromise = new Promise((resolve) => {
      resolveSlowFetch = resolve
    })

    globalThis.fetch = () => slowFetchPromise

    const controller = new AbortController()
    const inFlightPromise = fetchNBAScoreboard('2026-10-27', controller.signal)
    controller.abort()

    await assert.rejects(
      () => inFlightPromise,
      (err) => err.name === 'AbortError'
    )
    resolveSlowFetch({ ok: true, status: 200, json: async () => ({ events: [] }) })

    // 7. Shared in-flight request: second caller with abort signal aborts
    clearScoreboardCache()
    let finishInFlight
    const pendingFetch = new Promise((resolve) => {
      finishInFlight = resolve
    })
    globalThis.fetch = () => pendingFetch

    const req1 = fetchNBAScoreboard('2026-10-28') // no signal
    const secondController = new AbortController()
    const req2 = fetchNBAScoreboard('2026-10-28', secondController.signal)

    secondController.abort()
    await assert.rejects(
      () => req2,
      (err) => err.name === 'AbortError'
    )

    finishInFlight({ ok: true, status: 200, json: async () => ({ events: [] }) })
    const res1 = await req1
    assert.ok(res1)

    // 8. Shared in-flight request: second caller with signal succeeds
    clearScoreboardCache()
    let finishSecondSuccess
    const pendingFetch2 = new Promise((resolve) => {
      finishSecondSuccess = resolve
    })
    globalThis.fetch = () => pendingFetch2

    const primaryReq = fetchNBAScoreboard('2026-10-28')
    const thirdController = new AbortController()
    const sharedWithSignal = fetchNBAScoreboard('2026-10-28', thirdController.signal)

    finishSecondSuccess({ ok: true, status: 200, json: async () => ({ events: [] }) })
    const [rPrimary, rShared] = await Promise.all([primaryReq, sharedWithSignal])
    assert.ok(rPrimary)
    assert.ok(rShared)

    // 9. Shared in-flight request: inFlight rejects with AbortError
    clearScoreboardCache()
    globalThis.fetch = () => Promise.reject(abortErr)

    const failReq1 = fetchNBAScoreboard('2026-10-28')
    const signalController4 = new AbortController()
    const failReq2 = fetchNBAScoreboard('2026-10-28', signalController4.signal)

    await assert.rejects(() => failReq1, (e) => e.name === 'AbortError')
    await assert.rejects(() => failReq2, (e) => e.name === 'AbortError')

    // 10. Max cache eviction branch (> 50 valid calendar entries across 2 months)
    clearScoreboardCache()
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ events: [] }),
    })

    // January has 31 days
    for (let day = 1; day <= 31; day++) {
      const d = day < 10 ? `0${day}` : `${day}`
      await fetchNBAScoreboard(`2026-01-${d}`)
    }
    // February has 28 days -> total 59 entries
    for (let day = 1; day <= 28; day++) {
      const d = day < 10 ? `0${day}` : `${day}`
      await fetchNBAScoreboard(`2026-02-${d}`)
    }
  } finally {
    globalThis.fetch = originalFetch
    clearScoreboardCache()
  }
})

test('Stage 1 Hardening: audioFeedback.ts Web Audio API execution, suspended state, webkitAudioContext, and node cleanup', () => {
  // In Node environment (window undefined), should safely return without throwing
  assert.doesNotThrow(() => {
    playWhistleSound()
    playSwishSound()
    playBuzzerSound()
    playTactileClick()
  })

  // Simulated browser environment with Web Audio API mock
  const createdNodes = []
  class MockParam {
    value = 0
    setValueAtTime() {}
    linearRampToValueAtTime() {}
    exponentialRampToValueAtTime() {}
  }
  class MockNode {
    type = 'sine'
    frequency = new MockParam()
    gain = new MockParam()
    Q = new MockParam()
    buffer = null
    onended = null
    connect() {}
    disconnect() {
      createdNodes.push('disconnected')
    }
    start() {}
    stop() {
      if (this.onended) this.onended()
    }
  }
  class MockBuffer {
    getChannelData() {
      return new Float32Array(100)
    }
  }
  class MockAudioContext {
    state = 'suspended'
    currentTime = 0
    sampleRate = 44100
    destination = {}
    createOscillator() {
      return new MockNode()
    }
    createGain() {
      return new MockNode()
    }
    createBiquadFilter() {
      return new MockNode()
    }
    createBuffer() {
      return new MockBuffer()
    }
    createBufferSource() {
      return new MockNode()
    }
    resume() {
      this.state = 'running'
      return Promise.reject(new Error('Policy catch test'))
    }
  }

  // Test webkitAudioContext fallback and suspended state
  globalThis.window = {
    webkitAudioContext: MockAudioContext,
  }

  try {
    assert.doesNotThrow(() => {
      playWhistleSound()
      playSwishSound()
      playBuzzerSound()
      playTactileClick()
    })
    assert.ok(createdNodes.length > 0, 'Audio nodes must execute cleanup and disconnect')
  } finally {
    delete globalThis.window
  }

  // Test closed audio context state
  class ClosedAudioContext extends MockAudioContext {
    state = 'closed'
  }
  globalThis.window = { AudioContext: ClosedAudioContext }
  try {
    assert.doesNotThrow(() => {
      playWhistleSound()
      playSwishSound()
      playBuzzerSound()
      playTactileClick()
    })
  } finally {
    delete globalThis.window
  }

  // Test when window exists but has neither AudioContext nor webkitAudioContext
  globalThis.window = {}
  try {
    assert.doesNotThrow(() => {
      playWhistleSound()
      playSwishSound()
      playBuzzerSound()
      playTactileClick()
    })
  } finally {
    delete globalThis.window
  }

  // Test suspended state with rejected resume promise to trigger .catch(() => {})
  class SuspendedRejectContext extends MockAudioContext {
    state = 'suspended'
    resume() {
      return Promise.reject(new Error('Autoplay policy prevented audio start'))
    }
  }
  globalThis.window = { AudioContext: SuspendedRejectContext }
  try {
    assert.doesNotThrow(() => {
      playWhistleSound()
    })
  } finally {
    delete globalThis.window
  }
})

test('Stage 1 Hardening: nbaHelpers.ts possession neutral, scoringRun <= 4 and undefined opponent points', () => {
  // Tipoff 0-0 with 2880s remaining and gameState === 'in' (hits second operand of pre-game condition)
  const tipoffLive = calculateWinProbability(0, 0, 2880, 'in', -4)
  assert.ok(tipoffLive.homePct > 50)
  assert.equal(tipoffLive.homePct + tipoffLive.awayPct, 100)

  // Neutral possession (neither home nor away)
  const neutralPoss = calculateWinProbability(100, 100, 300, 'in', 0, {
    possession: 'neutral',
    homeTeamId: 'h1',
    awayTeamId: 'a1',
  })
  assert.equal(neutralPoss.homePct, 50)

  // Scoring run diff <= 4 (does not trigger momentum)
  const smallRun = calculateWinProbability(100, 100, 300, 'in', 0, {
    scoringRun: { points: 4, opponentPoints: 2, teamId: 'h1' },
    homeTeamId: 'h1',
    awayTeamId: 'a1',
  })
  assert.equal(smallRun.homePct, 50)

  // Scoring run with undefined opponentPoints (falls back to 0)
  const runNoOpponent = calculateWinProbability(100, 100, 300, 'in', 0, {
    scoringRun: { points: 6, teamId: 'h1' },
    homeTeamId: 'h1',
    awayTeamId: 'a1',
  })
  assert.ok(runNoOpponent.homePct > 50)
})

test('Stage 1 Hardening: espnApi.ts fast-abort and inFlight reuse without signal', async () => {
  clearScoreboardCache()
  const originalFetch = globalThis.fetch

  try {
    // 1. Signal already aborted before calling fetchNBAScoreboard (line 155)
    const alreadyAborted = new AbortController()
    alreadyAborted.abort()
    await assert.rejects(
      () => fetchNBAScoreboard('2026-11-15', alreadyAborted.signal),
      (err) => err.name === 'AbortError'
    )

    // 2. InFlight request reuse without signal (line 164)
    let resolveFlight
    const slowPromise = new Promise((resolve) => {
      resolveFlight = resolve
    })
    globalThis.fetch = () => slowPromise

    const f1 = fetchNBAScoreboard('2026-11-16')
    const f2 = fetchNBAScoreboard('2026-11-16') // no signal, reuses f1
    resolveFlight({ ok: true, status: 200, json: async () => ({ events: null }) })

    const [r1, r2] = await Promise.all([f1, f2])
    assert.ok(r1)
    assert.ok(r2)
    assert.equal(r1.data.events.length > 0, true) // fell back to mock events because events was null

    // 3. Raw events with missing competitors and missing team objects
    clearScoreboardCache()
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        events: [
          {
            id: 'ev-sparse-1',
            competitions: [
              {
                id: 'comp-sparse',
                competitors: [
                  { homeAway: 'home' }, // no score, no team
                  { homeAway: 'away', score: 'invalid', team: {} },
                ],
              },
            ],
          },
          {
            id: 'ev-no-comps',
            // no competitions array
          },
        ],
      }),
    })
    const sparseRes = await fetchNBAScoreboard('2026-11-17')
    assert.equal(sparseRes.isCached, false)
    assert.equal(sparseRes.data.events.length, 2)
  } finally {
    globalThis.fetch = originalFetch
    clearScoreboardCache()
  }
})

test('Stage 1 Hardening: announcers.ts numeric options and officials extraction', () => {
  // Numeric options (gameIndex = 1)
  const crewNumOpt = resolveAnnouncingCrew({ broadcasts: [] }, 'BOS', 'DET', 1)
  assert.equal(crewNumOpt.network, 'NBC Sports Boston')

  // Morning / off-peak time window (h = 10, windowIndex remains -1)
  const offPeakCrew = resolveAnnouncingCrew(
    { broadcasts: [{ market: 'National', names: ['TNT'] }] },
    'MIA',
    'ORL',
    { gameDate: '2026-12-25T10:00Z' }
  )
  assert.equal(offPeakCrew.network, 'TNT Sports')

  // Afternoon time window (h = 18, windowIndex = 2)
  const afternoonCrew = resolveAnnouncingCrew(
    { broadcasts: [{ market: 'National', names: ['TNT'] }] },
    'MIA',
    'ORL',
    { gameDate: '2026-12-25T18:00Z' }
  )
  assert.equal(afternoonCrew.network, 'TNT Sports')

  // Invalid date string in competition
  const invalidDateCrew = resolveAnnouncingCrew(
    { broadcasts: [{ market: 'National', names: ['TNT'] }], date: 'not-a-valid-date' },
    'MIA',
    'ORL'
  )
  assert.equal(invalidDateCrew.network, 'TNT Sports')

  // Real officials in competition with displayName, fullName, and missing fallback
  const crewWithOfficials = resolveAnnouncingCrew(
    {
      broadcasts: [],
      officials: [
        { position: 'Referee', displayName: 'Scott Foster' },
        { position: 'Umpire 1', fullName: 'Tony Brothers' },
        { position: 'Umpire 2' },
      ],
    },
    'LAL',
    'GSW'
  )
  assert.equal(crewWithOfficials.officials[0].name, 'Scott Foster')
  assert.equal(crewWithOfficials.officials[0].role, 'Crew Chief')
  assert.equal(crewWithOfficials.officials[1].name, 'Tony Brothers')
  assert.equal(crewWithOfficials.officials[1].role, 'Referee')
  assert.equal(crewWithOfficials.officials[2].name, 'Official #3')
  assert.equal(crewWithOfficials.officials[2].role, 'Umpire')
})

test('Stage 1 Hardening: timezone.ts options and Date object handling', () => {
  // getTimeZoneAbbr with invalid Date object (line 75)
  assert.equal(getTimeZoneAbbr(new Date('invalid-time'), 'Europe/London'), 'BST')
  assert.equal(getTimeZoneAbbr(new Date('invalid-time'), 'America/New_York'), 'ET')

  // formatGameKickoff options: hour12 variations
  const us24h = formatGameKickoff('2026-10-21T23:00Z', 'America/New_York', { hour12: false })
  assert.match(us24h, /19:00/)

  const uk12h = formatGameKickoff('2026-10-21T23:00Z', 'Europe/London', { hour12: true })
  assert.match(uk12h, /12:00/)
})

test('Stage 1 Hardening: nbaHelpers.ts clock fallback and announcers unrecognized matchup', () => {
  // calculateSecondsRemaining with non-number clock
  const nanClockSecs = calculateSecondsRemaining({
    period: 2,
    clock: 'not-a-number',
    displayClock: '',
    type: { state: 'in' },
  })
  assert.equal(nanClockSecs, 1440) // 0 + (2 * 720)

  // Unrecognized matchup on national feed (skips national crew matching, falls through to default)
  const nonNbaMatchup = resolveAnnouncingCrew(
    { broadcasts: [{ market: 'National', names: ['ESPN'] }] },
    'XYZ',
    'ABC'
  )
  assert.equal(nonNbaMatchup.playByPlay, 'TBA')
  assert.equal(nonNbaMatchup.market, 'ESPN')
  assert.equal(nonNbaMatchup.network, 'ESPN')

  // Broadcast with empty names array
  const emptyNamesCrew = resolveAnnouncingCrew(
    { broadcasts: [{ names: [] }] },
    'DET',
    'BOS'
  )
  assert.equal(emptyNamesCrew.network, 'FanDuel Sports Network DET')

  // Broadcast with empty string in name
  const emptyStringNameCrew = resolveAnnouncingCrew(
    { broadcasts: [{ names: ['   '] }] },
    'DET',
    'BOS'
  )
  assert.equal(emptyStringNameCrew.network, 'FanDuel Sports Network DET')
})

