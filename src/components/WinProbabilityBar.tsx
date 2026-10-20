import React, { memo } from 'react'
import type { NBACompetitor, NBAStatus, NBAOdds, NBASituation } from '../types/nba'
import { sanitizeHexColor, safeParseInt } from '../utils/nbaHelpers'

interface WinProbabilityBarProps {
  homeWinPercentage?: number
  awayWinPercentage?: number
  homeCompetitor?: NBACompetitor
  awayCompetitor?: NBACompetitor
  gameState?: 'pre' | 'in' | 'post' | string
  status?: NBAStatus
  situation?: NBASituation | null
  odds?: NBAOdds[]
}

export const WinProbabilityBar: React.FC<WinProbabilityBarProps> = memo(({
  homeWinPercentage,
  awayWinPercentage,
  homeCompetitor,
  awayCompetitor,
  gameState = 'in',
  odds,
}) => {
  const homeColor = sanitizeHexColor(homeCompetitor?.team?.color, '#1d428a')
  const awayColor = sanitizeHexColor(awayCompetitor?.team?.color, '#ce1141')

  const homeAbbr = homeCompetitor?.team?.abbreviation || 'HOME'
  const awayAbbr = awayCompetitor?.team?.abbreviation || 'AWAY'

  let calculatedHomePct = 50
  let calculatedAwayPct = 50

  if (gameState === 'post') {
    const homeScore = safeParseInt(homeCompetitor?.score, 0)
    const awayScore = safeParseInt(awayCompetitor?.score, 0)
    if (homeScore > awayScore) {
      calculatedHomePct = 100
      calculatedAwayPct = 0
    } else if (awayScore > homeScore) {
      calculatedHomePct = 0
      calculatedAwayPct = 100
    }
  } else if (typeof homeWinPercentage === 'number' && Number.isFinite(homeWinPercentage)) {
    calculatedHomePct = Math.max(1, Math.min(99, Math.round(homeWinPercentage * 100)))
    calculatedAwayPct = 100 - calculatedHomePct
  } else if (typeof awayWinPercentage === 'number' && Number.isFinite(awayWinPercentage)) {
    calculatedAwayPct = Math.max(1, Math.min(99, Math.round(awayWinPercentage * 100)))
    calculatedHomePct = 100 - calculatedAwayPct
  }

  const oddsText = odds?.[0]?.details ? `Line: ${odds[0].details}` : null
  const overUnderText = odds?.[0]?.overUnder ? `O/U ${odds[0].overUnder}` : null

  return (
    <div className="w-full space-y-1.5">
      <div className="flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-1.5 font-bold">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: awayColor }} />
          <span className="text-slate-300">{awayAbbr}</span>
          <span className="text-white tabular-nums font-black">{calculatedAwayPct}%</span>
        </div>

        {(oddsText || overUnderText) && (
          <span className="text-[10px] text-slate-400 font-sans">
            {oddsText} {overUnderText && `• ${overUnderText}`}
          </span>
        )}

        <div className="flex items-center gap-1.5 font-bold">
          <span className="text-white tabular-nums font-black">{calculatedHomePct}%</span>
          <span className="text-slate-300">{homeAbbr}</span>
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: homeColor }} />
        </div>
      </div>

      {/* Split Bar */}
      <div className="relative flex h-2.5 w-full overflow-hidden rounded-full bg-slate-900 border border-white/[0.08]">
        <div
          className="h-full transition-all duration-700 ease-out"
          style={{ width: `${calculatedAwayPct}%`, backgroundColor: awayColor }}
        />
        <div
          className="h-full transition-all duration-700 ease-out"
          style={{ width: `${calculatedHomePct}%`, backgroundColor: homeColor }}
        />
      </div>
    </div>
  )
})
