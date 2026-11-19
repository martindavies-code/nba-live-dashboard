import React, { useState, useId, memo, useMemo, useEffect } from 'react'
import type { NBACompetitor, NBAShot, NBASituation, NBAStatus, NBAGameSummary } from '../types/nba'
import { sanitizeHexColor } from '../utils/nbaHelpers'
import { formatGameKickoff, type TimeZoneMode } from '../utils/timezone.ts'
import { computeShootingZones, extractRecordSummary, getValidatedTeamSummary } from '../utils/matchupStats'
import { CourtMatchupIntel } from './CourtMatchupIntel'
import { Flame, Clock, Crosshair, BarChart2, ShieldAlert, ClipboardList, Trophy } from 'lucide-react'

interface CourtDiagramProps {
  eventId?: string
  situation?: NBASituation | null
  competitors: NBACompetitor[]
  shots?: NBAShot[]
  summary?: NBAGameSummary | null
  isSummaryLoading?: boolean
  gameState?: 'pre' | 'in' | 'post'
  gameStatusDetail?: string
  isHero?: boolean
  status?: NBAStatus
  timeZoneMode?: TimeZoneMode
  eventDate?: string
}

type CourtViewMode = 'intel' | 'shots' | 'zones'

function defaultViewModeForState(gameState: string): CourtViewMode {
  return gameState === 'in' ? 'shots' : 'intel'
}

export const CourtDiagram: React.FC<CourtDiagramProps> = memo(({
  eventId,
  situation,
  competitors = [],
  shots = [],
  summary,
  isSummaryLoading = false,
  gameState = 'in',
  gameStatusDetail = 'In Progress',
  isHero = false,
  status,
  timeZoneMode,
  eventDate,
}) => {
  const uniqueId = useId().replace(/:/g, '')
  const [selectedShot, setSelectedShot] = useState<NBAShot | null>(null)
  const [shotFilter, setShotFilter] = useState<'all' | 'makes' | 'misses' | 'home' | 'away'>('all')
  const [viewMode, setViewMode] = useState<CourtViewMode>(() => defaultViewModeForState(gameState))

  // Reset tab & selected shot when switching spotlighted games or game state transitions
  useEffect(() => {
    setViewMode(defaultViewModeForState(gameState))
    setSelectedShot(null)
    setShotFilter('all')
  }, [eventId, gameState])

  const homeComp = competitors.find((c) => c.homeAway === 'home')
  const awayComp = competitors.find((c) => c.homeAway === 'away')

  const validatedAwaySummary = getValidatedTeamSummary(summary?.awayTeam, awayComp)
  const validatedHomeSummary = getValidatedTeamSummary(summary?.homeTeam, homeComp)
  const hasMismatchedSummaryTeam =
    (Boolean(summary?.awayTeam) && !validatedAwaySummary) ||
    (Boolean(summary?.homeTeam) && !validatedHomeSummary)
  const safeSummary = hasMismatchedSummaryTeam ? null : summary

  const homeColor = sanitizeHexColor(homeComp?.team?.color, '#1d428a')
  const awayColor = sanitizeHexColor(awayComp?.team?.color, '#ce1141')
  // Strict alphanumeric sanitisation for SVG text nodes
  const homeAbbr = (homeComp?.team?.abbreviation || 'HOME').replace(/[^A-Za-z0-9]/g, '').slice(0, 6) || 'HOME'
  const awayAbbr = (awayComp?.team?.abbreviation || 'AWAY').replace(/[^A-Za-z0-9]/g, '').slice(0, 6) || 'AWAY'

  // Effective shots: prefer competition.shots if provided, otherwise validated summary.shots
  const effectiveShots = useMemo(() => {
    if (Array.isArray(shots) && shots.length > 0) return shots
    return safeSummary?.shots || []
  }, [shots, safeSummary?.shots])

  // Memoized filtered shots to prevent unnecessary recalculation
  const filteredShots = useMemo(() => {
    return effectiveShots.filter((s) => {
      if (shotFilter === 'makes') return s.made
      if (shotFilter === 'misses') return !s.made
      if (shotFilter === 'home') return s.teamAbbr === homeAbbr || (homeComp?.team?.id && s.teamId === homeComp.team.id)
      if (shotFilter === 'away') return s.teamAbbr === awayAbbr || (awayComp?.team?.id && s.teamId === awayComp.team.id)
      return true
    })
  }, [effectiveShots, shotFilter, homeAbbr, awayAbbr, homeComp?.team?.id, awayComp?.team?.id])

  // Single-pass shooting summary calculation (preserves null percentage when no shots are tracked)
  const { totalShots, madeShots, fgPct, threePointersMade, threePointersTotal } = useMemo(() => {
    let made = 0
    let tpMade = 0
    let tpTotal = 0
    const total = effectiveShots.length
    for (let i = 0; i < total; i++) {
      const s = effectiveShots[i]
      if (s.made) made++
      if (s.points === 3) {
        tpTotal++
        if (s.made) tpMade++
      }
    }
    const pct = total > 0 ? Math.round((made / total) * 100) : null
    return {
      totalShots: total,
      madeShots: made,
      fgPct: pct,
      threePointersMade: tpMade,
      threePointersTotal: tpTotal,
    }
  }, [effectiveShots])

  const zoneSummary = useMemo(() => computeShootingZones(effectiveShots), [effectiveShots])

  // Shot clock & fouls
  const shotClock = situation?.shotClock ?? 24
  const homeFouls = situation?.homeFouls ?? homeComp?.fouls ?? 0
  const awayFouls = situation?.awayFouls ?? awayComp?.fouls ?? 0
  const isClutch = situation?.isClutch || false
  const scoringRun = situation?.scoringRun
  const currentPeriodDetail = status?.type?.detail || gameStatusDetail

  const awayRecords = extractRecordSummary(awayComp, validatedAwaySummary)
  const homeRecords = extractRecordSummary(homeComp, validatedHomeSummary)

  const awayPostFg =
    validatedAwaySummary?.stats?.fieldGoalPct ||
    awayComp?.statistics?.find((s) => s.name === 'fieldGoalPct')?.displayValue
  const homePostFg =
    validatedHomeSummary?.stats?.fieldGoalPct ||
    homeComp?.statistics?.find((s) => s.name === 'fieldGoalPct')?.displayValue

  return (
    <div className={`flex flex-col space-y-3.5 w-full ${isHero ? 'hero-court-diagram' : ''}`}>
      {/* Top Hoops Momentum / Matchup Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-white/[0.15] bg-[#0c1424] p-2.5 sm:p-3 shadow-md backdrop-blur-md">
        {/* Left: Possession, Tip-Off, or Final Recap Context */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={`inline-block h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full shrink-0 ${
                gameState === 'in' ? 'animate-pulse' : ''
              }`}
              style={{
                backgroundColor:
                  situation?.possession === homeComp?.team?.id
                    ? homeColor
                    : situation?.possession === awayComp?.team?.id
                    ? awayColor
                    : gameState === 'post'
                    ? '#10b981'
                    : '#f97316',
              }}
            />
            <span className="font-mono text-xs sm:text-sm font-bold text-white tracking-wide">
              {gameState === 'in'
                ? situation?.possessionText || 'Live Play'
                : gameState === 'post'
                ? 'Final Game Leaders & Box Score'
                : eventDate
                ? `Tip-Off: ${formatGameKickoff(eventDate, timeZoneMode)}`
                : currentPeriodDetail}
            </span>
          </div>

          {gameState === 'pre' && safeSummary?.seasonSeries && (
            <span className="inline-flex items-center gap-1 rounded bg-sky-500/15 border border-sky-400/35 px-2 py-0.5 text-xs font-semibold text-sky-200">
              {safeSummary.seasonSeries}
            </span>
          )}

          {gameState === 'post' && (validatedAwaySummary?.stats?.leadChanges || validatedHomeSummary?.stats?.leadChanges) && (
            <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 border border-emerald-400/35 px-2 py-0.5 text-xs font-semibold text-emerald-200">
              <Trophy className="h-3 w-3 text-emerald-300 shrink-0" />
              {validatedAwaySummary?.stats?.leadChanges || validatedHomeSummary?.stats?.leadChanges} Lead Changes
            </span>
          )}

          {gameState === 'in' && scoringRun && (
            <span className="inline-flex items-center gap-1 rounded bg-orange-600/35 border border-orange-500/60 px-2 py-0.5 text-xs font-bold text-orange-100 animate-pulse">
              <Flame className="h-3 w-3 text-orange-400 fill-orange-400 shrink-0" />
              <span>
                {scoringRun.teamAbbr} {scoringRun.points}-{scoringRun.opponentPoints} Run
                {scoringRun.durationText ? ` (${scoringRun.durationText})` : ''}
              </span>
            </span>
          )}

          {gameState === 'in' && isClutch && (
            <span className="inline-flex items-center gap-1 rounded bg-rose-600/40 border border-rose-500/60 px-2 py-0.5 text-xs font-extrabold text-rose-100 animate-pulse">
              <ShieldAlert className="h-3 w-3 text-rose-300 shrink-0" />
              <span>CLUTCH (≤5 PTS)</span>
            </span>
          )}
        </div>

        {/* Right: Contextual Metrics (Live Shot Clock & Fouls vs Pre Records vs Post FG%) */}
        <div className="flex items-center gap-2 sm:gap-3 font-mono text-xs sm:text-sm shrink-0">
          {gameState === 'in' && (
            <>
              <div className="flex items-center gap-1.5 bg-black/70 border border-white/[0.15] px-2.5 py-1 rounded-md">
                <Clock className="h-3 w-3 text-slate-300" />
                <span className="text-slate-300 text-xs uppercase tracking-wider font-semibold">Shot Clock:</span>
                <span
                  className={`font-extrabold tabular-nums ${
                    shotClock <= 5 ? 'text-rose-400 animate-pulse' : 'text-amber-300'
                  }`}
                >
                  {shotClock}s
                </span>
              </div>

              <div className="hidden sm:flex items-center gap-2 text-xs">
                <span className="text-slate-300">
                  {awayAbbr} Fouls: <strong className="text-white">{awayFouls}</strong>
                  {awayFouls >= 5 && <span className="ml-1 text-rose-400 font-bold">(BONUS)</span>}
                </span>
                <span className="text-slate-500">|</span>
                <span className="text-slate-300">
                  {homeAbbr} Fouls: <strong className="text-white">{homeFouls}</strong>
                  {homeFouls >= 5 && <span className="ml-1 text-rose-400 font-bold">(BONUS)</span>}
                </span>
              </div>
            </>
          )}

          {gameState === 'pre' && (
            <div className="hidden sm:flex items-center gap-2 text-xs">
              <span className="text-slate-300">
                {awayAbbr}: <strong className="text-white">{awayRecords.overall ?? '—'}</strong>
                {awayRecords.streak && (
                  <span className={`ml-1 font-bold ${awayRecords.streak.startsWith('W') ? 'text-emerald-300' : 'text-rose-300'}`}>
                    ({awayRecords.streak})
                  </span>
                )}
              </span>
              <span className="text-slate-500">|</span>
              <span className="text-slate-300">
                {homeAbbr}: <strong className="text-white">{homeRecords.overall ?? '—'}</strong>
                {homeRecords.streak && (
                  <span className={`ml-1 font-bold ${homeRecords.streak.startsWith('W') ? 'text-emerald-300' : 'text-rose-300'}`}>
                    ({homeRecords.streak})
                  </span>
                )}
              </span>
            </div>
          )}

          {gameState === 'post' && (
            <div className="hidden sm:flex items-center gap-2 text-xs">
              {awayPostFg && homePostFg ? (
                <>
                  <span className="text-slate-300">
                    {awayAbbr} FG: <strong className="text-white">{awayPostFg}%</strong>
                  </span>
                  <span className="text-slate-500">|</span>
                  <span className="text-slate-300">
                    {homeAbbr} FG: <strong className="text-white">{homePostFg}%</strong>
                  </span>
                </>
              ) : (
                <span className="text-slate-300">
                  Final: <strong className="text-white">{awayAbbr} {awayComp?.score ?? '—'}</strong> –{' '}
                  <strong className="text-white">{homeAbbr} {homeComp?.score ?? '—'}</strong>
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Interactive Court & Matchup Intelligence Container */}
      <div className="relative rounded-xl border border-white/[0.15] bg-[#080d1a] p-2 sm:p-4 overflow-hidden shadow-xl">
        {/* Controls & Mode Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          {/* Left: View Mode Tabs (responsive 3-column grid on mobile so all modes stay 100% visible) */}
          {gameState === 'pre' ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500/20 border border-sky-400/40 px-2.5 py-1 text-xs font-bold text-sky-100">
                <ClipboardList className="h-3.5 w-3.5 text-sky-300" />
                Pre-Game Scouting & Season Leaders
              </span>
            </div>
          ) : (
            <div
              role="tablist"
              aria-label="Court intelligence view modes"
              data-testid="court-mode-tablist"
              className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-1 w-full sm:w-auto sm:inline-flex items-center rounded-lg bg-black/60 border border-white/[0.12] p-1 text-[11px] sm:text-xs"
            >
              {gameState === 'post' ? (
                <>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={viewMode === 'intel'}
                    onClick={() => setViewMode('intel')}
                    className={`flex items-center justify-center gap-1 px-1.5 sm:px-2.5 py-1.5 sm:py-1 rounded font-semibold transition-colors whitespace-nowrap min-w-0 ${
                      viewMode === 'intel'
                        ? 'bg-sky-500/30 text-sky-100 border border-sky-400/50'
                        : 'text-slate-300 hover:text-white border border-transparent'
                    }`}
                  >
                    <ClipboardList className="h-3 w-3 shrink-0" />
                    <span className="hidden sm:inline">Game Leaders & Stats</span>
                    <span className="sm:hidden">Leaders</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={viewMode === 'shots'}
                    onClick={() => setViewMode('shots')}
                    className={`flex items-center justify-center gap-1 px-1.5 sm:px-2.5 py-1.5 sm:py-1 rounded font-semibold transition-colors whitespace-nowrap min-w-0 ${
                      viewMode === 'shots'
                        ? 'bg-sky-500/30 text-sky-100 border border-sky-400/50'
                        : 'text-slate-300 hover:text-white border border-transparent'
                    }`}
                  >
                    <Crosshair className="h-3 w-3 shrink-0" />
                    <span className="hidden sm:inline">Shot Chart{effectiveShots.length > 0 ? ` (${effectiveShots.length})` : ''}</span>
                    <span className="sm:hidden">Shots{effectiveShots.length > 0 ? ` (${effectiveShots.length})` : ''}</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={viewMode === 'zones'}
                    onClick={() => setViewMode('zones')}
                    className={`flex items-center justify-center gap-1 px-1.5 sm:px-2.5 py-1.5 sm:py-1 rounded font-semibold transition-colors whitespace-nowrap min-w-0 ${
                      viewMode === 'zones'
                        ? 'bg-sky-500/25 text-sky-200 border border-sky-400/40'
                        : 'text-slate-300 hover:text-white border border-transparent'
                    }`}
                  >
                    <BarChart2 className="h-3 w-3 shrink-0" />
                    <span className="hidden sm:inline">Shooting Zones</span>
                    <span className="sm:hidden">Zones</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={viewMode === 'shots'}
                    onClick={() => setViewMode('shots')}
                    className={`flex items-center justify-center gap-1 px-1.5 sm:px-2.5 py-1.5 sm:py-1 rounded font-semibold transition-colors whitespace-nowrap min-w-0 ${
                      viewMode === 'shots'
                        ? 'bg-sky-500/30 text-sky-100 border border-sky-400/50'
                        : 'text-slate-300 hover:text-white border border-transparent'
                    }`}
                  >
                    <Crosshair className="h-3 w-3 shrink-0" />
                    <span className="hidden sm:inline">Live Shot Chart</span>
                    <span className="sm:hidden">Shots</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={viewMode === 'zones'}
                    onClick={() => setViewMode('zones')}
                    className={`flex items-center justify-center gap-1 px-1.5 sm:px-2.5 py-1.5 sm:py-1 rounded font-semibold transition-colors whitespace-nowrap min-w-0 ${
                      viewMode === 'zones'
                        ? 'bg-sky-500/25 text-sky-200 border border-sky-400/40'
                        : 'text-slate-300 hover:text-white border border-transparent'
                    }`}
                  >
                    <BarChart2 className="h-3 w-3 shrink-0" />
                    <span className="hidden sm:inline">Shooting Zones</span>
                    <span className="sm:hidden">Zones</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={viewMode === 'intel'}
                    onClick={() => setViewMode('intel')}
                    className={`flex items-center justify-center gap-1 px-1.5 sm:px-2.5 py-1.5 sm:py-1 rounded font-semibold transition-colors whitespace-nowrap min-w-0 ${
                      viewMode === 'intel'
                        ? 'bg-sky-500/30 text-sky-100 border border-sky-400/50'
                        : 'text-slate-300 hover:text-white border border-transparent'
                    }`}
                  >
                    <ClipboardList className="h-3 w-3 shrink-0" />
                    <span className="hidden sm:inline">Box Leaders</span>
                    <span className="sm:hidden">Leaders</span>
                  </button>
                </>
              )}
            </div>
          )}

          {/* Middle: Shot Filters (Only in Shots Mode) */}
          {viewMode === 'shots' && gameState !== 'pre' && (
            <div className="flex flex-wrap items-center gap-1 text-[11px]">
              {(['all', 'makes', 'misses', 'away', 'home'] as const).map((filterKey) => (
                <button
                  key={filterKey}
                  type="button"
                  onClick={() => setShotFilter(filterKey)}
                  className={`px-2 py-0.5 rounded capitalize font-medium transition-colors ${
                    shotFilter === filterKey
                      ? 'bg-white/[0.12] text-white border border-white/[0.2]'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {filterKey === 'home' ? homeAbbr : filterKey === 'away' ? awayAbbr : filterKey}
                </button>
              ))}
            </div>
          )}

          {/* Right: Contextual Summary Pill */}
          {gameState === 'pre' ? (
            <div className="flex items-center gap-2 font-mono text-[11px] text-slate-300">
              {safeSummary?.predictor ? (
                <span>
                  Matchup Model:{' '}
                  <strong className="text-white">{awayAbbr} {safeSummary.predictor.awayWinPct.toFixed(0)}%</strong>
                  <span className="text-slate-500 mx-1">/</span>
                  <strong className="text-white">{homeAbbr} {safeSummary.predictor.homeWinPct.toFixed(0)}%</strong>
                </span>
              ) : (
                <span>Season Leaders & Team Splits</span>
              )}
            </div>
          ) : viewMode === 'intel' ? (
            <div className="flex items-center gap-2 font-mono text-[11px] text-slate-300">
              <span>
                {awayAbbr}: <strong className="text-white">{awayComp?.score ?? '—'}</strong>
              </span>
              <span className="text-slate-600">|</span>
              <span>
                {homeAbbr}: <strong className="text-white">{homeComp?.score ?? '—'}</strong>
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 font-mono text-[11px] text-slate-300">
              {totalShots > 0 && fgPct !== null ? (
                <>
                  <span>
                    Tracked Shots: <strong className="text-emerald-400">{fgPct}%</strong> ({madeShots}/{totalShots})
                  </span>
                  <span className="text-slate-600">|</span>
                  <span>
                    3PT: <strong className="text-sky-400">{threePointersMade}/{threePointersTotal}</strong>
                  </span>
                </>
              ) : (
                <span className="text-slate-400">Tracked Shots: —</span>
              )}
            </div>
          )}
        </div>

        {/* Main Content: Pre-game / Post-game Intel Board OR Hardwood SVG Court */}
        {viewMode === 'intel' || gameState === 'pre' ? (
          <CourtMatchupIntel
            awayComp={awayComp}
            homeComp={homeComp}
            summary={safeSummary}
            gameState={gameState}
            isSummaryLoading={isSummaryLoading}
          />
        ) : (
          <>
            {/* Tactical Hardwood Court SVG (Full Court 94' x 50' aspect ratio: 940 x 500) */}
            <div className="relative w-full aspect-[940/500] max-h-[460px] select-none">
              <svg
                viewBox="0 0 940 500"
                className="w-full h-full rounded-xl overflow-hidden drop-shadow-2xl"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  {/* Hardwood Grain Pattern */}
                  <pattern
                    id={`hardwood-${uniqueId}`}
                    width="40"
                    height="10"
                    patternUnits="userSpaceOnUse"
                  >
                    <rect width="40" height="10" fill="#a46830" />
                    <line x1="0" y1="0" x2="40" y2="0" stroke="#874f1d" strokeWidth="0.8" />
                    <line x1="20" y1="0" x2="20" y2="10" stroke="#874f1d" strokeWidth="0.5" />
                  </pattern>

                  {/* Court Gloss Gradient */}
                  <linearGradient id={`court-gloss-${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#d4954d" stopOpacity="0.9" />
                    <stop offset="50%" stopColor="#b87b38" stopOpacity="0.95" />
                    <stop offset="100%" stopColor="#9a5f22" stopOpacity="0.9" />
                  </linearGradient>

                  {/* Glowing Rim Drop Shadow */}
                  <filter id={`glow-${uniqueId}`} x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>

                {/* Base Court Surface */}
                <rect x="0" y="0" width="940" height="500" fill={`url(#hardwood-${uniqueId})`} />
                <rect x="0" y="0" width="940" height="500" fill={`url(#court-gloss-${uniqueId})`} opacity="0.65" />

                {/* Boundary Lines (2 inches wide regulation) */}
                <rect
                  x="20"
                  y="20"
                  width="900"
                  height="460"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="4"
                  strokeOpacity="0.9"
                />

                {/* Mid-Court Division Line */}
                <line
                  x1="470"
                  y1="20"
                  x2="470"
                  y2="480"
                  stroke="#ffffff"
                  strokeWidth="4"
                  strokeOpacity="0.9"
                />

                {/* Center Jump Circle (Radius 60 units = 6ft) */}
                <circle
                  cx="470"
                  cy="250"
                  r="60"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="4"
                  strokeOpacity="0.9"
                />
                {/* Center Outer Circle (Radius 20 units) */}
                <circle
                  cx="470"
                  cy="250"
                  r="20"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="2"
                  strokeDasharray="6 6"
                  strokeOpacity="0.7"
                />

                {/* Center Court Logo Silhouette */}
                <g transform="translate(435, 215) scale(1.4)" opacity="0.4">
                  <circle cx="25" cy="25" r="24" fill="none" stroke="#ffffff" strokeWidth="2" />
                  <path
                    d="M 1,25 L 49,25 M 25,1 L 25,49 M 7,7 C 18,18 32,32 43,43 M 7,43 C 18,32 32,18 43,7"
                    stroke="#ffffff"
                    strokeWidth="1.8"
                    fill="none"
                  />
                </g>

                {/* ---------------- LEFT BASKET (AWAY DEFENSE / HOME ATTACK) ---------------- */}
                <rect
                  x="20"
                  y="170"
                  width="190"
                  height="160"
                  fill={awayColor}
                  fillOpacity="0.45"
                  stroke="#ffffff"
                  strokeWidth="3"
                />
                <path d="M 210,170 A 60,60 0 0,1 210,330" fill="none" stroke="#ffffff" strokeWidth="3" />
                <path
                  d="M 210,330 A 60,60 0 0,1 210,170"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="3"
                  strokeDasharray="8 8"
                />
                <path
                  d="M 20,50 L 140,50 A 237.5,237.5 0 0,1 140,450 L 20,450"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="3.5"
                  strokeOpacity="0.9"
                />
                <path d="M 60,210 A 40,40 0 0,1 60,290" fill="none" stroke="#ffffff" strokeWidth="2.5" />
                <line x1="60" y1="220" x2="60" y2="280" stroke="#ffffff" strokeWidth="5" />
                <circle
                  cx="75"
                  cy="250"
                  r="9"
                  fill="none"
                  stroke="#f97316"
                  strokeWidth="3"
                  filter={`url(#glow-${uniqueId})`}
                />
                <circle cx="75" cy="250" r="3" fill="#ffffff" />
                <text
                  x="30"
                  y="255"
                  fontSize="18"
                  fontWeight="900"
                  fontFamily="Oswald"
                  fill="#ffffff"
                  fillOpacity="0.75"
                  transform="rotate(-90 30 255)"
                  textAnchor="middle"
                  letterSpacing="3"
                >
                  {awayAbbr}
                </text>
                {viewMode !== 'zones' && (
                  <text
                    x="120"
                    y="42"
                    fontSize="12"
                    fontWeight="bold"
                    fontFamily="sans-serif"
                    fill="#ffffff"
                    fillOpacity="0.9"
                    textAnchor="middle"
                  >
                    {awayAbbr} BASKET
                  </text>
                )}

                {/* ---------------- RIGHT BASKET (HOME DEFENSE / AWAY ATTACK) ---------------- */}
                <rect
                  x="730"
                  y="170"
                  width="190"
                  height="160"
                  fill={homeColor}
                  fillOpacity="0.45"
                  stroke="#ffffff"
                  strokeWidth="3"
                />
                <path d="M 730,170 A 60,60 0 0,0 730,330" fill="none" stroke="#ffffff" strokeWidth="3" />
                <path
                  d="M 730,330 A 60,60 0 0,0 730,170"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="3"
                  strokeDasharray="8 8"
                />
                <path
                  d="M 920,50 L 800,50 A 237.5,237.5 0 0,0 800,450 L 920,450"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="3.5"
                  strokeOpacity="0.9"
                />
                <path d="M 880,210 A 40,40 0 0,0 880,290" fill="none" stroke="#ffffff" strokeWidth="2.5" />
                <line x1="880" y1="220" x2="880" y2="280" stroke="#ffffff" strokeWidth="5" />
                <circle
                  cx="865"
                  cy="250"
                  r="9"
                  fill="none"
                  stroke="#f97316"
                  strokeWidth="3"
                  filter={`url(#glow-${uniqueId})`}
                />
                <circle cx="865" cy="250" r="3" fill="#ffffff" />
                <text
                  x="910"
                  y="255"
                  fontSize="18"
                  fontWeight="900"
                  fontFamily="Oswald"
                  fill="#ffffff"
                  fillOpacity="0.75"
                  transform="rotate(90 910 255)"
                  textAnchor="middle"
                  letterSpacing="3"
                >
                  {homeAbbr}
                </text>
                {viewMode !== 'zones' && (
                  <text
                    x="820"
                    y="42"
                    fontSize="12"
                    fontWeight="bold"
                    fontFamily="sans-serif"
                    fill="#ffffff"
                    fillOpacity="0.9"
                    textAnchor="middle"
                  >
                    {homeAbbr} BASKET
                  </text>
                )}

                {/* ---------------- ZONE HEATMAP OVERLAY (COMPUTED FROM REAL SHOTS) ---------------- */}
                {viewMode === 'zones' && (
                  <g opacity="0.92">
                    <rect
                      x="730"
                      y="170"
                      width="190"
                      height="160"
                      fill="#060b14"
                      fillOpacity="0.65"
                      stroke="#10b981"
                      strokeWidth="1.5"
                      strokeDasharray="4 4"
                    />
                    <text x="825" y="246" fill="#ffffff" fontSize="13" fontWeight="bold" fontFamily="JetBrains Mono" textAnchor="middle">
                      PAINT: {zoneSummary.paint.pct}
                    </text>
                    <text x="825" y="264" fill="#cbd5e1" fontSize="11" fontFamily="JetBrains Mono" textAnchor="middle">
                      ({zoneSummary.paint.made}/{zoneSummary.paint.total})
                    </text>

                    <rect
                      x="782"
                      y="24"
                      width="136"
                      height="36"
                      rx="4"
                      fill="#060b14"
                      fillOpacity="0.7"
                      stroke="#3b82f6"
                      strokeWidth="1"
                    />
                    <text x="850" y="46" fill="#ffffff" fontSize="10.5" fontWeight="bold" fontFamily="JetBrains Mono" textAnchor="middle">
                      CORNER 3: {zoneSummary.corner3.pct}
                    </text>

                    <rect
                      x="587"
                      y="92"
                      width="206"
                      height="38"
                      rx="4"
                      fill="#060b14"
                      fillOpacity="0.7"
                      stroke="#38bdf8"
                      strokeWidth="1"
                    />
                    <text x="690" y="115" fill="#ffffff" fontSize="10.5" fontWeight="bold" fontFamily="JetBrains Mono" textAnchor="middle">
                      3PT BREAK: {zoneSummary.aboveBreak3.pct} ({zoneSummary.aboveBreak3.made}/{zoneSummary.aboveBreak3.total})
                    </text>

                    <rect
                      x="587"
                      y="372"
                      width="206"
                      height="38"
                      rx="4"
                      fill="#060b14"
                      fillOpacity="0.7"
                      stroke="#f59e0b"
                      strokeWidth="1"
                    />
                    <text x="690" y="395" fill="#ffffff" fontSize="10.5" fontWeight="bold" fontFamily="JetBrains Mono" textAnchor="middle">
                      MID-RANGE: {zoneSummary.midRange.pct} ({zoneSummary.midRange.made}/{zoneSummary.midRange.total})
                    </text>
                  </g>
                )}

                {/* ---------------- LIVE / POST SHOT PLOTS ---------------- */}
                {viewMode === 'shots' &&
                  filteredShots.map((shot) => {
                    const cx = Math.max(0, Math.min(940, (Number.isFinite(shot.x) ? shot.x : 47) * 10))
                    const cy = Math.max(0, Math.min(500, (Number.isFinite(shot.y) ? shot.y : 25) * 10))
                    const isSelected = selectedShot?.id === shot.id

                    return (
                      <g
                        key={shot.id}
                        className="cursor-pointer transition-transform hover:scale-125"
                        onClick={() => setSelectedShot(shot)}
                      >
                        {isSelected && (
                          <circle
                            cx={cx}
                            cy={cy}
                            r="14"
                            fill="none"
                            stroke="#38bdf8"
                            strokeWidth="2.5"
                            className="animate-ping"
                          />
                        )}

                        {shot.made ? (
                          <g>
                            <circle
                              cx={cx}
                              cy={cy}
                              r={shot.points === 3 ? '8' : '6.5'}
                              fill="#10b981"
                              stroke="#ffffff"
                              strokeWidth="1.5"
                              filter={`url(#glow-${uniqueId})`}
                            />
                            {shot.points === 3 && (
                              <text
                                x={cx}
                                y={cy + 3}
                                fontSize="8"
                                fontWeight="900"
                                fontFamily="JetBrains Mono"
                                fill="#ffffff"
                                textAnchor="middle"
                              >
                                3
                              </text>
                            )}
                          </g>
                        ) : (
                          <g stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round">
                            <line x1={cx - 5} y1={cy - 5} x2={cx + 5} y2={cy + 5} />
                            <line x1={cx + 5} y1={cy - 5} x2={cx - 5} y2={cy + 5} />
                          </g>
                        )}
                      </g>
                    )
                  })}
              </svg>
            </div>

            {/* Companion Readable Shooting Zones Cards (ensures legible typography at narrow mobile widths) */}
            {viewMode === 'zones' && (
              <div
                data-testid="zone-breakdown-grid"
                className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2"
              >
                {[
                  {
                    key: 'paint',
                    label: 'Paint',
                    borderClass: 'border-emerald-500/40',
                    accentClass: 'text-emerald-300',
                    zone: zoneSummary.paint,
                  },
                  {
                    key: 'midRange',
                    label: 'Mid-Range',
                    borderClass: 'border-amber-500/40',
                    accentClass: 'text-amber-300',
                    zone: zoneSummary.midRange,
                  },
                  {
                    key: 'corner3',
                    label: 'Corner 3',
                    borderClass: 'border-blue-500/40',
                    accentClass: 'text-blue-300',
                    zone: zoneSummary.corner3,
                  },
                  {
                    key: 'aboveBreak3',
                    label: 'Above Break 3',
                    borderClass: 'border-sky-500/40',
                    accentClass: 'text-sky-300',
                    zone: zoneSummary.aboveBreak3,
                  },
                ].map((item) => (
                  <div
                    key={item.key}
                    data-testid="zone-stat-card"
                    className={`rounded-lg border ${item.borderClass} bg-[#0c1424]/95 px-3 py-2 text-center shadow-sm`}
                  >
                    <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-300">
                      {item.label}
                    </span>
                    <span
                      data-testid="zone-card-pct"
                      className={`mt-0.5 block font-['Oswald'] text-lg sm:text-xl font-bold tabular-nums leading-tight ${
                        item.zone.total > 0 ? item.accentClass : 'text-slate-500'
                      }`}
                    >
                      {item.zone.total > 0 ? item.zone.pct : '—'}
                    </span>
                    <span className="block font-mono text-[11px] text-slate-400 tabular-nums mt-0.5">
                      {item.zone.total > 0 ? `${item.zone.made}/${item.zone.total} FGM` : 'No tracked shots'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Selected Shot Detail Card Overlay */}
            {selectedShot && (
              <div className="mt-3 flex items-center justify-between rounded-xl border border-sky-500/40 bg-[#070d18] p-3 text-xs shadow-lg animate-in fade-in">
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full font-black text-xs shrink-0 ${
                      selectedShot.made ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
                    }`}
                  >
                    {selectedShot.made ? (selectedShot.points === 3 ? '3PT' : '2PT') : 'MISS'}
                  </span>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white text-sm">{selectedShot.shooter}</span>
                      <span className="font-mono text-[11px] font-semibold text-sky-400">({selectedShot.teamAbbr})</span>
                      <span className="font-mono text-[11px] text-slate-400">
                        Q{selectedShot.period} {selectedShot.clock}
                      </span>
                    </div>
                    <p className="text-slate-300 text-xs mt-0.5">{selectedShot.description}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedShot(null)}
                  className="text-slate-400 hover:text-white px-2 py-1 text-xs rounded bg-white/[0.06] shrink-0"
                >
                  Close
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
})
