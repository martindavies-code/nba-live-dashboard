import { HISTORICAL_OCCURRED, TOTAL_UNIQUE_NBA_SCORIGAMIS, type HistoricalScoreRecord } from './scorigamiHistoricalData.ts'
import { safeParseInt } from './nbaHelpers.ts'

export interface NBAScorigamiInfo {
  isCurrentScorigami: boolean
  chanceLabel: string
  chancePct: number
  mostLikelyNovel: string | null
  mostLikelyLabel: string
  whenScenario: string
  currentOccurrences: number
  lastSeenYear: number | null
  lastDate: string | null
  lastWinner: string | null
  lastLoser: string | null
  lastGameSummary: string | null
  pointsNeededHome: number
  pointsNeededAway: number
}

// In-memory LRU cache for scorigami evaluations to prevent redundant loop calculations
const SCORIGAMI_CACHE = new Map<string, NBAScorigamiInfo>()
const MAX_CACHE_ENTRIES = 200

/**
 * Creates canonical hi-lo score key safely.
 * Bounds all inputs to non-negative integers.
 */
export function makeScoreKey(a: unknown, b: unknown): string {
  const safeA = safeParseInt(a, 0, 0)
  const safeB = safeParseInt(b, 0, 0)
  const hi = Math.max(safeA, safeB)
  const lo = Math.min(safeA, safeB)
  return `${hi}-${lo}`
}

/**
 * Prototype-safe check for whether an NBA score combination has occurred historically.
 */
export function hasOccurred(a: unknown, b: unknown): boolean {
  const key = makeScoreKey(a, b)
  return Object.prototype.hasOwnProperty.call(HISTORICAL_OCCURRED, key)
}

/**
 * Retrieves the historical record tuple for a score key safely.
 */
export function getHistoricalRecord(a: unknown, b: unknown): HistoricalScoreRecord | null {
  const key = makeScoreKey(a, b)
  if (Object.prototype.hasOwnProperty.call(HISTORICAL_OCCURRED, key)) {
    return HISTORICAL_OCCURRED[key] ?? null
  }
  return null
}

/**
 * Safely parses and formats ISO date string to readable format.
 */
export function formatHistoricalDate(isoDate: unknown): string {
  if (typeof isoDate !== 'string' || !isoDate.trim()) return ''
  const parts = isoDate.trim().split('-')
  if (parts.length !== 3) return isoDate.trim()

  const [y, m, d] = parts.map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return isoDate.trim()
  }

  const date = new Date(Date.UTC(y, m - 1, d))
  if (isNaN(date.getTime())) return isoDate.trim()

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * Calculates NBA Scorigami probability, historical frequency, and target scores.
 * Fully isolated from prototype pollution, non-finite inputs, and redundant loop computations.
 */
export function getScorigamiInfo(
  homeScore: unknown,
  awayScore: unknown,
  secondsRemaining: unknown,
  gameState: 'pre' | 'in' | 'post' | string = 'in',
  homeAbbr = 'Home',
  awayAbbr = 'Away'
): NBAScorigamiInfo {
  const safeHome = safeParseInt(homeScore, 0, 0)
  const safeAway = safeParseInt(awayScore, 0, 0)
  const safeSec = safeParseInt(secondsRemaining, 0, 0, 2880 * 2)
  const key = makeScoreKey(safeHome, safeAway)

  // Cache key buckets seconds remaining into 15-second windows to optimize cache hits during live play
  const timeBucket = gameState === 'in' ? Math.floor(safeSec / 15) : 0
  const cacheKey = `${key}_${timeBucket}_${gameState}_${homeAbbr}_${awayAbbr}`

  const cached = SCORIGAMI_CACHE.get(cacheKey)
  if (cached) return cached

  const histRecord = getHistoricalRecord(safeHome, safeAway)
  const isCurrentScorigami = !histRecord && (safeHome > 0 || safeAway > 0)

  let result: NBAScorigamiInfo

  // 1. POST GAME: Definitive Historical Status
  if (gameState === 'post') {
    const occurrences = histRecord ? histRecord[0] : 0
    const lastYear = histRecord ? histRecord[1] : null
    const lastDate = histRecord ? formatHistoricalDate(histRecord[2]) : null
    const lastWinner = histRecord ? histRecord[3] : null
    const lastLoser = histRecord ? histRecord[4] : null
    const lastGameSummary = histRecord
      ? `${lastWinner} ${key.split('-')[0]}, ${lastLoser} ${key.split('-')[1]} on ${lastDate}`
      : null

    result = {
      isCurrentScorigami,
      chanceLabel: isCurrentScorigami ? '100% — Historical NBA Scorigami! ✨' : '0% — Already Occurred',
      chancePct: isCurrentScorigami ? 1 : 0,
      mostLikelyNovel: isCurrentScorigami ? key : null,
      mostLikelyLabel: isCurrentScorigami ? `${key} ✨` : key,
      whenScenario: isCurrentScorigami
        ? `Final: Novel score #${TOTAL_UNIQUE_NBA_SCORIGAMIS + 1} in NBA history!`
        : `Final: Has occurred ${occurrences}x in NBA history (last: ${lastGameSummary || 'prior era'})`,
      currentOccurrences: occurrences,
      lastSeenYear: lastYear,
      lastDate,
      lastWinner,
      lastLoser,
      lastGameSummary,
      pointsNeededHome: 0,
      pointsNeededAway: 0,
    }
  } else if (gameState === 'pre' || (safeHome === 0 && safeAway === 0)) {
    // 2. PRE-GAME: Projected Scorigami Probability
    const targetHome = 139
    const targetAway = 119
    const novelKey = makeScoreKey(targetHome, targetAway)

    result = {
      isCurrentScorigami: false,
      chanceLabel: '7.8% Novelty Chance',
      chancePct: 0.078,
      mostLikelyNovel: novelKey,
      mostLikelyLabel: `${novelKey} (High Pace)`,
      whenScenario: `Pre-game model: ~7.8% chance game finishes on a novel score (e.g. ${novelKey})`,
      currentOccurrences: 0,
      lastSeenYear: null,
      lastDate: null,
      lastWinner: null,
      lastLoser: null,
      lastGameSummary: null,
      pointsNeededHome: targetHome,
      pointsNeededAway: targetAway,
    }
  } else {
    // 3. LIVE GAME: Dynamic Scorigami Probability & Projections
    const minutesLeft = Math.max(0.1, safeSec / 60)
    const expAddPoints = Math.round(minutesLeft * 2.3)

    // Find nearest novel score candidate in projected range
    let bestNovelScore: { hi: number; lo: number; dist: number } | null = null
    const projHome = safeHome + expAddPoints
    const projAway = safeAway + expAddPoints

    // Efficiently search surrounding score combinations
    for (let dh = -6; dh <= 14; dh++) {
      for (let da = -6; da <= 14; da++) {
        const h = Math.max(safeHome, projHome + dh)
        const a = Math.max(safeAway, projAway + da)
        if (h === a) continue // NBA games cannot end in a tie

        if (!hasOccurred(h, a)) {
          const dist = Math.abs(h - projHome) + Math.abs(a - projAway)
          if (!bestNovelScore || dist < bestNovelScore.dist) {
            bestNovelScore = { hi: Math.max(h, a), lo: Math.min(h, a), dist }
          }
        }
      }
    }

    let noveltyPct = 0
    if (safeSec <= 120) {
      noveltyPct = isCurrentScorigami ? 0.72 : 0.04
    } else if (safeSec <= 600) {
      noveltyPct = isCurrentScorigami ? 0.45 : 0.12
    } else {
      noveltyPct = 0.08
    }

    const novelKey = bestNovelScore ? `${bestNovelScore.hi}-${bestNovelScore.lo}` : '142-136'
    const targetHomePts = bestNovelScore
      ? (safeHome >= safeAway ? bestNovelScore.hi : bestNovelScore.lo)
      : safeHome + 15
    const targetAwayPts = bestNovelScore
      ? (safeAway > safeHome ? bestNovelScore.hi : bestNovelScore.lo)
      : safeAway + 12
    const ptsNeededHome = Math.max(0, targetHomePts - safeHome)
    const ptsNeededAway = Math.max(0, targetAwayPts - safeAway)

    const minPart = Math.floor(safeSec / 60)
    const secPart = String(Math.floor(safeSec % 60)).padStart(2, '0')

    let whenScenario = ''
    if (isCurrentScorigami && safeSec <= 90) {
      whenScenario = `🔥 Current score (${key}) is a SCORIGAMI right now if score holds in final ${Math.round(safeSec)}s!`
    } else if (isCurrentScorigami) {
      whenScenario = `Current score (${key}) is historically novel! Target to maintain novelty: ${novelKey}`
    } else {
      whenScenario = `Target novel score: ${novelKey} (Needs +${ptsNeededHome} ${homeAbbr}, +${ptsNeededAway} ${awayAbbr} in remaining ${minPart}:${secPart})`
    }

    const occurrences = histRecord ? histRecord[0] : 0
    const lastYear = histRecord ? histRecord[1] : null
    const lastDate = histRecord ? formatHistoricalDate(histRecord[2]) : null
    const lastWinner = histRecord ? histRecord[3] : null
    const lastLoser = histRecord ? histRecord[4] : null
    const lastGameSummary = histRecord
      ? `${lastWinner} ${key.split('-')[0]}, ${lastLoser} ${key.split('-')[1]} on ${lastDate}`
      : null

    result = {
      isCurrentScorigami,
      chanceLabel: `${Math.round(noveltyPct * 100)}% Novelty Chance`,
      chancePct: noveltyPct,
      mostLikelyNovel: novelKey,
      mostLikelyLabel: novelKey,
      whenScenario,
      currentOccurrences: occurrences,
      lastSeenYear: lastYear,
      lastDate,
      lastWinner,
      lastLoser,
      lastGameSummary,
      pointsNeededHome: ptsNeededHome,
      pointsNeededAway: ptsNeededAway,
    }
  }

  // Manage cache bounds
  if (SCORIGAMI_CACHE.size >= MAX_CACHE_ENTRIES) {
    const firstKey = SCORIGAMI_CACHE.keys().next().value
    if (firstKey) SCORIGAMI_CACHE.delete(firstKey)
  }
  SCORIGAMI_CACHE.set(cacheKey, result)

  return result
}
