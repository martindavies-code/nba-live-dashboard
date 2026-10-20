import test from 'node:test'
import assert from 'node:assert/strict'
import {
  sanitizeDateParam,
  fetchNBAScoreboard,
  clearScoreboardCache,
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
