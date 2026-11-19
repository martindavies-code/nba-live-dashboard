import test from 'node:test'
import assert from 'node:assert/strict'
import {
  sanitizeDateParam,
  fetchNBAScoreboard,
  clearScoreboardCache,
  fetchNBAGameSummary,
  clearSummaryCache,
  parseSummaryPayload,
  mapEspnPlayToShot,
  MOCK_NBA_EVENTS,
} from './espnApi.ts'

test('sanitizeDateParam validates and normalizes date inputs', () => {
  assert.equal(sanitizeDateParam('2026-10-20'), '20261020')
  assert.equal(sanitizeDateParam('2024-04-14'), '20240414')
  assert.equal(sanitizeDateParam('20261020'), '20261020')

  // Malformed and invalid types
  assert.equal(sanitizeDateParam(''), null)
  assert.equal(sanitizeDateParam('2026/10/20'), null)
  assert.equal(sanitizeDateParam('invalid'), null)
  assert.equal(sanitizeDateParam('2026-1-1'), null)
  assert.equal(sanitizeDateParam(null), null)
  assert.equal(sanitizeDateParam(undefined), null)
  assert.equal(sanitizeDateParam(20261020), null)
  assert.equal(sanitizeDateParam({}), null)
})

test('fetchNBAScoreboard returns enriched scoreboard and utilizes TTL cache', async () => {
  clearScoreboardCache()
  const originalFetch = globalThis.fetch

  const mockPayload = {
    events: [
      {
        id: 'test-event-1',
        name: 'Boston Celtics at Detroit Pistons',
        status: { period: 4, clock: 200, type: { state: 'in', completed: false } },
        competitions: [
          {
            id: 'test-comp-1',
            broadcasts: [{ market: 'National', names: ['ABC'] }],
            competitors: [
              { id: '1', homeAway: 'home', score: '100', team: { id: '8', abbreviation: 'DET', displayName: 'Pistons' } },
              { id: '2', homeAway: 'away', score: '102', team: { id: '2', abbreviation: 'BOS', displayName: 'Celtics' } },
            ],
          },
        ],
      },
    ],
  }

  let fetchCallCount = 0
  globalThis.fetch = async () => {
    fetchCallCount++
    return {
      ok: true,
      status: 200,
      json: async () => mockPayload,
    }
  }

  try {
    // 1st call: Network fetch
    const res1 = await fetchNBAScoreboard('2026-10-20')
    assert.equal(res1.isCached, false)
    assert.equal(res1.data.events.length, 1)
    assert.equal(res1.data.events[0].competitions[0].announcingCrew.network, 'ABC')
    assert.equal(fetchCallCount, 1)

    // 2nd call: Cache hit (same date within TTL)
    const res2 = await fetchNBAScoreboard('2026-10-20')
    assert.equal(res2.isCached, true)
    assert.equal(res2.responseTimeMs, 0)
    assert.equal(fetchCallCount, 1) // Network fetch NOT called again
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('fetchNBAScoreboard handles network failures with fallback redundancy', async () => {
  clearScoreboardCache()
  const originalFetch = globalThis.fetch

  globalThis.fetch = async () => {
    throw new Error('Network offline or connection refused')
  }

  try {
    const res = await fetchNBAScoreboard()
    assert.equal(res.isCached, true)
    assert.equal(res.sourceId, 'mock-redundancy')
    assert.equal(res.data.events.length > 0, true)
    assert.deepEqual(res.data.events, MOCK_NBA_EVENTS)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('fetchNBAScoreboard re-throws AbortError when AbortSignal triggers', async () => {
  const originalFetch = globalThis.fetch

  globalThis.fetch = async () => {
    const abortErr = new Error('The user aborted a request.')
    abortErr.name = 'AbortError'
    throw abortErr
  }

  try {
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(
      async () => {
        await fetchNBAScoreboard('2026-10-20', controller.signal)
      },
      (err) => err.name === 'AbortError'
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('fetchNBAScoreboard safely handles malformed JSON response', async () => {
  clearScoreboardCache()
  const originalFetch = globalThis.fetch

  globalThis.fetch = async () => {
    return {
      ok: true,
      status: 200,
      json: async () => 'not a json object',
    }
  }

  try {
    const res = await fetchNBAScoreboard('2026-10-21')
    // Should gracefully fall back to mock redundancy instead of crashing
    assert.equal(res.isCached, true)
    assert.equal(res.sourceId, 'mock-redundancy')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('mapEspnPlayToShot excludes free throws and sentinel coordinates, and maps valid home/away shots', () => {
  const ctx = {
    awayTeamId: '29',
    homeTeamId: '5',
    awayAbbr: 'MEM',
    homeAbbr: 'CLE',
    athleteHeadshots: new Map([['101', 'https://a.espncdn.com/i/headshots/nba/players/full/101.png']]),
  }

  // Free throw excluded
  assert.equal(
    mapEspnPlayToShot(
      { shootingPlay: true, pointsAttempted: 1, text: 'Ja Morant makes free throw 1 of 2', coordinate: { x: 25, y: 15 } },
      ctx
    ),
    null
  )

  // Sentinel unmapped coordinate excluded
  assert.equal(
    mapEspnPlayToShot(
      { shootingPlay: true, pointsAttempted: 2, text: 'Turnover / unmapped shot', coordinate: { x: -214748340, y: 20 } },
      ctx
    ),
    null
  )

  // Valid away corner 3
  const awayShot = mapEspnPlayToShot(
    {
      id: 'p-away-3',
      shootingPlay: true,
      scoringPlay: true,
      pointsAttempted: 3,
      text: 'Desmond Bane makes 24-foot three point jumper',
      clock: { displayValue: '4:12' },
      period: { number: 2 },
      team: { id: '29' },
      participants: [{ athlete: { id: '101', displayName: 'Desmond Bane' } }],
      coordinate: { x: 3, y: 4 },
    },
    ctx
  )
  assert.ok(awayShot)
  assert.equal(awayShot.teamAbbr, 'MEM')
  assert.equal(awayShot.points, 3)
  assert.equal(awayShot.made, true)
  assert.equal(awayShot.zone, 'Left Corner 3')
  assert.equal(awayShot.x > 70, true) // Away shoots at right basket (86.5)
  assert.equal(awayShot.shooterPhoto, 'https://a.espncdn.com/i/headshots/nba/players/full/101.png')

  // Valid home Restricted Area layup
  const homeShot = mapEspnPlayToShot(
    {
      id: 'p-home-2',
      shootingPlay: true,
      scoringPlay: false,
      pointsAttempted: 2,
      text: 'Evan Mobley misses 2-foot driving layup',
      clock: { displayValue: '1:05' },
      period: { number: 4 },
      team: { id: '5' },
      coordinate: { x: 25, y: 2 },
    },
    ctx
  )
  assert.ok(homeShot)
  assert.equal(homeShot.teamAbbr, 'CLE')
  assert.equal(homeShot.points, 2)
  assert.equal(homeShot.made, false)
  assert.equal(homeShot.zone, 'Restricted Area')
  assert.equal(homeShot.x < 20, true) // Home shoots at left basket (7.5)
})

test('parseSummaryPayload extracts pre-game scouting splits and post-game box score & hustle metrics', () => {
  const prePayload = {
    header: {
      competitions: [
        {
          competitors: [
            { homeAway: 'away', team: { id: '29', abbreviation: 'MEM' } },
            { homeAway: 'home', team: { id: '5', abbreviation: 'CLE' } },
          ],
        },
      ],
    },
    boxscore: {
      teams: [
        {
          homeAway: 'away',
          team: { id: '29', abbreviation: 'MEM' },
          statistics: [
            { name: 'streak', displayValue: 'L2' },
            { name: 'Last Ten Games', displayValue: '5-5' },
            { name: 'avgPointsAgainst', displayValue: '115.2' },
          ],
        },
        {
          homeAway: 'home',
          team: { id: '5', abbreviation: 'CLE' },
          statistics: [
            { name: 'streak', displayValue: 'W6' },
            { name: 'Last Ten Games', displayValue: '9-1' },
            { name: 'avgPointsAgainst', displayValue: '108.9' },
          ],
        },
      ],
    },
    lastFiveGames: [
      {
        team: { id: '5', abbreviation: 'CLE' },
        events: [
          { gameResult: 'W', score: '120-108', opponent: { abbreviation: 'CHI' } },
        ],
      },
    ],
    injuries: [
      {
        team: { id: '29', abbreviation: 'MEM' },
        injuries: [
          { status: 'Out', details: { type: 'Knee' }, athlete: { displayName: 'Ty Jerome', position: { abbreviation: 'PG' } } },
        ],
      },
    ],
    seasonseries: [{ summary: 'CLE leads 1-0' }],
    predictor: { awayTeam: { gameProjection: '34.2' }, homeTeam: { gameProjection: '65.8' } },
  }

  const parsedPre = parseSummaryPayload('401910007', prePayload)
  assert.ok(parsedPre)
  assert.equal(parsedPre.awayTeam?.stats.streak, 'L2')
  assert.equal(parsedPre.awayTeam?.injuries[0]?.playerName, 'Ty Jerome')
  assert.equal(parsedPre.homeTeam?.lastFiveGames[0]?.result, 'W')
  assert.equal(parsedPre.seasonSeries, 'CLE leads 1-0')
  assert.equal(parsedPre.predictor?.homeWinPct, 65.8)

  const postPayload = {
    header: {
      competitions: [
        {
          competitors: [
            { homeAway: 'away', team: { id: '7', abbreviation: 'DEN' } },
            { homeAway: 'home', team: { id: '16', abbreviation: 'MIN' } },
          ],
        },
      ],
    },
    boxscore: {
      teams: [
        {
          homeAway: 'away',
          team: { id: '7', abbreviation: 'DEN' },
          statistics: [
            { name: 'pointsInPaint', displayValue: '48' },
            { name: 'leadChanges', displayValue: '12' },
          ],
        },
      ],
      players: [
        {
          team: { id: '7', abbreviation: 'DEN' },
          statistics: [
            {
              labels: ['MIN', 'FG', '3PT', 'FT', 'REB', 'AST', 'STL', 'BLK', 'TO', '+/-', 'PTS'],
              athletes: [
                {
                  didNotPlay: false,
                  starter: true,
                  athlete: { id: '3112335', displayName: 'Nikola Jokic', shortName: 'N. Jokic', headshot: 'https://a.espncdn.com/jokic.png' },
                  stats: ['37', '13-22', '2-5', '6-6', '14', '11', '2', '1', '3', '+12', '34'],
                },
                {
                  didNotPlay: true,
                  athlete: { id: '999', displayName: 'Inactive Player', shortName: 'I. Player' },
                  stats: [],
                },
              ],
            },
          ],
        },
      ],
    },
    gameInfo: {
      attendance: 19356,
      officials: [{ displayName: 'Zach Zarba' }],
    },
    plays: [
      {
        id: 'shot-1',
        shootingPlay: true,
        scoringPlay: true,
        pointsAttempted: 2,
        text: 'Nikola Jokic makes 5-foot hook shot',
        clock: { displayValue: '8:11' },
        period: { number: 3 },
        team: { id: '7' },
        participants: [{ athlete: { id: '3112335', displayName: 'Nikola Jokic' } }],
        coordinate: { x: 25, y: 5 },
      },
    ],
  }

  const parsedPost = parseSummaryPayload('401910002', postPayload)
  assert.ok(parsedPost)
  assert.equal(parsedPost.awayTeam?.stats.pointsInPaint, '48')
  assert.equal(parsedPost.awayTeam?.topPlayers.length, 1) // DNP skipped
  assert.equal(parsedPost.awayTeam?.topPlayers[0]?.pts, 34)
  assert.equal(parsedPost.attendance, 19356)
  assert.equal(parsedPost.shots.length, 1)
  assert.equal(parsedPost.shots[0]?.shooterPhoto, 'https://a.espncdn.com/jokic.png')
})

test('fetchNBAGameSummary short-circuits mock IDs, caches by state, deduplicates in-flight calls, and handles errors', async () => {
  clearSummaryCache()
  const originalFetch = globalThis.fetch
  let callCount = 0

  globalThis.fetch = async () => {
    callCount++
    await new Promise((r) => setTimeout(r, 20))
    return {
      ok: true,
      status: 200,
      json: async () => ({
        seasonseries: [{ summary: `Call #${callCount}` }],
        boxscore: { teams: [] },
      }),
    }
  }

  try {
    // 1. Explicit demo summary ID returns immediately with zero fetch calls when context matches
    const mockPre = await fetchNBAGameSummary('demo-mock-401909091', 'pre', undefined, {
      awayTeamId: '25',
      homeTeamId: '24',
      awayAbbr: 'OKC',
      homeAbbr: 'SAS',
    })
    assert.ok(mockPre)
    assert.equal(mockPre.provenance, 'demo')
    assert.equal(callCount, 0)

    // 2. Concurrent in-flight calls for the same event + state deduplicate to 1 network fetch
    const [a, b] = await Promise.all([
      fetchNBAGameSummary('9990001', 'pre'),
      fetchNBAGameSummary('9990001', 'pre'),
    ])
    assert.equal(callCount, 1)
    assert.equal(a?.seasonSeries, 'Call #1')
    assert.equal(b?.seasonSeries, 'Call #1')

    // 3. Cached hit within TTL for same gameState
    const cached = await fetchNBAGameSummary('9990001', 'pre')
    assert.equal(callCount, 1)
    assert.equal(cached?.seasonSeries, 'Call #1')

    // 4. Transition from 'pre' -> 'in' invalidates cache entry and triggers fresh fetch
    const transitioned = await fetchNBAGameSummary('9990001', 'in')
    assert.equal(callCount, 2)
    assert.equal(transitioned?.seasonSeries, 'Call #2')

    // 5. Non-ok HTTP response degrades gracefully to null without crashing
    clearSummaryCache()
    globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) })
    const missing = await fetchNBAGameSummary('9990002', 'post')
    assert.equal(missing, null)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('P1 Regression: Real ESPN event IDs 401909091 (MIN @ MIA) and 401909092 (GS @ LAL) perform network requests and return requested teams', async () => {
  clearSummaryCache()
  const originalFetch = globalThis.fetch
  const requestedUrls = []

  const payloadsByEvent = {
    '401909091': {
      header: {
        competitions: [
          {
            competitors: [
              { homeAway: 'away', team: { id: '16', abbreviation: 'MIN' } },
              { homeAway: 'home', team: { id: '14', abbreviation: 'MIA' } },
            ],
          },
        ],
      },
      boxscore: {
        teams: [
          {
            homeAway: 'away',
            team: { id: '16', abbreviation: 'MIN' },
            statistics: [
              { name: 'fieldGoalsMade-fieldGoalsAttempted', displayValue: '46-98' },
              { name: 'fieldGoalPct', displayValue: '46.9' },
              { name: 'threePointFieldGoalsMade-threePointFieldGoalsAttempted', displayValue: '21-50' },
              { name: 'threePointFieldGoalPct', displayValue: '42.0' },
              { name: 'freeThrowsMade-freeThrowsAttempted', displayValue: '18-29' },
              { name: 'freeThrowPct', displayValue: '62.1' },
            ],
          },
          {
            homeAway: 'home',
            team: { id: '14', abbreviation: 'MIA' },
            statistics: [
              { name: 'fieldGoalsMade-fieldGoalsAttempted', displayValue: '38-86' },
              { name: 'fieldGoalPct', displayValue: '44.2' },
            ],
          },
        ],
      },
    },
    '401909092': {
      header: {
        competitions: [
          {
            competitors: [
              { homeAway: 'away', team: { id: '9', abbreviation: 'GS' } },
              { homeAway: 'home', team: { id: '13', abbreviation: 'LAL' } },
            ],
          },
        ],
      },
      boxscore: {
        teams: [
          {
            homeAway: 'away',
            team: { id: '9', abbreviation: 'GS' },
            statistics: [
              { name: 'fieldGoalsMade-fieldGoalsAttempted', displayValue: '40-90' },
              { name: 'fieldGoalPct', displayValue: '44.4' },
            ],
          },
          {
            homeAway: 'home',
            team: { id: '13', abbreviation: 'LAL' },
            statistics: [
              { name: 'fieldGoalsMade-fieldGoalsAttempted', displayValue: '47-88' },
              { name: 'fieldGoalPct', displayValue: '53.4' },
            ],
          },
        ],
      },
    },
  }

  globalThis.fetch = async (url) => {
    const urlStr = String(url)
    requestedUrls.push(urlStr)
    const eventMatch = urlStr.match(/event=(\d+)/)
    const eventId = eventMatch ? eventMatch[1] : ''
    return {
      ok: true,
      status: 200,
      json: async () => payloadsByEvent[eventId] || {},
    }
  }

  try {
    const minMia = await fetchNBAGameSummary('401909091', 'post', undefined, {
      awayTeamId: '16',
      homeTeamId: '14',
      awayAbbr: 'MIN',
      homeAbbr: 'MIA',
    })
    assert.equal(requestedUrls.length, 1, '401909091 must make a real network request instead of returning fabricated mock')
    assert.ok(minMia)
    assert.equal(minMia.awayTeam?.abbreviation, 'MIN')
    assert.equal(minMia.homeTeam?.abbreviation, 'MIA')
    assert.equal(minMia.awayTeam?.stats.fieldGoalPct, '46.9')
    assert.equal(minMia.awayTeam?.stats.threePointPct, '42.0')
    assert.equal(minMia.awayTeam?.stats.freeThrowPct, '62.1')

    const gsLal = await fetchNBAGameSummary('401909092', 'post', undefined, {
      awayTeamId: '9',
      homeTeamId: '13',
      awayAbbr: 'GSW',
      homeAbbr: 'LAL',
    })
    assert.equal(requestedUrls.length, 2, '401909092 must make a real network request instead of returning fabricated mock')
    assert.ok(gsLal)
    assert.equal(gsLal.awayTeam?.abbreviation, 'GS')
    assert.equal(gsLal.homeTeam?.abbreviation, 'LAL')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('P1 Regression: parseSummaryPayload maps ESPN turnoverPoints (Points Conceded Off Turnovers) and distinguishes player vs total turnovers (401910002 NY @ TOR)', () => {
  const nyTorPayload = {
    header: {
      competitions: [
        {
          competitors: [
            { homeAway: 'away', team: { id: '18', abbreviation: 'NY' } },
            { homeAway: 'home', team: { id: '28', abbreviation: 'TOR' } },
          ],
        },
      ],
    },
    boxscore: {
      teams: [
        {
          homeAway: 'away',
          team: { id: '18', abbreviation: 'NY' },
          statistics: [
            { name: 'turnovers', displayValue: '12', label: 'Turnovers', abbreviation: 'TO' },
            { name: 'teamTurnovers', displayValue: '1', label: 'Team Turnovers', abbreviation: 'TTO' },
            { name: 'totalTurnovers', displayValue: '13', label: 'Total Turnovers', abbreviation: 'ToTO' },
            { name: 'turnoverPoints', displayValue: '22', label: 'Points Conceded Off Turnovers', abbreviation: 'Points Conceded Off Turnovers' },
          ],
        },
        {
          homeAway: 'home',
          team: { id: '28', abbreviation: 'TOR' },
          statistics: [
            { name: 'turnovers', displayValue: '5', label: 'Turnovers', abbreviation: 'TO' },
            { name: 'teamTurnovers', displayValue: '1', label: 'Team Turnovers', abbreviation: 'TTO' },
            { name: 'totalTurnovers', displayValue: '6', label: 'Total Turnovers', abbreviation: 'ToTO' },
            { name: 'turnoverPoints', displayValue: '11', label: 'Points Conceded Off Turnovers', abbreviation: 'Points Conceded Off Turnovers' },
          ],
        },
      ],
    },
  }

  const parsed = parseSummaryPayload('401910002', nyTorPayload)
  assert.ok(parsed)
  assert.equal(parsed.awayTeam?.stats.pointsConcededOffTurnovers, '22')
  assert.equal(parsed.homeTeam?.stats.pointsConcededOffTurnovers, '11')
  assert.equal(parsed.awayTeam?.stats.pointsScoredOffTurnovers, '11')
  assert.equal(parsed.homeTeam?.stats.pointsScoredOffTurnovers, '22')
  assert.equal(parsed.awayTeam?.stats.totalTurnovers, '13')
  assert.equal(parsed.homeTeam?.stats.totalTurnovers, '6')
  assert.equal(parsed.awayTeam?.stats.playerTurnovers, '12')
  assert.equal(parsed.homeTeam?.stats.playerTurnovers, '5')
})

test('P1 Regression: Deferred pre/in/post requests for the same event do not coalesce across states in either resolution order', async () => {
  clearSummaryCache()
  const originalFetch = globalThis.fetch

  try {
    // Order 1: pre resolves before post
    const resolvers1 = []
    globalThis.fetch = () =>
      new Promise((resolve) => {
        const idx = resolvers1.length + 1
        resolvers1.push(() =>
          resolve({
            ok: true,
            status: 200,
            json: async () => ({
              seasonseries: [{ summary: `Order1-Call-${idx}` }],
              boxscore: { teams: [] },
            }),
          })
        )
      })

    const prePromise1 = fetchNBAGameSummary('audit-transition', 'pre')
    const postPromise1 = fetchNBAGameSummary('audit-transition', 'post')

    assert.equal(resolvers1.length, 2, 'Concurrent pre and post calls must trigger separate network requests')
    resolvers1[0]()
    resolvers1[1]()
    const [preRes1, postRes1] = await Promise.all([prePromise1, postPromise1])
    assert.equal(preRes1?.seasonSeries, 'Order1-Call-1')
    assert.equal(postRes1?.seasonSeries, 'Order1-Call-2')
    assert.equal(preRes1?.gameState, 'pre')
    assert.equal(postRes1?.gameState, 'post')

    // Order 2: post resolves before pre
    clearSummaryCache()
    const resolvers2 = []
    globalThis.fetch = () =>
      new Promise((resolve) => {
        const idx = resolvers2.length + 1
        resolvers2.push(() =>
          resolve({
            ok: true,
            status: 200,
            json: async () => ({
              seasonseries: [{ summary: `Order2-Call-${idx}` }],
              boxscore: { teams: [] },
            }),
          })
        )
      })

    const prePromise2 = fetchNBAGameSummary('audit-transition-2', 'pre')
    const postPromise2 = fetchNBAGameSummary('audit-transition-2', 'post')

    assert.equal(resolvers2.length, 2)
    // Resolve post (index 1) first, then pre (index 0)
    resolvers2[1]()
    resolvers2[0]()
    const [preRes2, postRes2] = await Promise.all([prePromise2, postPromise2])
    assert.equal(preRes2?.seasonSeries, 'Order2-Call-1')
    assert.equal(postRes2?.seasonSeries, 'Order2-Call-2')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('P1 Regression: Subscriber-isolated cancellation — aborting first, second, or all consumers', async () => {
  clearSummaryCache()
  const originalFetch = globalThis.fetch

  try {
    let underlyingAborted = false
    let resolveNetwork
    globalThis.fetch = (_url, opts) => {
      opts?.signal?.addEventListener('abort', () => {
        underlyingAborted = true
      })
      return new Promise((resolve, reject) => {
        opts?.signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted.')
          err.name = 'AbortError'
          reject(err)
        })
        resolveNetwork = () =>
          resolve({
            ok: true,
            status: 200,
            json: async () => ({
              seasonseries: [{ summary: 'Shared-In-State-Result' }],
              boxscore: { teams: [] },
            }),
          })
      })
    }

    // 1. Caller A attaches signal and aborts; Caller B has no signal and must still succeed
    const controllerA = new AbortController()
    const promiseA = fetchNBAGameSummary('abort-shared-1', 'in', controllerA.signal)
    const promiseB = fetchNBAGameSummary('abort-shared-1', 'in')

    controllerA.abort()
    await assert.rejects(promiseA, (err) => err.name === 'AbortError')
    assert.equal(underlyingAborted, false, 'Underlying shared request must NOT abort while Caller B is still subscribed')

    resolveNetwork()
    const resB = await promiseB
    assert.equal(resB?.seasonSeries, 'Shared-In-State-Result')

    // 2. Caller A and Caller B both attach signals; Caller B aborts while Caller A succeeds
    clearSummaryCache()
    underlyingAborted = false
    const controllerA2 = new AbortController()
    const controllerB2 = new AbortController()
    const promiseA2 = fetchNBAGameSummary('abort-shared-2', 'in', controllerA2.signal)
    const promiseB2 = fetchNBAGameSummary('abort-shared-2', 'in', controllerB2.signal)

    controllerB2.abort()
    await assert.rejects(promiseB2, (err) => err.name === 'AbortError')
    assert.equal(underlyingAborted, false)

    resolveNetwork()
    const resA2 = await promiseA2
    assert.equal(resA2?.seasonSeries, 'Shared-In-State-Result')

    // 3. When all subscribers abort, the underlying fetch is aborted
    clearSummaryCache()
    underlyingAborted = false
    const controllerA3 = new AbortController()
    const controllerB3 = new AbortController()
    const promiseA3 = fetchNBAGameSummary('abort-shared-3', 'in', controllerA3.signal)
    const promiseB3 = fetchNBAGameSummary('abort-shared-3', 'in', controllerB3.signal)

    controllerA3.abort()
    controllerB3.abort()
    await assert.rejects(promiseA3, (err) => err.name === 'AbortError')
    await assert.rejects(promiseB3, (err) => err.name === 'AbortError')
    assert.equal(underlyingAborted, true, 'Underlying request must abort when all subscribers abort')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('P1 Regression: Failed transition refresh does not return cached data from a previous gameState, and clearSummaryCache invalidates late responses', async () => {
  clearSummaryCache()
  const originalFetch = globalThis.fetch

  try {
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        seasonseries: [{ summary: 'Pre-Game-Scouting' }],
        boxscore: { teams: [] },
      }),
    })

    const preData = await fetchNBAGameSummary('transition-event-1', 'pre')
    assert.equal(preData?.seasonSeries, 'Pre-Game-Scouting')

    // Now transition to 'in' and 'post' while network fails
    globalThis.fetch = async () => {
      throw new Error('Network error during state transition')
    }

    const failedIn = await fetchNBAGameSummary('transition-event-1', 'in')
    const failedPost = await fetchNBAGameSummary('transition-event-1', 'post')
    assert.equal(failedIn, null, 'Failed live transition must NOT return pre-game cached summary')
    assert.equal(failedPost, null, 'Failed post transition must NOT return pre-game cached summary')

    // Late response after clearSummaryCache must not populate cache
    clearSummaryCache()
    let resolveLate
    let fetchCount = 0
    globalThis.fetch = () => {
      fetchCount++
      const currentCall = fetchCount
      return new Promise((resolve) => {
        resolveLate = () =>
          resolve({
            ok: true,
            status: 200,
            json: async () => ({
              seasonseries: [{ summary: `Late-Call-${currentCall}` }],
              boxscore: { teams: [] },
            }),
          })
      })
    }

    const latePromise = fetchNBAGameSummary('late-clear-event', 'pre')
    clearSummaryCache()
    resolveLate()
    await latePromise

    // Next call must trigger a fresh network fetch because the pre-clear response was from an old cache epoch
    const nextPromise = fetchNBAGameSummary('late-clear-event', 'pre')
    resolveLate()
    const nextRes = await nextPromise
    assert.equal(fetchCount, 2, 'Response from before clearSummaryCache() must not populate the cache')
    assert.equal(nextRes?.seasonSeries, 'Late-Call-2')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('P1 Follow-Up Regression: parseSummaryPayload and fetchNBAGameSummary reject mismatched event IDs, top-level vs competition ID conflicts, wrong game states, and empty JSON', async () => {
  clearSummaryCache()
  const originalFetch = globalThis.fetch

  const memCleContext = {
    awayTeamId: '29',
    homeTeamId: '5',
    awayAbbr: 'MEM',
    homeAbbr: 'CLE',
  }

  const makeMemClePrePayload = (headerId = '401910007', compId = '401910007', state = 'pre') => ({
    header: {
      id: headerId,
      competitions: [
        {
          id: compId,
          status: {
            type: { state, completed: state === 'post' },
          },
          competitors: [
            { homeAway: 'away', team: { id: '29', abbreviation: 'MEM' } },
            { homeAway: 'home', team: { id: '5', abbreviation: 'CLE' } },
          ],
        },
      ],
    },
    leaders: [
      {
        team: { id: '29', abbreviation: 'MEM' },
        leaders: [
          {
            name: 'pointsPerGame',
            displayName: 'Points Per Game',
            leaders: [{ displayValue: '25.4', value: 25.4, athlete: { id: '4278', displayName: 'Ty Jerome', shortName: 'T. Jerome', fullName: 'Ty Jerome' } }],
          },
        ],
      },
    ],
    boxscore: {
      teams: [
        { homeAway: 'away', team: { id: '29', abbreviation: 'MEM' }, statistics: [{ name: 'avgPointsAgainst', displayValue: '115.2' }] },
        { homeAway: 'home', team: { id: '5', abbreviation: 'CLE' }, statistics: [{ name: 'avgPointsAgainst', displayValue: '108.9' }] },
      ],
    },
  })

  // 1. Wrong event ID with matching teams (401910007 returned when requesting 401999999)
  assert.equal(
    parseSummaryPayload('401999999', makeMemClePrePayload('401910007', '401910007', 'pre'), memCleContext, 'pre'),
    null,
    'Must reject summary whose header.id / competition.id does not match requested eventId'
  )

  // 2. Explicit OTHER_EVENT ID
  assert.equal(
    parseSummaryPayload('401910007', makeMemClePrePayload('OTHER_EVENT', 'OTHER_EVENT', 'post'), memCleContext, 'post'),
    null,
    'Must reject summary with explicit OTHER_EVENT header ID'
  )

  // 3. Top-level header.id vs header.competitions[0].id conflict
  assert.equal(
    parseSummaryPayload('401910007', makeMemClePrePayload('401910007', '401999888', 'pre'), memCleContext, 'pre'),
    null,
    'Must reject payload with conflicting header.id and header.competitions[0].id'
  )

  // 4. Pre payload delivered to in or post consumer must be rejected (never relabeled as live/post)
  assert.equal(
    parseSummaryPayload('401910007', makeMemClePrePayload('401910007', '401910007', 'pre'), memCleContext, 'in'),
    null,
    'Explicit pre summary must not be accepted for in-game consumer'
  )
  assert.equal(
    parseSummaryPayload('401910007', makeMemClePrePayload('401910007', '401910007', 'pre'), memCleContext, 'post'),
    null,
    'Explicit pre summary must not be accepted for post-game consumer'
  )

  // 5. In-game payload delivered to final (post) consumer must be rejected
  assert.equal(
    parseSummaryPayload('401910007', makeMemClePrePayload('401910007', '401910007', 'in'), memCleContext, 'post'),
    null,
    'Explicit in-game summary must not be accepted as final post-game summary'
  )

  // 6. Correct matching post response is accepted with live provenance
  const validPost = parseSummaryPayload('401910007', makeMemClePrePayload('401910007', '401910007', 'post'), memCleContext, 'post')
  assert.ok(validPost, 'Matching event ID and post state must be accepted')
  assert.equal(validPost.eventId, '401910007')
  assert.equal(validPost.gameState, 'post')
  assert.equal(validPost.provenance, 'live')
  assert.equal(validPost.isStale, false)

  // 7. Conservative missing-metadata & empty JSON policy:
  // Empty {} successful JSON must be rejected (never live/fresh provenance)
  assert.equal(
    parseSummaryPayload('401910007', {}, memCleContext, 'post'),
    null,
    'Empty {} JSON payload must be rejected instead of returning false live/fresh summary'
  )
  // Headerless payload whose teams do not match requested context must be rejected even if seasonseries is present
  assert.equal(
    parseSummaryPayload(
      '401910007',
      {
        seasonseries: [{ summary: 'OKC leads 2-0' }],
        boxscore: {
          teams: [
            { homeAway: 'away', team: { id: '25', abbreviation: 'OKC' }, statistics: [{ name: 'fieldGoalPct', displayValue: '49.1' }] },
          ],
        },
      },
      memCleContext,
      'post'
    ),
    null,
    'Headerless payload with conflicting teams must be rejected'
  )
  // Headerless payload WITH valid matching team stats is accepted conservatively
  const partialNoHeader = parseSummaryPayload(
    '401910007',
    {
      boxscore: {
        teams: [
          { homeAway: 'away', team: { id: '29', abbreviation: 'MEM' }, statistics: [{ name: 'fieldGoalPct', displayValue: '47.5' }] },
        ],
      },
    },
    memCleContext,
    'post'
  )
  assert.ok(partialNoHeader, 'Payload omitting optional header metadata with valid matching team content is conservatively accepted')

  // 8. End-to-end fetchNBAGameSummary: lagging pre response for post consumer returns null (no false live provenance, no cache write)
  let fetchCalls = 0
  try {
    globalThis.fetch = async () => {
      fetchCalls++
      return {
        ok: true,
        status: 200,
        json: async () => makeMemClePrePayload('401910007', '401910007', 'pre'),
      }
    }
    const rejectedPost = await fetchNBAGameSummary('401910007', 'post', undefined, memCleContext)
    assert.equal(rejectedPost, null, 'Lagging pre summary returned for post request must resolve null, not live/post')

    // Subsequent call must retry network (rejected payload must not have been cached)
    const secondTry = await fetchNBAGameSummary('401910007', 'post', undefined, memCleContext)
    assert.equal(secondTry, null)
    assert.equal(fetchCalls, 2, 'Rejected mismatched-state response must not be cached')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('P2 Follow-Up Regression: Late completion of an aborted obsolete request never overwrites a newer cache entry (and produces zero unhandled rejections)', async () => {
  clearSummaryCache()
  const originalFetch = globalThis.fetch
  const unhandled = []
  const onUnhandled = (reason) => unhandled.push(reason)
  process.on('unhandledRejection', onUnhandled)

  try {
    // Scenario 1: Request A aborted -> Request B resolves 'fresh' -> Request A's deferred fetch resolves 'obsolete'
    const deferredFetches = []
    globalThis.fetch = () =>
      new Promise((resolve) => {
        deferredFetches.push(resolve)
      })

    const controllerA = new AbortController()
    const promiseA = fetchNBAGameSummary('late-aborted', 'post', controllerA.signal)
    assert.equal(deferredFetches.length, 1)

    controllerA.abort()
    await assert.rejects(promiseA, (err) => err.name === 'AbortError')

    const promiseB = fetchNBAGameSummary('late-aborted', 'post')
    assert.equal(deferredFetches.length, 2)

    // Resolve B with 'fresh'
    deferredFetches[1]({
      ok: true,
      status: 200,
      json: async () => ({
        seasonseries: [{ summary: 'FRESH_RESULT_B' }],
        boxscore: { teams: [] },
      }),
    })
    const resB = await promiseB
    assert.equal(resB?.seasonSeries, 'FRESH_RESULT_B')

    // Now resolve obsolete aborted A with 'obsolete'
    deferredFetches[0]({
      ok: true,
      status: 200,
      json: async () => ({
        seasonseries: [{ summary: 'OBSOLETE_RESULT_A' }],
        boxscore: { teams: [] },
      }),
    })
    await new Promise((r) => setTimeout(r, 30))

    // Reading same event/state must return cached FRESH_RESULT_B, NOT OBSOLETE_RESULT_A
    const cachedAfter = await fetchNBAGameSummary('late-aborted', 'post')
    assert.equal(deferredFetches.length, 2, 'Should read directly from cache')
    assert.equal(cachedAfter?.seasonSeries, 'FRESH_RESULT_B', 'Aborted obsolete Request A must NOT overwrite Request B cache entry')

    // Scenario 2: Aborted Request A's deferred response.json() body resolves AFTER Request B writes 'fresh'
    clearSummaryCache()
    let resolveBodyA
    let callIdx = 0
    globalThis.fetch = async () => {
      callIdx++
      if (callIdx === 1) {
        return {
          ok: true,
          status: 200,
          json: () =>
            new Promise((resolve) => {
              resolveBodyA = () => resolve({ seasonseries: [{ summary: 'OBSOLETE_BODY_A' }], boxscore: { teams: [] } })
            }),
        }
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ seasonseries: [{ summary: 'FRESH_BODY_B' }], boxscore: { teams: [] } }),
      }
    }

    const ctrlBodyA = new AbortController()
    const pBodyA = fetchNBAGameSummary('late-aborted-body', 'post', ctrlBodyA.signal)
    await new Promise((r) => setTimeout(r, 10))
    ctrlBodyA.abort()
    await assert.rejects(pBodyA, (err) => err.name === 'AbortError')

    const resBodyB = await fetchNBAGameSummary('late-aborted-body', 'post')
    assert.equal(resBodyB?.seasonSeries, 'FRESH_BODY_B')

    resolveBodyA()
    await new Promise((r) => setTimeout(r, 30))

    const cachedBodyAfter = await fetchNBAGameSummary('late-aborted-body', 'post')
    assert.equal(cachedBodyAfter?.seasonSeries, 'FRESH_BODY_B', 'Late aborted response.json() must NOT overwrite newer cache entry')

    // Scenario 3: Aborted Request A resolves BEFORE Request B finishes -> must not populate cache or break B
    clearSummaryCache()
    const deferred3 = []
    globalThis.fetch = () =>
      new Promise((resolve) => {
        deferred3.push(resolve)
      })
    const ctrl3 = new AbortController()
    const p3A = fetchNBAGameSummary('late-aborted-order', 'post', ctrl3.signal)
    ctrl3.abort()
    await assert.rejects(p3A, (err) => err.name === 'AbortError')

    const p3B = fetchNBAGameSummary('late-aborted-order', 'post')
    deferred3[0]({
      ok: true,
      status: 200,
      json: async () => ({ seasonseries: [{ summary: 'OBSOLETE_BEFORE_B' }], boxscore: { teams: [] } }),
    })
    await new Promise((r) => setTimeout(r, 20))
    deferred3[1]({
      ok: true,
      status: 200,
      json: async () => ({ seasonseries: [{ summary: 'FRESH_AFTER_A' }], boxscore: { teams: [] } }),
    })
    const res3B = await p3B
    assert.equal(res3B?.seasonSeries, 'FRESH_AFTER_A')
    const cached3 = await fetchNBAGameSummary('late-aborted-order', 'post')
    assert.equal(cached3?.seasonSeries, 'FRESH_AFTER_A')

    // Scenario 4: Aborted sole request with no Request B must NOT populate cache when it resolves late
    clearSummaryCache()
    let resolveSoleA
    let soleCalls = 0
    globalThis.fetch = () => {
      soleCalls++
      const n = soleCalls
      if (n === 1) {
        return new Promise((resolve) => {
          resolveSoleA = () =>
            resolve({
              ok: true,
              status: 200,
              json: async () => ({ seasonseries: [{ summary: 'OBSOLETE_SOLE' }], boxscore: { teams: [] } }),
            })
        })
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ seasonseries: [{ summary: 'FRESH_SECOND_CALL' }], boxscore: { teams: [] } }),
      })
    }
    const ctrlSole = new AbortController()
    const pSole = fetchNBAGameSummary('sole-aborted', 'post', ctrlSole.signal)
    ctrlSole.abort()
    await assert.rejects(pSole, (err) => err.name === 'AbortError')
    resolveSoleA()
    await new Promise((r) => setTimeout(r, 30))

    const resSoleNext = await fetchNBAGameSummary('sole-aborted', 'post')
    assert.equal(soleCalls, 2, 'Aborted sole request must not populate cache')
    assert.equal(resSoleNext?.seasonSeries, 'FRESH_SECOND_CALL')

    await new Promise((r) => setTimeout(r, 20))
    assert.equal(unhandled.length, 0, `Expected zero unhandled rejections, got ${unhandled.length}`)
  } finally {
    process.off('unhandledRejection', onUnhandled)
    globalThis.fetch = originalFetch
  }
})

test('P2 Follow-Up Regression: parseBoxPlayers preserves null for missing/placeholder/malformed cells, preserves explicit 0/0-0/negative +/-, and sorts unknown PTS after known PTS', () => {
  const payload = {
    header: {
      id: '401910999',
      competitions: [
        {
          id: '401910999',
          status: { type: { state: 'post', completed: true } },
          competitors: [
            { homeAway: 'away', team: { id: '7', abbreviation: 'DEN' } },
            { homeAway: 'home', team: { id: '16', abbreviation: 'MIN' } },
          ],
        },
      ],
    },
    boxscore: {
      players: [
        {
          team: { id: '7', abbreviation: 'DEN' },
          statistics: [
            {
              // Notice '3PT' and 'FT' columns are intentionally omitted from labels
              labels: ['MIN', 'FG', 'REB', 'AST', 'STL', 'BLK', 'TO', '+/-', 'PTS'],
              athletes: [
                {
                  // Unknown PTS ('--'), malformed REB ('12bad'), blank FG, placeholder +/-
                  didNotPlay: false,
                  starter: true,
                  athlete: { id: 'p-unknown', displayName: 'Unknown Scorer', shortName: 'U. Scorer' },
                  stats: ['--', '', '12bad', '5', 'N/A', null, '2', '--', '--'],
                },
                {
                  // Explicit genuine zero PTS, explicit '0-0' FG, real negative +/- '-4'
                  didNotPlay: false,
                  starter: false,
                  athlete: { id: 'p-zero', displayName: 'Zero Scorer', shortName: 'Z. Scorer' },
                  stats: ['11', '0-0', '3', '0', '0', '0', '0', '-4', '0'],
                },
                {
                  // Truncated stats row (only MIN, FG, REB present; AST..PTS missing)
                  didNotPlay: false,
                  starter: false,
                  athlete: { id: 'p-trunc', displayName: 'Truncated Row', shortName: 'T. Row' },
                  stats: ['18', '4-9', '7'],
                },
                {
                  // Valid full row with 22 pts and malformed FG '9-2' (made > attempted)
                  didNotPlay: false,
                  starter: true,
                  athlete: { id: 'p-star', displayName: 'Star Player', shortName: 'S. Player' },
                  stats: ['35', '9-2', '8', '6', '1', '0', '2', '+10', '22'],
                },
                {
                  // DNP row skipped
                  didNotPlay: true,
                  athlete: { id: 'p-dnp', displayName: 'Did Not Play', shortName: 'D. Play' },
                  stats: [],
                },
              ],
            },
          ],
        },
      ],
    },
  }

  const parsed = parseSummaryPayload('401910999', payload, { awayTeamId: '7', homeTeamId: '16' }, 'post')
  assert.ok(parsed)
  const players = parsed.awayTeam?.topPlayers || []
  assert.equal(players.length, 4, 'DNP player must be excluded while 4 active/partial rows remain')

  // Sort policy: known numeric PTS (22, then 0) MUST sort ahead of unknown (null) PTS
  assert.equal(players[0].id, 'p-star')
  assert.equal(players[1].id, 'p-zero', 'Genuine 0-point player must rank ahead of unknown-PTS players')

  // Check Star Player: valid 22 PTS, malformed FG '9-2' (made > att) -> null, omitted 3PT/FT -> null
  assert.equal(players[0].pts, 22)
  assert.equal(players[0].fg, null, 'Impossible FG made > attempted must parse as null')
  assert.equal(players[0].threePt, null, 'Omitted 3PT column must parse as null, not 0-0')
  assert.equal(players[0].ft, null, 'Omitted FT column must parse as null, not 0-0')
  assert.equal(players[0].plusMinus, '+10')

  // Check Zero Scorer: genuine 0, '0-0', and negative '-4' preserved
  assert.equal(players[1].min, '11')
  assert.equal(players[1].pts, 0)
  assert.equal(players[1].reb, 3)
  assert.equal(players[1].ast, 0)
  assert.equal(players[1].fg, '0-0')
  assert.equal(players[1].plusMinus, '-4')

  // Check Unknown Scorer: '--', '', '12bad', 'N/A', null all become null (never 0 or 12)
  const unknown = players.find((p) => p.id === 'p-unknown')
  assert.ok(unknown)
  assert.equal(unknown.min, null)
  assert.equal(unknown.fg, null)
  assert.equal(unknown.reb, null, 'Malformed numeric prefix 12bad must parse as null, not 12')
  assert.equal(unknown.ast, 5)
  assert.equal(unknown.stl, null)
  assert.equal(unknown.blk, null)
  assert.equal(unknown.tov, 2)
  assert.equal(unknown.plusMinus, null)
  assert.equal(unknown.pts, null)

  // Check Truncated Row: missing trailing cells become null (not 0 or '0-0')
  const trunc = players.find((p) => p.id === 'p-trunc')
  assert.ok(trunc)
  assert.equal(trunc.min, '18')
  assert.equal(trunc.fg, '4-9')
  assert.equal(trunc.reb, 7)
  assert.equal(trunc.ast, null)
  assert.equal(trunc.pts, null)
  assert.equal(trunc.plusMinus, null)
})



