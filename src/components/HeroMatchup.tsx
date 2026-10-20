import React, { useState, memo, useMemo } from 'react'
import type { NBAEvent } from '../types/nba'
import { CourtDiagram } from './CourtDiagram'
import { WinProbabilityBar } from './WinProbabilityBar'
import { getScorigamiInfo } from '../utils/scorigami'
import {
  safeParseInt,
  isClutchGame,
  calculateSecondsRemaining,
  calculateWinProbability,
  resolveHomeSpread,
  sanitizeImageUrl,
} from '../utils/nbaHelpers'
import {
  Tv,
  Mic,
  MapPin,
  Sparkles,
  Share2,
  Check,
  Radio,
  Users,
  ShieldAlert,
} from 'lucide-react'

interface HeroMatchupProps {
  event: NBAEvent
  onSelectGame?: (id: string) => void
}

function areHeroPropsEqual(prev: HeroMatchupProps, next: HeroMatchupProps): boolean {
  if (prev.event === next.event) return true
  const p = prev.event
  const n = next.event
  if (p.id !== n.id) return false
  if (p.status?.clock !== n.status?.clock) return false
  if (p.status?.period !== n.status?.period) return false
  if (p.status?.displayClock !== n.status?.displayClock) return false
  if (p.status?.type?.detail !== n.status?.type?.detail) return false
  if (p.status?.type?.state !== n.status?.type?.state) return false

  const pComp = p.competitions?.[0]
  const nComp = n.competitions?.[0]
  if (pComp?.situation?.possession !== nComp?.situation?.possession) return false
  if (pComp?.situation?.shotClock !== nComp?.situation?.shotClock) return false

  const pComps = pComp?.competitors
  const nComps = nComp?.competitors
  if ((pComps?.[0]?.score ?? '') !== (nComps?.[0]?.score ?? '')) return false
  if ((pComps?.[1]?.score ?? '') !== (nComps?.[1]?.score ?? '')) return false
  if ((pComp?.shots?.length ?? 0) !== (nComp?.shots?.length ?? 0)) return false

  return true
}

export const HeroMatchup: React.FC<HeroMatchupProps> = memo(({ event }) => {
  const [isCopied, setIsCopied] = useState<boolean>(false)
  const competition = event.competitions[0]
  if (!competition) return null

  const { status } = event
  const state = status.type?.state || 'in'
  const isLive = state === 'in'
  const isFinal = state === 'post'
  const situation = competition.situation

  const competitors = competition.competitors || []
  const homeComp = competitors.find((c) => c.homeAway === 'home')
  const awayComp = competitors.find((c) => c.homeAway === 'away')

  const crew = competition.announcingCrew
  const isClutch = isClutchGame(status, competitors)
  const venueText = competition.venue?.fullName
    ? `${competition.venue.fullName}${competition.venue.address?.city ? `, ${competition.venue.address.city}` : ''}`
    : ''

  const secondsRemaining = calculateSecondsRemaining(status)
  const homeScore = safeParseInt(homeComp?.score, 0)
  const awayScore = safeParseInt(awayComp?.score, 0)
  const homeAbbr = homeComp?.team?.abbreviation || 'Home'
  const awayAbbr = awayComp?.team?.abbreviation || 'Away'

  const scorigamiInfo = useMemo(() => {
    return getScorigamiInfo(
      homeScore,
      awayScore,
      secondsRemaining,
      state,
      homeAbbr,
      awayAbbr
    )
  }, [homeScore, awayScore, secondsRemaining, state, homeAbbr, awayAbbr])

  const homeSpread = useMemo(() => {
    return resolveHomeSpread(competition.odds, homeAbbr, awayAbbr)
  }, [competition.odds, homeAbbr, awayAbbr])

  const winProb = useMemo(() => {
    return calculateWinProbability(
      homeScore,
      awayScore,
      secondsRemaining,
      state,
      homeSpread,
      situation
        ? {
            possession: situation.possession,
            homeTeamId: homeComp?.team?.id,
            awayTeamId: awayComp?.team?.id,
            homeFouls: situation.homeFouls ?? homeComp?.fouls,
            awayFouls: situation.awayFouls ?? awayComp?.fouls,
            scoringRun: situation.scoringRun,
          }
        : null
    )
  }, [homeScore, awayScore, secondsRemaining, state, homeSpread, situation, homeComp?.team?.id, awayComp?.team?.id, homeComp?.fouls, awayComp?.fouls])

  const handleCopySnapshot = async () => {
    const awayName = awayComp?.team?.displayName || awayAbbr
    const homeName = homeComp?.team?.displayName || homeAbbr
    const awayScoreStr = awayComp?.score ?? '-'
    const homeScoreStr = homeComp?.score ?? '-'
    const statusText = isLive ? `Q${status.period} ${status.displayClock}` : isFinal ? 'Final' : 'Upcoming'
    const crewText = crew?.playByPlay ? ` • On Air: ${crew.playByPlay} & ${crew.colorAnalyst} (${crew.network})` : ''
    const shareText = `🏀 NBA Score: ${awayName} (${awayScoreStr}) @ ${homeName} (${homeScoreStr}) [${statusText}]${crewText}\nLive Command: https://martindavies-code.github.io/nba-live-dashboard/`

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(shareText)
        setIsCopied(true)
        setTimeout(() => setIsCopied(false), 2500)
      }
    } catch {}
  }

  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/[0.18] bg-[#0c1424] shadow-2xl backdrop-blur-xl">
      {/* Top Spotlight Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-white/[0.12] bg-black/50 px-4 sm:px-6 py-2.5 sm:py-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex h-2.5 w-2.5 rounded-full bg-orange-500 animate-ping" />
          <span className="font-extrabold uppercase tracking-widest text-orange-400 text-[10px] sm:text-[11px]">
            Spotlight Matchup
          </span>
          <span className="text-slate-500 hidden sm:inline">|</span>
          <span className="font-mono text-slate-200 font-bold text-[11px] sm:text-xs">
            {isLive ? `Quarter ${status.period} • ${status.displayClock}` : status.type?.detail || 'Match Details'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Announcing Crew Network Badge */}
          {crew?.network && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/20 border border-sky-400/40 px-2.5 py-0.5 sm:px-3 sm:py-1 font-semibold text-sky-200 text-[10px] sm:text-xs">
              <Tv className="h-3 w-3 text-sky-400" />
              {crew.network}
            </span>
          )}

          {/* Clutch Alert Badge */}
          {isClutch && (
            <span className="inline-flex items-center gap-1 rounded bg-rose-600/40 border border-rose-500/60 px-2 py-0.5 text-[10px] sm:text-xs font-black text-rose-200 animate-pulse">
              <ShieldAlert className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-rose-300" />
              CLUTCH GAME
            </span>
          )}

          {/* Copy Snapshot Button */}
          <button
            onClick={handleCopySnapshot}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.15] bg-white/[0.08] hover:bg-white/[0.15] px-2.5 py-1 text-slate-200 hover:text-white transition-colors text-[11px] sm:text-xs font-medium"
            title="Copy matchup snapshot to clipboard"
          >
            {isCopied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Share2 className="h-3.5 w-3.5" />}
            <span>{isCopied ? 'Copied' : 'Share'}</span>
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-5">
        {/* Full-Width Commanding Scoreboard Header */}
        <div className="rounded-xl border border-white/[0.12] bg-[#080d1a] p-4 sm:p-6 shadow-lg">
          {/* Venue & Clock Info Strip */}
          <div className="flex items-center justify-between gap-2 border-b border-white/[0.08] pb-3 text-xs text-slate-300">
            <span className="flex items-center gap-2 shrink-0 font-medium">
              <span className={`h-2.5 w-2.5 rounded-full ${isLive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`} />
              <strong className="text-white">{isLive ? 'Live On Air' : status.type?.detail}</strong>
            </span>
            {venueText && (
              <span className="flex items-center gap-1.5 truncate max-w-[280px] sm:max-w-md text-slate-300" title={venueText}>
                <MapPin className="h-3.5 w-3.5 text-orange-400 shrink-0" />
                <span className="truncate">{venueText}</span>
              </span>
            )}
          </div>

          {/* Symmetrical Desktop / Stacked Mobile Scoreboard */}
          <div className="py-4 grid grid-cols-1 md:grid-cols-11 items-center gap-4">
            {/* Away Team (Columns 1-4) */}
            <div className="md:col-span-4 flex items-center justify-between md:justify-start gap-4 min-w-0">
              <div className="flex items-center gap-3.5 min-w-0">
                <img
                  src={sanitizeImageUrl(awayComp?.team?.logo)}
                  alt={awayComp?.team?.displayName || 'Away'}
                  className="h-12 w-12 sm:h-16 sm:w-16 object-contain drop-shadow-lg shrink-0"
                  loading="lazy"
                  decoding="async"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-extrabold text-lg sm:text-xl text-white truncate">
                      {awayComp?.team?.displayName || awayComp?.team?.name}
                    </span>
                    <span className="font-mono text-xs font-bold text-slate-300 bg-white/[0.08] px-1.5 py-0.5 rounded shrink-0">
                      {awayComp?.team?.abbreviation}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-300 mt-0.5">
                    <span className="font-medium">{awayComp?.records?.[0]?.summary || '0-0'}</span>
                    {situation?.possession === awayComp?.team?.id && (
                      <span className="rounded bg-orange-500/25 border border-orange-500/50 text-orange-200 font-extrabold text-[10px] px-2 py-0.2 shrink-0 animate-pulse">
                        🏀 POSSESSION
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {/* Score on Mobile */}
              <span className="md:hidden font-['Oswald'] text-4xl sm:text-5xl font-bold tracking-tight text-white tabular-nums shrink-0">
                {awayComp?.score ?? '-'}
              </span>
            </div>

            {/* Center Status & Large Scores on Desktop (Columns 5-7) */}
            <div className="md:col-span-3 flex flex-col items-center justify-center text-center py-2 md:py-0 border-y md:border-y-0 md:border-x border-white/[0.08] px-2">
              <div className="hidden md:flex items-center justify-center gap-6 w-full">
                <span className="font-['Oswald'] text-5xl lg:text-6xl font-bold tracking-tight text-white tabular-nums shrink-0">
                  {awayComp?.score ?? '-'}
                </span>
                <span className="font-mono text-xs text-slate-400 font-bold uppercase tracking-wider">
                  VS
                </span>
                <span className="font-['Oswald'] text-5xl lg:text-6xl font-bold tracking-tight text-white tabular-nums shrink-0">
                  {homeComp?.score ?? '-'}
                </span>
              </div>

              <div className="mt-1 space-y-0.5">
                <span className="font-mono text-xs font-bold text-amber-300 uppercase tracking-wide block">
                  {isLive ? `Q${status.period} • ${status.displayClock}` : isFinal ? 'Final Score' : status.type?.detail}
                </span>
                {Math.abs(homeScore - awayScore) > 0 && isLive && (
                  <span className="text-[11px] font-semibold text-slate-300 block">
                    {homeScore > awayScore ? `${homeAbbr} by ${homeScore - awayScore}` : `${awayAbbr} by ${awayScore - homeScore}`}
                  </span>
                )}
                {competition.odds?.[0] && (
                  <span className="font-mono text-[10px] text-slate-400 block">
                    {competition.odds[0].details ? `Line: ${competition.odds[0].details}` : ''}
                    {competition.odds[0].overUnder ? ` • O/U ${competition.odds[0].overUnder}` : ''}
                  </span>
                )}
              </div>
            </div>

            {/* Home Team (Columns 8-11) */}
            <div className="md:col-span-4 flex items-center justify-between md:justify-end gap-4 min-w-0">
              {/* Score on Mobile */}
              <span className="md:hidden font-['Oswald'] text-4xl sm:text-5xl font-bold tracking-tight text-white tabular-nums shrink-0">
                {homeComp?.score ?? '-'}
              </span>

              <div className="flex items-center gap-3.5 min-w-0 md:flex-row-reverse md:text-right">
                <img
                  src={sanitizeImageUrl(homeComp?.team?.logo)}
                  alt={homeComp?.team?.displayName || 'Home'}
                  className="h-12 w-12 sm:h-16 sm:w-16 object-contain drop-shadow-lg shrink-0"
                  loading="lazy"
                  decoding="async"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap md:justify-end">
                    <span className="font-mono text-xs font-bold text-slate-300 bg-white/[0.08] px-1.5 py-0.5 rounded shrink-0">
                      {homeComp?.team?.abbreviation}
                    </span>
                    <span className="font-extrabold text-lg sm:text-xl text-white truncate">
                      {homeComp?.team?.displayName || homeComp?.team?.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-300 mt-0.5 md:justify-end">
                    {situation?.possession === homeComp?.team?.id && (
                      <span className="rounded bg-orange-500/25 border border-orange-500/50 text-orange-200 font-extrabold text-[10px] px-2 py-0.2 shrink-0 animate-pulse">
                        🏀 POSSESSION
                      </span>
                    )}
                    <span className="font-medium">{homeComp?.records?.[0]?.summary || '0-0'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Full-Width Live Win Probability Meter */}
          <div className="border-t border-white/[0.08] pt-3">
            <WinProbabilityBar
              homeWinPercentage={winProb.homePct / 100}
              awayWinPercentage={winProb.awayPct / 100}
              homeCompetitor={homeComp}
              awayCompetitor={awayComp}
              gameState={state}
              status={status}
              situation={situation}
              odds={competition.odds}
            />
          </div>
        </div>

        {/* Lower Intelligence Grid: Linescore & Broadcast (Left) | Scorigami & Tactical Court (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Deck (Col 6): Linescore Breakdown & Broadcast Crew */}
          <div className="lg:col-span-6 flex flex-col space-y-4">
            {/* Quarter-by-Quarter Linescore Table */}
            {((homeComp?.linescores && homeComp.linescores.length > 0) ||
              (awayComp?.linescores && awayComp.linescores.length > 0)) && (
              <div className="rounded-xl border border-white/[0.12] bg-[#080d1a] p-3.5 shadow-md">
                <div className="flex items-center justify-between border-b border-white/[0.08] pb-2 mb-2">
                  <span className="font-bold uppercase tracking-wider text-[11px] text-slate-200">
                    Quarter-by-Quarter Linescore
                  </span>
                  <span className="font-mono text-[10px] text-slate-400">Official Period Totals</span>
                </div>
                <div className="overflow-x-auto no-scrollbar">
                  <table className="w-full text-center text-xs font-mono">
                    <thead>
                      <tr className="text-slate-300 text-[11px] border-b border-white/[0.08] font-bold">
                        <th className="text-left py-1.5 px-2.5">Team</th>
                        <th className="py-1.5 px-2.5">Q1</th>
                        <th className="py-1.5 px-2.5">Q2</th>
                        <th className="py-1.5 px-2.5">Q3</th>
                        <th className="py-1.5 px-2.5">Q4</th>
                        {(homeComp?.linescores?.length ?? 0) > 4 && <th className="py-1.5 px-2.5">OT</th>}
                        <th className="py-1.5 px-2.5 font-black text-white bg-white/[0.06] rounded-r">TOTAL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      <tr className="hover:bg-white/[0.02]">
                        <td className="text-left py-2 px-2.5 font-bold text-white">{awayAbbr}</td>
                        <td className="py-2 px-2.5 text-slate-200">{awayComp?.linescores?.[0]?.value ?? '-'}</td>
                        <td className="py-2 px-2.5 text-slate-200">{awayComp?.linescores?.[1]?.value ?? '-'}</td>
                        <td className="py-2 px-2.5 text-slate-200">{awayComp?.linescores?.[2]?.value ?? '-'}</td>
                        <td className="py-2 px-2.5 text-slate-200">{awayComp?.linescores?.[3]?.value ?? '-'}</td>
                        {(homeComp?.linescores?.length ?? 0) > 4 && (
                          <td className="py-2 px-2.5 text-slate-200">{awayComp?.linescores?.[4]?.value ?? '-'}</td>
                        )}
                        <td className="py-2 px-2.5 font-black text-white bg-white/[0.06] text-sm">{awayComp?.score ?? '-'}</td>
                      </tr>
                      <tr className="hover:bg-white/[0.02]">
                        <td className="text-left py-2 px-2.5 font-bold text-white">{homeAbbr}</td>
                        <td className="py-2 px-2.5 text-slate-200">{homeComp?.linescores?.[0]?.value ?? '-'}</td>
                        <td className="py-2 px-2.5 text-slate-200">{homeComp?.linescores?.[1]?.value ?? '-'}</td>
                        <td className="py-2 px-2.5 text-slate-200">{homeComp?.linescores?.[2]?.value ?? '-'}</td>
                        <td className="py-2 px-2.5 text-slate-200">{homeComp?.linescores?.[3]?.value ?? '-'}</td>
                        {(homeComp?.linescores?.length ?? 0) > 4 && (
                          <td className="py-2 px-2.5 text-slate-200">{homeComp?.linescores?.[4]?.value ?? '-'}</td>
                        )}
                        <td className="py-2 px-2.5 font-black text-white bg-white/[0.06] text-sm">{homeComp?.score ?? '-'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Broadcast & Announcing Crew Card */}
            {crew && (
              <div className="rounded-xl border border-white/[0.12] bg-[#080d1a] p-3.5 text-xs space-y-2.5 shadow-md">
                <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
                  <span className="flex items-center gap-1.5 font-bold tracking-wider uppercase text-[11px] text-sky-400">
                    <Mic className="h-3.5 w-3.5" />
                    Broadcast & Announcing Team
                  </span>
                  <span className="font-mono text-xs text-white font-bold bg-sky-500/20 border border-sky-400/40 px-2.5 py-0.5 rounded">
                    {crew.network}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-slate-200 pt-0.5">
                  <div className="rounded-lg bg-white/[0.03] p-2 border border-white/[0.04]">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Commentators</span>
                    <strong className="text-white font-bold text-sm block">{crew.playByPlay}</strong>
                    <span className="text-slate-300 block text-xs">{crew.colorAnalyst}</span>
                  </div>
                  {crew.sidelineReporter && (
                    <div className="rounded-lg bg-white/[0.03] p-2 border border-white/[0.04]">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Sideline Reporter</span>
                      <strong className="text-slate-100 font-semibold text-sm block">{crew.sidelineReporter}</strong>
                      <span className="text-slate-400 text-xs">On-Court Live</span>
                    </div>
                  )}
                </div>

                {/* Radio & Officials */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-2 text-xs">
                  {crew.radioNetwork && (
                    <div className="flex items-center gap-1.5 text-slate-300">
                      <Radio className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      <span className="font-medium">{crew.radioNetwork}</span>
                    </div>
                  )}
                  {crew.officials && crew.officials.length > 0 && (
                    <div className="flex items-center gap-1.5 text-slate-400 text-[11px] ml-auto">
                      <Users className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      <span>
                        <strong className="text-slate-200">Refs: </strong>
                        {crew.officials.map((o) => `${o.name}`).join(', ')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Deck (Col 6): NBA Scorigami Intelligence & Court Radar */}
          <div className="lg:col-span-6 flex flex-col space-y-4">
            {/* NBA Scorigami Showcase Card */}
            <div
              className={`rounded-xl border p-4 text-xs transition-colors shadow-md ${
                scorigamiInfo.isCurrentScorigami
                  ? 'border-violet-500/70 bg-gradient-to-r from-violet-950/80 to-purple-950/70 text-violet-100 shadow-violet-950/50'
                  : 'border-white/[0.12] bg-[#080d1a] text-slate-200'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-2.5 mb-2.5">
                <span className="flex items-center gap-1.5 font-bold tracking-wider uppercase text-xs text-slate-100">
                  <Sparkles
                    className={`h-4 w-4 ${
                      scorigamiInfo.isCurrentScorigami ? 'text-violet-300 animate-pulse' : 'text-orange-400'
                    }`}
                  />
                  {scorigamiInfo.isCurrentScorigami ? '✨ Live NBA Scorigami in Progress' : isFinal ? 'Final Scorigami Status' : 'Scorigami Probability'}
                </span>
                <span
                  className={`font-mono font-bold text-xs tabular-nums px-2.5 py-0.5 rounded ${
                    scorigamiInfo.isCurrentScorigami
                      ? 'bg-violet-500/30 text-violet-100 border border-violet-400/50'
                      : 'bg-white/[0.1] text-white border border-white/[0.15]'
                  }`}
                >
                  {scorigamiInfo.chanceLabel}
                </span>
              </div>

              {scorigamiInfo.mostLikelyNovel && (
                <div className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-black/30 border border-white/[0.06] mb-2">
                  <span className="text-slate-300 font-medium">Nearest Novel Final Score:</span>
                  <span className="font-mono text-sm font-bold text-violet-200 bg-violet-950/90 px-2.5 py-0.5 rounded border border-violet-600/60">
                    {scorigamiInfo.mostLikelyLabel}
                  </span>
                </div>
              )}

              <div className="text-xs leading-relaxed text-slate-300">
                <strong className="text-white font-semibold">Live Condition: </strong>
                {scorigamiInfo.whenScenario}
              </div>

              {scorigamiInfo.lastGameSummary && (
                <div className="mt-2.5 flex items-start gap-1.5 text-xs text-slate-300 border-t border-white/[0.06] pt-2.5">
                  <span className="font-semibold text-white shrink-0">Historical Record:</span>
                  <span className="text-slate-200">
                    <strong className="text-amber-300 font-semibold">{scorigamiInfo.lastGameSummary}</strong>
                    <span className="text-slate-400 ml-1.5 font-mono text-[11px]">
                      ({scorigamiInfo.currentOccurrences}x in NBA history)
                    </span>
                  </span>
                </div>
              )}
            </div>

            {/* Tactical Basketball Court & Momentum Radar */}
            <div className="rounded-xl border border-white/[0.12] bg-[#080d1a] p-3.5 shadow-md">
              <CourtDiagram
                situation={situation}
                competitors={competitors}
                shots={competition.shots}
                gameState={state}
                gameStatusDetail={status?.type?.detail}
                isHero={true}
                status={status}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}, areHeroPropsEqual)
