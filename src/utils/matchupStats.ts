import type {
  NBACompetitor,
  NBACompetitorStat,
  NBALeader,
  NBAShot,
  NBATeamSummary,
  NBAPlayerBoxLine,
} from '../types/nba'
import { sanitizeImageUrl } from './nbaHelpers.ts'
import { normalizeTeamAbbr } from './announcers.ts'

export interface TeamRecordBreakdown {
  overall: string | null
  home?: string
  road?: string
  streak?: string
  lastTen?: string
}

export interface NormalizedStatLeader {
  category: 'PTS' | 'REB' | 'AST'
  categoryLabel: string
  playerId: string
  playerName: string
  shortName: string
  jersey?: string
  position?: string
  headshot: string
  primaryValue: string
  primaryUnit: string
  subline: string
  injuryStatus?: string
  injuryDetail?: string
}

export interface TeamComparisonRow {
  key: string
  label: string
  awayDisplay: string
  homeDisplay: string
  awayValue: number | null
  homeValue: number | null
  awayRank?: string
  homeRank?: string
  lowerIsBetter?: boolean
  awaySharePct: number | null
  homeSharePct: number | null
  leaderSide: 'away' | 'home' | 'tie' | 'none'
  isPartial?: boolean
}

export interface GameHighlightMetric {
  key: string
  label: string
  awayDisplay: string
  homeDisplay: string
  awayValue: number | null
  homeValue: number | null
  lowerIsBetter?: boolean
  leaderSide: 'away' | 'home' | 'tie' | 'none'
  isPartial?: boolean
}

export interface ShootingZoneSummary {
  paint: { made: number; total: number; pct: string }
  midRange: { made: number; total: number; pct: string }
  corner3: { made: number; total: number; pct: string }
  aboveBreak3: { made: number; total: number; pct: string }
}

const MISSING_IMAGE_SENTINEL = 'https://invalid.local/__missing__'
const STRICT_NUMBER_REGEX = /^[+-]?(?:\d+\.?\d*|\.\d+)%?$/

/**
 * Validates that a team summary belongs to the given scoreboard competitor (team ID and normalized abbreviation).
 */
export function isTeamSummaryMatchingCompetitor(
  teamSummary: NBATeamSummary | null | undefined,
  competitor: NBACompetitor | undefined
): boolean {
  if (!teamSummary) return false
  if (!competitor) return true

  const compTeamId = competitor.team?.id ? String(competitor.team.id) : competitor.id ? String(competitor.id) : ''
  const sumTeamId = teamSummary.teamId ? String(teamSummary.teamId) : ''
  if (compTeamId && sumTeamId && compTeamId !== sumTeamId) {
    return false
  }

  const compAbbr = competitor.team?.abbreviation ? normalizeTeamAbbr(competitor.team.abbreviation) : ''
  const sumAbbr =
    teamSummary.abbreviation &&
    teamSummary.abbreviation !== 'HOME' &&
    teamSummary.abbreviation !== 'AWAY'
      ? normalizeTeamAbbr(teamSummary.abbreviation)
      : ''

  if (compAbbr && sumAbbr && compAbbr !== sumAbbr) {
    return false
  }

  return true
}

export function getValidatedTeamSummary(
  teamSummary: NBATeamSummary | null | undefined,
  competitor: NBACompetitor | undefined
): NBATeamSummary | null {
  return isTeamSummaryMatchingCompetitor(teamSummary, competitor) ? (teamSummary ?? null) : null
}

/**
 * Safely extracts and validates a player headshot URL (handles string or { href } shapes).
 */
export function extractHeadshotUrl(headshot: unknown): string {
  const candidate =
    typeof headshot === 'string'
      ? headshot
      : headshot && typeof headshot === 'object' && 'href' in headshot
      ? (headshot as { href?: unknown }).href
      : undefined
  if (typeof candidate !== 'string' || !candidate.trim()) return ''
  const sanitized = sanitizeImageUrl(candidate, MISSING_IMAGE_SENTINEL)
  return sanitized === MISSING_IMAGE_SENTINEL ? '' : sanitized
}

/**
 * Strictly parses a numeric stat value while preserving genuine zero and returning null for
 * missing, placeholder ('-', '--', '—', 'N/A'), non-finite, or malformed strings ('12-34').
 */
export function parseStatNumber(val: unknown): number | null {
  if (typeof val === 'number') return Number.isFinite(val) ? val : null
  if (typeof val !== 'string') return null
  const trimmed = val.trim()
  if (!trimmed || !STRICT_NUMBER_REGEX.test(trimmed)) return null
  const parsed = Number(trimmed.endsWith('%') ? trimmed.slice(0, -1) : trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function formatPctDisplay(val?: string | number | null): string {
  const num = parseStatNumber(val)
  if (num === null) return '—'
  return `${num % 1 === 0 ? num.toFixed(0) : num.toFixed(1)}%`
}

function formatNumericDisplay(rawVal: string | undefined, parsed: number | null): string {
  if (parsed === null) return '—'
  if (typeof rawVal === 'string' && rawVal.trim()) {
    return rawVal.trim()
  }
  return String(parsed)
}

function findCompetitorStat(comp?: NBACompetitor, names: string[] = []): NBACompetitorStat | null {
  if (!comp?.statistics) return null
  for (const name of names) {
    const found = comp.statistics.find((s) => s.name === name)
    if (found && found.displayValue !== undefined && found.displayValue !== null && String(found.displayValue).trim()) {
      return found
    }
  }
  return null
}

function parseRankOrdinal(rank?: string): number | null {
  if (!rank) return null
  const m = rank.trim().match(/^#?(\d+)/)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Extracts verified ranks ONLY when attached to the exact displayed metric AND explicitly verified.
 * Never pulls season-total ranks for per-game averages, and omits contradictory ranks.
 */
function resolveVerifiedRanks(
  awayStat: NBACompetitorStat | null,
  homeStat: NBACompetitorStat | null,
  awayVal: number | null,
  homeVal: number | null,
  lowerIsBetter = false
): { awayRank?: string; homeRank?: string } {
  const rawAway =
    awayStat?.verifiedRank === true && awayStat.rankDisplayValue ? awayStat.rankDisplayValue.trim() : undefined
  const rawHome =
    homeStat?.verifiedRank === true && homeStat.rankDisplayValue ? homeStat.rankDisplayValue.trim() : undefined

  if (!rawAway && !rawHome) return {}

  // Sanity guard: if both teams have ranks and values, verify ranks don't contradict value ordering
  if (rawAway && rawHome && awayVal !== null && homeVal !== null && Math.abs(awayVal - homeVal) > 0.01) {
    const aOrd = parseRankOrdinal(rawAway)
    const hOrd = parseRankOrdinal(rawHome)
    if (aOrd !== null && hOrd !== null) {
      const awayBetter = lowerIsBetter ? awayVal < homeVal : awayVal > homeVal
      if ((awayBetter && aOrd >= hOrd) || (!awayBetter && hOrd >= aOrd)) {
        return {}
      }
    }
  }

  return { awayRank: rawAway, homeRank: rawHome }
}

function parseMadeAttempted(val?: string): { made: number; attempted: number } | null {
  if (!val) return null
  const m = val.trim().match(/^(\d+)\s*-\s*(\d+)$/)
  if (!m) return null
  const made = parseInt(m[1], 10)
  const attempted = parseInt(m[2], 10)
  if (!Number.isFinite(made) || !Number.isFinite(attempted) || made > attempted) return null
  return { made, attempted }
}

/**
 * Resolves a shooting line (made-attempted + percentage) without mixing inconsistent sources.
 */
function resolveShootingLine(
  comp: NBACompetitor | undefined,
  summary: NBATeamSummary | null,
  summaryMadeAttKey: 'fgMadeAttempted' | 'threePtMadeAttempted' | 'ftMadeAttempted',
  summaryPctKey: 'fieldGoalPct' | 'threePointPct' | 'freeThrowPct',
  compMadeKeys: string[],
  compAttKeys: string[],
  compPctKeys: string[]
): { display: string; pctValue: number | null } {
  const sumMadeAtt = summary?.stats?.[summaryMadeAttKey]
  const sumPctRaw = summary?.stats?.[summaryPctKey]
  const compMade = findCompetitorStat(comp, compMadeKeys)?.displayValue
  const compAtt = findCompetitorStat(comp, compAttKeys)?.displayValue
  const compMadeAtt = compMade !== undefined && compAtt !== undefined ? `${compMade}-${compAtt}` : undefined
  const compPctRaw = findCompetitorStat(comp, compPctKeys)?.displayValue

  // Prefer matching pair from same source (summary first, then competitor scoreboard)
  let chosenMadeAtt = sumMadeAtt || compMadeAtt
  let chosenPctNum = sumMadeAtt
    ? parseStatNumber(sumPctRaw) ?? parseStatNumber(compPctRaw)
    : parseStatNumber(compPctRaw) ?? parseStatNumber(sumPctRaw)

  if (chosenMadeAtt) {
    const parsedMA = parseMadeAttempted(chosenMadeAtt)
    if (parsedMA) {
      if (parsedMA.attempted > 0) {
        const expectedPct = (parsedMA.made / parsedMA.attempted) * 100
        if (chosenPctNum === null || Math.abs(expectedPct - chosenPctNum) > 1.0) {
          // Reconcile against arithmetic truth from made-attempted rather than mixing another source's %
          chosenPctNum = Math.round(expectedPct * 10) / 10
        }
      } else {
        chosenPctNum = null
      }
      return {
        display: chosenPctNum !== null ? `${chosenMadeAtt} (${formatPctDisplay(chosenPctNum)})` : chosenMadeAtt,
        pctValue: chosenPctNum,
      }
    }
    chosenMadeAtt = undefined
  }

  return {
    display: formatPctDisplay(chosenPctNum),
    pctValue: chosenPctNum,
  }
}

/**
 * Extracts overall record, Home/Road splits, streak, and Last 10 record.
 * Preserves explicit '0-0' when provided by data, and returns null when absent.
 */
export function extractRecordSummary(
  competitor?: NBACompetitor,
  teamSummary?: NBATeamSummary | null
): TeamRecordBreakdown {
  const validSummary = getValidatedTeamSummary(teamSummary, competitor)
  const records = competitor?.records || []
  const rawOverall =
    records.find((r) => r.type === 'total' || r.name === 'overall')?.summary ||
    records[0]?.summary
  const overall = typeof rawOverall === 'string' && rawOverall.trim() ? rawOverall.trim() : null
  const home = records.find((r) => r.type === 'home' || r.name === 'Home')?.summary?.trim() || undefined
  const road = records.find((r) => r.type === 'road' || r.name === 'Road')?.summary?.trim() || undefined

  return {
    overall,
    home,
    road,
    streak: validSummary?.stats?.streak,
    lastTen: validSummary?.stats?.lastTen,
  }
}

function findLeaderEntry(leaders: NBALeader[] | undefined, keys: string[]) {
  if (!Array.isArray(leaders)) return null
  for (const key of keys) {
    const group = leaders.find((l) => l.name === key || l.shortDisplayName === key || l.abbreviation === key)
    const entry = group?.leaders?.[0]
    if (entry && entry.athlete) {
      return { group, entry }
    }
  }
  return null
}

function normalizeName(name?: string): string {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Extracts top Scorer, Rebounder, and Assister for a team in pre, live, or post mode.
 * Enriches with player headshots, boxscore lines, season averages, and injury alerts.
 */
export function extractStatLeaders(
  competitor?: NBACompetitor,
  teamSummary?: NBATeamSummary | null,
  gameState: 'pre' | 'in' | 'post' | string = 'pre'
): NormalizedStatLeader[] {
  const isPre = gameState === 'pre'
  const validSummary = getValidatedTeamSummary(teamSummary, competitor)

  // Prefer scoreboard leaders immediately, merge validated summary leaders for extra summary line / headshots
  const primaryLeaders = competitor?.leaders?.length ? competitor.leaders : validSummary?.leaders || []
  const secondaryLeaders = validSummary?.leaders?.length ? validSummary.leaders : competitor?.leaders || []

  const injuryMap = new Map<string, { status: string; detail?: string }>()
  if (isPre && validSummary?.injuries) {
    for (const inj of validSummary.injuries) {
      const key = normalizeName(inj.playerName)
      if (key) injuryMap.set(key, { status: inj.status, detail: inj.detail })
    }
  }

  const boxPlayerMap = new Map<string, NBAPlayerBoxLine>()
  if (!isPre && validSummary?.topPlayers) {
    for (const p of validSummary.topPlayers) {
      if (p.id) boxPlayerMap.set(p.id, p)
      const nKey = normalizeName(p.name)
      if (nKey) boxPlayerMap.set(nKey, p)
    }
  }

  // Extract overall rating line from scoreboard if present (e.g. "24.1 PPG, 4.9 RPG, 5.5 APG...")
  const ratingMatch = findLeaderEntry(primaryLeaders, ['rating'])

  const specs: Array<{
    category: 'PTS' | 'REB' | 'AST'
    categoryLabel: string
    unit: string
    keys: string[]
  }> = isPre
    ? [
        { category: 'PTS', categoryLabel: 'Scoring Leader', unit: 'PPG', keys: ['pointsPerGame', 'points', 'PPG'] },
        { category: 'REB', categoryLabel: 'Rebound Leader', unit: 'RPG', keys: ['reboundsPerGame', 'rebounds', 'RPG'] },
        { category: 'AST', categoryLabel: 'Assist Leader', unit: 'APG', keys: ['assistsPerGame', 'assists', 'APG'] },
      ]
    : [
        { category: 'PTS', categoryLabel: 'Points Leader', unit: 'PTS', keys: ['points', 'Pts', 'pointsPerGame'] },
        { category: 'REB', categoryLabel: 'Rebounds Leader', unit: 'REB', keys: ['rebounds', 'Reb', 'reboundsPerGame'] },
        { category: 'AST', categoryLabel: 'Assists Leader', unit: 'AST', keys: ['assists', 'Ast', 'assistsPerGame'] },
      ]

  const result: NormalizedStatLeader[] = []

  for (const spec of specs) {
    const primaryMatch = findLeaderEntry(primaryLeaders, spec.keys)
    const secondaryMatch = findLeaderEntry(secondaryLeaders, spec.keys)
    const match = primaryMatch || secondaryMatch
    if (!match) continue

    const { entry } = match
    const athlete = entry.athlete
    const secEntry = secondaryMatch?.entry
    const headshot =
      extractHeadshotUrl(athlete.headshot) ||
      extractHeadshotUrl(secEntry?.athlete?.headshot)

    const playerName = athlete.displayName || athlete.fullName || athlete.shortName || 'Unknown'
    const shortName = athlete.shortName || playerName
    const jersey = athlete.jersey || secEntry?.athlete?.jersey
    const position = athlete.position?.abbreviation || secEntry?.athlete?.position?.abbreviation

    // Determine helpful subline
    let subline = ''
    if (isPre) {
      if (secEntry?.summary) {
        subline = secEntry.summary
      } else if (ratingMatch && normalizeName(ratingMatch.entry.athlete.displayName) === normalizeName(playerName)) {
        subline = ratingMatch.entry.displayValue
      } else if (position) {
        subline = `Pos: ${position}`
      }
    } else {
      const box = boxPlayerMap.get(athlete.id) || boxPlayerMap.get(normalizeName(playerName))
      if (box) {
        const parts: string[] = []
        if (spec.category === 'PTS') {
          if (box.fg && box.fg !== '0-0') parts.push(`${box.fg} FG`)
          if (box.threePt && box.threePt !== '0-0') parts.push(`${box.threePt} 3PT`)
          parts.push(`${box.reb} REB`, `${box.ast} AST`)
        } else if (spec.category === 'REB') {
          parts.push(`${box.pts} PTS`, `${box.ast} AST`)
          if (box.fg && box.fg !== '0-0') parts.push(`${box.fg} FG`)
          if (box.blk > 0) parts.push(`${box.blk} BLK`)
        } else {
          parts.push(`${box.pts} PTS`, `${box.reb} REB`)
          if (box.fg && box.fg !== '0-0') parts.push(`${box.fg} FG`)
          if (box.stl > 0) parts.push(`${box.stl} STL`)
        }
        if (box.plusMinus && parts.length < 4) parts.push(`${box.plusMinus} +/-`)
        subline = parts.join(' • ')
      } else if (secEntry?.summary) {
        subline = secEntry.summary
      } else if (position) {
        subline = `Pos: ${position}`
      }
    }

    const inj = injuryMap.get(normalizeName(playerName))

    result.push({
      category: spec.category,
      categoryLabel: spec.categoryLabel,
      playerId: athlete.id || playerName,
      playerName,
      shortName,
      jersey,
      position,
      headshot,
      primaryValue: entry.displayValue || (Number.isFinite(entry.value) ? String(entry.value) : '—'),
      primaryUnit: spec.unit,
      subline,
      injuryStatus: inj?.status,
      injuryDetail: inj?.detail,
    })
  }

  return result
}

function buildComparisonRow(
  key: string,
  label: string,
  awayDisplay: string,
  homeDisplay: string,
  awayValue: number | null,
  homeValue: number | null,
  options: { lowerIsBetter?: boolean; awayRank?: string; homeRank?: string } = {}
): TeamComparisonRow {
  const { lowerIsBetter = false, awayRank, homeRank } = options
  const hasAway = awayValue !== null && Number.isFinite(awayValue)
  const hasHome = homeValue !== null && Number.isFinite(homeValue)
  const isPartial = !hasAway || !hasHome

  if (isPartial) {
    return {
      key,
      label,
      awayDisplay: hasAway ? awayDisplay : '—',
      homeDisplay: hasHome ? homeDisplay : '—',
      awayValue: hasAway ? awayValue : null,
      homeValue: hasHome ? homeValue : null,
      awayRank: hasAway ? awayRank : undefined,
      homeRank: hasHome ? homeRank : undefined,
      lowerIsBetter,
      awaySharePct: null,
      homeSharePct: null,
      leaderSide: 'none',
      isPartial: true,
    }
  }

  const safeAway = Math.max(0, awayValue)
  const safeHome = Math.max(0, homeValue)
  const total = safeAway + safeHome
  const awaySharePct = total > 0 ? Math.round((safeAway / total) * 100) : 50
  const homeSharePct = 100 - awaySharePct

  let leaderSide: 'away' | 'home' | 'tie' | 'none' = 'tie'
  if (Math.abs(awayValue - homeValue) > 0.01) {
    if (lowerIsBetter) {
      leaderSide = awayValue < homeValue ? 'away' : 'home'
    } else {
      leaderSide = awayValue > homeValue ? 'away' : 'home'
    }
  }

  return {
    key,
    label,
    awayDisplay,
    homeDisplay,
    awayValue,
    homeValue,
    awayRank,
    homeRank,
    lowerIsBetter,
    awaySharePct,
    homeSharePct,
    leaderSide,
    isPartial: false,
  }
}

/**
 * Extracts structured team comparison rows and game highlights for pre-game or in/post-game views.
 */
export function extractTeamComparisonRows(
  awayComp?: NBACompetitor,
  homeComp?: NBACompetitor,
  awaySummary?: NBATeamSummary | null,
  homeSummary?: NBATeamSummary | null,
  gameState: 'pre' | 'in' | 'post' | string = 'pre'
): { rows: TeamComparisonRow[]; highlights: GameHighlightMetric[] } {
  const rows: TeamComparisonRow[] = []
  const highlights: GameHighlightMetric[] = []

  const validAwaySummary = getValidatedTeamSummary(awaySummary, awayComp)
  const validHomeSummary = getValidatedTeamSummary(homeSummary, homeComp)

  if (gameState === 'pre') {
    const awayPpgStat = findCompetitorStat(awayComp, ['avgPoints'])
    const homePpgStat = findCompetitorStat(homeComp, ['avgPoints'])
    const awayPpgRaw = validAwaySummary?.stats?.avgPoints ?? awayPpgStat?.displayValue
    const homePpgRaw = validHomeSummary?.stats?.avgPoints ?? homePpgStat?.displayValue
    const awayPpgVal = parseStatNumber(awayPpgRaw)
    const homePpgVal = parseStatNumber(homePpgRaw)
    if (awayPpgVal !== null || homePpgVal !== null) {
      const ranks = resolveVerifiedRanks(awayPpgStat, homePpgStat, awayPpgVal, homePpgVal)
      rows.push(
        buildComparisonRow(
          'ppg',
          'Points / Game',
          formatNumericDisplay(awayPpgRaw, awayPpgVal),
          formatNumericDisplay(homePpgRaw, homePpgVal),
          awayPpgVal,
          homePpgVal,
          ranks
        )
      )
    }

    const awayOppPpgRaw = validAwaySummary?.stats?.avgPointsAgainst
    const homeOppPpgRaw = validHomeSummary?.stats?.avgPointsAgainst
    const awayOppPpgVal = parseStatNumber(awayOppPpgRaw)
    const homeOppPpgVal = parseStatNumber(homeOppPpgRaw)
    if (awayOppPpgVal !== null || homeOppPpgVal !== null) {
      rows.push(
        buildComparisonRow(
          'oppPpg',
          'Opp PPG Allowed',
          formatNumericDisplay(awayOppPpgRaw, awayOppPpgVal),
          formatNumericDisplay(homeOppPpgRaw, homeOppPpgVal),
          awayOppPpgVal,
          homeOppPpgVal,
          { lowerIsBetter: true }
        )
      )
    }

    const awayFgStat = findCompetitorStat(awayComp, ['fieldGoalPct'])
    const homeFgStat = findCompetitorStat(homeComp, ['fieldGoalPct'])
    const awayFgRaw = awayFgStat?.displayValue ?? validAwaySummary?.stats?.fieldGoalPct
    const homeFgRaw = homeFgStat?.displayValue ?? validHomeSummary?.stats?.fieldGoalPct
    const awayFgVal = parseStatNumber(awayFgRaw)
    const homeFgVal = parseStatNumber(homeFgRaw)
    if (awayFgVal !== null || homeFgVal !== null) {
      const ranks = resolveVerifiedRanks(awayFgStat, homeFgStat, awayFgVal, homeFgVal)
      rows.push(
        buildComparisonRow(
          'fgPct',
          'Field Goal %',
          formatPctDisplay(awayFgVal),
          formatPctDisplay(homeFgVal),
          awayFgVal,
          homeFgVal,
          ranks
        )
      )
    }

    const away3pStat = findCompetitorStat(awayComp, ['threePointFieldGoalPct', 'threePointPct'])
    const home3pStat = findCompetitorStat(homeComp, ['threePointFieldGoalPct', 'threePointPct'])
    const away3pRaw = away3pStat?.displayValue ?? validAwaySummary?.stats?.threePointPct
    const home3pRaw = home3pStat?.displayValue ?? validHomeSummary?.stats?.threePointPct
    const away3pVal = parseStatNumber(away3pRaw)
    const home3pVal = parseStatNumber(home3pRaw)
    if (away3pVal !== null || home3pVal !== null) {
      const ranks = resolveVerifiedRanks(away3pStat, home3pStat, away3pVal, home3pVal)
      rows.push(
        buildComparisonRow(
          'threePct',
          '3-Point %',
          formatPctDisplay(away3pVal),
          formatPctDisplay(home3pVal),
          away3pVal,
          home3pVal,
          ranks
        )
      )
    }

    const awayRebStat = findCompetitorStat(awayComp, ['avgRebounds'])
    const homeRebStat = findCompetitorStat(homeComp, ['avgRebounds'])
    const awayRebRaw = validAwaySummary?.stats?.avgRebounds ?? awayRebStat?.displayValue
    const homeRebRaw = validHomeSummary?.stats?.avgRebounds ?? homeRebStat?.displayValue
    const awayRebVal = parseStatNumber(awayRebRaw)
    const homeRebVal = parseStatNumber(homeRebRaw)
    if (awayRebVal !== null || homeRebVal !== null) {
      rows.push(
        buildComparisonRow(
          'rpg',
          'Rebounds / Game',
          formatNumericDisplay(awayRebRaw, awayRebVal),
          formatNumericDisplay(homeRebRaw, homeRebVal),
          awayRebVal,
          homeRebVal
        )
      )
    }

    const awayAstStat = findCompetitorStat(awayComp, ['avgAssists'])
    const homeAstStat = findCompetitorStat(homeComp, ['avgAssists'])
    const awayAstRaw = validAwaySummary?.stats?.avgAssists ?? awayAstStat?.displayValue
    const homeAstRaw = validHomeSummary?.stats?.avgAssists ?? homeAstStat?.displayValue
    const awayAstVal = parseStatNumber(awayAstRaw)
    const homeAstVal = parseStatNumber(homeAstRaw)
    if (awayAstVal !== null || homeAstVal !== null) {
      const ranks = resolveVerifiedRanks(awayAstStat, homeAstStat, awayAstVal, homeAstVal)
      rows.push(
        buildComparisonRow(
          'apg',
          'Assists / Game',
          formatNumericDisplay(awayAstRaw, awayAstVal),
          formatNumericDisplay(homeAstRaw, homeAstVal),
          awayAstVal,
          homeAstVal,
          ranks
        )
      )
    }

    const awayTovRaw = validAwaySummary?.stats?.avgTotalTurnovers ?? validAwaySummary?.stats?.avgTurnovers
    const homeTovRaw = validHomeSummary?.stats?.avgTotalTurnovers ?? validHomeSummary?.stats?.avgTurnovers
    const awayTovVal = parseStatNumber(awayTovRaw)
    const homeTovVal = parseStatNumber(homeTovRaw)
    if (awayTovVal !== null || homeTovVal !== null) {
      const isTotal = Boolean(validAwaySummary?.stats?.avgTotalTurnovers || validHomeSummary?.stats?.avgTotalTurnovers)
      rows.push(
        buildComparisonRow(
          'tov',
          isTotal ? 'Total Turnovers / G' : 'Turnovers / Game',
          formatNumericDisplay(awayTovRaw, awayTovVal),
          formatNumericDisplay(homeTovRaw, homeTovVal),
          awayTovVal,
          homeTovVal,
          { lowerIsBetter: true }
        )
      )
    }

    return { rows, highlights }
  }

  // Post-game & Live Box Score Comparison (preventing mixed-source shooting percentages)
  const awayFgLine = resolveShootingLine(
    awayComp,
    validAwaySummary,
    'fgMadeAttempted',
    'fieldGoalPct',
    ['fieldGoalsMade'],
    ['fieldGoalsAttempted'],
    ['fieldGoalPct']
  )
  const homeFgLine = resolveShootingLine(
    homeComp,
    validHomeSummary,
    'fgMadeAttempted',
    'fieldGoalPct',
    ['fieldGoalsMade'],
    ['fieldGoalsAttempted'],
    ['fieldGoalPct']
  )
  if (awayFgLine.pctValue !== null || homeFgLine.pctValue !== null) {
    rows.push(
      buildComparisonRow(
        'fg',
        'Field Goals',
        awayFgLine.display,
        homeFgLine.display,
        awayFgLine.pctValue,
        homeFgLine.pctValue
      )
    )
  }

  const away3pLine = resolveShootingLine(
    awayComp,
    validAwaySummary,
    'threePtMadeAttempted',
    'threePointPct',
    ['threePointFieldGoalsMade'],
    ['threePointFieldGoalsAttempted'],
    ['threePointFieldGoalPct', 'threePointPct']
  )
  const home3pLine = resolveShootingLine(
    homeComp,
    validHomeSummary,
    'threePtMadeAttempted',
    'threePointPct',
    ['threePointFieldGoalsMade'],
    ['threePointFieldGoalsAttempted'],
    ['threePointFieldGoalPct', 'threePointPct']
  )
  if (away3pLine.pctValue !== null || home3pLine.pctValue !== null) {
    rows.push(
      buildComparisonRow(
        'threePt',
        '3-Pointers',
        away3pLine.display,
        home3pLine.display,
        away3pLine.pctValue,
        home3pLine.pctValue
      )
    )
  }

  const awayFtLine = resolveShootingLine(
    awayComp,
    validAwaySummary,
    'ftMadeAttempted',
    'freeThrowPct',
    ['freeThrowsMade'],
    ['freeThrowsAttempted'],
    ['freeThrowPct']
  )
  const homeFtLine = resolveShootingLine(
    homeComp,
    validHomeSummary,
    'ftMadeAttempted',
    'freeThrowPct',
    ['freeThrowsMade'],
    ['freeThrowsAttempted'],
    ['freeThrowPct']
  )
  if (awayFtLine.pctValue !== null || homeFtLine.pctValue !== null) {
    rows.push(
      buildComparisonRow(
        'ft',
        'Free Throws',
        awayFtLine.display,
        homeFtLine.display,
        awayFtLine.pctValue,
        homeFtLine.pctValue
      )
    )
  }

  const awayRebRaw = validAwaySummary?.stats?.totalRebounds ?? findCompetitorStat(awayComp, ['rebounds'])?.displayValue
  const homeRebRaw = validHomeSummary?.stats?.totalRebounds ?? findCompetitorStat(homeComp, ['rebounds'])?.displayValue
  const awayRebVal = parseStatNumber(awayRebRaw)
  const homeRebVal = parseStatNumber(homeRebRaw)
  const awayOreb = parseStatNumber(validAwaySummary?.stats?.offensiveRebounds) !== null ? validAwaySummary?.stats?.offensiveRebounds : undefined
  const homeOreb = parseStatNumber(validHomeSummary?.stats?.offensiveRebounds) !== null ? validHomeSummary?.stats?.offensiveRebounds : undefined
  if (awayRebVal !== null || homeRebVal !== null) {
    rows.push(
      buildComparisonRow(
        'reb',
        awayOreb || homeOreb ? 'Rebounds (OREB)' : 'Rebounds',
        awayRebVal !== null ? (awayOreb ? `${awayRebRaw} (${awayOreb})` : formatNumericDisplay(awayRebRaw, awayRebVal)) : '—',
        homeRebVal !== null ? (homeOreb ? `${homeRebRaw} (${homeOreb})` : formatNumericDisplay(homeRebRaw, homeRebVal)) : '—',
        awayRebVal,
        homeRebVal
      )
    )
  }

  const awayAstRaw = validAwaySummary?.stats?.assists ?? findCompetitorStat(awayComp, ['assists'])?.displayValue
  const homeAstRaw = validHomeSummary?.stats?.assists ?? findCompetitorStat(homeComp, ['assists'])?.displayValue
  const awayAstVal = parseStatNumber(awayAstRaw)
  const homeAstVal = parseStatNumber(homeAstRaw)
  if (awayAstVal !== null || homeAstVal !== null) {
    rows.push(
      buildComparisonRow(
        'ast',
        'Assists',
        formatNumericDisplay(awayAstRaw, awayAstVal),
        formatNumericDisplay(homeAstRaw, homeAstVal),
        awayAstVal,
        homeAstVal
      )
    )
  }

  // Distinguish Total Turnovers (player + team) from Player Turnovers consistently with label
  const hasTotalTov = Boolean(validAwaySummary?.stats?.totalTurnovers || validHomeSummary?.stats?.totalTurnovers)
  const hasPlayerTov = Boolean(validAwaySummary?.stats?.playerTurnovers || validHomeSummary?.stats?.playerTurnovers)
  const awayTovRaw = hasTotalTov
    ? validAwaySummary?.stats?.totalTurnovers
    : hasPlayerTov
      ? validAwaySummary?.stats?.playerTurnovers
      : validAwaySummary?.stats?.turnovers
  const homeTovRaw = hasTotalTov
    ? validHomeSummary?.stats?.totalTurnovers
    : hasPlayerTov
      ? validHomeSummary?.stats?.playerTurnovers
      : validHomeSummary?.stats?.turnovers
  const awayTovVal = parseStatNumber(awayTovRaw)
  const homeTovVal = parseStatNumber(homeTovRaw)
  if (awayTovVal !== null || homeTovVal !== null) {
    const tovLabel = hasTotalTov ? 'Total Turnovers' : hasPlayerTov ? 'Player Turnovers' : 'Turnovers'
    rows.push(
      buildComparisonRow(
        'tov',
        tovLabel,
        formatNumericDisplay(awayTovRaw, awayTovVal),
        formatNumericDisplay(homeTovRaw, homeTovVal),
        awayTovVal,
        homeTovVal,
        { lowerIsBetter: true }
      )
    )
  }

  // Cool Hustle & Flow Game Highlights (from validated summary boxscore)
  const addHighlight = (
    key: string,
    label: string,
    aVal?: string,
    hVal?: string,
    lowerIsBetter = false
  ) => {
    const av = parseStatNumber(aVal)
    const hv = parseStatNumber(hVal)
    if (av === null && hv === null) return

    const isPartial = av === null || hv === null
    let leaderSide: 'away' | 'home' | 'tie' | 'none' = 'none'
    if (!isPartial) {
      if (av === hv) {
        leaderSide = 'tie'
      } else if (lowerIsBetter) {
        leaderSide = av < hv ? 'away' : 'home'
      } else {
        leaderSide = av > hv ? 'away' : 'home'
      }
    }

    highlights.push({
      key,
      label,
      awayDisplay: formatNumericDisplay(aVal, av),
      homeDisplay: formatNumericDisplay(hVal, hv),
      awayValue: av,
      homeValue: hv,
      lowerIsBetter,
      leaderSide,
      isPartial,
    })
  }

  addHighlight('paint', 'Points in Paint', validAwaySummary?.stats?.pointsInPaint, validHomeSummary?.stats?.pointsInPaint)
  addHighlight('fastBreak', 'Fast Break Pts', validAwaySummary?.stats?.fastBreakPoints, validHomeSummary?.stats?.fastBreakPoints)

  // ESPN's turnoverPoints represents Points Conceded Off Turnovers (lower is better!).
  const awayConceded = validAwaySummary?.stats?.pointsConcededOffTurnovers ?? validAwaySummary?.stats?.turnoverPoints
  const homeConceded = validHomeSummary?.stats?.pointsConcededOffTurnovers ?? validHomeSummary?.stats?.turnoverPoints
  if (awayConceded || homeConceded) {
    addHighlight('ptsConcededOffTov', 'Pts Conceded Off TOV', awayConceded, homeConceded, true)
  } else {
    addHighlight(
      'ptsScoredOffTov',
      'Pts Scored Off TOV',
      validAwaySummary?.stats?.pointsScoredOffTurnovers,
      validHomeSummary?.stats?.pointsScoredOffTurnovers,
      false
    )
  }

  addHighlight('largestLead', 'Largest Lead', validAwaySummary?.stats?.largestLead, validHomeSummary?.stats?.largestLead)

  return { rows, highlights }
}

/**
 * Computes shooting zone percentages dynamically from actual game shots.
 */
export function computeShootingZones(shots: NBAShot[]): ShootingZoneSummary {
  const buckets = {
    paint: { made: 0, total: 0 },
    midRange: { made: 0, total: 0 },
    corner3: { made: 0, total: 0 },
    aboveBreak3: { made: 0, total: 0 },
  }

  for (const s of shots) {
    const z = s.zone
    if (z === 'Restricted Area' || z === 'In The Paint (Non-RA)') {
      buckets.paint.total++
      if (s.made) buckets.paint.made++
    } else if (z === 'Left Corner 3' || z === 'Right Corner 3') {
      buckets.corner3.total++
      if (s.made) buckets.corner3.made++
    } else if (z === 'Above the Break 3') {
      buckets.aboveBreak3.total++
      if (s.made) buckets.aboveBreak3.made++
    } else if (z === 'Mid-Range' || s.points === 2) {
      buckets.midRange.total++
      if (s.made) buckets.midRange.made++
    } else if (s.points === 3) {
      buckets.aboveBreak3.total++
      if (s.made) buckets.aboveBreak3.made++
    }
  }

  const fmt = (b: { made: number; total: number }) => ({
    ...b,
    pct: b.total > 0 ? `${Math.round((b.made / b.total) * 1000) / 10}%` : '--',
  })

  return {
    paint: fmt(buckets.paint),
    midRange: fmt(buckets.midRange),
    corner3: fmt(buckets.corner3),
    aboveBreak3: fmt(buckets.aboveBreak3),
  }
}
