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
    // 1. Mock summary ID returns immediately with zero fetch calls
    const mockPre = await fetchNBAGameSummary('401909091', 'pre')
    assert.ok(mockPre)
    assert.equal(callCount, 0)

    // 2. Concurrent in-flight calls for the same event deduplicate to 1 network fetch
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

