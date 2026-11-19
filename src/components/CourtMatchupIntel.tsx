import React, { memo, useState, useEffect } from 'react'
import type { NBACompetitor, NBAGameSummary } from '../types/nba'
import { sanitizeHexColor, sanitizeImageUrl } from '../utils/nbaHelpers'
import {
  extractRecordSummary,
  extractStatLeaders,
  extractTeamComparisonRows,
  getValidatedTeamSummary,
  type NormalizedStatLeader,
} from '../utils/matchupStats'
import {
  Trophy,
  Flame,
  AlertTriangle,
  TrendingUp,
  Activity,
  Shield,
  Users,
  Clock,
} from 'lucide-react'

interface CourtMatchupIntelProps {
  awayComp?: NBACompetitor
  homeComp?: NBACompetitor
  summary?: NBAGameSummary | null
  gameState: 'pre' | 'in' | 'post' | string
  isSummaryLoading?: boolean
}

function hexLuminance(hex: string): number {
  const clean = hex.replace('#', '')
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.slice(0, 6)
  if (full.length !== 6) return 0.5
  const r = parseInt(full.slice(0, 2), 16) / 255
  const g = parseInt(full.slice(2, 4), 16) / 255
  const b = parseInt(full.slice(4, 6), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function getReadableTeamAccent(primary?: string, alternate?: string, fallback = '#38bdf8'): string {
  const p = sanitizeHexColor(primary, fallback)
  if (hexLuminance(p) >= 0.1) return p
  if (alternate) {
    const a = sanitizeHexColor(alternate, '')
    if (a && hexLuminance(a) >= 0.14) return a
  }
  return fallback
}

const PlayerAvatar: React.FC<{
  src?: string
  name: string
  accentColor: string
}> = ({ src, name, accentColor }) => {
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    setImgError(false)
  }, [src])
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('')

  if (!src || imgError) {
    return (
      <div
        className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-full border border-white/20 bg-slate-900 font-['Oswald'] text-sm font-bold text-white shrink-0"
        style={{ boxShadow: `inset 0 0 0 1px ${accentColor}40` }}
      >
        {initials || '?'}
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={name}
      onError={() => setImgError(true)}
      loading="lazy"
      decoding="async"
      className="h-10 w-10 sm:h-11 sm:w-11 rounded-full border border-white/20 bg-slate-900/90 object-cover object-top shrink-0"
    />
  )
}

const LeaderCardRow: React.FC<{
  leader: NormalizedStatLeader
  accentColor: string
}> = ({ leader, accentColor }) => {
  const isOut = leader.injuryStatus && /out/i.test(leader.injuryStatus)
  const isDayToDay = leader.injuryStatus && !isOut

  return (
    <div className="flex items-center justify-between gap-2.5 rounded-lg border border-white/[0.08] bg-black/35 px-2.5 py-2 hover:border-white/[0.16] transition-colors">
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <PlayerAvatar src={leader.headshot} name={leader.playerName} accentColor={accentColor} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {leader.categoryLabel}
            </span>
            {isOut && (
              <span className="rounded bg-rose-500/25 border border-rose-500/50 px-1.5 py-0 text-[9px] font-black uppercase text-rose-200">
                OUT
              </span>
            )}
            {isDayToDay && (
              <span className="rounded bg-amber-500/25 border border-amber-500/50 px-1.5 py-0 text-[9px] font-black uppercase text-amber-200">
                {leader.injuryStatus}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-bold text-xs sm:text-sm text-white truncate">
              {leader.playerName}
            </span>
            {(leader.jersey || leader.position) && (
              <span className="font-mono text-[10px] text-slate-400 shrink-0">
                {leader.jersey ? `#${leader.jersey}` : ''}
                {leader.jersey && leader.position ? ' • ' : ''}
                {leader.position || ''}
              </span>
            )}
          </div>
          {leader.subline && (
            <p className="text-[11px] text-slate-300 truncate mt-0.5" title={leader.subline}>
              {leader.subline}
            </p>
          )}
        </div>
      </div>

      <div className="text-right shrink-0 pl-1">
        <span className="font-['Oswald'] text-xl sm:text-2xl font-bold tracking-tight text-white tabular-nums leading-none block">
          {leader.primaryValue}
        </span>
        <span className="font-mono text-[10px] font-bold text-amber-300 uppercase tracking-wider">
          {leader.primaryUnit}
        </span>
      </div>
    </div>
  )
}

const TeamLogoBadge: React.FC<{
  src?: string
  name: string
  abbr: string
  accentColor: string
}> = ({ src, name, abbr, accentColor }) => {
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    setImgError(false)
  }, [src])

  const safeSrc = sanitizeImageUrl(src)
  if (!safeSrc || imgError) {
    return (
      <div
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 bg-slate-900 font-['Oswald'] text-xs font-extrabold text-white shrink-0"
        style={{ boxShadow: `inset 0 0 0 1px ${accentColor}66` }}
      >
        {abbr}
      </div>
    )
  }

  return (
    <img
      src={safeSrc}
      alt={name}
      onError={() => setImgError(true)}
      className="h-9 w-9 object-contain shrink-0 drop-shadow"
      loading="lazy"
      decoding="async"
    />
  )
}

const TeamScoutingPanel: React.FC<{
  side: 'away' | 'home'
  comp?: NBACompetitor
  teamSummary?: NBAGameSummary['awayTeam']
  accentColor: string
  gameState: 'pre' | 'in' | 'post' | string
}> = ({ side, comp, teamSummary, accentColor, gameState }) => {
  const isPre = gameState === 'pre'
  const validatedSummary = getValidatedTeamSummary(teamSummary, comp)
  const teamName = comp?.team?.displayName || comp?.team?.name || (side === 'away' ? 'Away Team' : 'Home Team')
  const abbr = (comp?.team?.abbreviation || (side === 'away' ? 'AWAY' : 'HOME')).slice(0, 6)
  const records = extractRecordSummary(comp, validatedSummary)
  const leaders = extractStatLeaders(comp, validatedSummary, gameState)
  const topPlayers = validatedSummary?.topPlayers || []
  const lastFive = validatedSummary?.lastFiveGames || []
  const injuries = validatedSummary?.injuries || []
  const isWinner = comp?.winner === true

  return (
    <div className="flex flex-col rounded-xl border border-white/[0.12] bg-[#0c1424]/95 overflow-hidden shadow-lg">
      {/* Team Color Top Accent Strip */}
      <div className="h-1 w-full" style={{ backgroundColor: accentColor }} />

      <div className="p-2.5 sm:p-3.5 flex-1 flex flex-col justify-between space-y-3">
        <div className="space-y-3">
          {/* Team Identity & Record Header */}
          <div className="flex items-start justify-between gap-2 border-b border-white/[0.08] pb-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <TeamLogoBadge src={comp?.team?.logo} name={teamName} abbr={abbr} accentColor={accentColor} />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-extrabold text-sm sm:text-base text-white truncate">
                    {teamName}
                  </span>
                  <span className="font-mono text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-white/[0.08] text-slate-300 shrink-0">
                    {side === 'away' ? 'AWAY' : 'HOME'}
                  </span>
                  {!isPre && isWinner && (
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 border border-emerald-400/40 px-1.5 py-0.5 text-[10px] font-bold text-emerald-200 shrink-0">
                      <Trophy className="h-2.5 w-2.5 text-emerald-300" />
                      WIN
                    </span>
                  )}
                </div>

                {/* Win-Loss & Splits Strip */}
                <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px] font-mono text-slate-300">
                  {records.overall ? (
                    <span className="font-bold text-white">{records.overall}</span>
                  ) : (
                    <span className="text-slate-400">Record —</span>
                  )}
                  {side === 'away' && records.road && (
                    <span className="text-slate-400">• Road: {records.road}</span>
                  )}
                  {side === 'home' && records.home && (
                    <span className="text-slate-400">• Home: {records.home}</span>
                  )}
                  {isPre && records.lastTen && (
                    <span className="text-slate-400">• L10: {records.lastTen}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Streak or Final Score Pill */}
            {isPre && records.streak ? (
              <span
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-xs font-extrabold shrink-0 border ${
                  records.streak.startsWith('W')
                    ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40'
                    : 'bg-rose-500/20 text-rose-200 border-rose-400/40'
                }`}
              >
                <Flame className="h-3 w-3 shrink-0" />
                {records.streak}
              </span>
            ) : !isPre ? (
              <span className="font-['Oswald'] text-2xl font-bold text-white tabular-nums shrink-0 leading-none">
                {comp?.score ?? '-'}
              </span>
            ) : null}
          </div>

          {/* Stat Leaders List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <span>{isPre ? `${abbr} Season Leaders` : `${abbr} Game Leaders`}</span>
              <span>{isPre ? 'Per Game Avg' : 'Game Total'}</span>
            </div>

            {leaders.length > 0 ? (
              <div className="space-y-1.5">
                {leaders.map((leader) => (
                  <LeaderCardRow
                    key={`${abbr}-${leader.category}-${leader.playerId}`}
                    leader={leader}
                    accentColor={accentColor}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-white/[0.06] bg-black/25 p-3 text-center text-xs text-slate-400">
                Player stat leaders unavailable for this matchup yet.
              </div>
            )}
          </div>
        </div>

        {/* Bottom Section: Pre-Game Last 5 & Injuries OR Post/Live Mini Box Score */}
        {isPre ? (
          <div className="space-y-2.5 pt-2 border-t border-white/[0.08]">
            {lastFive.length > 0 && (
              <div>
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  <span className="flex items-center gap-1">
                    <TrendingUp className="h-3 w-3 text-sky-400" />
                    Last 5 Games
                  </span>
                  <span className="font-mono text-slate-400">Most Recent →</span>
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {lastFive.map((g, idx) => (
                    <div
                      key={`${abbr}-l5-${idx}`}
                      title={`${g.result} ${g.score} vs ${g.opponentAbbr}`}
                      className={`rounded-md border px-1 py-1 text-center font-mono ${
                        g.result === 'W'
                          ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-200'
                          : 'bg-rose-500/15 border-rose-500/35 text-rose-200'
                      }`}
                    >
                      <span className="block text-[11px] font-black leading-tight">{g.result}</span>
                      <span className="block text-[9px] text-slate-300 truncate leading-tight mt-0.5">
                        {g.opponentAbbr || g.score}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {injuries.length > 0 && (
              <div>
                <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-300 mb-1.5">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  <span>Injury Watch ({injuries.length})</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {injuries.slice(0, 4).map((inj, idx) => {
                    const out = /out/i.test(inj.status)
                    return (
                      <span
                        key={`${abbr}-inj-${idx}`}
                        title={`${inj.playerName} (${inj.position || 'Player'}) — ${inj.status}${inj.detail ? `: ${inj.detail}` : ''}`}
                        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold border ${
                          out
                            ? 'bg-rose-500/15 border-rose-500/35 text-rose-200'
                            : 'bg-amber-500/15 border-amber-500/35 text-amber-200'
                        }`}
                      >
                        <span className="font-bold">{out ? 'OUT' : 'DTD'}</span>
                        <span className="text-slate-100 truncate max-w-[115px]">{inj.playerName}</span>
                      </span>
                    )
                  })}
                  {injuries.length > 4 && (
                    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-white/[0.05]">
                      +{injuries.length - 4} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          topPlayers.length > 0 && (
            <div className="pt-2 border-t border-white/[0.08]">
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                <span className="flex items-center gap-1">
                  <Activity className="h-3 w-3 text-emerald-400" />
                  Top Box Score Performers
                </span>
                <span className="font-mono text-slate-400">PTS / REB / AST</span>
              </div>
              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-[11px] font-mono">
                  <thead>
                    <tr className="text-[10px] text-slate-400 border-b border-white/[0.08]">
                      <th className="text-left py-1 pr-2 font-semibold whitespace-nowrap">PLAYER</th>
                      <th className="text-right py-1 px-1 font-semibold whitespace-nowrap">PTS</th>
                      <th className="text-right py-1 px-1 font-semibold whitespace-nowrap">REB</th>
                      <th className="text-right py-1 px-1 font-semibold whitespace-nowrap">AST</th>
                      <th className="text-right py-1 px-1 font-semibold whitespace-nowrap">FG</th>
                      <th className="text-right py-1 pl-1 font-semibold whitespace-nowrap">+/-</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {topPlayers.slice(0, 4).map((p) => {
                      const pm = p.plusMinus
                      const pmClass =
                        pm === null
                          ? 'font-normal text-slate-500'
                          : pm.startsWith('+')
                          ? 'font-semibold text-emerald-300'
                          : pm.startsWith('-')
                          ? 'font-semibold text-rose-300'
                          : 'font-semibold text-slate-300'
                      return (
                        <tr key={`${abbr}-box-${p.id}`} className="hover:bg-white/[0.03]">
                          <td className="py-1.5 pr-1.5 font-sans font-semibold text-slate-100 truncate max-w-[96px] sm:max-w-[125px]">
                            {p.shortName}
                          </td>
                          <td
                            className={`py-1.5 px-1 text-right tabular-nums whitespace-nowrap ${
                              p.pts === null
                                ? 'font-normal text-slate-500'
                                : p.pts >= 20
                                ? 'font-bold text-amber-300'
                                : 'font-bold text-white'
                            }`}
                          >
                            {p.pts === null ? '—' : p.pts}
                          </td>
                          <td
                            className={`py-1.5 px-1 text-right tabular-nums whitespace-nowrap ${
                              p.reb === null ? 'text-slate-500' : 'text-slate-200'
                            }`}
                          >
                            {p.reb === null ? '—' : p.reb}
                          </td>
                          <td
                            className={`py-1.5 px-1 text-right tabular-nums whitespace-nowrap ${
                              p.ast === null ? 'text-slate-500' : 'text-slate-200'
                            }`}
                          >
                            {p.ast === null ? '—' : p.ast}
                          </td>
                          <td
                            className={`py-1.5 px-1 text-right tabular-nums whitespace-nowrap ${
                              p.fg === null ? 'text-slate-500' : 'text-slate-300'
                            }`}
                          >
                            {p.fg === null ? '—' : p.fg}
                          </td>
                          <td className={`py-1.5 pl-1 text-right tabular-nums whitespace-nowrap ${pmClass}`}>
                            {pm === null ? '—' : pm}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  )
}

export const CourtMatchupIntel: React.FC<CourtMatchupIntelProps> = memo(({
  awayComp,
  homeComp,
  summary,
  gameState,
  isSummaryLoading = false,
}) => {
  const isPre = gameState === 'pre'

  const awayColorRaw = getReadableTeamAccent(
    awayComp?.team?.color,
    awayComp?.team?.alternateColor,
    '#38bdf8'
  )
  let homeColor = getReadableTeamAccent(
    homeComp?.team?.color,
    homeComp?.team?.alternateColor,
    '#f97316'
  )
  const awayColor = awayColorRaw
  if (awayColor.toLowerCase() === homeColor.toLowerCase()) {
    homeColor = '#f59e0b'
  }

  const awayAbbr = awayComp?.team?.abbreviation || 'AWAY'
  const homeAbbr = homeComp?.team?.abbreviation || 'HOME'

  const normalizedViewState = gameState === 'in' || gameState === 'post' ? gameState : 'pre'
  const hasMismatchedSummaryState = Boolean(
    summary?.gameState &&
      (summary.gameState === 'in' || summary.gameState === 'post' ? summary.gameState : 'pre') !==
        normalizedViewState
  )
  const stateCompatibleSummary = hasMismatchedSummaryState ? null : summary

  const validatedAwaySummary = getValidatedTeamSummary(stateCompatibleSummary?.awayTeam, awayComp)
  const validatedHomeSummary = getValidatedTeamSummary(stateCompatibleSummary?.homeTeam, homeComp)

  // If summary teams were provided but failed validation against either competitor, reject event-level summary metadata too
  const hasMismatchedSummaryTeam =
    (Boolean(stateCompatibleSummary?.awayTeam) && !validatedAwaySummary) ||
    (Boolean(stateCompatibleSummary?.homeTeam) && !validatedHomeSummary)
  const safeSummary = hasMismatchedSummaryTeam ? null : stateCompatibleSummary

  const { rows, highlights } = extractTeamComparisonRows(
    awayComp,
    homeComp,
    validatedAwaySummary,
    validatedHomeSummary,
    gameState
  )

  const leadChanges = validatedAwaySummary?.stats?.leadChanges || validatedHomeSummary?.stats?.leadChanges
  const showStaleBanner = Boolean(safeSummary && (safeSummary.isStale || safeSummary.provenance === 'stale-cache'))
  const showDemoBanner = Boolean(safeSummary && safeSummary.provenance === 'demo')

  return (
    <div className="relative rounded-xl overflow-hidden border border-white/[0.1] bg-[#060b14] p-2 sm:p-3.5">
      {/* Subtle Hardwood Court Lines Watermark Backdrop */}
      <svg
        viewBox="0 0 940 500"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 w-full h-full opacity-[0.07]"
      >
        <rect x="20" y="20" width="900" height="460" fill="none" stroke="#ffffff" strokeWidth="3" />
        <line x1="470" y1="20" x2="470" y2="480" stroke="#ffffff" strokeWidth="3" />
        <circle cx="470" cy="250" r="65" fill="none" stroke="#ffffff" strokeWidth="3" />
        <rect x="20" y="170" width="190" height="160" fill={awayColor} fillOpacity="0.35" stroke="#ffffff" strokeWidth="2.5" />
        <path d="M 20,50 L 140,50 A 237.5,237.5 0 0,1 140,450 L 20,450" fill="none" stroke="#ffffff" strokeWidth="2.5" />
        <rect x="730" y="170" width="190" height="160" fill={homeColor} fillOpacity="0.35" stroke="#ffffff" strokeWidth="2.5" />
        <path d="M 920,50 L 800,50 A 237.5,237.5 0 0,0 800,450 L 920,450" fill="none" stroke="#ffffff" strokeWidth="2.5" />
      </svg>

      {/* Honest Provenance Strip for Stale Cache or Demo Fixtures */}
      {(showStaleBanner || showDemoBanner) && (
        <div
          data-testid="summary-provenance-banner"
          className="relative z-10 mb-2.5 flex items-center justify-between gap-2 rounded-lg border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-[11px] font-semibold text-amber-200"
        >
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-amber-300 shrink-0" />
            {showDemoBanner
              ? 'Demo Mode: Displaying sample fixture data (not live ESPN telemetry)'
              : 'Showing cached summary — refresh pending'}
          </span>
        </div>
      )}

      {/* Symmetrical 3-Column Court-Side Intelligence Grid */}
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch">
        {/* Left Side of Court: Away Team */}
        <div className="lg:col-span-4 flex flex-col">
          <TeamScoutingPanel
            side="away"
            comp={awayComp}
            teamSummary={validatedAwaySummary}
            accentColor={awayColor}
            gameState={gameState}
          />
        </div>

        {/* Center Court: Tale of the Tape / Team Box Comparison */}
        <div className="lg:col-span-4 flex flex-col rounded-xl border border-white/[0.12] bg-[#0c1424]/95 p-2.5 sm:p-3.5 shadow-lg justify-between space-y-3">
          <div className="space-y-3">
            {/* Comparison Header */}
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-2.5">
              <div className="flex items-center gap-1.5 font-mono text-xs font-extrabold">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: awayColor }} />
                <span className="text-white">{awayAbbr}</span>
              </div>
              <span className="text-[11px] font-extrabold uppercase tracking-widest text-slate-200 text-center">
                {isPre ? 'Tale of the Tape' : 'Team Box Stats'}
              </span>
              <div className="flex items-center gap-1.5 font-mono text-xs font-extrabold">
                <span className="text-white">{homeAbbr}</span>
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: homeColor }} />
              </div>
            </div>

            {/* Mirrored Comparison Bars */}
            {rows.length > 0 ? (
              <div className="space-y-2.5">
                {rows.map((row) => {
                  const isPartial = Boolean(
                    row.isPartial || row.awaySharePct === null || row.homeSharePct === null
                  )
                  return (
                    <div
                      key={row.key}
                      data-row-key={row.key}
                      data-leader-side={row.leaderSide}
                      data-partial={isPartial ? 'true' : 'false'}
                      className="space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs font-mono">
                        <div className="flex items-center gap-1 min-w-0">
                          <span
                            className={`tabular-nums ${
                              row.awayValue === null
                                ? 'font-normal text-slate-500'
                                : row.leaderSide === 'away'
                                ? 'font-black text-white'
                                : 'font-medium text-slate-300'
                            }`}
                          >
                            {row.awayDisplay}
                          </span>
                          {row.awayRank && (
                            <span className="text-[9px] px-1 rounded bg-white/[0.08] text-amber-300 font-bold">
                              #{row.awayRank.replace(/[^0-9A-Za-z-]/g, '')}
                            </span>
                          )}
                        </div>

                        <span className="font-sans text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center shrink-0">
                          {row.label}
                        </span>

                        <div className="flex items-center gap-1 min-w-0 justify-end">
                          {row.homeRank && (
                            <span className="text-[9px] px-1 rounded bg-white/[0.08] text-amber-300 font-bold">
                              #{row.homeRank.replace(/[^0-9A-Za-z-]/g, '')}
                            </span>
                          )}
                          <span
                            className={`tabular-nums ${
                              row.homeValue === null
                                ? 'font-normal text-slate-500'
                                : row.leaderSide === 'home'
                                ? 'font-black text-white'
                                : 'font-medium text-slate-300'
                            }`}
                          >
                            {row.homeDisplay}
                          </span>
                        </div>
                      </div>

                      {/* Split Comparison Meter (omits fabricated split when either side is unavailable) */}
                      {isPartial ? (
                        <div
                          className="h-1.5 w-full rounded-full bg-slate-900/90 border border-dashed border-white/[0.14]"
                          title="Partial data — comparison unavailable"
                        />
                      ) : (
                        <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-900/90 border border-white/[0.08]">
                          <div
                            className="h-full transition-all duration-500"
                            style={{
                              width: `${row.awaySharePct}%`,
                              backgroundColor: awayColor,
                              opacity: row.leaderSide === 'home' ? 0.45 : 0.95,
                            }}
                          />
                          <div className="w-[2px] bg-[#060b14] shrink-0" />
                          <div
                            className="h-full transition-all duration-500"
                            style={{
                              width: `${row.homeSharePct}%`,
                              backgroundColor: homeColor,
                              opacity: row.leaderSide === 'away' ? 0.45 : 0.95,
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-lg border border-white/[0.06] bg-black/25 p-4 text-center text-xs text-slate-400">
                {isSummaryLoading ? 'Loading matchup statistics...' : 'Team comparison stats unavailable.'}
              </div>
            )}
          </div>

          {/* Bottom Center Highlights: Pre-game Defense/Series/Predictor OR Post-Game Paint/Fastbreak */}
          {isPre ? (
            <div className="space-y-2 pt-2 border-t border-white/[0.08]">
              {(validatedAwaySummary?.stats?.avgSteals ||
                validatedHomeSummary?.stats?.avgSteals ||
                validatedAwaySummary?.stats?.avgBlocks ||
                validatedHomeSummary?.stats?.avgBlocks) && (
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-lg bg-black/30 border border-white/[0.06] px-2 py-1.5">
                    <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                      Steals / Game
                    </span>
                    <span className="font-mono text-xs font-bold text-slate-200 tabular-nums">
                      {validatedAwaySummary?.stats?.avgSteals ?? '—'} <span className="text-slate-500">vs</span>{' '}
                      {validatedHomeSummary?.stats?.avgSteals ?? '—'}
                    </span>
                  </div>
                  <div className="rounded-lg bg-black/30 border border-white/[0.06] px-2 py-1.5">
                    <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                      Blocks / Game
                    </span>
                    <span className="font-mono text-xs font-bold text-slate-200 tabular-nums">
                      {validatedAwaySummary?.stats?.avgBlocks ?? '—'} <span className="text-slate-500">vs</span>{' '}
                      {validatedHomeSummary?.stats?.avgBlocks ?? '—'}
                    </span>
                  </div>
                </div>
              )}

              {(safeSummary?.seasonSeries || safeSummary?.predictor) && (
                <div className="rounded-lg bg-black/35 border border-white/[0.08] p-2.5 text-xs space-y-1">
                  {safeSummary.seasonSeries && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        <Shield className="h-3 w-3 text-sky-400" />
                        Season Series
                      </span>
                      <span className="font-semibold text-slate-100 text-[11px]">{safeSummary.seasonSeries}</span>
                    </div>
                  )}
                  {safeSummary.predictor && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        ESPN Matchup Odds
                      </span>
                      <span className="font-mono text-[11px] font-bold text-amber-300 tabular-nums">
                        {awayAbbr} {safeSummary.predictor.awayWinPct.toFixed(1)}% • {homeAbbr}{' '}
                        {safeSummary.predictor.homeWinPct.toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            (highlights.length > 0 || leadChanges || safeSummary?.attendance) && (
              <div className="space-y-2 pt-2 border-t border-white/[0.08]">
                {highlights.length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {highlights.map((h) => (
                      <div
                        key={h.key}
                        data-highlight-key={h.key}
                        data-leader-side={h.leaderSide}
                        className="rounded-lg bg-black/35 border border-white/[0.08] px-2 py-1.5 text-center"
                      >
                        <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                          {h.label}
                        </span>
                        <div className="mt-0.5 flex items-center justify-center gap-1.5 font-mono text-xs tabular-nums">
                          <span
                            className={
                              h.awayValue === null
                                ? 'text-slate-500'
                                : h.leaderSide === 'away'
                                ? 'font-black text-white'
                                : 'text-slate-400'
                            }
                          >
                            {h.awayDisplay}
                          </span>
                          <span className="text-slate-600 text-[10px]">vs</span>
                          <span
                            className={
                              h.homeValue === null
                                ? 'text-slate-500'
                                : h.leaderSide === 'home'
                                ? 'font-black text-white'
                                : 'text-slate-400'
                            }
                          >
                            {h.homeDisplay}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {(leadChanges || safeSummary?.attendance) && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-black/30 border border-white/[0.06] px-2.5 py-1.5 text-[11px] font-mono text-slate-300">
                    {leadChanges && (
                      <span>
                        Lead Changes: <strong className="text-white">{leadChanges}</strong>
                      </span>
                    )}
                    {safeSummary?.attendance && (
                      <span className="flex items-center gap-1 ml-auto">
                        <Users className="h-3 w-3 text-slate-400" />
                        <strong className="text-white">{safeSummary.attendance.toLocaleString()}</strong>
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          )}
        </div>

        {/* Right Side of Court: Home Team */}
        <div className="lg:col-span-4 flex flex-col">
          <TeamScoutingPanel
            side="home"
            comp={homeComp}
            teamSummary={validatedHomeSummary}
            accentColor={homeColor}
            gameState={gameState}
          />
        </div>
      </div>
    </div>
  )
})
