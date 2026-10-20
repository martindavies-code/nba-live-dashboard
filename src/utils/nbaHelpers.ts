import type { NBACompetitor, NBAStatus } from '../types/nba'

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

/**
 * Dynamic NBA win probability model based on score margin, time remaining, and spread.
 */
export function calculateWinProbability(
  homeScore: unknown,
  awayScore: unknown,
  secondsRemaining: number,
  gameState = 'in',
  spread = 0
): { homePct: number; awayPct: number } {
  const hScore = safeParseInt(homeScore, 0, 0)
  const aScore = safeParseInt(awayScore, 0, 0)

  if (gameState === 'post') {
    if (hScore > aScore) return { homePct: 100, awayPct: 0 }
    if (aScore > hScore) return { homePct: 0, awayPct: 100 }
    return { homePct: 50, awayPct: 50 }
  }

  if (gameState === 'pre') {
    // Pre-game estimate based on spread (every 1 point spread ~ 3% win prob shift from 50%)
    const homeProb = Math.max(10, Math.min(90, Math.round(50 - spread * 3)))
    return { homePct: homeProb, awayPct: 100 - homeProb }
  }

  const scoreDiff = hScore - aScore
  const safeSec = Math.max(1, Math.min(2880, secondsRemaining))
  const timeWeight = 1 - Math.sqrt(safeSec / 2880)

  // Sigmoid-based probability estimation
  const leadAdvantage = scoreDiff * (1.2 + timeWeight * 3.5)
  const oddsPrior = (1 - timeWeight) * (-spread * 0.8)
  const z = (leadAdvantage + oddsPrior) / 10

  const prob = 1 / (1 + Math.exp(-z))
  const homePct = Math.max(1, Math.min(99, Math.round(prob * 100)))
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
