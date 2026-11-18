import type {
  NBAScoreboardData,
  NBAEvent,
  NBAShot,
  NBACompetition,
  NBALeader,
  NBAGameSummary,
  NBATeamSummary,
  NBATeamSummaryStats,
  NBAPlayerBoxLine,
  NBAInjuryItem,
  NBALastGameItem,
} from '../types/nba'
import { resolveAnnouncingCrew } from '../utils/announcers.ts'
import { sanitizeImageUrl } from '../utils/nbaHelpers.ts'
import { DashboardDomainError, TransientNetworkError, isAbortError } from '../utils/errors.ts'
import { withExponentialBackoff } from '../utils/retry.ts'
import { logger } from '../utils/logger.ts'

export const ESPN_NBA_SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard'
export const ESPN_NBA_SUMMARY_URL = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary'

export interface FetchNBAScoreboardResult {
  data: NBAScoreboardData
  sourceId: string
  sourceName: string
  responseTimeMs: number
  isCached: boolean
  cachedTimestamp?: string
}

interface CacheEntry {
  data: NBAScoreboardData
  timestamp: string
  expiresAt: number
}

// Multi-date LRU Cache with TTL to eliminate redundant network queries
const SCOREBOARD_CACHE = new Map<string, CacheEntry>()
const MAX_CACHE_ENTRIES = 15
const IN_FLIGHT_REQUESTS = new Map<string, Promise<FetchNBAScoreboardResult>>()

interface SummaryCacheEntry {
  data: NBAGameSummary
  gameState: string
  expiresAt: number
}

const SUMMARY_CACHE = new Map<string, SummaryCacheEntry>()
const MAX_SUMMARY_CACHE_ENTRIES = 20
const IN_FLIGHT_SUMMARY_REQUESTS = new Map<string, Promise<NBAGameSummary | null>>()

/**
 * Validates and sanitizes date parameter into strictly valid YYYYMMDD format.
 * Validates real calendar bounds (1946 to 2100), month bounds (01-12), and leap-year days.
 */
export function sanitizeDateParam(dateStr?: unknown): string | null {
  if (typeof dateStr !== 'string') return null
  const trimmed = dateStr.trim()

  let yStr = ''
  let mStr = ''
  let dStr = ''

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parts = trimmed.split('-')
    yStr = parts[0]
    mStr = parts[1]
    dStr = parts[2]
  } else if (/^\d{8}$/.test(trimmed)) {
    yStr = trimmed.slice(0, 4)
    mStr = trimmed.slice(4, 6)
    dStr = trimmed.slice(6, 8)
  } else {
    return null
  }

  const y = parseInt(yStr, 10)
  const m = parseInt(mStr, 10)
  const d = parseInt(dStr, 10)

  // Enforce NBA historical epoch (1946 founding to 2100)
  if (y < 1946 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) {
    return null
  }

  // Days in month check (handling leap years via UTC month zero)
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  if (d > daysInMonth) {
    return null
  }

  return `${yStr}${mStr}${dStr}`
}

/**
 * Clears the scoreboard cache (used for cache invalidation & tests).
 */
export function clearScoreboardCache(): void {
  SCOREBOARD_CACHE.clear()
  IN_FLIGHT_REQUESTS.clear()
}

/**
 * Clears the game summary cache (used for cache invalidation & tests).
 */
export function clearSummaryCache(): void {
  SUMMARY_CACHE.clear()
  IN_FLIGHT_SUMMARY_REQUESTS.clear()
}

const MISSING_HEADSHOT_SENTINEL = 'https://invalid.local/__missing__'

function sanitizeOptionalHeadshotUrl(url: unknown): string {
  if (typeof url !== 'string' || !url.trim()) return ''
  const sanitized = sanitizeImageUrl(url, MISSING_HEADSHOT_SENTINEL)
  return sanitized === MISSING_HEADSHOT_SENTINEL ? '' : sanitized
}

function sanitizeLeaderHeadshot(headshot: unknown): string | { href: string; alt?: string } | undefined {
  if (typeof headshot === 'string') {
    const safe = sanitizeOptionalHeadshotUrl(headshot)
    return safe || undefined
  }
  if (headshot && typeof headshot === 'object' && 'href' in headshot) {
    const obj = headshot as { href?: unknown; alt?: unknown }
    const safe = sanitizeOptionalHeadshotUrl(obj.href)
    if (!safe) return undefined
    return {
      href: safe,
      ...(typeof obj.alt === 'string' ? { alt: obj.alt } : {}),
    }
  }
  return undefined
}

function sanitizeLeaders(leaders: NBALeader[]): NBALeader[] {
  return leaders.map((group) => ({
    ...group,
    leaders: Array.isArray(group.leaders)
      ? group.leaders.map((entry) => ({
          ...entry,
          athlete: entry.athlete
            ? {
                ...entry.athlete,
                headshot: sanitizeLeaderHeadshot(entry.athlete.headshot),
              }
            : entry.athlete,
        }))
      : [],
  }))
}

/**
 * Immutably enriches and sanitizes raw NBA events from external feed.
 * Tracks assigned crews across the entire slate so no two games share the same broadcast crew.
 */
function enrichEvents(rawEvents: unknown[]): NBAEvent[] {
  if (!Array.isArray(rawEvents)) return []

  const assignedCrews = new Set<string>()
  const enriched: NBAEvent[] = []

  for (let idx = 0; idx < rawEvents.length; idx++) {
    const raw = rawEvents[idx]
    if (!raw || typeof raw !== 'object') continue
    const ev = raw as NBAEvent

    const competitions: NBACompetition[] = (Array.isArray(ev.competitions) ? ev.competitions : []).map((comp) => {
      const homeComp = comp.competitors?.find((c) => c.homeAway === 'home')
      const awayComp = comp.competitors?.find((c) => c.homeAway === 'away')

      const sanitizedCompetitors = (comp.competitors || []).map((c) => ({
        ...c,
        ...(Array.isArray(c.leaders) ? { leaders: sanitizeLeaders(c.leaders) } : {}),
        team: {
          ...c.team,
          logo: sanitizeImageUrl(c.team?.logo),
        },
      }))

      const crew = resolveAnnouncingCrew(
        comp,
        homeComp?.team?.abbreviation,
        awayComp?.team?.abbreviation,
        {
          gameDate: ev.date || comp.date,
          gameIndex: idx,
          assignedCrews,
        }
      )

      return {
        ...comp,
        competitors: sanitizedCompetitors,
        announcingCrew: crew,
      }
    })

    enriched.push({
      ...ev,
      competitions,
    })
  }

  return enriched
}

export function fetchNBAScoreboard(
  dateStr?: string,
  signal?: AbortSignal
): Promise<FetchNBAScoreboardResult> {
  const startTime = performance.now()
  const sanitizedDate = sanitizeDateParam(dateStr)
  const cacheKey = sanitizedDate || 'today'

  // 1. Check in-memory cache
  const cached = SCOREBOARD_CACHE.get(cacheKey)
  if (cached && Date.now() < cached.expiresAt) {
    return Promise.resolve({
      data: cached.data,
      sourceId: 'client-cache',
      sourceName: 'Cached NBA Scoreboard Feed',
      responseTimeMs: 0,
      isCached: true,
      cachedTimestamp: cached.timestamp,
    })
  }

  // If signal already aborted, fail fast without scheduling
  if (signal?.aborted) {
    const abortErr = new Error('The operation was aborted.')
    abortErr.name = 'AbortError'
    return Promise.reject(abortErr)
  }

  // 2. Reuse in-flight network request if already active
  const inFlight = IN_FLIGHT_REQUESTS.get(cacheKey)
  if (inFlight) {
    if (!signal) return inFlight
    return new Promise<FetchNBAScoreboardResult>((resolve, reject) => {
      const onAbort = () => {
        const abortErr = new Error('The operation was aborted.')
        abortErr.name = 'AbortError'
        reject(abortErr)
      }
      signal.addEventListener('abort', onAbort, { once: true })
      inFlight.then(
        (res) => {
          signal.removeEventListener('abort', onAbort)
          resolve(res)
        },
        (err) => {
          signal.removeEventListener('abort', onAbort)
          reject(err)
        }
      )
    })
  }

  const executeFetch = async (): Promise<FetchNBAScoreboardResult> => {
    const url = new URL(ESPN_NBA_SCOREBOARD_URL)
    if (sanitizedDate) {
      url.searchParams.set('dates', sanitizedDate)
    }

    try {
      const fetchRaw = async (fetchSignal?: AbortSignal) => {
        const response = await fetch(url.toString(), {
          signal: fetchSignal,
          headers: {
            Accept: 'application/json',
          },
        })

        if (!response.ok) {
          if (response.status >= 500 || response.status === 429) {
            throw new TransientNetworkError(`ESPN NBA API returned ${response.status}`, response.status)
          }
          throw new DashboardDomainError(`ESPN NBA API returned non-retryable ${response.status}`, `HTTP_${response.status}`)
        }

        const rawData = await response.json()
        if (!rawData || typeof rawData !== 'object') {
          throw new DashboardDomainError('Invalid JSON response structure from ESPN NBA API')
        }
        return rawData
      }

      const rawData = await withExponentialBackoff(
        fetchRaw,
        { maxRetries: 2, initialDelayMs: 50, maxDelayMs: 200, jitter: false },
        signal
      )

      const rawEvents = Array.isArray(rawData.events) ? rawData.events : []
      const enriched = enrichEvents(rawEvents)

      const scoreboard: NBAScoreboardData = {
        events: enriched.length > 0 ? enriched : MOCK_NBA_EVENTS,
        day: rawData.day,
        season: rawData.season,
      }

      // TTL Policy: Live games refresh every 10s; completed/pre-game slates cache for 5 minutes
      const hasLiveGames = scoreboard.events.some((e) => e.status?.type?.state === 'in')
      const ttlMs = hasLiveGames ? 10_000 : 300_000

      if (SCOREBOARD_CACHE.size >= MAX_CACHE_ENTRIES) {
        const oldestKey = SCOREBOARD_CACHE.keys().next().value
        if (oldestKey) SCOREBOARD_CACHE.delete(oldestKey)
      }

      const timestamp = new Date().toISOString()
      SCOREBOARD_CACHE.set(cacheKey, {
        data: scoreboard,
        timestamp,
        expiresAt: Date.now() + ttlMs,
      })

      return {
        data: scoreboard,
        sourceId: 'espn-api',
        sourceName: 'ESPN NBA Core Feed (Live CDN)',
        responseTimeMs: Math.round(performance.now() - startTime),
        isCached: false,
      }
    } catch (err: unknown) {
      // If aborted, rethrow immediately
      if (isAbortError(err)) {
        throw err
      }

      logger.warn('Scoreboard fetch encountered non-fatal failure; falling back to cache or redundancy', {
        date: sanitizedDate,
        cacheKey,
      }, err)

      // Fallback to cached (even if expired) or rich mock data
      if (cached) {
        return {
          data: cached.data,
          sourceId: 'client-cache-stale',
          sourceName: 'Cached NBA Scoreboard View (Stale)',
          responseTimeMs: Math.round(performance.now() - startTime),
          isCached: true,
          cachedTimestamp: cached.timestamp,
        }
      }

      return {
        data: {
          events: MOCK_NBA_EVENTS,
          day: { date: new Date().toISOString().slice(0, 10).replace(/-/g, '') },
          season: { type: 2, year: 2026 },
        },
        sourceId: 'mock-redundancy',
        sourceName: 'NBA Emergency Redundant Fallback Matrix',
        responseTimeMs: Math.round(performance.now() - startTime),
        isCached: true,
      }
    }
  }

  const fetchPromise = executeFetch().finally(() => {
    IN_FLIGHT_REQUESTS.delete(cacheKey)
  })

  IN_FLIGHT_REQUESTS.set(cacheKey, fetchPromise)

  if (signal) {
    return new Promise<FetchNBAScoreboardResult>((resolve, reject) => {
      const onAbort = () => {
        const abortErr = new Error('The operation was aborted.')
        abortErr.name = 'AbortError'
        reject(abortErr)
      }
      signal.addEventListener('abort', onAbort, { once: true })
      fetchPromise.then(
        (res) => {
          signal.removeEventListener('abort', onAbort)
          resolve(res)
        },
        (err) => {
          signal.removeEventListener('abort', onAbort)
          reject(err)
        }
      )
    })
  }

  return fetchPromise
}

// -----------------------------------------------------------------------------
// On-Demand Game Summary (Scouting Intel, Box Scores, Injuries, Real Shots)
// -----------------------------------------------------------------------------

const clampCoord = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val))

/**
 * Converts an ESPN play-by-play shooting event into an NBAShot in 94x50 SVG court space.
 * Filters out free throws and sentinel out-of-bounds coordinates.
 */
export function mapEspnPlayToShot(
  play: unknown,
  context: {
    awayTeamId?: string
    homeTeamId?: string
    awayAbbr?: string
    homeAbbr?: string
    athleteHeadshots?: Map<string, string>
  }
): NBAShot | null {
  if (!play || typeof play !== 'object') return null
  const p = play as {
    id?: unknown
    text?: unknown
    shootingPlay?: unknown
    scoringPlay?: unknown
    pointsAttempted?: unknown
    clock?: { displayValue?: unknown }
    period?: { number?: unknown }
    team?: { id?: unknown }
    participants?: Array<{ athlete?: { id?: unknown; displayName?: unknown } }>
    coordinate?: { x?: unknown; y?: unknown }
  }

  if (p.shootingPlay !== true) return null
  const text = typeof p.text === 'string' ? p.text : ''
  const ptsAttempted = typeof p.pointsAttempted === 'number' ? p.pointsAttempted : 0
  if (ptsAttempted === 1 || /free throw/i.test(text)) return null

  const rawX = p.coordinate?.x
  const rawY = p.coordinate?.y
  if (typeof rawX !== 'number' || typeof rawY !== 'number' || !Number.isFinite(rawX) || !Number.isFinite(rawY)) {
    return null
  }
  // ESPN uses ~0..50 width and -5..90 distance from rim; reject sentinel values like -214748340
  if (rawX < 0 || rawX > 50 || rawY < -5 || rawY > 90) return null

  const teamId = typeof p.team?.id === 'string' ? p.team.id : String(p.team?.id ?? '')
  const isAway = Boolean(context.awayTeamId && teamId === context.awayTeamId)
  const teamAbbr = isAway ? (context.awayAbbr || 'AWAY') : (context.homeAbbr || 'HOME')

  // Away shoots at right basket (86.5, 25); Home shoots at left basket (7.5, 25)
  const courtX = isAway ? clampCoord(86.5 - rawY, 3, 91) : clampCoord(7.5 + rawY, 3, 91)
  const courtY = isAway ? clampCoord(rawX, 3, 47) : clampCoord(50 - rawX, 3, 47)

  const points: 2 | 3 = ptsAttempted === 3 || /three point|3-point|3pt/i.test(text) ? 3 : 2
  const made = Boolean(p.scoringPlay)

  const distMatch = text.match(/(\d+)-foot/i)
  const distanceFeet = distMatch
    ? parseInt(distMatch[1], 10)
    : Math.max(1, Math.round(Math.hypot(rawX - 25, rawY)))

  let zone: NBAShot['zone']
  if (points === 3) {
    if (rawY <= 9 && (rawX <= 6 || rawX >= 44)) {
      zone = rawX < 25 ? 'Left Corner 3' : 'Right Corner 3'
    } else {
      zone = 'Above the Break 3'
    }
  } else if (distanceFeet <= 4) {
    zone = 'Restricted Area'
  } else if (rawY <= 14 && rawX >= 17 && rawX <= 33) {
    zone = 'In The Paint (Non-RA)'
  } else {
    zone = 'Mid-Range'
  }

  const participant = p.participants?.[0]?.athlete
  const athleteId = participant?.id ? String(participant.id) : ''
  const nameFromText = text.split(/\s+(?:makes|misses)\s+/i)[0]?.trim()
  const shooter =
    (typeof participant?.displayName === 'string' && participant.displayName) ||
    nameFromText ||
    'Player'

  const shooterPhoto = athleteId ? context.athleteHeadshots?.get(athleteId) : undefined

  return {
    id: typeof p.id === 'string' ? p.id : `shot-${teamId}-${Math.round(rawX)}-${Math.round(rawY)}-${Math.random().toString(36).slice(2, 7)}`,
    x: courtX,
    y: courtY,
    made,
    points,
    shooter,
    ...(shooterPhoto ? { shooterPhoto } : {}),
    teamId,
    teamAbbr,
    distanceFeet,
    clock: typeof p.clock?.displayValue === 'string' ? p.clock.displayValue : '0:00',
    period: typeof p.period?.number === 'number' ? p.period.number : 1,
    description: text || `${shooter} ${made ? 'makes' : 'misses'} ${points}-pointer`,
    zone,
  }
}

function parseTeamSummaryStats(rawStats: unknown[]): NBATeamSummaryStats {
  const stats: NBATeamSummaryStats = {}
  if (!Array.isArray(rawStats)) return stats

  const getVal = (names: string[]): string | undefined => {
    for (const n of names) {
      const found = rawStats.find(
        (item) => item && typeof item === 'object' && (item as { name?: string }).name === n
      ) as { displayValue?: unknown } | undefined
      if (found && typeof found.displayValue === 'string' && found.displayValue.trim()) {
        return found.displayValue.trim()
      }
    }
    return undefined
  }

  stats.streak = getVal(['streak'])
  stats.lastTen = getVal(['Last Ten Games', 'lastTenGames'])
  stats.avgPoints = getVal(['avgPoints'])
  stats.avgPointsAgainst = getVal(['avgPointsAgainst'])
  stats.fieldGoalPct = getVal(['fieldGoalPct'])
  stats.threePointPct = getVal(['threePointFieldGoalPct', 'threePointPct'])
  stats.freeThrowPct = getVal(['freeThrowPct'])
  stats.avgRebounds = getVal(['avgRebounds'])
  stats.avgAssists = getVal(['avgAssists'])
  stats.avgSteals = getVal(['avgSteals'])
  stats.avgBlocks = getVal(['avgBlocks'])
  stats.avgTurnovers = getVal(['avgTotalTurnovers', 'avgTurnovers'])
  stats.fgMadeAttempted = getVal(['fieldGoalsMade-fieldGoalsAttempted'])
  stats.threePtMadeAttempted = getVal(['threePointFieldGoalsMade-threePointFieldGoalsAttempted'])
  stats.ftMadeAttempted = getVal(['freeThrowsMade-freeThrowsAttempted'])
  stats.totalRebounds = getVal(['totalRebounds', 'rebounds'])
  stats.offensiveRebounds = getVal(['offensiveRebounds'])
  stats.defensiveRebounds = getVal(['defensiveRebounds'])
  stats.assists = getVal(['assists'])
  stats.steals = getVal(['steals'])
  stats.blocks = getVal(['blocks'])
  stats.turnovers = getVal(['turnovers', 'totalTurnovers'])
  stats.pointsInPaint = getVal(['pointsInPaint'])
  stats.fastBreakPoints = getVal(['fastBreakPoints'])
  stats.turnoverPoints = getVal(['turnoverPoints'])
  stats.largestLead = getVal(['largestLead'])
  stats.leadChanges = getVal(['leadChanges'])
  stats.leadPercentage = getVal(['leadPercentage'])

  return stats
}

function parseBoxPlayers(
  rawGroup: unknown,
  athleteHeadshots: Map<string, string>
): NBAPlayerBoxLine[] {
  if (!rawGroup || typeof rawGroup !== 'object') return []
  const group = rawGroup as {
    statistics?: Array<{
      labels?: unknown[]
      athletes?: Array<{
        didNotPlay?: boolean
        starter?: boolean
        athlete?: {
          id?: unknown
          displayName?: unknown
          shortName?: unknown
          jersey?: unknown
          position?: { abbreviation?: unknown }
          headshot?: unknown
        }
        stats?: unknown[]
      }>
    }>
  }

  const statBlock = group.statistics?.[0]
  if (!statBlock || !Array.isArray(statBlock.labels) || !Array.isArray(statBlock.athletes)) {
    return []
  }

  const labels = statBlock.labels.map((l) => String(l).toUpperCase())
  const idx = {
    min: labels.indexOf('MIN'),
    pts: labels.indexOf('PTS'),
    fg: labels.indexOf('FG'),
    threePt: labels.indexOf('3PT'),
    ft: labels.indexOf('FT'),
    reb: labels.indexOf('REB'),
    ast: labels.indexOf('AST'),
    to: labels.indexOf('TO'),
    stl: labels.indexOf('STL'),
    blk: labels.indexOf('BLK'),
    pm: labels.indexOf('+/-'),
  }

  const getCell = (row: unknown[], colIdx: number, fallback = '0'): string => {
    if (colIdx < 0 || colIdx >= row.length) return fallback
    const val = row[colIdx]
    return val !== undefined && val !== null && String(val).trim() ? String(val).trim() : fallback
  }

  const players: NBAPlayerBoxLine[] = []
  for (const item of statBlock.athletes) {
    if (!item || item.didNotPlay || !Array.isArray(item.stats) || item.stats.length === 0) continue
    const ath = item.athlete
    if (!ath) continue

    const id = ath.id ? String(ath.id) : ''
    const headshot = sanitizeOptionalHeadshotUrl(
      typeof ath.headshot === 'string'
        ? ath.headshot
        : (ath.headshot as { href?: unknown } | undefined)?.href
    )
    if (id && headshot) {
      athleteHeadshots.set(id, headshot)
    }

    const pts = parseInt(getCell(item.stats, idx.pts, '0'), 10) || 0
    const reb = parseInt(getCell(item.stats, idx.reb, '0'), 10) || 0
    const ast = parseInt(getCell(item.stats, idx.ast, '0'), 10) || 0
    const stl = parseInt(getCell(item.stats, idx.stl, '0'), 10) || 0
    const blk = parseInt(getCell(item.stats, idx.blk, '0'), 10) || 0
    const tov = parseInt(getCell(item.stats, idx.to, '0'), 10) || 0

    players.push({
      id: id || String(ath.displayName || 'player'),
      name: typeof ath.displayName === 'string' ? ath.displayName : 'Player',
      shortName: typeof ath.shortName === 'string' ? ath.shortName : (typeof ath.displayName === 'string' ? ath.displayName : 'Player'),
      jersey: typeof ath.jersey === 'string' ? ath.jersey : undefined,
      position: typeof ath.position?.abbreviation === 'string' ? ath.position.abbreviation : undefined,
      ...(headshot ? { headshot } : {}),
      starter: Boolean(item.starter),
      min: getCell(item.stats, idx.min, '0'),
      pts,
      reb,
      ast,
      fg: getCell(item.stats, idx.fg, '0-0'),
      threePt: getCell(item.stats, idx.threePt, '0-0'),
      ft: getCell(item.stats, idx.ft, '0-0'),
      stl,
      blk,
      tov,
      plusMinus: getCell(item.stats, idx.pm, '0'),
    })
  }

  players.sort((a, b) => b.pts - a.pts || b.reb + b.ast - (a.reb + a.ast))
  return players.slice(0, 8)
}

/**
 * Parses ESPN's game summary endpoint payload into a typed NBAGameSummary object.
 */
export function parseSummaryPayload(
  eventId: string,
  raw: unknown,
  context: {
    homeTeamId?: string
    awayTeamId?: string
    homeAbbr?: string
    awayAbbr?: string
  } = {}
): NBAGameSummary | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as {
    boxscore?: {
      teams?: Array<{
        team?: { id?: unknown; abbreviation?: unknown }
        homeAway?: unknown
        statistics?: unknown[]
      }>
      players?: Array<{
        team?: { id?: unknown; abbreviation?: unknown }
      }>
    }
    leaders?: Array<{
      team?: { id?: unknown; abbreviation?: unknown }
      leaders?: NBALeader[]
    }>
    injuries?: Array<{
      team?: { id?: unknown; abbreviation?: unknown }
      injuries?: Array<{
        status?: unknown
        details?: { type?: unknown }
        athlete?: { displayName?: unknown; position?: { abbreviation?: unknown } }
      }>
    }>
    lastFiveGames?: Array<{
      team?: { id?: unknown; abbreviation?: unknown }
      events?: Array<{
        gameResult?: unknown
        score?: unknown
        homeAway?: unknown
        opponent?: { abbreviation?: unknown }
      }>
    }>
    predictor?: {
      homeTeam?: { gameProjection?: unknown }
      awayTeam?: { gameProjection?: unknown }
    }
    seasonseries?: Array<{ summary?: unknown }>
    gameInfo?: {
      attendance?: unknown
      officials?: Array<{ displayName?: unknown; fullName?: unknown }>
    }
    plays?: unknown[]
    header?: {
      competitions?: Array<{
        competitors?: Array<{
          id?: unknown
          homeAway?: unknown
          team?: { id?: unknown; abbreviation?: unknown }
        }>
      }>
    }
  }

  // Resolve home & away team IDs from header or context
  const headerComps = data.header?.competitions?.[0]?.competitors || []
  const resolvedHomeComp = headerComps.find((c) => c.homeAway === 'home')
  const resolvedAwayComp = headerComps.find((c) => c.homeAway === 'away')

  const homeTeamId =
    context.homeTeamId ||
    (resolvedHomeComp?.team?.id ? String(resolvedHomeComp.team.id) : resolvedHomeComp?.id ? String(resolvedHomeComp.id) : undefined)
  const awayTeamId =
    context.awayTeamId ||
    (resolvedAwayComp?.team?.id ? String(resolvedAwayComp.team.id) : resolvedAwayComp?.id ? String(resolvedAwayComp.id) : undefined)
  const homeAbbr =
    context.homeAbbr ||
    (typeof resolvedHomeComp?.team?.abbreviation === 'string' ? resolvedHomeComp.team.abbreviation : 'HOME')
  const awayAbbr =
    context.awayAbbr ||
    (typeof resolvedAwayComp?.team?.abbreviation === 'string' ? resolvedAwayComp.team.abbreviation : 'AWAY')

  const athleteHeadshots = new Map<string, string>()

  const buildTeamSummary = (side: 'home' | 'away'): NBATeamSummary | null => {
    const targetId = side === 'home' ? homeTeamId : awayTeamId
    const targetAbbr = side === 'home' ? homeAbbr : awayAbbr

    const matchesTeam = (teamObj?: { id?: unknown; abbreviation?: unknown }, explicitSide?: unknown) => {
      if (explicitSide === side) return true
      if (targetId && teamObj?.id && String(teamObj.id) === targetId) return true
      if (targetAbbr && typeof teamObj?.abbreviation === 'string' && teamObj.abbreviation.toUpperCase() === targetAbbr.toUpperCase()) {
        return true
      }
      return false
    }

    const boxTeam = data.boxscore?.teams?.find((t) => matchesTeam(t.team, t.homeAway))
    const leaderGroup = data.leaders?.find((l) => matchesTeam(l.team))
    const playerGroup = data.boxscore?.players?.find((p) => matchesTeam(p.team))
    const injuryGroup = data.injuries?.find((i) => matchesTeam(i.team))
    const lastFiveGroup = data.lastFiveGames?.find((g) => matchesTeam(g.team))

    if (!boxTeam && !leaderGroup && !playerGroup && !injuryGroup && !lastFiveGroup) {
      return null
    }

    const stats = parseTeamSummaryStats(boxTeam?.statistics || [])
    const leaders = Array.isArray(leaderGroup?.leaders) ? sanitizeLeaders(leaderGroup.leaders) : []
    const topPlayers = parseBoxPlayers(playerGroup, athleteHeadshots)

    const injuries: NBAInjuryItem[] = Array.isArray(injuryGroup?.injuries)
      ? injuryGroup.injuries
          .filter((inj) => inj?.athlete?.displayName && inj?.status)
          .slice(0, 8)
          .map((inj) => ({
            playerName: String(inj.athlete!.displayName),
            position: typeof inj.athlete?.position?.abbreviation === 'string' ? inj.athlete.position.abbreviation : undefined,
            status: String(inj.status),
            detail: typeof inj.details?.type === 'string' ? inj.details.type : undefined,
          }))
      : []

    const lastFiveGames: NBALastGameItem[] = Array.isArray(lastFiveGroup?.events)
      ? lastFiveGroup.events
          .slice(0, 5)
          .filter((ev) => ev?.gameResult === 'W' || ev?.gameResult === 'L')
          .map((ev) => ({
            result: ev.gameResult as 'W' | 'L',
            score: typeof ev.score === 'string' ? ev.score : '',
            opponentAbbr: typeof ev.opponent?.abbreviation === 'string' ? ev.opponent.abbreviation : '',
            homeAway: typeof ev.homeAway === 'string' ? ev.homeAway : undefined,
          }))
      : []

    return {
      teamId: targetId || String(boxTeam?.team?.id || ''),
      abbreviation: targetAbbr,
      homeAway: side,
      leaders,
      stats,
      topPlayers,
      injuries,
      lastFiveGames,
    }
  }

  const awayTeam = buildTeamSummary('away')
  const homeTeam = buildTeamSummary('home')

  const shots: NBAShot[] = []
  if (Array.isArray(data.plays)) {
    for (const play of data.plays) {
      const mapped = mapEspnPlayToShot(play, {
        awayTeamId,
        homeTeamId,
        awayAbbr,
        homeAbbr,
        athleteHeadshots,
      })
      if (mapped) shots.push(mapped)
    }
  }

  let predictor: NBAGameSummary['predictor']
  const homeProj = parseFloat(String(data.predictor?.homeTeam?.gameProjection ?? ''))
  const awayProj = parseFloat(String(data.predictor?.awayTeam?.gameProjection ?? ''))
  if (Number.isFinite(homeProj) && Number.isFinite(awayProj)) {
    predictor = { homeWinPct: homeProj, awayWinPct: awayProj }
  }

  const seasonSeries =
    typeof data.seasonseries?.[0]?.summary === 'string'
      ? data.seasonseries[0].summary
      : undefined

  const attendance =
    typeof data.gameInfo?.attendance === 'number' && data.gameInfo.attendance > 0
      ? data.gameInfo.attendance
      : undefined

  const officials = Array.isArray(data.gameInfo?.officials)
    ? data.gameInfo.officials
        .map((o) => (typeof o.displayName === 'string' ? o.displayName : typeof o.fullName === 'string' ? o.fullName : ''))
        .filter(Boolean)
    : undefined

  return {
    eventId,
    awayTeam,
    homeTeam,
    shots,
    predictor,
    seasonSeries,
    attendance,
    officials,
  }
}

/**
 * Fetches rich game summary intelligence (scouting splits, injuries, last-5, full box score, and shots)
 * for a spotlighted NBA event with TTL caching, in-flight deduplication, and silent graceful fallback.
 */
export function fetchNBAGameSummary(
  eventId: string,
  gameState: 'pre' | 'in' | 'post' | string = 'pre',
  signal?: AbortSignal,
  context: {
    homeTeamId?: string
    awayTeamId?: string
    homeAbbr?: string
    awayAbbr?: string
  } = {}
): Promise<NBAGameSummary | null> {
  const cleanId = typeof eventId === 'string' ? eventId.replace(/[^A-Za-z0-9_-]/g, '') : ''
  if (!cleanId) return Promise.resolve(null)

  const mockSummary = MOCK_GAME_SUMMARIES.get(cleanId)
  if (mockSummary) {
    return Promise.resolve(mockSummary)
  }

  const cacheKey = cleanId
  const cached = SUMMARY_CACHE.get(cacheKey)
  if (cached && cached.gameState === gameState && Date.now() < cached.expiresAt) {
    return Promise.resolve(cached.data)
  }

  if (signal?.aborted) {
    const abortErr = new Error('The operation was aborted.')
    abortErr.name = 'AbortError'
    return Promise.reject(abortErr)
  }

  const inFlight = IN_FLIGHT_SUMMARY_REQUESTS.get(cacheKey)
  if (inFlight) {
    if (!signal) return inFlight
    return new Promise<NBAGameSummary | null>((resolve, reject) => {
      const onAbort = () => {
        const abortErr = new Error('The operation was aborted.')
        abortErr.name = 'AbortError'
        reject(abortErr)
      }
      signal.addEventListener('abort', onAbort, { once: true })
      inFlight.then(
        (res) => {
          signal.removeEventListener('abort', onAbort)
          resolve(res)
        },
        (err) => {
          signal.removeEventListener('abort', onAbort)
          reject(err)
        }
      )
    })
  }

  const executeFetch = async (): Promise<NBAGameSummary | null> => {
    const url = new URL(ESPN_NBA_SUMMARY_URL)
    url.searchParams.set('event', cleanId)

    try {
      const fetchRaw = async (fetchSignal?: AbortSignal) => {
        const response = await fetch(url.toString(), {
          signal: fetchSignal,
          headers: { Accept: 'application/json' },
        })
        if (!response.ok) {
          if (response.status >= 500 || response.status === 429) {
            throw new TransientNetworkError(`ESPN Summary API returned ${response.status}`, response.status)
          }
          throw new DashboardDomainError(`ESPN Summary API returned ${response.status}`, `HTTP_${response.status}`)
        }
        return response.json()
      }

      const rawData = await withExponentialBackoff(
        fetchRaw,
        { maxRetries: 1, initialDelayMs: 60, maxDelayMs: 180, jitter: false },
        signal
      )

      const parsed = parseSummaryPayload(cleanId, rawData, context)
      if (!parsed) return null

      const ttlMs = gameState === 'in' ? 15_000 : gameState === 'post' ? 1_800_000 : 300_000
      if (SUMMARY_CACHE.size >= MAX_SUMMARY_CACHE_ENTRIES) {
        const oldestKey = SUMMARY_CACHE.keys().next().value
        if (oldestKey) SUMMARY_CACHE.delete(oldestKey)
      }
      SUMMARY_CACHE.set(cacheKey, {
        data: parsed,
        gameState,
        expiresAt: Date.now() + ttlMs,
      })

      return parsed
    } catch (err: unknown) {
      if (isAbortError(err)) throw err
      logger.warn('Game summary fetch unavailable; using scoreboard baseline data', { eventId: cleanId }, err)
      return cached?.data ?? null
    }
  }

  const fetchPromise = executeFetch().finally(() => {
    IN_FLIGHT_SUMMARY_REQUESTS.delete(cacheKey)
  })

  IN_FLIGHT_SUMMARY_REQUESTS.set(cacheKey, fetchPromise)

  if (signal) {
    return new Promise<NBAGameSummary | null>((resolve, reject) => {
      const onAbort = () => {
        const abortErr = new Error('The operation was aborted.')
        abortErr.name = 'AbortError'
        reject(abortErr)
      }
      signal.addEventListener('abort', onAbort, { once: true })
      fetchPromise.then(
        (res) => {
          signal.removeEventListener('abort', onAbort)
          resolve(res)
        },
        (err) => {
          signal.removeEventListener('abort', onAbort)
          reject(err)
        }
      )
    })
  }

  return fetchPromise
}

// -----------------------------------------------------------------------------
// High-Fidelity Mock NBA Events with Live Court Shots, Announcing Crews, Runs
// -----------------------------------------------------------------------------

const MOCK_CELTICS_PISTONS_SHOTS: NBAShot[] = [
  {
    id: 'shot-1',
    shooter: 'Jayson Tatum',
    teamId: '2',
    teamAbbr: 'BOS',
    x: 82,
    y: 25,
    made: true,
    points: 3,
    distanceFeet: 27,
    clock: '5:42',
    period: 4,
    description: 'Jayson Tatum makes 27-foot step-back 3-pointer',
    zone: 'Above the Break 3',
  },
  {
    id: 'shot-2',
    shooter: 'Cade Cunningham',
    teamId: '8',
    teamAbbr: 'DET',
    x: 88,
    y: 25,
    made: true,
    points: 2,
    distanceFeet: 9,
    clock: '5:18',
    period: 4,
    description: 'Cade Cunningham makes driving floating jump shot',
    zone: 'Restricted Area',
  },
  {
    id: 'shot-3',
    shooter: 'Jaylen Brown',
    teamId: '2',
    teamAbbr: 'BOS',
    x: 89,
    y: 25,
    made: true,
    points: 2,
    distanceFeet: 4,
    clock: '4:55',
    period: 4,
    description: 'Jaylen Brown makes thunderous fast break dunk',
    zone: 'Restricted Area',
  },
  {
    id: 'shot-4',
    shooter: 'Jaden Ivey',
    teamId: '8',
    teamAbbr: 'DET',
    x: 75,
    y: 45,
    made: false,
    points: 3,
    distanceFeet: 23,
    clock: '4:38',
    period: 4,
    description: 'Jaden Ivey misses 23-foot right corner 3-pointer',
    zone: 'Right Corner 3',
  },
  {
    id: 'shot-5',
    shooter: 'Derrick White',
    teamId: '2',
    teamAbbr: 'BOS',
    x: 75,
    y: 5,
    made: true,
    points: 3,
    distanceFeet: 22,
    clock: '4:18',
    period: 4,
    description: 'Derrick White makes 22-foot left corner 3-pointer',
    zone: 'Left Corner 3',
  },
  {
    id: 'shot-6',
    shooter: 'Jalen Duren',
    teamId: '8',
    teamAbbr: 'DET',
    x: 90,
    y: 25,
    made: true,
    points: 2,
    distanceFeet: 2,
    clock: '3:50',
    period: 4,
    description: 'Jalen Duren makes alley-oop slam from Cade Cunningham',
    zone: 'Restricted Area',
  },
  {
    id: 'shot-7',
    shooter: 'Jrue Holiday',
    teamId: '2',
    teamAbbr: 'BOS',
    x: 80,
    y: 15,
    made: false,
    points: 2,
    distanceFeet: 16,
    clock: '3:22',
    period: 4,
    description: 'Jrue Holiday misses 16-foot pull-up jump shot',
    zone: 'Mid-Range',
  },
  {
    id: 'shot-8',
    shooter: 'Cade Cunningham',
    teamId: '8',
    teamAbbr: 'DET',
    x: 78,
    y: 28,
    made: true,
    points: 3,
    distanceFeet: 26,
    clock: '3:05',
    period: 4,
    description: 'Cade Cunningham makes 26-foot pullup 3-pointer',
    zone: 'Above the Break 3',
  },
]

export const MOCK_NBA_EVENTS: NBAEvent[] = [
  // 1. Boston Celtics at Detroit Pistons (Live 4th Quarter Clutch Thriller)
  {
    id: '401909088',
    uid: 's:40~l:46~e:401909088',
    date: new Date().toISOString(),
    name: 'Boston Celtics at Detroit Pistons',
    shortName: 'BOS @ DET',
    status: {
      clock: 258,
      displayClock: '4:18',
      period: 4,
      type: {
        id: '2',
        name: 'STATUS_IN_PROGRESS',
        state: 'in',
        completed: false,
        description: 'In Progress',
        detail: 'Q4 4:18',
        shortDetail: 'Q4 4:18',
      },
    },
    competitions: [
      {
        id: '401909088',
        uid: 's:40~l:46~e:401909088~c:401909088',
        date: new Date().toISOString(),
        venue: {
          fullName: 'Little Caesars Arena',
          address: { city: 'Detroit', state: 'MI' },
        },
        broadcasts: [{ market: 'National', names: ['NBC'] }],
        announcingCrew: {
          network: 'NBC Sports',
          market: 'National',
          playByPlay: 'Terry Gannon',
          colorAnalyst: 'Brad Daugherty & Robbie Hummel',
          sidelineReporter: 'Zora Stephenson',
          radioNetwork: '98.5 The Sports Hub (BOS) / 97.1 The Ticket (DET)',
          officials: [
            { name: 'Scott Foster', role: 'Crew Chief (#48)' },
            { name: 'Ed Malloy', role: 'Referee (#14)' },
            { name: 'Aaron Smith', role: 'Umpire (#51)' },
          ],
        },
        situation: {
          possession: '2',
          possessionText: 'Boston Celtics Possession',
          shotClock: 14,
          homeFouls: 5,
          awayFouls: 4,
          homeTimeouts: 2,
          awayTimeouts: 2,
          isClutch: true,
          scoringRun: {
            teamId: '2',
            teamAbbr: 'BOS',
            points: 11,
            opponentPoints: 2,
            durationText: 'over last 3:15',
          },
          lastPlay: {
            id: 'play-bos-1',
            text: 'Derrick White makes 22-foot left corner 3-pointer (Jayson Tatum assists)',
            scoringPlay: true,
            scoreValue: 3,
            clock: { displayValue: '4:18' },
            period: { number: 4, displayValue: '4th Quarter' },
            team: { id: '2' },
            shootingPlay: true,
          },
        },
        shots: MOCK_CELTICS_PISTONS_SHOTS,
        odds: [
          {
            details: 'BOS -7.5',
            spread: -7.5,
            overUnder: 224.5,
            awayTeamOdds: { favorite: true },
            homeTeamOdds: { underdog: true },
          },
        ],
        competitors: [
          {
            id: '8',
            homeAway: 'home',
            score: '96',
            linescores: [
              { value: 24, displayValue: '24', period: 1 },
              { value: 26, displayValue: '26', period: 2 },
              { value: 27, displayValue: '27', period: 3 },
              { value: 19, displayValue: '19', period: 4 },
            ],
            records: [{ summary: '44-38' }],
            fouls: 5,
            timeouts: 2,
            inBonus: true,
            team: {
              id: '8',
              name: 'Pistons',
              displayName: 'Detroit Pistons',
              abbreviation: 'DET',
              location: 'Detroit',
              color: '1d42ba',
              alternateColor: 'bec0c2',
              logo: 'https://a.espncdn.com/i/teamlogos/nba/500/det.png',
            },
          },
          {
            id: '2',
            homeAway: 'away',
            score: '98',
            linescores: [
              { value: 28, displayValue: '28', period: 1 },
              { value: 25, displayValue: '25', period: 2 },
              { value: 24, displayValue: '24', period: 3 },
              { value: 21, displayValue: '21', period: 4 },
            ],
            records: [{ summary: '57-25' }],
            fouls: 4,
            timeouts: 2,
            inBonus: false,
            team: {
              id: '2',
              name: 'Celtics',
              displayName: 'Boston Celtics',
              abbreviation: 'BOS',
              location: 'Boston',
              color: '007a33',
              alternateColor: 'ba9653',
              logo: 'https://a.espncdn.com/i/teamlogos/nba/500/bos.png',
            },
          },
        ],
      },
    ],
  },

  // 2. Philadelphia 76ers at New York Knicks (Live Halftime at MSG)
  {
    id: '401909089',
    uid: 's:40~l:46~e:401909089',
    date: new Date().toISOString(),
    name: 'Philadelphia 76ers at New York Knicks',
    shortName: 'PHI @ NYK',
    status: {
      clock: 0,
      displayClock: '0:00',
      period: 2,
      type: {
        id: '2',
        name: 'STATUS_HALFTIME',
        state: 'in',
        completed: false,
        description: 'Halftime',
        detail: 'Halftime',
        shortDetail: 'Half',
      },
    },
    competitions: [
      {
        id: '401909089',
        uid: 's:40~l:46~e:401909089~c:401909089',
        date: new Date().toISOString(),
        venue: {
          fullName: 'Madison Square Garden',
          address: { city: 'New York', state: 'NY' },
        },
        broadcasts: [{ market: 'National', names: ['ABC'] }],
        announcingCrew: {
          network: 'ABC / ESPN',
          market: 'National',
          playByPlay: 'Mike Breen',
          colorAnalyst: 'Doris Burke & Richard Jefferson',
          sidelineReporter: 'Lisa Salters',
          radioNetwork: 'ESPN Radio (Marc Kestecher) / 98.7 ESPN NY',
          officials: [
            { name: 'Tony Brothers', role: 'Crew Chief (#25)' },
            { name: 'Courtney Kirkland', role: 'Referee (#61)' },
            { name: 'Mitchell Ervin', role: 'Umpire (#27)' },
          ],
        },
        situation: {
          possession: '18',
          possessionText: 'Halftime Intermission',
          shotClock: 24,
          homeFouls: 2,
          awayFouls: 3,
          homeTimeouts: 4,
          awayTimeouts: 5,
          isClutch: false,
          lastPlay: {
            id: 'play-nyk-half',
            text: 'Jalen Brunson buzzer-beating step-back 21ft jumper',
            scoringPlay: true,
            scoreValue: 2,
            clock: { displayValue: '0:00' },
            period: { number: 2, displayValue: '2nd Quarter' },
            team: { id: '18' },
          },
        },
        odds: [
          {
            details: 'NYK -4.0',
            spread: -4.0,
            overUnder: 215.5,
            homeTeamOdds: { favorite: true },
            awayTeamOdds: { underdog: true },
          },
        ],
        competitors: [
          {
            id: '18',
            homeAway: 'home',
            score: '58',
            linescores: [
              { value: 29, displayValue: '29', period: 1 },
              { value: 29, displayValue: '29', period: 2 },
            ],
            records: [{ summary: '51-31' }],
            team: {
              id: '18',
              name: 'Knicks',
              displayName: 'New York Knicks',
              abbreviation: 'NYK',
              location: 'New York',
              color: '006bb6',
              alternateColor: 'f58426',
              logo: 'https://a.espncdn.com/i/teamlogos/nba/500/nyk.png',
            },
          },
          {
            id: '20',
            homeAway: 'away',
            score: '55',
            linescores: [
              { value: 26, displayValue: '26', period: 1 },
              { value: 29, displayValue: '29', period: 2 },
            ],
            records: [{ summary: '47-35' }],
            team: {
              id: '20',
              name: '76ers',
              displayName: 'Philadelphia 76ers',
              abbreviation: 'PHI',
              location: 'Philadelphia',
              color: '006bb6',
              alternateColor: 'ed174c',
              logo: 'https://a.espncdn.com/i/teamlogos/nba/500/phi.png',
            },
          },
        ],
      },
    ],
  },

  // 3. Golden State Warriors at Los Angeles Lakers (Live 3rd Quarter Showdown)
  {
    id: '401909090',
    uid: 's:40~l:46~e:401909090',
    date: new Date().toISOString(),
    name: 'Golden State Warriors at Los Angeles Lakers',
    shortName: 'GSW @ LAL',
    status: {
      clock: 142,
      displayClock: '2:22',
      period: 3,
      type: {
        id: '2',
        name: 'STATUS_IN_PROGRESS',
        state: 'in',
        completed: false,
        description: 'In Progress',
        detail: 'Q3 2:22',
        shortDetail: 'Q3 2:22',
      },
    },
    competitions: [
      {
        id: '401909090',
        uid: 's:40~l:46~e:401909090~c:401909090',
        date: new Date().toISOString(),
        venue: {
          fullName: 'Crypto.com Arena',
          address: { city: 'Los Angeles', state: 'CA' },
        },
        broadcasts: [{ market: 'National', names: ['TNT'] }],
        announcingCrew: {
          network: 'TNT Sports',
          market: 'National',
          playByPlay: 'Kevin Harlan',
          colorAnalyst: 'Reggie Miller & Stan Van Gundy',
          sidelineReporter: 'Allie LaForce',
          radioNetwork: 'Westwood One Sports / ESPN LA 710',
          officials: [
            { name: 'Zach Zarba', role: 'Crew Chief (#15)' },
            { name: 'Bill Kennedy', role: 'Referee (#55)' },
            { name: 'Natalie Sago', role: 'Umpire (#9)' },
          ],
        },
        situation: {
          possession: '13',
          possessionText: 'Los Angeles Lakers Possession',
          shotClock: 9,
          homeFouls: 3,
          awayFouls: 4,
          homeTimeouts: 3,
          awayTimeouts: 4,
          isClutch: false,
          scoringRun: {
            teamId: '9',
            teamAbbr: 'GSW',
            points: 8,
            opponentPoints: 0,
            durationText: 'over last 1:45',
          },
          lastPlay: {
            id: 'play-gsw-curry',
            text: 'Stephen Curry 29ft step-back 3-pointer from the logo!',
            scoringPlay: true,
            scoreValue: 3,
            clock: { displayValue: '2:22' },
            period: { number: 3, displayValue: '3rd Quarter' },
            team: { id: '9' },
          },
        },
        odds: [
          {
            details: 'LAL -2.5',
            spread: -2.5,
            overUnder: 231.5,
            homeTeamOdds: { favorite: true },
            awayTeamOdds: { underdog: true },
          },
        ],
        competitors: [
          {
            id: '13',
            homeAway: 'home',
            score: '84',
            linescores: [
              { value: 31, displayValue: '31', period: 1 },
              { value: 27, displayValue: '27', period: 2 },
              { value: 26, displayValue: '26', period: 3 },
            ],
            records: [{ summary: '48-34' }],
            team: {
              id: '13',
              name: 'Lakers',
              displayName: 'Los Angeles Lakers',
              abbreviation: 'LAL',
              location: 'Los Angeles',
              color: '552583',
              alternateColor: 'fdb927',
              logo: 'https://a.espncdn.com/i/teamlogos/nba/500/lal.png',
            },
          },
          {
            id: '9',
            homeAway: 'away',
            score: '88',
            linescores: [
              { value: 28, displayValue: '28', period: 1 },
              { value: 30, displayValue: '30', period: 2 },
              { value: 30, displayValue: '30', period: 3 },
            ],
            records: [{ summary: '46-36' }],
            team: {
              id: '9',
              name: 'Warriors',
              displayName: 'Golden State Warriors',
              abbreviation: 'GSW',
              location: 'Golden State',
              color: '1d428a',
              alternateColor: 'ffc72c',
              logo: 'https://a.espncdn.com/i/teamlogos/nba/500/gsw.png',
            },
          },
        ],
      },
    ],
  },

  // 4. Oklahoma City Thunder at San Antonio Spurs (Upcoming Showcase)
  {
    id: '401909091',
    uid: 's:40~l:46~e:401909091',
    date: new Date(Date.now() + 3600000 * 2).toISOString(),
    name: 'Oklahoma City Thunder at San Antonio Spurs',
    shortName: 'OKC @ SAS',
    status: {
      clock: 0,
      displayClock: '0:00',
      period: 0,
      type: {
        id: '1',
        name: 'STATUS_SCHEDULED',
        state: 'pre',
        completed: false,
        description: 'Scheduled',
        detail: 'Tonight, 8:00 PM ET',
        shortDetail: '8:00 PM ET',
      },
    },
    competitions: [
      {
        id: '401909091',
        uid: 's:40~l:46~e:401909091~c:401909091',
        date: new Date(Date.now() + 3600000 * 2).toISOString(),
        venue: {
          fullName: 'Frost Bank Center',
          address: { city: 'San Antonio', state: 'TX' },
        },
        broadcasts: [{ market: 'National', names: ['NBA TV'] }],
        announcingCrew: {
          network: 'NBA TV',
          market: 'National',
          playByPlay: 'Ian Eagle',
          colorAnalyst: 'Jim Jackson',
          sidelineReporter: 'Stephanie Ready',
          radioNetwork: 'WOAI 1200 AM (SAS) / WWLS 98.1 (OKC)',
          officials: [
            { name: 'Marc Davis', role: 'Crew Chief (#8)' },
            { name: 'David Guthrie', role: 'Referee (#16)' },
            { name: 'Curtis Blair', role: 'Umpire (#74)' },
          ],
        },
        odds: [
          {
            details: 'OKC -5.5',
            spread: -5.5,
            overUnder: 228.0,
            awayTeamOdds: { favorite: true },
            homeTeamOdds: { underdog: true },
          },
        ],
        competitors: [
          {
            id: '24',
            homeAway: 'home',
            score: '0',
            records: [
              { name: 'overall', type: 'total', summary: '38-44' },
              { name: 'Home', type: 'home', summary: '22-19' },
              { name: 'Road', type: 'road', summary: '16-25' },
            ],
            statistics: [
              { name: 'avgPoints', abbreviation: 'PTS', displayValue: '114.2' },
              { name: 'fieldGoalPct', abbreviation: 'FG%', displayValue: '46.8' },
              { name: 'threePointPct', abbreviation: '3P%', displayValue: '35.9' },
              { name: 'freeThrowPct', abbreviation: 'FT%', displayValue: '77.4' },
              { name: 'avgRebounds', abbreviation: 'REB', displayValue: '44.6' },
              { name: 'avgAssists', abbreviation: 'AST', displayValue: '28.8' },
            ],
            leaders: [
              {
                name: 'pointsPerGame',
                displayName: 'Points Per Game',
                shortDisplayName: 'PPG',
                abbreviation: 'PTS',
                leaders: [
                  {
                    displayValue: '24.3',
                    value: 24.3,
                    athlete: {
                      id: '5104157',
                      fullName: 'Victor Wembanyama',
                      displayName: 'Victor Wembanyama',
                      shortName: 'V. Wembanyama',
                      jersey: '1',
                      position: { abbreviation: 'C' },
                      headshot: 'https://a.espncdn.com/i/headshots/nba/players/full/5104157.png',
                      team: { id: '24', abbreviation: 'SAS' },
                    },
                  },
                ],
              },
              {
                name: 'reboundsPerGame',
                displayName: 'Rebounds Per Game',
                shortDisplayName: 'RPG',
                abbreviation: 'REB',
                leaders: [
                  {
                    displayValue: '11.0',
                    value: 11.0,
                    athlete: {
                      id: '5104157',
                      fullName: 'Victor Wembanyama',
                      displayName: 'Victor Wembanyama',
                      shortName: 'V. Wembanyama',
                      jersey: '1',
                      position: { abbreviation: 'C' },
                      headshot: 'https://a.espncdn.com/i/headshots/nba/players/full/5104157.png',
                      team: { id: '24', abbreviation: 'SAS' },
                    },
                  },
                ],
              },
              {
                name: 'assistsPerGame',
                displayName: 'Assists Per Game',
                shortDisplayName: 'APG',
                abbreviation: 'AST',
                leaders: [
                  {
                    displayValue: '5.9',
                    value: 5.9,
                    athlete: {
                      id: '4845367',
                      fullName: 'Stephon Castle',
                      displayName: 'Stephon Castle',
                      shortName: 'S. Castle',
                      jersey: '5',
                      position: { abbreviation: 'G' },
                      headshot: 'https://a.espncdn.com/i/headshots/nba/players/full/4845367.png',
                      team: { id: '24', abbreviation: 'SAS' },
                    },
                  },
                ],
              },
            ],
            team: {
              id: '24',
              name: 'Spurs',
              displayName: 'San Antonio Spurs',
              abbreviation: 'SAS',
              location: 'San Antonio',
              color: 'c4ced4',
              alternateColor: '000000',
              logo: 'https://a.espncdn.com/i/teamlogos/nba/500/sas.png',
            },
          },
          {
            id: '25',
            homeAway: 'away',
            score: '0',
            records: [
              { name: 'overall', type: 'total', summary: '57-25' },
              { name: 'Home', type: 'home', summary: '32-9' },
              { name: 'Road', type: 'road', summary: '25-16' },
            ],
            statistics: [
              { name: 'avgPoints', abbreviation: 'PTS', displayValue: '120.4', rankDisplayValue: '3rd' },
              { name: 'fieldGoalPct', abbreviation: 'FG%', displayValue: '49.1', rankDisplayValue: '2nd' },
              { name: 'threePointPct', abbreviation: '3P%', displayValue: '38.4', rankDisplayValue: '2nd' },
              { name: 'freeThrowPct', abbreviation: 'FT%', displayValue: '81.9', rankDisplayValue: '4th' },
              { name: 'avgRebounds', abbreviation: 'REB', displayValue: '44.9' },
              { name: 'avgAssists', abbreviation: 'AST', displayValue: '27.2' },
            ],
            leaders: [
              {
                name: 'pointsPerGame',
                displayName: 'Points Per Game',
                shortDisplayName: 'PPG',
                abbreviation: 'PTS',
                leaders: [
                  {
                    displayValue: '32.4',
                    value: 32.4,
                    athlete: {
                      id: '4278073',
                      fullName: 'Shai Gilgeous-Alexander',
                      displayName: 'Shai Gilgeous-Alexander',
                      shortName: 'S. Gilgeous-Alexander',
                      jersey: '2',
                      position: { abbreviation: 'G' },
                      headshot: 'https://a.espncdn.com/i/headshots/nba/players/full/4278073.png',
                      team: { id: '25', abbreviation: 'OKC' },
                    },
                  },
                ],
              },
              {
                name: 'reboundsPerGame',
                displayName: 'Rebounds Per Game',
                shortDisplayName: 'RPG',
                abbreviation: 'REB',
                leaders: [
                  {
                    displayValue: '10.6',
                    value: 10.6,
                    athlete: {
                      id: '4278585',
                      fullName: 'Isaiah Hartenstein',
                      displayName: 'Isaiah Hartenstein',
                      shortName: 'I. Hartenstein',
                      jersey: '55',
                      position: { abbreviation: 'C' },
                      headshot: 'https://a.espncdn.com/i/headshots/nba/players/full/4278585.png',
                      team: { id: '25', abbreviation: 'OKC' },
                    },
                  },
                ],
              },
              {
                name: 'assistsPerGame',
                displayName: 'Assists Per Game',
                shortDisplayName: 'APG',
                abbreviation: 'AST',
                leaders: [
                  {
                    displayValue: '6.4',
                    value: 6.4,
                    athlete: {
                      id: '4278073',
                      fullName: 'Shai Gilgeous-Alexander',
                      displayName: 'Shai Gilgeous-Alexander',
                      shortName: 'S. Gilgeous-Alexander',
                      jersey: '2',
                      position: { abbreviation: 'G' },
                      headshot: 'https://a.espncdn.com/i/headshots/nba/players/full/4278073.png',
                      team: { id: '25', abbreviation: 'OKC' },
                    },
                  },
                ],
              },
            ],
            team: {
              id: '25',
              name: 'Thunder',
              displayName: 'Oklahoma City Thunder',
              abbreviation: 'OKC',
              location: 'Oklahoma City',
              color: '007ac1',
              alternateColor: 'ef3b24',
              logo: 'https://a.espncdn.com/i/teamlogos/nba/500/okc.png',
            },
          },
        ],
      },
    ],
  },

  // 5. Denver Nuggets at Minnesota Timberwolves (Final / OT Thriller with Scorigami!)
  {
    id: '401909092',
    uid: 's:40~l:46~e:401909092',
    date: new Date(Date.now() - 3600000 * 4).toISOString(),
    name: 'Denver Nuggets at Minnesota Timberwolves',
    shortName: 'DEN @ MIN',
    status: {
      clock: 0,
      displayClock: '0:00',
      period: 5,
      type: {
        id: '3',
        name: 'STATUS_FINAL',
        state: 'post',
        completed: true,
        description: 'Final',
        detail: 'Final/OT',
        shortDetail: 'Final/OT',
      },
    },
    competitions: [
      {
        id: '401909092',
        uid: 's:40~l:46~e:401909092~c:401909092',
        date: new Date(Date.now() - 3600000 * 4).toISOString(),
        venue: {
          fullName: 'Target Center',
          address: { city: 'Minneapolis', state: 'MN' },
        },
        broadcasts: [{ market: 'National', names: ['ESPN'] }],
        announcingCrew: {
          network: 'ESPN',
          market: 'National',
          playByPlay: 'Brian Anderson',
          colorAnalyst: 'Grant Hill & Hubie Brown',
          sidelineReporter: 'Katie George',
          radioNetwork: 'KFAN 100.3 (MIN) / Altitude 92.5 (DEN)',
          officials: [
            { name: 'James Capers', role: 'Crew Chief (#19)' },
            { name: 'Josh Tiven', role: 'Referee (#58)' },
            { name: 'Gediminas Petraitis', role: 'Umpire (#50)' },
          ],
        },
        competitors: [
          {
            id: '16',
            homeAway: 'home',
            score: '116',
            winner: true,
            linescores: [
              { value: 26, displayValue: '26', period: 1 },
              { value: 28, displayValue: '28', period: 2 },
              { value: 26, displayValue: '26', period: 3 },
              { value: 25, displayValue: '25', period: 4 },
              { value: 11, displayValue: '11', period: 5 },
            ],
            records: [
              { name: 'overall', type: 'total', summary: '56-26' },
              { name: 'Home', type: 'home', summary: '30-11' },
              { name: 'Road', type: 'road', summary: '26-15' },
            ],
            statistics: [
              { name: 'fieldGoalsMade', abbreviation: 'FGM', displayValue: '42' },
              { name: 'fieldGoalsAttempted', abbreviation: 'FGA', displayValue: '85' },
              { name: 'fieldGoalPct', abbreviation: 'FG%', displayValue: '49.4' },
              { name: 'threePointFieldGoalsMade', abbreviation: '3PM', displayValue: '15' },
              { name: 'threePointFieldGoalsAttempted', abbreviation: '3PA', displayValue: '37' },
              { name: 'threePointPct', abbreviation: '3P%', displayValue: '40.5' },
              { name: 'freeThrowsMade', abbreviation: 'FTM', displayValue: '17' },
              { name: 'freeThrowsAttempted', abbreviation: 'FTA', displayValue: '21' },
              { name: 'freeThrowPct', abbreviation: 'FT%', displayValue: '81.0' },
              { name: 'rebounds', abbreviation: 'REB', displayValue: '46' },
              { name: 'assists', abbreviation: 'AST', displayValue: '28' },
            ],
            leaders: [
              {
                name: 'points',
                displayName: 'Points',
                shortDisplayName: 'Pts',
                abbreviation: 'Pts',
                leaders: [
                  {
                    displayValue: '34',
                    value: 34,
                    athlete: {
                      id: '4594268',
                      fullName: 'Anthony Edwards',
                      displayName: 'Anthony Edwards',
                      shortName: 'A. Edwards',
                      jersey: '5',
                      position: { abbreviation: 'G' },
                      headshot: 'https://a.espncdn.com/i/headshots/nba/players/full/4594268.png',
                      team: { id: '16', abbreviation: 'MIN' },
                    },
                  },
                ],
              },
              {
                name: 'rebounds',
                displayName: 'Rebounds',
                shortDisplayName: 'Reb',
                abbreviation: 'Reb',
                leaders: [
                  {
                    displayValue: '14',
                    value: 14,
                    athlete: {
                      id: '3032976',
                      fullName: 'Rudy Gobert',
                      displayName: 'Rudy Gobert',
                      shortName: 'R. Gobert',
                      jersey: '27',
                      position: { abbreviation: 'C' },
                      headshot: 'https://a.espncdn.com/i/headshots/nba/players/full/3032976.png',
                      team: { id: '16', abbreviation: 'MIN' },
                    },
                  },
                ],
              },
              {
                name: 'assists',
                displayName: 'Assists',
                shortDisplayName: 'Ast',
                abbreviation: 'Ast',
                leaders: [
                  {
                    displayValue: '8',
                    value: 8,
                    athlete: {
                      id: '4594268',
                      fullName: 'Anthony Edwards',
                      displayName: 'Anthony Edwards',
                      shortName: 'A. Edwards',
                      jersey: '5',
                      position: { abbreviation: 'G' },
                      headshot: 'https://a.espncdn.com/i/headshots/nba/players/full/4594268.png',
                      team: { id: '16', abbreviation: 'MIN' },
                    },
                  },
                ],
              },
            ],
            team: {
              id: '16',
              name: 'Timberwolves',
              displayName: 'Minnesota Timberwolves',
              abbreviation: 'MIN',
              location: 'Minnesota',
              color: '0c2340',
              alternateColor: '236192',
              logo: 'https://a.espncdn.com/i/teamlogos/nba/500/min.png',
            },
          },
          {
            id: '7',
            homeAway: 'away',
            score: '112',
            winner: false,
            linescores: [
              { value: 27, displayValue: '27', period: 1 },
              { value: 27, displayValue: '27', period: 2 },
              { value: 28, displayValue: '28', period: 3 },
              { value: 23, displayValue: '23', period: 4 },
              { value: 7, displayValue: '7', period: 5 },
            ],
            records: [
              { name: 'overall', type: 'total', summary: '57-25' },
              { name: 'Home', type: 'home', summary: '33-8' },
              { name: 'Road', type: 'road', summary: '24-17' },
            ],
            statistics: [
              { name: 'fieldGoalsMade', abbreviation: 'FGM', displayValue: '41' },
              { name: 'fieldGoalsAttempted', abbreviation: 'FGA', displayValue: '88' },
              { name: 'fieldGoalPct', abbreviation: 'FG%', displayValue: '46.6' },
              { name: 'threePointFieldGoalsMade', abbreviation: '3PM', displayValue: '12' },
              { name: 'threePointFieldGoalsAttempted', abbreviation: '3PA', displayValue: '34' },
              { name: 'threePointPct', abbreviation: '3P%', displayValue: '35.3' },
              { name: 'freeThrowsMade', abbreviation: 'FTM', displayValue: '18' },
              { name: 'freeThrowsAttempted', abbreviation: 'FTA', displayValue: '22' },
              { name: 'freeThrowPct', abbreviation: 'FT%', displayValue: '81.8' },
              { name: 'rebounds', abbreviation: 'REB', displayValue: '43' },
              { name: 'assists', abbreviation: 'AST', displayValue: '29' },
            ],
            leaders: [
              {
                name: 'points',
                displayName: 'Points',
                shortDisplayName: 'Pts',
                abbreviation: 'Pts',
                leaders: [
                  {
                    displayValue: '33',
                    value: 33,
                    athlete: {
                      id: '3112335',
                      fullName: 'Nikola Jokic',
                      displayName: 'Nikola Jokic',
                      shortName: 'N. Jokic',
                      jersey: '15',
                      position: { abbreviation: 'C' },
                      headshot: 'https://a.espncdn.com/i/headshots/nba/players/full/3112335.png',
                      team: { id: '7', abbreviation: 'DEN' },
                    },
                  },
                ],
              },
              {
                name: 'rebounds',
                displayName: 'Rebounds',
                shortDisplayName: 'Reb',
                abbreviation: 'Reb',
                leaders: [
                  {
                    displayValue: '15',
                    value: 15,
                    athlete: {
                      id: '3112335',
                      fullName: 'Nikola Jokic',
                      displayName: 'Nikola Jokic',
                      shortName: 'N. Jokic',
                      jersey: '15',
                      position: { abbreviation: 'C' },
                      headshot: 'https://a.espncdn.com/i/headshots/nba/players/full/3112335.png',
                      team: { id: '7', abbreviation: 'DEN' },
                    },
                  },
                ],
              },
              {
                name: 'assists',
                displayName: 'Assists',
                shortDisplayName: 'Ast',
                abbreviation: 'Ast',
                leaders: [
                  {
                    displayValue: '11',
                    value: 11,
                    athlete: {
                      id: '3112335',
                      fullName: 'Nikola Jokic',
                      displayName: 'Nikola Jokic',
                      shortName: 'N. Jokic',
                      jersey: '15',
                      position: { abbreviation: 'C' },
                      headshot: 'https://a.espncdn.com/i/headshots/nba/players/full/3112335.png',
                      team: { id: '7', abbreviation: 'DEN' },
                    },
                  },
                ],
              },
            ],
            team: {
              id: '7',
              name: 'Nuggets',
              displayName: 'Denver Nuggets',
              abbreviation: 'DEN',
              location: 'Denver',
              color: '0e2240',
              alternateColor: 'fec524',
              logo: 'https://a.espncdn.com/i/teamlogos/nba/500/den.png',
            },
          },
        ],
      },
    ],
  },
]

const MOCK_GAME_SUMMARIES = new Map<string, NBAGameSummary>([
  [
    '401909091',
    {
      eventId: '401909091',
      seasonSeries: 'OKC leads season series 2-1',
      predictor: { awayWinPct: 64.2, homeWinPct: 35.8 },
      shots: [],
      awayTeam: {
        teamId: '25',
        abbreviation: 'OKC',
        homeAway: 'away',
        leaders: [],
        stats: {
          streak: 'W4',
          lastTen: '8-2',
          avgPoints: '120.4',
          avgPointsAgainst: '107.6',
          fieldGoalPct: '49.1',
          threePointPct: '38.4',
          freeThrowPct: '81.9',
          avgRebounds: '44.9',
          avgAssists: '27.2',
          avgSteals: '10.3',
          avgBlocks: '5.8',
          avgTurnovers: '11.9',
        },
        topPlayers: [],
        injuries: [
          { playerName: 'Alex Caruso', position: 'G', status: 'Day-To-Day', detail: 'Hip' },
        ],
        lastFiveGames: [
          { result: 'W', score: '124-110', opponentAbbr: 'PHX' },
          { result: 'W', score: '118-104', opponentAbbr: 'MEM' },
          { result: 'W', score: '131-116', opponentAbbr: 'SAC' },
          { result: 'W', score: '112-98', opponentAbbr: 'POR' },
          { result: 'L', score: '114-119', opponentAbbr: 'DEN' },
        ],
      },
      homeTeam: {
        teamId: '24',
        abbreviation: 'SAS',
        homeAway: 'home',
        leaders: [],
        stats: {
          streak: 'W1',
          lastTen: '6-4',
          avgPoints: '114.2',
          avgPointsAgainst: '113.8',
          fieldGoalPct: '46.8',
          threePointPct: '35.9',
          freeThrowPct: '77.4',
          avgRebounds: '44.6',
          avgAssists: '28.8',
          avgSteals: '8.1',
          avgBlocks: '6.4',
          avgTurnovers: '14.2',
        },
        topPlayers: [],
        injuries: [
          { playerName: 'Jeremy Sochan', position: 'F', status: 'Out', detail: 'Back' },
        ],
        lastFiveGames: [
          { result: 'W', score: '117-109', opponentAbbr: 'DAL' },
          { result: 'L', score: '105-118', opponentAbbr: 'HOU' },
          { result: 'W', score: '121-112', opponentAbbr: 'UTA' },
          { result: 'W', score: '110-103', opponentAbbr: 'NOP' },
          { result: 'L', score: '108-120', opponentAbbr: 'LAL' },
        ],
      },
    },
  ],
  [
    '401909092',
    {
      eventId: '401909092',
      attendance: 18978,
      shots: [
        {
          id: 'mock-post-1',
          shooter: 'Anthony Edwards',
          teamId: '16',
          teamAbbr: 'MIN',
          x: 24,
          y: 8,
          made: true,
          points: 3,
          distanceFeet: 25,
          clock: '0:24',
          period: 5,
          description: 'Anthony Edwards makes 25-foot step-back 3-pointer in OT',
          zone: 'Above the Break 3',
        },
        {
          id: 'mock-post-2',
          shooter: 'Nikola Jokic',
          teamId: '7',
          teamAbbr: 'DEN',
          x: 79,
          y: 23,
          made: true,
          points: 2,
          distanceFeet: 8,
          clock: '1:05',
          period: 5,
          description: 'Nikola Jokic makes 8-foot turnaround hook shot',
          zone: 'In The Paint (Non-RA)',
        },
        {
          id: 'mock-post-3',
          shooter: 'Jaden McDaniels',
          teamId: '16',
          teamAbbr: 'MIN',
          x: 11,
          y: 45,
          made: true,
          points: 3,
          distanceFeet: 23,
          clock: '2:12',
          period: 4,
          description: 'Jaden McDaniels makes 23-foot corner 3-pointer',
          zone: 'Right Corner 3',
        },
        {
          id: 'mock-post-4',
          shooter: 'Jamal Murray',
          teamId: '7',
          teamAbbr: 'DEN',
          x: 68,
          y: 16,
          made: false,
          points: 3,
          distanceFeet: 26,
          clock: '0:04',
          period: 5,
          description: 'Jamal Murray misses 26-foot game-tying 3-pointer',
          zone: 'Above the Break 3',
        },
      ],
      awayTeam: {
        teamId: '7',
        abbreviation: 'DEN',
        homeAway: 'away',
        leaders: [],
        stats: {
          fgMadeAttempted: '41-88',
          fieldGoalPct: '46.6',
          threePtMadeAttempted: '12-34',
          threePointPct: '35.3',
          ftMadeAttempted: '18-22',
          freeThrowPct: '81.8',
          totalRebounds: '43',
          offensiveRebounds: '10',
          defensiveRebounds: '33',
          assists: '29',
          steals: '6',
          blocks: '4',
          turnovers: '13',
          pointsInPaint: '52',
          fastBreakPoints: '14',
          turnoverPoints: '15',
          largestLead: '8',
          leadChanges: '14',
        },
        topPlayers: [
          {
            id: '3112335',
            name: 'Nikola Jokic',
            shortName: 'N. Jokic',
            jersey: '15',
            position: 'C',
            headshot: 'https://a.espncdn.com/i/headshots/nba/players/full/3112335.png',
            min: '42',
            pts: 33,
            reb: 15,
            ast: 11,
            fg: '13-22',
            threePt: '2-5',
            ft: '5-6',
            stl: 2,
            blk: 1,
            tov: 3,
            plusMinus: '+2',
          },
          {
            id: '3936299',
            name: 'Jamal Murray',
            shortName: 'J. Murray',
            jersey: '27',
            position: 'G',
            headshot: 'https://a.espncdn.com/i/headshots/nba/players/full/3936299.png',
            min: '40',
            pts: 24,
            reb: 4,
            ast: 7,
            fg: '9-20',
            threePt: '3-9',
            ft: '3-3',
            stl: 1,
            blk: 0,
            tov: 2,
            plusMinus: '-3',
          },
          {
            id: '3064290',
            name: 'Aaron Gordon',
            shortName: 'A. Gordon',
            jersey: '32',
            position: 'F',
            headshot: 'https://a.espncdn.com/i/headshots/nba/players/full/3064290.png',
            min: '37',
            pts: 18,
            reb: 8,
            ast: 3,
            fg: '7-13',
            threePt: '1-3',
            ft: '3-4',
            stl: 1,
            blk: 2,
            tov: 1,
            plusMinus: '-1',
          },
        ],
        injuries: [],
        lastFiveGames: [],
      },
      homeTeam: {
        teamId: '16',
        abbreviation: 'MIN',
        homeAway: 'home',
        leaders: [],
        stats: {
          fgMadeAttempted: '42-85',
          fieldGoalPct: '49.4',
          threePtMadeAttempted: '15-37',
          threePointPct: '40.5',
          ftMadeAttempted: '17-21',
          freeThrowPct: '81.0',
          totalRebounds: '46',
          offensiveRebounds: '11',
          defensiveRebounds: '35',
          assists: '28',
          steals: '8',
          blocks: '7',
          turnovers: '11',
          pointsInPaint: '48',
          fastBreakPoints: '19',
          turnoverPoints: '18',
          largestLead: '10',
          leadChanges: '14',
        },
        topPlayers: [
          {
            id: '4594268',
            name: 'Anthony Edwards',
            shortName: 'A. Edwards',
            jersey: '5',
            position: 'G',
            headshot: 'https://a.espncdn.com/i/headshots/nba/players/full/4594268.png',
            min: '43',
            pts: 34,
            reb: 6,
            ast: 8,
            fg: '12-24',
            threePt: '5-11',
            ft: '5-6',
            stl: 2,
            blk: 1,
            tov: 3,
            plusMinus: '+8',
          },
          {
            id: '3064514',
            name: 'Julius Randle',
            shortName: 'J. Randle',
            jersey: '30',
            position: 'F',
            headshot: 'https://a.espncdn.com/i/headshots/nba/players/full/3064514.png',
            min: '38',
            pts: 22,
            reb: 9,
            ast: 5,
            fg: '8-16',
            threePt: '2-5',
            ft: '4-5',
            stl: 0,
            blk: 0,
            tov: 2,
            plusMinus: '+5',
          },
          {
            id: '3032976',
            name: 'Rudy Gobert',
            shortName: 'R. Gobert',
            jersey: '27',
            position: 'C',
            headshot: 'https://a.espncdn.com/i/headshots/nba/players/full/3032976.png',
            min: '36',
            pts: 14,
            reb: 14,
            ast: 2,
            fg: '6-8',
            threePt: '0-0',
            ft: '2-4',
            stl: 1,
            blk: 4,
            tov: 1,
            plusMinus: '+11',
          },
        ],
        injuries: [],
        lastFiveGames: [],
      },
    },
  ],
])

