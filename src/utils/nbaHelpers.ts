import type { NBACompetitor, NBAStatus, NBAOdds } from '../types/nba'

/**
 * Sanitizes a hex color string against CSS injection and format violations.
 * Strictly accepts 3, 4, 6, or 8 hexadecimal characters.
 */
export function sanitizeHexColor(hex?: unknown, fallback = '#1d428a'): string {
  const safeFallback =
    typeof fallback === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(fallback)
      ? fallback
      : '#1d428a'

  if (typeof hex !== 'string') return safeFallback

  const clean = hex.replace(/^#/, '').trim()
  if (/^[0-9a-fA-F]{3}$/.test(clean) ||
      /^[0-9a-fA-F]{4}$/.test(clean) ||
      /^[0-9a-fA-F]{6}$/.test(clean) ||
      /^[0-9a-fA-F]{8}$/.test(clean)) {
    return `#${clean.toLowerCase()}`
  }

  return safeFallback
}

/**
 * Safely parses integer values with finite checks and optional bounds.
 */
export function safeParseInt(
  val: unknown,
  fallback = 0,
  min = Number.MIN_SAFE_INTEGER,
  max = Number.MAX_SAFE_INTEGER
): number {
  let parsed: number
  if (typeof val === 'number') {
    parsed = Number.isFinite(val) ? Math.floor(val) : fallback
  } else if (typeof val === 'string') {
    const trimmed = val.trim()
    if (!trimmed) return fallback
    const res = parseInt(trimmed, 10)
    parsed = Number.isFinite(res) ? res : fallback
  } else {
    parsed = fallback
  }

  return Math.max(min, Math.min(max, parsed))
}

/**
 * Validates and sanitizes image URLs, preventing javascript: or data: injection.
 */
export function sanitizeImageUrl(
  url?: unknown,
  fallback = 'https://a.espncdn.com/i/teamlogos/nba/500/nba.png'
): string {
  if (typeof url !== 'string' || !url.trim()) return fallback
  const clean = url.trim()
  try {
    const parsed = new URL(clean)
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.href
    }
  } catch {
    // Relative or malformed path
  }
  return fallback
}

/**
 * Calculates whether a game is in "Clutch" mode:
 * NBA definition: Score difference <= 5 points in the 4th quarter or Overtime with <= 5:00 remaining.
 */
export function isClutchGame(
  status?: NBAStatus | null,
  competitors?: NBACompetitor[] | null
): boolean {
  if (!status?.type || status.type.state !== 'in') return false
  if (!Array.isArray(competitors) || competitors.length < 2) return false

  const period = safeParseInt(status.period, 0)
  if (period < 4) return false

  const scoreA = safeParseInt(competitors[0]?.score, 0)
  const scoreB = safeParseInt(competitors[1]?.score, 0)
  const diff = Math.abs(scoreA - scoreB)

  const clock = safeParseInt(status.clock, 0)
  // In 4th quarter under 5 minutes (300 seconds) or any Overtime period
  const isLate = period > 4 || clock <= 300
  return diff <= 5 && isLate
}

/**
 * Derives the total regulation/game seconds remaining.
 * NBA regulation: 4 periods of 12 minutes (720 seconds each) = 2,880 seconds total.
 */
export function calculateSecondsRemaining(status?: NBAStatus | null): number {
  if (!status) return 2880
  const state = status.type?.state
  if (state === 'post') return 0
  if (state === 'pre') return 2880

  const period = safeParseInt(status.period, 1)
  const clock = safeParseInt(status.clock, 0)

  if (period >= 4) {
    return Math.max(0, clock)
  }

  const remainingPeriods = Math.max(0, 4 - period)
  return Math.max(0, clock + remainingPeriods * 720)
}

/**
 * Resolves high-contrast colors for competing NBA franchises.
 */
export function resolveContrastingTeamColors(
  homeHex?: unknown,
  awayHex?: unknown
): { homeColor: string; awayColor: string } {
  const home = sanitizeHexColor(homeHex, '#1d428a')
  let away = sanitizeHexColor(awayHex, '#ce1141')

  if (home.toLowerCase() === away.toLowerCase()) {
    away = '#f59e0b'
  }
  return { homeColor: home, awayColor: away }
}

export interface WinProbabilitySituation {
  possession?: string
  homeTeamId?: string
  awayTeamId?: string
  homeFouls?: number
  awayFouls?: number
  scoringRun?: {
    teamId?: string
    teamAbbr?: string
    points?: number
    opponentPoints?: number
  }
}

/**
 * Normalizes pre-game Vegas odds spread relative to the home franchise.
 * Returns negative if home team is favored (e.g. -7.5), positive if home team is underdog (+7.5).
 */
export function resolveHomeSpread(
  odds?: NBAOdds[],
  homeAbbr?: string,
  awayAbbr?: string
): number {
  if (!odds || odds.length === 0) return 0
  const first = odds[0]
  if (!first) return 0

  const rawSpread = typeof first.spread === 'number' && Number.isFinite(first.spread) ? first.spread : 0

  const details = (first.details || '').trim().toUpperCase()
  if (details) {
    if (details === 'PK' || details === 'EVEN') return 0
    const match = details.match(/^([A-Z]{2,4})\s*([+-]?\d+(?:\.\d+)?)$/)
    if (match) {
      const favTeam = match[1]
      const spreadVal = parseFloat(match[2])
      if (homeAbbr && favTeam === homeAbbr.toUpperCase()) {
        return spreadVal
      }
      if (awayAbbr && favTeam === awayAbbr.toUpperCase()) {
        return -spreadVal
      }
    }
  }

  if (first.awayTeamOdds?.favorite) {
    return Math.abs(rawSpread)
  }
  if (first.homeTeamOdds?.favorite) {
    return -Math.abs(rawSpread)
  }

  return rawSpread
}

/**
 * Dynamic NBA in-game win probability model.
 * Factors in live score margin, precise time remaining, possession value (~1.1 pts),
 * bonus foul penalties, scoring run momentum, and decaying pre-game spread expectation.
 */
export function calculateWinProbability(
  homeScore: unknown,
  awayScore: unknown,
  secondsRemaining: number,
  gameState = 'in',
  homeSpread = 0,
  situation?: WinProbabilitySituation | null
): { homePct: number; awayPct: number } {
  const hScore = safeParseInt(homeScore, 0, 0)
  const aScore = safeParseInt(awayScore, 0, 0)

  // 1. Post-Game: Conclusive result
  if (gameState === 'post') {
    if (hScore > aScore) return { homePct: 100, awayPct: 0 }
    if (aScore > hScore) return { homePct: 0, awayPct: 100 }
    return { homePct: 50, awayPct: 50 }
  }

  const cleanSpread = typeof homeSpread === 'number' && Number.isFinite(homeSpread) ? homeSpread : 0

  // 2. Pre-Game: Based on pregame spread line (1 pt spread ≈ 3% win prob shift from 50%)
  if (gameState === 'pre' || (secondsRemaining >= 2880 && hScore === 0 && aScore === 0)) {
    const zPregame = -cleanSpread / 11.5
    const homeProb = 1 / (1 + Math.exp(-1.702 * zPregame))
    const homePct = Math.max(5, Math.min(95, Math.round(homeProb * 100)))
    return { homePct, awayPct: 100 - homePct }
  }

  // 3. Live In-Game Dynamic Real-Time Model
  const scoreDiff = hScore - aScore
  const safeSec = Math.max(1, Math.min(2880, Number.isFinite(secondsRemaining) ? secondsRemaining : 2880))
  const timeRatio = safeSec / 2880

  // Pre-game spread expectation decays linearly with time remaining
  const spreadExpectation = -cleanSpread * timeRatio

  // Ball possession value: offensive team holds ~1.1 pts expected value
  let possessionAdjustment = 0
  if (situation?.possession) {
    if (situation.homeTeamId && situation.possession === situation.homeTeamId) {
      possessionAdjustment = 0.85
    } else if (situation.awayTeamId && situation.possession === situation.awayTeamId) {
      possessionAdjustment = -0.85
    }
  }

  // Bonus foul penalty advantage (+0.35 pts expected)
  let bonusAdjustment = 0
  if (typeof situation?.awayFouls === 'number' && situation.awayFouls >= 5) {
    bonusAdjustment += 0.35
  }
  if (typeof situation?.homeFouls === 'number' && situation.homeFouls >= 5) {
    bonusAdjustment -= 0.35
  }

  // Scoring Run Momentum
  let momentumAdjustment = 0
  if (situation?.scoringRun && typeof situation.scoringRun.points === 'number') {
    const runDiff = situation.scoringRun.points - (situation.scoringRun.opponentPoints ?? 0)
    if (runDiff > 4) {
      const isHomeRun = situation.scoringRun.teamId === situation.homeTeamId
      const delta = Math.min(1.5, runDiff * 0.15)
      momentumAdjustment = isHomeRun ? delta : -delta
    }
  }

  // Expected net point margin at regulation buzzer
  const expectedFinalDiff = scoreDiff + spreadExpectation + possessionAdjustment + bonusAdjustment + momentumAdjustment

  // Standard deviation scales with sqrt(time remaining), bounded at bottom for final possession variance
  const sigma = 11.5 * Math.sqrt(timeRatio) + 0.35

  const z = expectedFinalDiff / sigma
  const liveProb = 1 / (1 + Math.exp(-1.702 * z))

  // In the absolute final seconds, lock to 100/0 if lead is insurmountable
  if (safeSec <= 5) {
    if (scoreDiff > 3) return { homePct: 100, awayPct: 0 }
    if (scoreDiff < -3) return { homePct: 0, awayPct: 100 }
  } else if (safeSec <= 20) {
    if (scoreDiff >= 8) return { homePct: 99, awayPct: 1 }
    if (scoreDiff <= -8) return { homePct: 1, awayPct: 99 }
  }

  const homePct = Math.max(1, Math.min(99, Math.round(liveProb * 100)))
  return { homePct, awayPct: 100 - homePct }
}

/**
 * Formats period detail string (e.g. '1st Quarter', 'OT2', 'Final / 2OT').
 */
export function formatPeriodDetail(
  period: unknown,
  state: 'pre' | 'in' | 'post' | string
): string {
  const p = safeParseInt(period, 1)
  if (state === 'pre') return 'Upcoming'
  if (state === 'post') return p > 4 ? `Final / ${p - 4}OT` : 'Final'
  if (p === 1) return '1st Quarter'
  if (p === 2) return '2nd Quarter'
  if (p === 3) return '3rd Quarter'
  if (p === 4) return '4th Quarter'
  return p > 4 ? `OT${p - 4}` : 'In Progress'
}

/**
 * Safe local storage wrapper preventing SecurityError in restricted environments.
 */
export const safeStorage = {
  getItem(key: string): string | null {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key)
      }
    } catch {
      // Storage unavailable
    }
    return null
  },
  setItem(key: string, value: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value)
      }
    } catch {
      // Storage quota or restriction
    }
  },
}
