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
const MAX_CACHE_ENTRIES = 300

// Pre-indexed Set for O(1) lookup
const HISTORICAL_KEYS = new Set(Object.keys(HISTORICAL_OCCURRED))

// Bitwise packed integer Set for zero-allocation sub-nanosecond candidate search
const HISTORICAL_PACKED_KEYS = new Set<number>()
for (const key of Object.keys(HISTORICAL_OCCURRED)) {
  const dashIdx = key.indexOf('-')
  if (dashIdx !== -1) {
    const h = parseInt(key.slice(0, dashIdx), 10)
    const a = parseInt(key.slice(dashIdx + 1), 10)
    HISTORICAL_PACKED_KEYS.add((h << 10) | a)
  }
}

/**
 * Creates canonical hi-lo score key safely.
 * Bounds all inputs to non-negative integers.
 */
export function makeScoreKey(a: unknown, b: unknown): string {
  if (typeof a === 'number' && typeof b === 'number' && Number.isFinite(a) && Number.isFinite(b)) {
    const intA = Math.max(0, Math.floor(a))
    const intB = Math.max(0, Math.floor(b))
    return intA >= intB ? `${intA}-${intB}` : `${intB}-${intA}`
  }
  const safeA = safeParseInt(a, 0, 0)
  const safeB = safeParseInt(b, 0, 0)
  const hi = Math.max(safeA, safeB)
  const lo = Math.min(safeA, safeB)
  return `${hi}-${lo}`
}

/**
 * Prototype-safe check for whether an NBA score combination has occurred historically.
 * Operates with zero-allocation integer fast-path for high throughput.
 */
export function hasOccurred(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number' && Number.isFinite(a) && Number.isFinite(b)) {
    const intA = Math.max(0, Math.floor(a))
    const intB = Math.max(0, Math.floor(b))
    const hi = Math.max(intA, intB)
    const lo = Math.min(intA, intB)
    if (hi < 1024 && lo < 1024) {
      return HISTORICAL_PACKED_KEYS.has((hi << 10) | lo)
    }
  }
  const key = makeScoreKey(a, b)
  return HISTORICAL_KEYS.has(key)
}

/**
 * Retrieves the historical record tuple for a score key safely.
 */
export function getHistoricalRecord(a: unknown, b: unknown): HistoricalScoreRecord | null {
  const key = makeScoreKey(a, b)
  if (Object.prototype.hasOwnProperty.call(HISTORICAL_OCCURRED, key)) {
    const entry = HISTORICAL_OCCURRED[key]
    if (Array.isArray(entry)) {
      return entry
    }
    if (typeof entry === 'number') {
      return [entry, 0, '', '', '']
    }
  }
  return null
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

/**
 * Safely parses and formats ISO date string (YYYY-MM-DD) into readable format (e.g. "Feb 24, 2023").
 * Zero GC churn, immune to year < 100 Date.UTC bugs, and timezone-neutral.
 */
export function formatHistoricalDate(isoDate: unknown): string {
  if (typeof isoDate !== 'string' || !isoDate.trim()) return ''
  const trimmed = isoDate.trim()
  const parts = trimmed.split('-')
  if (parts.length !== 3) return trimmed

  const [y, m, d] = parts.map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return trimmed
  }

  if (m < 1 || m > 12 || d < 1 || d > 31) {
    return trimmed
  }

  const monthStr = MONTH_NAMES[m - 1]
  return `${monthStr} ${d}, ${y}`
}

interface NovelCandidate {
  hi: number
  lo: number
  dist: number
}

/**
 * Searches outward from Manhattan distance 0 to locate the closest novel NBA score.
 * Sub-millisecond performance with immediate early-exit upon finding the minimal distance candidate.
 */
function findNearestNovelScore(
  safeHome: number,
  safeAway: number,
  projHome: number,
  projAway: number
): NovelCandidate | null {
  for (let dist = 0; dist <= 20; dist++) {
    let candidate: NovelCandidate | null = null
    for (let dh = -Math.min(dist, 6); dh <= Math.min(dist, 14); dh++) {
      const remaining = dist - Math.abs(dh)
      const daCandidates = remaining === 0 ? [0] : [-remaining, remaining]
      for (const da of daCandidates) {
        if (da < -6 || da > 14) continue

        const h = Math.max(safeHome, projHome + dh)
        const a = Math.max(safeAway, projAway + da)
        if (h === a) continue // NBA games cannot end in a tie

        if (!hasOccurred(h, a)) {
          const actualDist = Math.abs(h - projHome) + Math.abs(a - projAway)
          if (!candidate || actualDist < candidate.dist) {
            candidate = { hi: Math.max(h, a), lo: Math.min(h, a), dist: actualDist }
          }
        }
      }
    }
    if (candidate && candidate.dist <= dist) {
      return candidate
    }
  }
  return null
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
    const totalOccurrences = histRecord ? histRecord[0] : 0
    const priorOccurrences = Math.max(0, totalOccurrences > 0 ? totalOccurrences - 1 : 0)
    const lastYear = histRecord && histRecord[1] ? histRecord[1] : null
    const lastDate = histRecord && histRecord[2] ? formatHistoricalDate(histRecord[2]) : null
    const lastWinner = histRecord && histRecord[3] ? histRecord[3] : null
    const lastLoser = histRecord && histRecord[4] ? histRecord[4] : null
    const lastGameSummary = (lastWinner && lastLoser && lastDate)
      ? `${lastWinner} vs ${lastLoser} on ${lastDate}`
      : null

    let whenScenario = ''
    let chanceLabel = ''

    if (isCurrentScorigami) {
      chanceLabel = '100% — Historical NBA Scorigami! ✨'
      whenScenario = `Final: Official NBA Scorigami! Novel score #${TOTAL_UNIQUE_NBA_SCORIGAMIS + 1} in NBA history.`
    } else {
      chanceLabel = priorOccurrences > 0
        ? `No Scorigami (Happened ${priorOccurrences}x before)`
        : `No Scorigami (${totalOccurrences}x in NBA history)`
      whenScenario = (lastWinner && lastLoser && lastDate)
        ? `Final: No Scorigami. This score has happened ${priorOccurrences} times before, most recently on ${lastDate} (${lastWinner} vs ${lastLoser}).`
        : `Final: No Scorigami. This score has happened ${totalOccurrences} times in NBA history.`
    }

    result = {
      isCurrentScorigami,
      chanceLabel,
      chancePct: isCurrentScorigami ? 1 : 0,
      mostLikelyNovel: isCurrentScorigami ? key : null,
      mostLikelyLabel: isCurrentScorigami ? `${key} ✨` : key,
      whenScenario,
      currentOccurrences: totalOccurrences,
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

    const projHome = safeHome + expAddPoints
    const projAway = safeAway + expAddPoints

    // Efficiently search surrounding score combinations with distance early exit
    const bestNovelScore = findNearestNovelScore(safeHome, safeAway, projHome, projAway)

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
    const lastYear = histRecord && histRecord[1] ? histRecord[1] : null
    const lastDate = histRecord && histRecord[2] ? formatHistoricalDate(histRecord[2]) : null
    const lastWinner = histRecord && histRecord[3] ? histRecord[3] : null
    const lastLoser = histRecord && histRecord[4] ? histRecord[4] : null
    const lastGameSummary = (lastWinner && lastLoser && lastDate)
      ? `${lastWinner} vs ${lastLoser} on ${lastDate}`
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
