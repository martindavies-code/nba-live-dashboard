import React, { memo } from 'react'
import type { NBAEvent } from '../types/nba'
import { WinProbabilityBar } from './WinProbabilityBar'
import { getScorigamiInfo } from '../utils/scorigami'
import {
  safeParseInt,
  isClutchGame,
  calculateSecondsRemaining,
  calculateWinProbability,
  sanitizeImageUrl,
} from '../utils/nbaHelpers'
import { formatCrewShortLabel } from '../utils/announcers'
import { Tv, Sparkles, Maximize2, ShieldAlert } from 'lucide-react'

interface GameCardProps {
  event: NBAEvent
  isSpotlighted?: boolean
  onSpotlight?: () => void
}

export const GameCard: React.FC<GameCardProps> = memo(({
  event,
  isSpotlighted = false,
  onSpotlight,
}) => {
  const competition = event.competitions[0]
  if (!competition) return null

  const { status } = event
  const state = status.type?.state || 'in'
  const isLive = state === 'in'
  const situation = competition.situation

  const competitors = competition.competitors || []
  const homeComp = competitors.find((c) => c.homeAway === 'home')
  const awayComp = competitors.find((c) => c.homeAway === 'away')

  const crew = competition.announcingCrew
  const isClutch = isClutchGame(status, competitors)

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

  const spread = competition.odds?.[0]?.spread ?? 0
  const winProb = calculateWinProbability(homeScore, awayScore, secondsRemaining, state, spread)

  return (
    <article
      onClick={onSpotlight}
      className={`group relative flex flex-col rounded-xl border transition-all duration-300 cursor-pointer overflow-hidden ${
        isSpotlighted
          ? 'border-sky-500/70 bg-gradient-to-b from-[#0b162c] to-[#080d1a] shadow-xl shadow-sky-950/40 ring-1 ring-sky-500/40'
          : 'border-white/[0.08] bg-[#070b14] hover:border-white/[0.2] hover:bg-[#090f1d] shadow-md'
      }`}
    >
      {/* Card Header Strip */}
      <div className="flex items-center justify-between border-b border-white/[0.06] bg-black/30 px-3.5 py-2 text-xs">
        <div className="flex items-center gap-2">
          {isLive ? (
            <span className="flex items-center gap-1.5 font-mono font-bold text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Q{status.period} {status.displayClock}
            </span>
          ) : (
            <span className="font-mono text-slate-400 font-semibold text-[11px]">
              {status.type?.detail || 'Scheduled'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Clutch Alert */}
          {isClutch && (
            <span className="inline-flex items-center gap-0.5 rounded bg-rose-600/30 border border-rose-500/50 px-1.5 py-0.5 text-[10px] font-black text-rose-300 animate-pulse">
              <ShieldAlert className="h-3 w-3 text-rose-400" />
              CLUTCH
            </span>
          )}

          {/* Broadcast Network */}
          {crew?.network && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400">
              <Tv className="h-3 w-3 text-slate-500" />
              {crew.network}
            </span>
          )}

          {/* Spotlight Icon */}
          {onSpotlight && !isSpotlighted && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onSpotlight()
              }}
              className="flex items-center gap-1 rounded bg-slate-800/80 hover:bg-sky-600 hover:text-white px-2 py-0.5 text-[10px] font-semibold text-slate-300 transition-colors"
              title="Pin matchup to Spotlight Hero"
            >
              <Maximize2 className="h-3 w-3" />
              <span className="hidden sm:inline">Spotlight</span>
            </button>
          )}
        </div>
      </div>

      {/* Teams & Scores */}
      <div className="p-3.5 space-y-2.5">
        {/* Away Team */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src={sanitizeImageUrl(awayComp?.team?.logo)}
              alt={awayComp?.team?.displayName || 'Away'}
              className="h-7 w-7 object-contain"
              loading="lazy"
            />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm text-white">
                  {awayComp?.team?.displayName || awayComp?.team?.name}
                </span>
                <span className="font-mono text-xs text-slate-400">
                  {awayComp?.team?.abbreviation}
                </span>
              </div>
              <span className="text-[11px] text-slate-400">{awayComp?.records?.[0]?.summary || '0-0'}</span>
            </div>
          </div>
          <span className="font-['Oswald'] text-2xl sm:text-3xl font-bold tracking-tight text-white tabular-nums">
            {awayComp?.score ?? '-'}
          </span>
        </div>

        {/* Home Team */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src={sanitizeImageUrl(homeComp?.team?.logo)}
              alt={homeComp?.team?.displayName || 'Home'}
              className="h-7 w-7 object-contain"
              loading="lazy"
            />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm text-white">
                  {homeComp?.team?.displayName || homeComp?.team?.name}
                </span>
                <span className="font-mono text-xs text-slate-400">
                  {homeComp?.team?.abbreviation}
                </span>
              </div>
              <span className="text-[11px] text-slate-400">{homeComp?.records?.[0]?.summary || '0-0'}</span>
            </div>
          </div>
          <span className="font-['Oswald'] text-2xl sm:text-3xl font-bold tracking-tight text-white tabular-nums">
            {homeComp?.score ?? '-'}
          </span>
        </div>
      </div>

      {/* Footer Strip: Win Probability & Announcing Crew Pill */}
      <div className="px-3.5 pb-3 pt-1 space-y-2 border-t border-white/[0.04]">
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

        {/* Scorigami Chance & Announcers Info */}
        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400 pt-1">
          <span
            className="flex items-center gap-1 font-mono truncate min-w-0 max-w-[55%]"
            title={scorigamiInfo.chanceLabel}
          >
            <Sparkles className={`h-3 w-3 shrink-0 ${scorigamiInfo.isCurrentScorigami ? 'text-violet-400' : 'text-slate-500'}`} />
            <strong className={`truncate ${scorigamiInfo.isCurrentScorigami ? 'text-violet-300' : 'text-slate-400'}`}>
              {scorigamiInfo.isCurrentScorigami
                ? 'Scorigami! ✨'
                : state === 'post'
                ? `No Scorigami (${scorigamiInfo.currentOccurrences}x)`
                : scorigamiInfo.chanceLabel}
            </strong>
          </span>

          {crew?.playByPlay && (
            <span
              className="truncate text-slate-400 text-right min-w-0 max-w-[45%]"
              title={`${crew.playByPlay} & ${crew.colorAnalyst}`}
            >
              🎙️ {formatCrewShortLabel(crew.playByPlay, crew.colorAnalyst)}
            </span>
          )}
        </div>
      </div>
    </article>
  )
})
