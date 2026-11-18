import type {
  NBACompetitor,
  NBALeader,
  NBAShot,
  NBATeamSummary,
  NBAPlayerBoxLine,
} from '../types/nba'
import { sanitizeImageUrl } from './nbaHelpers.ts'

export interface TeamRecordBreakdown {
  overall: string
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
  awayValue: number
  homeValue: number
  awayRank?: string
  homeRank?: string
  lowerIsBetter?: boolean
  awaySharePct: number
  homeSharePct: number
  leaderSide: 'away' | 'home' | 'tie'
}

export interface GameHighlightMetric {
  key: string
  label: string
  awayDisplay: string
  homeDisplay: string
  awayValue: number
  homeValue: number
  leaderSide: 'away' | 'home' | 'tie'
}

export interface ShootingZoneSummary {
  paint: { made: number; total: number; pct: string }
  midRange: { made: number; total: number; pct: string }
  corner3: { made: number; total: number; pct: string }
  aboveBreak3: { made: number; total: number; pct: string }
}

const MISSING_IMAGE_SENTINEL = 'https://invalid.local/__missing__'

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

function parseStatNumber(val: unknown): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0
  if (typeof val !== 'string') return 0
  const cleaned = val.replace(/[^0-9.-]/g, '')
  const parsed = parseFloat(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatPctDisplay(val?: string): string {
  if (!val) return '-'
  const num = parseStatNumber(val)
  if (!Number.isFinite(num)) return '-'
  return `${num % 1 === 0 ? num.toFixed(0) : num.toFixed(1)}%`
}

function findCompetitorStat(comp?: NBACompetitor, names: string[] = []): { displayValue: string; rank?: string } | null {
  if (!comp?.statistics) return null
  for (const name of names) {
    const found = comp.statistics.find((s) => s.name === name)
    if (found && found.displayValue) {
      return { displayValue: found.displayValue, rank: found.rankDisplayValue }
    }
  }
  return null
}

/**
 * Extracts overall record, Home/Road splits, streak, and Last 10 record.
 */
export function extractRecordSummary(
  competitor?: NBACompetitor,
  teamSummary?: NBATeamSummary | null
): TeamRecordBreakdown {
  const records = competitor?.records || []
  const overall =
    records.find((r) => r.type === 'total' || r.name === 'overall')?.summary ||
    records[0]?.summary ||
    '0-0'
  const home = records.find((r) => r.type === 'home' || r.name === 'Home')?.summary
  const road = records.find((r) => r.type === 'road' || r.name === 'Road')?.summary

  return {
    overall,
    home,
    road,
    streak: teamSummary?.stats?.streak,
    lastTen: teamSummary?.stats?.lastTen,
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

  // Prefer scoreboard leaders immediately, merge summary leaders for extra summary line / headshots
  const primaryLeaders = competitor?.leaders?.length ? competitor.leaders : teamSummary?.leaders || []
  const secondaryLeaders = teamSummary?.leaders?.length ? teamSummary.leaders : competitor?.leaders || []

  const injuryMap = new Map<string, { status: string; detail?: string }>()
  if (isPre && teamSummary?.injuries) {
    for (const inj of teamSummary.injuries) {
      const key = normalizeName(inj.playerName)
      if (key) injuryMap.set(key, { status: inj.status, detail: inj.detail })
    }
  }

  const boxPlayerMap = new Map<string, NBAPlayerBoxLine>()
  if (!isPre && teamSummary?.topPlayers) {
    for (const p of teamSummary.topPlayers) {
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
      primaryValue: entry.displayValue || String(entry.value ?? '0'),
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
  awayValue: number,
  homeValue: number,
  options: { lowerIsBetter?: boolean; awayRank?: string; homeRank?: string } = {}
): TeamComparisonRow {
  const { lowerIsBetter = false, awayRank, homeRank } = options
  const safeAway = Number.isFinite(awayValue) ? Math.max(0, awayValue) : 0
  const safeHome = Number.isFinite(homeValue) ? Math.max(0, homeValue) : 0
  const total = safeAway + safeHome
  const awaySharePct = total > 0 ? Math.round((safeAway / total) * 100) : 50
  const homeSharePct = 100 - awaySharePct

  let leaderSide: 'away' | 'home' | 'tie' = 'tie'
  if (Math.abs(safeAway - safeHome) > 0.01) {
    if (lowerIsBetter) {
      leaderSide = safeAway < safeHome ? 'away' : 'home'
    } else {
      leaderSide = safeAway > safeHome ? 'away' : 'home'
    }
  }

  return {
    key,
    label,
    awayDisplay,
    homeDisplay,
    awayValue: safeAway,
    homeValue: safeHome,
    awayRank,
    homeRank,
    lowerIsBetter,
    awaySharePct,
    homeSharePct,
    leaderSide,
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

  if (gameState === 'pre') {
    const awayPpg = awaySummary?.stats?.avgPoints || findCompetitorStat(awayComp, ['avgPoints'])?.displayValue
    const homePpg = homeSummary?.stats?.avgPoints || findCompetitorStat(homeComp, ['avgPoints'])?.displayValue
    const awayPpgRank = findCompetitorStat(awayComp, ['points', 'avgPoints'])?.rank
    const homePpgRank = findCompetitorStat(homeComp, ['points', 'avgPoints'])?.rank
    if (awayPpg || homePpg) {
      rows.push(
        buildComparisonRow(
          'ppg',
          'Points / Game',
          awayPpg || '-',
          homePpg || '-',
          parseStatNumber(awayPpg),
          parseStatNumber(homePpg),
          { awayRank: awayPpgRank, homeRank: homePpgRank }
        )
      )
    }

    const awayOppPpg = awaySummary?.stats?.avgPointsAgainst
    const homeOppPpg = homeSummary?.stats?.avgPointsAgainst
    if (awayOppPpg || homeOppPpg) {
      rows.push(
        buildComparisonRow(
          'oppPpg',
          'Opp PPG Allowed',
          awayOppPpg || '-',
          homeOppPpg || '-',
          parseStatNumber(awayOppPpg),
          parseStatNumber(homeOppPpg),
          { lowerIsBetter: true }
        )
      )
    }

    const awayFg = findCompetitorStat(awayComp, ['fieldGoalPct'])?.displayValue || awaySummary?.stats?.fieldGoalPct
    const homeFg = findCompetitorStat(homeComp, ['fieldGoalPct'])?.displayValue || homeSummary?.stats?.fieldGoalPct
    const awayFgRank = findCompetitorStat(awayComp, ['fieldGoalPct'])?.rank
    const homeFgRank = findCompetitorStat(homeComp, ['fieldGoalPct'])?.rank
    if (awayFg || homeFg) {
      rows.push(
        buildComparisonRow(
          'fgPct',
          'Field Goal %',
          formatPctDisplay(awayFg),
          formatPctDisplay(homeFg),
          parseStatNumber(awayFg),
          parseStatNumber(homeFg),
          { awayRank: awayFgRank, homeRank: homeFgRank }
        )
      )
    }

    const away3p = findCompetitorStat(awayComp, ['threePointFieldGoalPct', 'threePointPct'])?.displayValue || awaySummary?.stats?.threePointPct
    const home3p = findCompetitorStat(homeComp, ['threePointFieldGoalPct', 'threePointPct'])?.displayValue || homeSummary?.stats?.threePointPct
    const away3pRank = findCompetitorStat(awayComp, ['threePointPct', 'threePointFieldGoalPct'])?.rank
    const home3pRank = findCompetitorStat(homeComp, ['threePointPct', 'threePointFieldGoalPct'])?.rank
    if (away3p || home3p) {
      rows.push(
        buildComparisonRow(
          'threePct',
          '3-Point %',
          formatPctDisplay(away3p),
          formatPctDisplay(home3p),
          parseStatNumber(away3p),
          parseStatNumber(home3p),
          { awayRank: away3pRank, homeRank: home3pRank }
        )
      )
    }

    const awayReb = awaySummary?.stats?.avgRebounds || findCompetitorStat(awayComp, ['avgRebounds'])?.displayValue
    const homeReb = homeSummary?.stats?.avgRebounds || findCompetitorStat(homeComp, ['avgRebounds'])?.displayValue
    if (awayReb || homeReb) {
      rows.push(
        buildComparisonRow(
          'rpg',
          'Rebounds / Game',
          awayReb || '-',
          homeReb || '-',
          parseStatNumber(awayReb),
          parseStatNumber(homeReb)
        )
      )
    }

    const awayAst = awaySummary?.stats?.avgAssists || findCompetitorStat(awayComp, ['avgAssists'])?.displayValue
    const homeAst = homeSummary?.stats?.avgAssists || findCompetitorStat(homeComp, ['avgAssists'])?.displayValue
    const awayAstRank = findCompetitorStat(awayComp, ['assists', 'avgAssists'])?.rank
    const homeAstRank = findCompetitorStat(homeComp, ['assists', 'avgAssists'])?.rank
    if (awayAst || homeAst) {
      rows.push(
        buildComparisonRow(
          'apg',
          'Assists / Game',
          awayAst || '-',
          homeAst || '-',
          parseStatNumber(awayAst),
          parseStatNumber(homeAst),
          { awayRank: awayAstRank, homeRank: homeAstRank }
        )
      )
    }

    const awayTov = awaySummary?.stats?.avgTurnovers
    const homeTov = homeSummary?.stats?.avgTurnovers
    if (awayTov || homeTov) {
      rows.push(
        buildComparisonRow(
          'tov',
          'Turnovers / Game',
          awayTov || '-',
          homeTov || '-',
          parseStatNumber(awayTov),
          parseStatNumber(homeTov),
          { lowerIsBetter: true }
        )
      )
    }

    return { rows, highlights }
  }

  // Post-game & Live Box Score Comparison
  const awayFgPct = awaySummary?.stats?.fieldGoalPct || findCompetitorStat(awayComp, ['fieldGoalPct'])?.displayValue
  const homeFgPct = homeSummary?.stats?.fieldGoalPct || findCompetitorStat(homeComp, ['fieldGoalPct'])?.displayValue
  const awayFgMadeAtt =
    awaySummary?.stats?.fgMadeAttempted ||
    (findCompetitorStat(awayComp, ['fieldGoalsMade']) && findCompetitorStat(awayComp, ['fieldGoalsAttempted'])
      ? `${findCompetitorStat(awayComp, ['fieldGoalsMade'])!.displayValue}-${findCompetitorStat(awayComp, ['fieldGoalsAttempted'])!.displayValue}`
      : '')
  const homeFgMadeAtt =
    homeSummary?.stats?.fgMadeAttempted ||
    (findCompetitorStat(homeComp, ['fieldGoalsMade']) && findCompetitorStat(homeComp, ['fieldGoalsAttempted'])
      ? `${findCompetitorStat(homeComp, ['fieldGoalsMade'])!.displayValue}-${findCompetitorStat(homeComp, ['fieldGoalsAttempted'])!.displayValue}`
      : '')
  if (awayFgPct || homeFgPct) {
    rows.push(
      buildComparisonRow(
        'fg',
        'Field Goals',
        awayFgMadeAtt ? `${awayFgMadeAtt} (${formatPctDisplay(awayFgPct)})` : formatPctDisplay(awayFgPct),
        homeFgMadeAtt ? `${homeFgMadeAtt} (${formatPctDisplay(homeFgPct)})` : formatPctDisplay(homeFgPct),
        parseStatNumber(awayFgPct),
        parseStatNumber(homeFgPct)
      )
    )
  }

  const away3pPct = awaySummary?.stats?.threePointPct || findCompetitorStat(awayComp, ['threePointFieldGoalPct', 'threePointPct'])?.displayValue
  const home3pPct = homeSummary?.stats?.threePointPct || findCompetitorStat(homeComp, ['threePointFieldGoalPct', 'threePointPct'])?.displayValue
  const away3pMadeAtt =
    awaySummary?.stats?.threePtMadeAttempted ||
    (findCompetitorStat(awayComp, ['threePointFieldGoalsMade']) && findCompetitorStat(awayComp, ['threePointFieldGoalsAttempted'])
      ? `${findCompetitorStat(awayComp, ['threePointFieldGoalsMade'])!.displayValue}-${findCompetitorStat(awayComp, ['threePointFieldGoalsAttempted'])!.displayValue}`
      : '')
  const home3pMadeAtt =
    homeSummary?.stats?.threePtMadeAttempted ||
    (findCompetitorStat(homeComp, ['threePointFieldGoalsMade']) && findCompetitorStat(homeComp, ['threePointFieldGoalsAttempted'])
      ? `${findCompetitorStat(homeComp, ['threePointFieldGoalsMade'])!.displayValue}-${findCompetitorStat(homeComp, ['threePointFieldGoalsAttempted'])!.displayValue}`
      : '')
  if (away3pPct || home3pPct) {
    rows.push(
      buildComparisonRow(
        'threePt',
        '3-Pointers',
        away3pMadeAtt ? `${away3pMadeAtt} (${formatPctDisplay(away3pPct)})` : formatPctDisplay(away3pPct),
        home3pMadeAtt ? `${home3pMadeAtt} (${formatPctDisplay(home3pPct)})` : formatPctDisplay(home3pPct),
        parseStatNumber(away3pPct),
        parseStatNumber(home3pPct)
      )
    )
  }

  const awayFtPct = awaySummary?.stats?.freeThrowPct || findCompetitorStat(awayComp, ['freeThrowPct'])?.displayValue
  const homeFtPct = homeSummary?.stats?.freeThrowPct || findCompetitorStat(homeComp, ['freeThrowPct'])?.displayValue
  const awayFtMadeAtt =
    awaySummary?.stats?.ftMadeAttempted ||
    (findCompetitorStat(awayComp, ['freeThrowsMade']) && findCompetitorStat(awayComp, ['freeThrowsAttempted'])
      ? `${findCompetitorStat(awayComp, ['freeThrowsMade'])!.displayValue}-${findCompetitorStat(awayComp, ['freeThrowsAttempted'])!.displayValue}`
      : '')
  const homeFtMadeAtt =
    homeSummary?.stats?.ftMadeAttempted ||
    (findCompetitorStat(homeComp, ['freeThrowsMade']) && findCompetitorStat(homeComp, ['freeThrowsAttempted'])
      ? `${findCompetitorStat(homeComp, ['freeThrowsMade'])!.displayValue}-${findCompetitorStat(homeComp, ['freeThrowsAttempted'])!.displayValue}`
      : '')
  if (awayFtPct || homeFtPct) {
    rows.push(
      buildComparisonRow(
        'ft',
        'Free Throws',
        awayFtMadeAtt ? `${awayFtMadeAtt} (${formatPctDisplay(awayFtPct)})` : formatPctDisplay(awayFtPct),
        homeFtMadeAtt ? `${homeFtMadeAtt} (${formatPctDisplay(homeFtPct)})` : formatPctDisplay(homeFtPct),
        parseStatNumber(awayFtPct),
        parseStatNumber(homeFtPct)
      )
    )
  }

  const awayReb = awaySummary?.stats?.totalRebounds || findCompetitorStat(awayComp, ['rebounds'])?.displayValue
  const homeReb = homeSummary?.stats?.totalRebounds || findCompetitorStat(homeComp, ['rebounds'])?.displayValue
  const awayOreb = awaySummary?.stats?.offensiveRebounds
  const homeOreb = homeSummary?.stats?.offensiveRebounds
  if (awayReb || homeReb) {
    rows.push(
      buildComparisonRow(
        'reb',
        'Rebounds (OREB)',
        awayOreb ? `${awayReb || '-'} (${awayOreb})` : awayReb || '-',
        homeOreb ? `${homeReb || '-'} (${homeOreb})` : homeReb || '-',
        parseStatNumber(awayReb),
        parseStatNumber(homeReb)
      )
    )
  }

  const awayAst = awaySummary?.stats?.assists || findCompetitorStat(awayComp, ['assists'])?.displayValue
  const homeAst = homeSummary?.stats?.assists || findCompetitorStat(homeComp, ['assists'])?.displayValue
  if (awayAst || homeAst) {
    rows.push(
      buildComparisonRow(
        'ast',
        'Assists',
        awayAst || '-',
        homeAst || '-',
        parseStatNumber(awayAst),
        parseStatNumber(homeAst)
      )
    )
  }

  const awayTov = awaySummary?.stats?.turnovers
  const homeTov = homeSummary?.stats?.turnovers
  if (awayTov || homeTov) {
    rows.push(
      buildComparisonRow(
        'tov',
        'Turnovers',
        awayTov || '-',
        homeTov || '-',
        parseStatNumber(awayTov),
        parseStatNumber(homeTov),
        { lowerIsBetter: true }
      )
    )
  }

  // Cool Hustle & Flow Game Highlights (from summary boxscore)
  const addHighlight = (key: string, label: string, aVal?: string, hVal?: string) => {
    if (!aVal && !hVal) return
    const av = parseStatNumber(aVal)
    const hv = parseStatNumber(hVal)
    highlights.push({
      key,
      label,
      awayDisplay: aVal || '0',
      homeDisplay: hVal || '0',
      awayValue: av,
      homeValue: hv,
      leaderSide: av === hv ? 'tie' : av > hv ? 'away' : 'home',
    })
  }

  addHighlight('paint', 'Points in Paint', awaySummary?.stats?.pointsInPaint, homeSummary?.stats?.pointsInPaint)
  addHighlight('fastBreak', 'Fast Break Pts', awaySummary?.stats?.fastBreakPoints, homeSummary?.stats?.fastBreakPoints)
  addHighlight('tovPts', 'Pts Off Turnovers', awaySummary?.stats?.turnoverPoints, homeSummary?.stats?.turnoverPoints)
  addHighlight('largestLead', 'Largest Lead', awaySummary?.stats?.largestLead, homeSummary?.stats?.largestLead)

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
