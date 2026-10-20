import type { NBACompetitor, NBAStatus } from '../types/nba'

export function sanitizeHexColor(hex?: string, fallback = '#1d428a'): string {
  if (!hex) return fallback
  const clean = hex.replace(/^#/, '').trim()
  if (/^[0-9a-fA-F]{6}$/.test(clean) || /^[0-9a-fA-F]{3}$/.test(clean)) {
    return `#${clean}`
  }
  return fallback
}

export function safeParseInt(val: unknown, fallback = 0): number {
  if (typeof val === 'number') return Number.isFinite(val) ? Math.floor(val) : fallback
  if (typeof val === 'string') {
    const parsed = parseInt(val, 10)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return fallback
}

/**
 * Calculates whether a game is in "Clutch" mode:
 * NBA definition: Score difference <= 5 points in the 4th quarter or Overtime with <= 5:00 remaining.
 */
export function isClutchGame(status?: NBAStatus, competitors?: NBACompetitor[]): boolean {
  if (!status || !competitors || competitors.length < 2) return false
  if (status.type.state !== 'in') return false
  if (status.period < 4) return false

  const scoreA = safeParseInt(competitors[0].score, 0)
  const scoreB = safeParseInt(competitors[1].score, 0)
  const diff = Math.abs(scoreA - scoreB)

  // In 4th quarter under 5 minutes or any Overtime
  const isLate = status.period > 4 || status.clock <= 300
  return diff <= 5 && isLate
}

/**
 * Resolves high-contrast colors for competing NBA franchises.
 */
export function resolveContrastingTeamColors(
  homeHex?: string,
  awayHex?: string
): { homeColor: string; awayColor: string } {
  let home = sanitizeHexColor(homeHex, '#1d428a')
  let away = sanitizeHexColor(awayHex, '#ce1141')

  if (home.toLowerCase() === away.toLowerCase()) {
    away = '#f59e0b'
  }
  return { homeColor: home, awayColor: away }
}

export function formatPeriodDetail(period: number, state: 'pre' | 'in' | 'post'): string {
  if (state === 'pre') return 'Upcoming'
  if (state === 'post') return period > 4 ? `Final / ${period - 4}OT` : 'Final'
  if (period === 1) return '1st Quarter'
  if (period === 2) return '2nd Quarter'
  if (period === 3) return '3rd Quarter'
  if (period === 4) return '4th Quarter'
  return `OT${period - 4}`
}
