import test from 'node:test'
import assert from 'node:assert/strict'
import { areEventsEqual, areScoreboardsEqual } from './nbaHelpers.ts'
import { shiftCalendarDate } from './timezone.ts'
import { DashboardDomainError, TransientNetworkError, isAbortError } from './errors.ts'
import { logger, sanitizeLogData } from './logger.ts'
import { withExponentialBackoff } from './retry.ts'
import {
  playTactileClick,
  playWhistleSound,
  playSwishSound,
  playBuzzerSound,
  resetAudioContext,
} from './audioFeedback.ts'
import { resolveAnnouncingCrew } from './announcers.ts'

test('Stage 3 Hardening: areEventsEqual and areScoreboardsEqual structural comparisons', () => {
  const baseEvent = {
    id: 'ev-1',
    name: 'Boston Celtics at Detroit Pistons',
    date: '2026-11-02T19:00:00Z',
    status: {
      clock: 120,
      displayClock: '2:00',
      period: 4,
      type: { state: 'in', detail: '4th Quarter 2:00' },
    },
    competitions: [
      {
        situation: { possession: 'BOS', shotClock: 14 },
        competitors: [
          { id: '2', homeAway: 'away', score: '105', team: { abbreviation: 'BOS' } },
          { id: '8', homeAway: 'home', score: '102', team: { abbreviation: 'DET' } },
        ],
        shots: [{ id: 's1' }],
      },
    ],
  }

  // Exact reference
  assert.equal(areEventsEqual(baseEvent, baseEvent), true)
  assert.equal(areEventsEqual(null, null), true)
  assert.equal(areEventsEqual(baseEvent, null), false)
  assert.equal(areEventsEqual(undefined, baseEvent), false)

  // Identical deep clone
  const cloneEvent = JSON.parse(JSON.stringify(baseEvent))
  assert.equal(areEventsEqual(baseEvent, cloneEvent), true)

  // Mismatches
  assert.equal(areEventsEqual(baseEvent, { ...baseEvent, id: 'ev-2' }), false)
  assert.equal(areEventsEqual(baseEvent, { ...baseEvent, status: { ...baseEvent.status, clock: 119 } }), false)
  assert.equal(areEventsEqual(baseEvent, { ...baseEvent, status: { ...baseEvent.status, period: 3 } }), false)
  assert.equal(areEventsEqual(baseEvent, { ...baseEvent, status: { ...baseEvent.status, displayClock: '1:59' } }), false)
  assert.equal(areEventsEqual(baseEvent, { ...baseEvent, status: { ...baseEvent.status, type: { ...baseEvent.status.type, detail: 'Final' } } }), false)
  assert.equal(areEventsEqual(baseEvent, { ...baseEvent, status: { ...baseEvent.status, type: { ...baseEvent.status.type, state: 'post' } } }), false)

  // Competition situation mismatches
  const clonePossessionDiff = JSON.parse(JSON.stringify(baseEvent))
  clonePossessionDiff.competitions[0].situation.possession = 'DET'
  assert.equal(areEventsEqual(baseEvent, clonePossessionDiff), false)

  const cloneShotClockDiff = JSON.parse(JSON.stringify(baseEvent))
  cloneShotClockDiff.competitions[0].situation.shotClock = 8
  assert.equal(areEventsEqual(baseEvent, cloneShotClockDiff), false)

  // Score mismatches
  const cloneScoreDiff0 = JSON.parse(JSON.stringify(baseEvent))
  cloneScoreDiff0.competitions[0].competitors[0].score = '108'
  assert.equal(areEventsEqual(baseEvent, cloneScoreDiff0), false)

  const cloneScoreDiff1 = JSON.parse(JSON.stringify(baseEvent))
  cloneScoreDiff1.competitions[0].competitors[1].score = '104'
  assert.equal(areEventsEqual(baseEvent, cloneScoreDiff1), false)

  // Shots length mismatch
  const cloneShotsDiff = JSON.parse(JSON.stringify(baseEvent))
  cloneShotsDiff.competitions[0].shots = []
  assert.equal(areEventsEqual(baseEvent, cloneShotsDiff), false)

  // Undefined competitors / shots fallback checks
  const eventNoComps = {
    id: 'ev-sparse',
    competitions: [{}],
  }
  const eventNoComps2 = {
    id: 'ev-sparse',
    competitions: [{}],
  }
  assert.equal(areEventsEqual(eventNoComps, eventNoComps2), true)

  // Scoreboard comparisons
  const sb1 = { events: [baseEvent], day: { date: '20261102' } }
  const sbClone = { events: [cloneEvent], day: { date: '20261102' } }
  assert.equal(areScoreboardsEqual(sb1, sb1), true)
  assert.equal(areScoreboardsEqual(null, null), true)
  assert.equal(areScoreboardsEqual(sb1, null), false)
  assert.equal(areScoreboardsEqual(null, sb1), false)
  assert.equal(areScoreboardsEqual(sb1, { events: [] }), false)
  assert.equal(areScoreboardsEqual(sb1, sbClone), true)
  assert.equal(areScoreboardsEqual(sb1, { events: [cloneScoreDiff0] }), false)
})

test('Stage 3 Hardening: shiftCalendarDate deterministic calendar math', () => {
  // Normal shift
  assert.equal(shiftCalendarDate('2026-11-02', 1), '2026-11-03')
  assert.equal(shiftCalendarDate('2026-11-02', -1), '2026-11-01')

  // Month boundary
  assert.equal(shiftCalendarDate('2026-10-31', 1), '2026-11-01')
  assert.equal(shiftCalendarDate('2026-11-01', -1), '2026-10-31')

  // Leap year 2024
  assert.equal(shiftCalendarDate('2024-02-28', 1), '2024-02-29')
  assert.equal(shiftCalendarDate('2024-02-29', 1), '2024-03-01')

  // Non-leap year 2023
  assert.equal(shiftCalendarDate('2023-02-28', 1), '2023-03-01')

  // Non-finite delta values fallback to 0
  assert.equal(shiftCalendarDate('2026-11-02', NaN), '2026-11-02')
  assert.equal(shiftCalendarDate('2026-11-02', Infinity), '2026-11-02')
  assert.equal(shiftCalendarDate('2026-11-02', 2.9), '2026-11-04')

  // Invalid date inputs fallback to today
  const shiftedFromInvalid = shiftCalendarDate('invalid-date', 0)
  assert.match(shiftedFromInvalid, /^\d{4}-\d{2}-\d{2}$/)

  const shiftedFromUndefined = shiftCalendarDate(undefined, 0)
  assert.match(shiftedFromUndefined, /^\d{4}-\d{2}-\d{2}$/)
})

test('Stage 5 Hardening: custom error taxonomy and abort checks', () => {
  const domainErr = new DashboardDomainError('Invalid payload structure', 'INVALID_PAYLOAD')
  assert.equal(domainErr.name, 'DashboardDomainError')
  assert.equal(domainErr.message, 'Invalid payload structure')
  assert.equal(domainErr.code, 'INVALID_PAYLOAD')
  assert.equal(domainErr.isFatal, true)

  const defaultDomainErr = new DashboardDomainError('Default code')
  assert.equal(defaultDomainErr.code, 'DOMAIN_VALIDATION_ERROR')

  const transErr = new TransientNetworkError('Gateway 504 Timeout', 504, 1500)
  assert.equal(transErr.name, 'TransientNetworkError')
  assert.equal(transErr.message, 'Gateway 504 Timeout')
  assert.equal(transErr.statusCode, 504)
  assert.equal(transErr.retryAfterMs, 1500)
  assert.equal(transErr.isTransient, true)

  // isAbortError
  const abortErr = new Error('The operation was aborted.')
  abortErr.name = 'AbortError'
  assert.equal(isAbortError(abortErr), true)
  assert.equal(isAbortError(new Error('fetch was aborted by caller')), true)
  assert.equal(isAbortError(new Error('Connection refused')), false)
  assert.equal(isAbortError(null), false)
  assert.equal(isAbortError(undefined), false)
  assert.equal(isAbortError('not an error'), false)
})

test('Stage 5 Hardening: structured logging and credential sanitization', () => {
  // Primitives and bounds
  assert.equal(sanitizeLogData(null), null)
  assert.equal(sanitizeLogData(undefined), undefined)
  assert.equal(sanitizeLogData('normal string'), 'normal string')
  assert.equal(sanitizeLogData(123), 123)

  // Deep depth cutoff
  const deepObj = { a: { b: { c: { d: { e: { f: 'too deep' } } } } } }
  const sanitizedDeep = sanitizeLogData(deepObj)
  assert.ok(sanitizedDeep)

  // Redaction of sensitive fields
  const payload = {
    apiKey: 'secret_12345',
    authToken: 'bearer_xyz',
    userSecret: 'shhh',
    safeField: 'hello',
    nested: {
      password: 'password123',
      validUrl: 'https://site.api.espn.com/scoreboard?token=secret123&date=20261102',
      normalUrl: 'https://site.api.espn.com/scoreboard?date=20261102',
    },
    arrayField: [
      { credential: 'classified' },
      'safe array item',
    ],
  }

  const clean = sanitizeLogData(payload)
  assert.equal(clean.apiKey, '[REDACTED]')
  assert.equal(clean.authToken, '[REDACTED]')
  assert.equal(clean.userSecret, '[REDACTED]')
  assert.equal(clean.safeField, 'hello')
  assert.equal(clean.nested.password, '[REDACTED]')
  assert.ok(clean.nested.validUrl.includes('token=%5BREDACTED%5D') || clean.nested.validUrl.includes('token=[REDACTED]'))
  assert.equal(clean.nested.normalUrl, 'https://site.api.espn.com/scoreboard?date=20261102')
  assert.equal(clean.arrayField[0].credential, '[REDACTED]')

  // Logger calls
  const infoEntry = logger.info('System initialized', { version: '2.0.0' })
  assert.equal(infoEntry.level, 'info')
  assert.equal(infoEntry.message, 'System initialized')

  const warnEntry = logger.warn('Stale cache used', { key: 'today' }, new Error('Network slow'))
  assert.equal(warnEntry.level, 'warn')
  assert.equal(warnEntry.errorName, 'Error')
  assert.equal(warnEntry.errorMessage, 'Network slow')

  const errEntry = logger.error('Fatal crash', { reason: 'OOM' }, new DashboardDomainError('Fail'))
  assert.equal(errEntry.level, 'error')
  assert.equal(errEntry.errorName, 'DashboardDomainError')

  const debugEntry = logger.debug('Detail', { step: 1 })
  assert.equal(debugEntry.level, 'debug')
})

test('Stage 5 Hardening: withExponentialBackoff retry logic and cancellation', async () => {
  // 1. Success on first try
  let calls1 = 0
  const res1 = await withExponentialBackoff(async () => {
    calls1++
    return 'immediate success'
  })
  assert.equal(res1, 'immediate success')
  assert.equal(calls1, 1)

  // 2. Transient error retried and succeeds on 2nd try
  let calls2 = 0
  const res2 = await withExponentialBackoff(
    async () => {
      calls2++
      if (calls2 === 1) {
        throw new TransientNetworkError('503 Service Unavailable', 503)
      }
      return 'recovered'
    },
    { maxRetries: 2, initialDelayMs: 10, maxDelayMs: 50, jitter: false }
  )
  assert.equal(res2, 'recovered')
  assert.equal(calls2, 2)

  // 3. Transient error retried until maxRetries exhausted
  let calls3 = 0
  await assert.rejects(
    async () => {
      await withExponentialBackoff(
        async () => {
          calls3++
          throw new TransientNetworkError('500 Server Error', 500)
        },
        { maxRetries: 1, initialDelayMs: 10, maxDelayMs: 50, jitter: false }
      )
    },
    (err) => err instanceof TransientNetworkError && calls3 === 2
  )

  // 4. Non-transient error throws immediately without retry
  let calls4 = 0
  await assert.rejects(
    async () => {
      await withExponentialBackoff(
        async () => {
          calls4++
          throw new DashboardDomainError('Bad request schema')
        },
        { maxRetries: 3 }
      )
    },
    (err) => err instanceof DashboardDomainError && calls4 === 1
  )

  // 5. Already aborted signal throws AbortError immediately
  const preAborted = new AbortController()
  preAborted.abort()
  await assert.rejects(
    async () => {
      await withExponentialBackoff(async () => 'never called', {}, preAborted.signal)
    },
    (err) => err.name === 'AbortError'
  )

  // 6. Abort signal fired during retry delay
  const midController = new AbortController()
  let calls5 = 0
  const retryPromise = withExponentialBackoff(
    async () => {
      calls5++
      throw new TransientNetworkError('Drop', 502)
    },
    { maxRetries: 2, initialDelayMs: 80, jitter: false },
    midController.signal
  )
  setTimeout(() => midController.abort(), 20)
  await assert.rejects(
    retryPromise,
    (err) => err.name === 'AbortError'
  )
  assert.ok(calls5 >= 1)
})

test('Stage 4 Hardening: Web Audio lifecycle and resetAudioContext teardown', () => {
  // Reset initial context
  resetAudioContext()

  // Setup mock audio context
  const disconnectedNodes = []
  class MockNode {
    connect() {}
    disconnect() {
      disconnectedNodes.push(this)
    }
  }
  class MockOscillator extends MockNode {
    type = 'sine'
    frequency = {
      setValueAtTime() {},
      linearRampToValueAtTime() {},
      exponentialRampToValueAtTime() {},
    }
    start() {
      if (typeof this.onended === 'function') {
        this.onended()
      }
    }
    stop() {}
  }
  class MockGain extends MockNode {
    gain = {
      setValueAtTime() {},
      linearRampToValueAtTime() {},
      exponentialRampToValueAtTime() {},
    }
  }

  let closedCount = 0
  let resumeCount = 0
  class MockAudioContext {
    state = 'suspended'
    currentTime = 0
    sampleRate = 44100
    destination = {}
    createOscillator() { return new MockOscillator() }
    createGain() { return new MockGain() }
    createBuffer() {
      return {
        getChannelData() { return new Float32Array(100) },
      }
    }
    createBufferSource() { return new MockOscillator() }
    createBiquadFilter() {
      const node = new MockNode()
      node.frequency = { setValueAtTime() {}, exponentialRampToValueAtTime() {} }
      node.Q = { setValueAtTime() {} }
      return node
    }
    resume() {
      resumeCount++
      this.state = 'running'
      return Promise.resolve()
    }
    close() {
      closedCount++
      this.state = 'closed'
      return Promise.resolve()
    }
  }

  global.window = {
    AudioContext: MockAudioContext,
  }

  playTactileClick()
  assert.equal(resumeCount, 1)

  playWhistleSound()
  playSwishSound()
  playBuzzerSound()
  assert.ok(disconnectedNodes.length > 0)

  // Test resetAudioContext
  resetAudioContext()
  assert.equal(closedCount, 1)

  // Calling reset again on null is safe
  resetAudioContext()

  // Test error path during osc.start()
  class FailingOscillator extends MockNode {
    type = 'sine'
    frequency = { setValueAtTime() {}, exponentialRampToValueAtTime() {} }
    start() {
      throw new Error('Hardware audio device detached')
    }
    stop() {}
  }
  class FailingAudioContext extends MockAudioContext {
    state = 'running'
    createOscillator() { return new FailingOscillator() }
  }
  global.window.AudioContext = FailingAudioContext

  // Should catch without throwing and safely disconnect nodes
  assert.doesNotThrow(() => {
    playTactileClick()
  })

  // Cleanup globals
  resetAudioContext()
  delete global.window
})

test('Stage 1 Hardening: national crew window matching branches in announcers.ts', () => {
  // Test primetime window (23:00 UTC)
  const espnPrimetimeComp = {
    broadcasts: [{ names: ['ESPN'] }],
  }
  const crewPrime = resolveAnnouncingCrew(espnPrimetimeComp, 'BOS', 'LAL', {
    gameDate: '2026-11-02T23:00:00Z',
  })
  assert.equal(crewPrime.market, 'National')
  assert.ok(crewPrime.playByPlay)

  // Test afternoon window (18:00 UTC)
  const abcAfternoonComp = {
    broadcasts: [{ names: ['ABC'] }],
  }
  const crewAfternoon = resolveAnnouncingCrew(abcAfternoonComp, 'BOS', 'MIA', {
    gameDate: '2026-11-02T18:00:00Z',
  })
  assert.equal(crewAfternoon.market, 'National')
  assert.ok(crewAfternoon.playByPlay)
})
