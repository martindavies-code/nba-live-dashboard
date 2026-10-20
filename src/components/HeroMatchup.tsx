import React, { useState, memo } from 'react'
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

  const scorigamiInfo = getScorigamiInfo(
    homeScore,
    awayScore,
    secondsRemaining,
    state,
    homeAbbr,
    awayAbbr
  )

  const homeSpread = resolveHomeSpread(competition.odds, homeAbbr, awayAbbr)
  const winProb = calculateWinProbability(
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
    <section className="relative overflow-hidden rounded-2xl border border-white/[0.12] bg-gradient-to-b from-[#0b1222] via-[#090e1a] to-[#060a12] shadow-2xl backdrop-blur-xl">
      {/* Top Spotlight Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-white/[0.08] bg-black/40 px-4 sm:px-5 py-2.5 sm:py-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex h-2.5 w-2.5 rounded-full bg-orange-500 animate-ping" />
          <span className="font-extrabold uppercase tracking-widest text-orange-400 text-[10px] sm:text-[11px]">
            Spotlight Matchup
          </span>
          <span className="text-slate-600 hidden sm:inline">|</span>
          <span className="font-mono text-slate-300 font-bold text-[11px] sm:text-xs">
            {isLive ? `Quarter ${status.period} • ${status.displayClock}` : status.type?.detail || 'Match Details'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Announcing Crew Network Badge */}
          {crew?.network && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/15 border border-sky-400/30 px-2.5 py-0.5 sm:px-3 sm:py-1 font-semibold text-sky-200 text-[10px] sm:text-xs">
              <Tv className="h-3 w-3 text-sky-400" />
              {crew.network}
            </span>
          )}

          {/* Clutch Alert Badge */}
          {isClutch && (
            <span className="inline-flex items-center gap-1 rounded bg-rose-600/30 border border-rose-500/50 px-2 py-0.5 text-[10px] sm:text-xs font-black text-rose-300 animate-pulse">
              <ShieldAlert className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-rose-400" />
              CLUTCH GAME
            </span>
          )}

          {/* Copy Snapshot Button */}
          <button
            onClick={handleCopySnapshot}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.06] hover:bg-white/[0.12] px-2 py-0.5 sm:px-2.5 sm:py-1 text-slate-300 hover:text-white transition-colors text-[11px] sm:text-xs"
            title="Copy matchup snapshot to clipboard"
          >
            {isCopied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Share2 className="h-3.5 w-3.5" />}
            <span>{isCopied ? 'Copied' : 'Share'}</span>
          </button>
        </div>
      </div>

      {/* Hero Content Grid: Left Column (Teams, Announcers, Scorigami) | Right Column (Court Shot Chart) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-4 sm:p-6">
        {/* Left Column: Teams Scoreboard, Announcers, Scorigami */}
        <div className="lg:col-span-5 flex flex-col justify-between space-y-5">
          {/* Venue & Clock Strip */}
          <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] pb-2 text-xs text-slate-400">
            <span className="flex items-center gap-1.5 shrink-0">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              {isLive ? 'Live On Air' : status.type?.detail}
            </span>
            {venueText && (
              <span className="flex items-center gap-1 truncate max-w-[200px] sm:max-w-[240px]" title={venueText}>
                <MapPin className="h-3 w-3 text-slate-500 shrink-0" />
                <span className="truncate">{venueText}</span>
              </span>
            )}
          </div>

          {/* Teams Display */}
          <div className="space-y-4">
            {/* Away Team */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={sanitizeImageUrl(awayComp?.team?.logo)}
                  alt={awayComp?.team?.displayName || 'Away'}
                  className="h-10 w-10 sm:h-12 sm:w-12 object-contain drop-shadow-md shrink-0"
                  loading="lazy"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                    <span className="font-extrabold text-base sm:text-lg text-white truncate">
                      {awayComp?.team?.displayName || awayComp?.team?.name}
                    </span>
                    <span className="font-mono text-xs font-semibold text-slate-400 shrink-0">
                      {awayComp?.team?.abbreviation}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>{awayComp?.records?.[0]?.summary || '0-0'}</span>
                    {situation?.possession === awayComp?.team?.id && (
                      <span className="rounded bg-orange-500/20 text-orange-300 font-bold text-[10px] px-1.5 py-0.2 shrink-0">
                        POSSESSION
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <span className="font-['Oswald'] text-3xl sm:text-5xl font-bold tracking-tight text-white tabular-nums shrink-0">
                {awayComp?.score ?? '-'}
              </span>
            </div>

            {/* Home Team */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={sanitizeImageUrl(homeComp?.team?.logo)}
                  alt={homeComp?.team?.displayName || 'Home'}
                  className="h-10 w-10 sm:h-12 sm:w-12 object-contain drop-shadow-md shrink-0"
                  loading="lazy"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                    <span className="font-extrabold text-base sm:text-lg text-white truncate">
                      {homeComp?.team?.displayName || homeComp?.team?.name}
                    </span>
                    <span className="font-mono text-xs font-semibold text-slate-400 shrink-0">
                      {homeComp?.team?.abbreviation}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>{homeComp?.records?.[0]?.summary || '0-0'}</span>
                    {situation?.possession === homeComp?.team?.id && (
                      <span className="rounded bg-orange-500/20 text-orange-300 font-bold text-[10px] px-1.5 py-0.2 shrink-0">
                        POSSESSION
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <span className="font-['Oswald'] text-3xl sm:text-5xl font-bold tracking-tight text-white tabular-nums shrink-0">
                {homeComp?.score ?? '-'}
              </span>
            </div>
          </div>

          {/* Quarter-by-Quarter Linescore Table */}
          {((homeComp?.linescores && homeComp.linescores.length > 0) ||
            (awayComp?.linescores && awayComp.linescores.length > 0)) && (
            <div className="rounded-xl border border-white/[0.06] bg-[#070c16] p-2.5 overflow-x-auto">
              <table className="w-full text-center text-xs font-mono">
                <thead>
                  <tr className="text-slate-400 text-[10px] border-b border-white/[0.06]">
                    <th className="text-left py-1 px-2 font-normal">Team</th>
                    <th className="py-1 px-2">Q1</th>
                    <th className="py-1 px-2">Q2</th>
                    <th className="py-1 px-2">Q3</th>
                    <th className="py-1 px-2">Q4</th>
                    {(homeComp?.linescores?.length ?? 0) > 4 && <th className="py-1 px-2">OT</th>}
                    <th className="py-1 px-2 font-bold text-white">T</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  <tr>
                    <td className="text-left py-1 px-2 font-bold text-slate-300">{awayAbbr}</td>
                    <td className="py-1 px-2 text-slate-400">{awayComp?.linescores?.[0]?.value ?? '-'}</td>
                    <td className="py-1 px-2 text-slate-400">{awayComp?.linescores?.[1]?.value ?? '-'}</td>
                    <td className="py-1 px-2 text-slate-400">{awayComp?.linescores?.[2]?.value ?? '-'}</td>
                    <td className="py-1 px-2 text-slate-400">{awayComp?.linescores?.[3]?.value ?? '-'}</td>
                    {(homeComp?.linescores?.length ?? 0) > 4 && (
                      <td className="py-1 px-2 text-slate-400">{awayComp?.linescores?.[4]?.value ?? '-'}</td>
                    )}
                    <td className="py-1 px-2 font-black text-white">{awayComp?.score ?? '-'}</td>
                  </tr>
                  <tr>
                    <td className="text-left py-1 px-2 font-bold text-slate-300">{homeAbbr}</td>
                    <td className="py-1 px-2 text-slate-400">{homeComp?.linescores?.[0]?.value ?? '-'}</td>
                    <td className="py-1 px-2 text-slate-400">{homeComp?.linescores?.[1]?.value ?? '-'}</td>
                    <td className="py-1 px-2 text-slate-400">{homeComp?.linescores?.[2]?.value ?? '-'}</td>
                    <td className="py-1 px-2 text-slate-400">{homeComp?.linescores?.[3]?.value ?? '-'}</td>
                    {(homeComp?.linescores?.length ?? 0) > 4 && (
                      <td className="py-1 px-2 text-slate-400">{homeComp?.linescores?.[4]?.value ?? '-'}</td>
                    )}
                    <td className="py-1 px-2 font-black text-white">{homeComp?.score ?? '-'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Win Probability Bar */}
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

          {/* Prominent Announcing Crew Showcase */}
          {crew && (
            <div className="rounded-xl border border-white/[0.08] bg-[#070d18] p-3 text-xs space-y-2">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-1.5">
                <span className="flex items-center gap-1.5 font-bold tracking-wider uppercase text-[10px] text-sky-400">
                  <Mic className="h-3 w-3" />
                  Announcing Crew & Broadcast
                </span>
                <span className="font-mono text-[11px] text-slate-300 font-semibold bg-white/[0.06] px-2 py-0.5 rounded">
                  {crew.network}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-300 pt-0.5">
                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-500 block">Commentators</span>
                  <strong className="text-white font-medium">{crew.playByPlay}</strong>
                  <span className="text-slate-400 block text-[11px]">{crew.colorAnalyst}</span>
                </div>
                {crew.sidelineReporter && (
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-slate-500 block">Sideline Reporter</span>
                    <strong className="text-slate-200 font-medium">{crew.sidelineReporter}</strong>
                  </div>
                )}
              </div>

              {/* Radio Broadcast */}
              {crew.radioNetwork && (
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 border-t border-white/[0.04] pt-1.5">
                  <Radio className="h-3 w-3 text-amber-400 shrink-0" />
                  <span className="truncate">{crew.radioNetwork}</span>
                </div>
              )}

              {/* Referees / Officials */}
              {crew.officials && crew.officials.length > 0 && (
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 border-t border-white/[0.04] pt-1.5">
                  <Users className="h-3 w-3 text-emerald-400 shrink-0" />
                  <span>
                    <strong className="text-slate-300">Officials: </strong>
                    {crew.officials.map((o) => `${o.name} (${o.role})`).join(', ')}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* NBA Scorigami Showcase Section */}
          <div
            className={`rounded-xl border p-3.5 text-xs transition-colors ${
              scorigamiInfo.isCurrentScorigami
                ? 'border-violet-500/50 bg-gradient-to-r from-violet-950/70 to-purple-950/60 text-violet-200 shadow-md shadow-violet-950/50'
                : 'border-white/[0.08] bg-[#070c16] text-slate-300'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-2 mb-2">
              <span className="flex items-center gap-1.5 font-bold tracking-wider uppercase text-[11px] text-slate-400">
                <Sparkles
                  className={`h-3.5 w-3.5 ${
                    scorigamiInfo.isCurrentScorigami ? 'text-violet-400 animate-pulse' : 'text-slate-500'
                  }`}
                />
                {scorigamiInfo.isCurrentScorigami ? '✨ Live NBA Scorigami in Progress' : isFinal ? 'NBA Scorigami Status' : 'NBA Scorigami Probability'}
              </span>
              <span
                className={`font-mono font-bold text-xs tabular-nums px-2 py-0.5 rounded ${
                  scorigamiInfo.isCurrentScorigami
                    ? 'bg-violet-500/20 text-violet-200 border border-violet-500/40'
                    : 'bg-white/[0.06] text-slate-200 border border-white/[0.08]'
                }`}
              >
                {scorigamiInfo.chanceLabel}
              </span>
            </div>

            {scorigamiInfo.mostLikelyNovel && (
              <div className="flex items-center justify-between py-1">
                <span className="text-slate-400 text-xs">Most Likely Novel Score:</span>
                <span className="font-mono text-sm font-bold text-violet-300 bg-violet-950/80 px-2 py-0.5 rounded border border-violet-700/50">
                  {scorigamiInfo.mostLikelyLabel}
                </span>
              </div>
            )}

            <div className="mt-1.5 text-xs leading-relaxed text-slate-400">
              <span className="font-semibold text-slate-200">When: </span>
              {scorigamiInfo.whenScenario}
            </div>

            {scorigamiInfo.lastGameSummary && (
              <div className="mt-2 flex items-start gap-1.5 text-xs text-slate-400 border-t border-white/[0.06] pt-2">
                <span className="font-semibold text-slate-200 shrink-0">Last Occurred:</span>
                <span className="text-slate-300">
                  <strong className="text-amber-300/90 font-medium">{scorigamiInfo.lastGameSummary}</strong>
                  <span className="text-slate-400 ml-1.5 font-mono text-[11px]">
                    ({scorigamiInfo.currentOccurrences}x in NBA history)
                  </span>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Dynamic Tactical Basketball Court Shot Radar */}
        <div className="lg:col-span-7 flex flex-col justify-center">
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
    </section>
  )
})
