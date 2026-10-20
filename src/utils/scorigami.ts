import { HISTORICAL_OCCURRED, TOTAL_UNIQUE_NBA_SCORIGAMIS, type HistoricalScoreRecord } from './scorigamiHistoricalData.ts'

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

export function makeScoreKey(a: number, b: number): string {
  const hi = Math.max(a, b)
  const lo = Math.min(a, b)
  return `${hi}-${lo}`
}

export function hasOccurred(a: number, b: number): boolean {
  return makeScoreKey(a, b) in HISTORICAL_OCCURRED
}

export function getHistoricalRecord(a: number, b: number): HistoricalScoreRecord | null {
  return HISTORICAL_OCCURRED[makeScoreKey(a, b)] || null
}

export function formatHistoricalDate(isoDate: string): string {
  if (!isoDate) return ''
  const [y, m, d] = isoDate.split('-').map(Number)
  if (isNaN(y) || isNaN(m) || isNaN(d)) return isoDate
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * Calculates NBA Scorigami probability, historical frequency, and target scores.
 *
 * NBA dynamics:
 * - Regulation game: 48 minutes (2,880 seconds)
 * - Average pace: ~100 possessions per 48 mins (~2.08 possessions / minute)
 * - Points per possession: ~1.12
 */
export function getScorigamiInfo(
  homeScore: number,
  awayScore: number,
  secondsRemaining: number,
  gameState: 'pre' | 'in' | 'post',
  homeAbbr = 'Home',
  awayAbbr = 'Away'
): NBAScorigamiInfo {
  const safeHome = Number.isFinite(homeScore) ? Math.max(0, Math.floor(homeScore)) : 0
  const safeAway = Number.isFinite(awayScore) ? Math.max(0, Math.floor(awayScore)) : 0
  const key = makeScoreKey(safeHome, safeAway)
  const histRecord = HISTORICAL_OCCURRED[key]
  const isCurrentScorigami = !histRecord && (safeHome > 0 || safeAway > 0)

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

    return {
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
  }

  // 2. PRE-GAME: Projected Scorigami Probability
  if (gameState === 'pre' || (safeHome === 0 && safeAway === 0)) {
    // In NBA, pre-game novelty probability is typically ~4% - 9%
    const targetHome = 139
    const targetAway = 119
    const novelKey = makeScoreKey(targetHome, targetAway)

    return {
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
  }

  // 3. LIVE GAME: Dynamic Scorigami Probability & Projections
  const minutesLeft = Math.max(0.1, secondsRemaining / 60)
  // Expected additional points per team: ~2.3 points per minute
  const expAddPoints = Math.round(minutesLeft * 2.3)

  // Find nearest novel score candidate in projected range
  let bestNovelScore: { hi: number; lo: number; dist: number } | null = null
  const projHome = safeHome + expAddPoints
  const projAway = safeAway + expAddPoints

  for (let dh = -6; dh <= 14; dh++) {
    for (let da = -6; da <= 14; da++) {
      const h = Math.max(safeHome, projHome + dh)
      const a = Math.max(safeAway, projAway + da)
      if (h === a) continue // NBA games cannot end in a tie
      const candidateKey = makeScoreKey(h, a)
      if (!(candidateKey in HISTORICAL_OCCURRED)) {
        const dist = Math.abs(h - projHome) + Math.abs(a - projAway)
        if (!bestNovelScore || dist < bestNovelScore.dist) {
          bestNovelScore = { hi: Math.max(h, a), lo: Math.min(h, a), dist }
        }
      }
    }
  }

  // Calculate live novelty probability
  let noveltyPct = 0
  if (secondsRemaining <= 120) {
    // Under 2 mins: high fidelity depending on current score
    noveltyPct = isCurrentScorigami ? 0.72 : 0.04
  } else if (secondsRemaining <= 600) {
    // 4th quarter
    noveltyPct = isCurrentScorigami ? 0.45 : 0.12
  } else {
    // Earlier quarters
    noveltyPct = 0.08
  }

  const novelKey = bestNovelScore ? `${bestNovelScore.hi}-${bestNovelScore.lo}` : '142-136'
  const targetHomePts = bestNovelScore ? (safeHome >= safeAway ? bestNovelScore.hi : bestNovelScore.lo) : safeHome + 15
  const targetAwayPts = bestNovelScore ? (safeAway > safeHome ? bestNovelScore.hi : bestNovelScore.lo) : safeAway + 12
  const ptsNeededHome = Math.max(0, targetHomePts - safeHome)
  const ptsNeededAway = Math.max(0, targetAwayPts - safeAway)

  let whenScenario = ''
  if (isCurrentScorigami && secondsRemaining <= 90) {
    whenScenario = `🔥 Current score (${key}) is a SCORIGAMI right now if score holds in final ${Math.round(secondsRemaining)}s!`
  } else if (isCurrentScorigami) {
    whenScenario = `Current score (${key}) is historically novel! Target to maintain novelty: ${novelKey}`
  } else {
    whenScenario = `Target novel score: ${novelKey} (Needs +${ptsNeededHome} ${homeAbbr}, +${ptsNeededAway} ${awayAbbr} in remaining ${Math.floor(secondsRemaining / 60)}:${String(Math.floor(secondsRemaining % 60)).padStart(2, '0')})`
  }

  const occurrences = histRecord ? histRecord[0] : 0
  const lastYear = histRecord ? histRecord[1] : null
  const lastDate = histRecord ? formatHistoricalDate(histRecord[2]) : null
  const lastWinner = histRecord ? histRecord[3] : null
  const lastLoser = histRecord ? histRecord[4] : null
  const lastGameSummary = histRecord
    ? `${lastWinner} ${key.split('-')[0]}, ${lastLoser} ${key.split('-')[1]} on ${lastDate}`
    : null

  return {
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
