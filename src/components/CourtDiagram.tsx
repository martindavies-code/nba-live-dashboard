import React, { useState, useId, memo, useMemo } from 'react'
import type { NBACompetitor, NBAShot, NBASituation, NBAStatus } from '../types/nba'
import { sanitizeHexColor } from '../utils/nbaHelpers'
import { formatGameKickoff, type TimeZoneMode } from '../utils/timezone.ts'
import { Flame, Clock, Crosshair, BarChart2, ShieldAlert } from 'lucide-react'

interface CourtDiagramProps {
  situation?: NBASituation | null
  competitors: NBACompetitor[]
  shots?: NBAShot[]
  gameState?: 'pre' | 'in' | 'post'
  gameStatusDetail?: string
  isHero?: boolean
  status?: NBAStatus
  timeZoneMode?: TimeZoneMode
  eventDate?: string
}

export const CourtDiagram: React.FC<CourtDiagramProps> = memo(({
  situation,
  competitors,
  shots = [],
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
  const [viewMode, setViewMode] = useState<'shots' | 'zones'>('shots')

  const homeComp = competitors.find((c) => c.homeAway === 'home')
  const awayComp = competitors.find((c) => c.homeAway === 'away')

  const homeColor = sanitizeHexColor(homeComp?.team?.color, '#1d428a')
  const awayColor = sanitizeHexColor(awayComp?.team?.color, '#ce1141')
  // Strict alphanumeric sanitisation for SVG text nodes
  const homeAbbr = (homeComp?.team?.abbreviation || 'HOME').replace(/[^A-Za-z0-9]/g, '').slice(0, 6) || 'HOME'
  const awayAbbr = (awayComp?.team?.abbreviation || 'AWAY').replace(/[^A-Za-z0-9]/g, '').slice(0, 6) || 'AWAY'

  // Memoized filtered shots to prevent unnecessary recalculation
  const filteredShots = useMemo(() => {
    return shots.filter((s) => {
      if (shotFilter === 'makes') return s.made
      if (shotFilter === 'misses') return !s.made
      if (shotFilter === 'home') return s.teamAbbr === homeAbbr
      if (shotFilter === 'away') return s.teamAbbr === awayAbbr
      return true
    })
  }, [shots, shotFilter, homeAbbr, awayAbbr])

  // Single-pass shooting summary calculation (avoids 4 intermediate filter passes)
  const { totalShots, madeShots, fgPct, threePointersMade, threePointersTotal } = useMemo(() => {
    let made = 0
    let tpMade = 0
    let tpTotal = 0
    const total = shots.length
    for (let i = 0; i < total; i++) {
      const s = shots[i]
      if (s.made) made++
      if (s.points === 3) {
        tpTotal++
        if (s.made) tpMade++
      }
    }
    const pct = total > 0 ? Math.round((made / total) * 100) : 0
    return {
      totalShots: total,
      madeShots: made,
      fgPct: pct,
      threePointersMade: tpMade,
      threePointersTotal: tpTotal,
    }
  }, [shots])

  // Shot clock & fouls
  const shotClock = situation?.shotClock ?? 24
  const homeFouls = situation?.homeFouls ?? homeComp?.fouls ?? 0
  const awayFouls = situation?.awayFouls ?? awayComp?.fouls ?? 0
  const isClutch = situation?.isClutch || false
  const scoringRun = situation?.scoringRun
  const currentPeriodDetail = status?.type?.detail || gameStatusDetail

  return (
    <div className={`flex flex-col space-y-3.5 w-full ${isHero ? 'hero-court-diagram' : ''}`}>
      {/* Top Hoops Momentum Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-white/[0.15] bg-[#0c1424] p-2.5 sm:p-3 shadow-md backdrop-blur-md">
        {/* Left: Possession & Scoring Run */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className="inline-block h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full animate-pulse shrink-0"
              style={{
                backgroundColor:
                  situation?.possession === homeComp?.team?.id
                    ? homeColor
                    : situation?.possession === awayComp?.team?.id
                    ? awayColor
                    : '#f97316',
              }}
            />
            <span className="font-mono text-xs sm:text-sm font-bold text-white tracking-wide">
              {situation?.possessionText ||
                (gameState === 'in'
                  ? 'Live Play'
                  : gameState === 'post'
                  ? 'Final Shot Chart'
                  : eventDate
                  ? `Tip-Off: ${formatGameKickoff(eventDate, timeZoneMode)}`
                  : currentPeriodDetail)}
            </span>
          </div>

          {scoringRun && (
            <span className="inline-flex items-center gap-1 rounded bg-orange-600/35 border border-orange-500/60 px-2 py-0.5 text-xs font-bold text-orange-100 animate-pulse">
              <Flame className="h-3 w-3 text-orange-400 fill-orange-400 shrink-0" />
              <span>
                {scoringRun.teamAbbr} {scoringRun.points}-{scoringRun.opponentPoints} Run
                {scoringRun.durationText ? ` (${scoringRun.durationText})` : ''}
              </span>
            </span>
          )}

          {isClutch && (
            <span className="inline-flex items-center gap-1 rounded bg-rose-600/40 border border-rose-500/60 px-2 py-0.5 text-xs font-extrabold text-rose-100 animate-pulse">
              <ShieldAlert className="h-3 w-3 text-rose-300 shrink-0" />
              <span>CLUTCH (≤5 PTS)</span>
            </span>
          )}
        </div>

        {/* Right: Shot Clock & Bonus Indicators */}
        <div className="flex items-center gap-2 sm:gap-3 font-mono text-xs sm:text-sm shrink-0">
          {/* Shot Clock */}
          {gameState === 'in' && (
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
          )}

          {/* Team Fouls & Bonus */}
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
        </div>
      </div>

      {/* Interactive Court SVG Visualizer */}
      <div className="relative rounded-xl border border-white/[0.15] bg-[#080d1a] p-3 sm:p-4 overflow-hidden shadow-xl">
        {/* Court Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          {/* View Mode Toggle: Shots vs Zones */}
          <div className="flex items-center rounded-lg bg-black/60 border border-white/[0.12] p-0.5 text-xs">
            <button
              onClick={() => setViewMode('shots')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded font-semibold transition-colors ${
                viewMode === 'shots'
                  ? 'bg-sky-500/30 text-sky-100 border border-sky-400/50'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Crosshair className="h-3 w-3" />
              Live Shot Chart
            </button>
            <button
              onClick={() => setViewMode('zones')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded font-semibold transition-colors ${
                viewMode === 'zones'
                  ? 'bg-sky-500/25 text-sky-200 border border-sky-400/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <BarChart2 className="h-3 w-3" />
              Shooting Zones
            </button>
          </div>

          {/* Shot Filters (Only in Shots Mode) */}
          {viewMode === 'shots' && (
            <div className="flex items-center gap-1 text-[11px]">
              {(['all', 'makes', 'misses', 'home', 'away'] as const).map((filterKey) => (
                <button
                  key={filterKey}
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

          {/* Quick Stats Pill */}
          <div className="flex items-center gap-2 font-mono text-[11px] text-slate-300">
            <span>FG: <strong className="text-emerald-400">{fgPct}%</strong> ({madeShots}/{totalShots})</span>
            <span className="text-slate-600">|</span>
            <span>3PT: <strong className="text-sky-400">{threePointersMade}/{threePointersTotal}</strong></span>
          </div>
        </div>

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
              <path d="M 1,25 L 49,25 M 25,1 L 25,49 M 7,7 C 18,18 32,32 43,43 M 7,43 C 18,32 32,18 43,7" stroke="#ffffff" strokeWidth="1.8" fill="none" />
            </g>

            {/* ---------------- LEFT BASKET (AWAY DEFENSE / HOME ATTACK) ---------------- */}
            {/* Painted Key / Lane (19ft x 16ft = 190 x 160 units) */}
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

            {/* Free Throw Circle */}
            <path
              d="M 210,170 A 60,60 0 0,1 210,330"
              fill="none"
              stroke="#ffffff"
              strokeWidth="3"
            />
            <path
              d="M 210,330 A 60,60 0 0,1 210,170"
              fill="none"
              stroke="#ffffff"
              strokeWidth="3"
              strokeDasharray="8 8"
            />

            {/* 3-Point Arc Left (Radius 237.5 units = 23'9", Corner lines 22ft) */}
            <path
              d="M 20,50 L 140,50 A 237.5,237.5 0 0,1 140,450 L 20,450"
              fill="none"
              stroke="#ffffff"
              strokeWidth="3.5"
              strokeOpacity="0.9"
            />

            {/* Restricted Area Arc Left (4ft radius = 40 units) */}
            <path
              d="M 60,210 A 40,40 0 0,1 60,290"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2.5"
            />

            {/* Backboard & Rim Left */}
            <line x1="60" y1="220" x2="60" y2="280" stroke="#ffffff" strokeWidth="5" />
            <circle cx="75" cy="250" r="9" fill="none" stroke="#f97316" strokeWidth="3" filter={`url(#glow-${uniqueId})`} />
            <circle cx="75" cy="250" r="3" fill="#ffffff" />

            {/* Baseline Team Wordmark Left */}
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

            {/* ---------------- RIGHT BASKET (HOME DEFENSE / AWAY ATTACK) ---------------- */}
            {/* Painted Key / Lane Right */}
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

            {/* Free Throw Circle Right */}
            <path
              d="M 730,170 A 60,60 0 0,0 730,330"
              fill="none"
              stroke="#ffffff"
              strokeWidth="3"
            />
            <path
              d="M 730,330 A 60,60 0 0,0 730,170"
              fill="none"
              stroke="#ffffff"
              strokeWidth="3"
              strokeDasharray="8 8"
            />

            {/* 3-Point Arc Right */}
            <path
              d="M 920,50 L 800,50 A 237.5,237.5 0 0,0 800,450 L 920,450"
              fill="none"
              stroke="#ffffff"
              strokeWidth="3.5"
              strokeOpacity="0.9"
            />

            {/* Restricted Area Arc Right */}
            <path
              d="M 880,210 A 40,40 0 0,0 880,290"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2.5"
            />

            {/* Backboard & Rim Right */}
            <line x1="880" y1="220" x2="880" y2="280" stroke="#ffffff" strokeWidth="5" />
            <circle cx="865" cy="250" r="9" fill="none" stroke="#f97316" strokeWidth="3" filter={`url(#glow-${uniqueId})`} />
            <circle cx="865" cy="250" r="3" fill="#ffffff" />

            {/* Baseline Team Wordmark Right */}
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

            {/* ---------------- ZONE HEATMAP OVERLAY (IF VIEWMODE === 'ZONES') ---------------- */}
            {viewMode === 'zones' && (
              <g opacity="0.85">
                {/* Paint Zone */}
                <rect x="730" y="170" width="190" height="160" fill="#10b981" fillOpacity="0.25" stroke="#10b981" strokeWidth="1" strokeDasharray="4 4" />
                <text x="825" y="255" fill="#ffffff" fontSize="13" fontWeight="bold" fontFamily="JetBrains Mono" textAnchor="middle">
                  PAINT: 64.2% FG
                </text>

                {/* Left Corner 3 */}
                <rect x="800" y="20" width="120" height="40" fill="#3b82f6" fillOpacity="0.25" stroke="#3b82f6" strokeWidth="1" strokeDasharray="4 4" />
                <text x="860" y="45" fill="#ffffff" fontSize="11" fontWeight="bold" fontFamily="JetBrains Mono" textAnchor="middle">
                  CORNER: 41.7%
                </text>

                {/* Right Corner 3 */}
                <rect x="800" y="440" width="120" height="40" fill="#3b82f6" fillOpacity="0.25" stroke="#3b82f6" strokeWidth="1" strokeDasharray="4 4" />
                <text x="860" y="465" fill="#ffffff" fontSize="11" fontWeight="bold" fontFamily="JetBrains Mono" textAnchor="middle">
                  CORNER: 38.5%
                </text>

                {/* Above Break 3 */}
                <text x="690" y="110" fill="#ffffff" fontSize="12" fontWeight="bold" fontFamily="JetBrains Mono" textAnchor="middle">
                  ABOVE BREAK: 37.1%
                </text>
                <text x="690" y="390" fill="#ffffff" fontSize="12" fontWeight="bold" fontFamily="JetBrains Mono" textAnchor="middle">
                  ABOVE BREAK: 36.4%
                </text>

                {/* Mid-Range */}
                <text x="760" y="130" fill="#ffffff" fontSize="11" fontWeight="bold" fontFamily="JetBrains Mono" textAnchor="middle">
                  MID: 43.8%
                </text>
                <text x="760" y="370" fill="#ffffff" fontSize="11" fontWeight="bold" fontFamily="JetBrains Mono" textAnchor="middle">
                  MID: 40.5%
                </text>
              </g>
            )}

            {/* ---------------- LIVE SHOT PLOTS (IF VIEWMODE === 'SHOTS') ---------------- */}
            {viewMode === 'shots' &&
              filteredShots.map((shot) => {
                // Scale coordinate to SVG viewBox (0..94 -> 0..940, 0..50 -> 0..500)
                const cx = Math.max(0, Math.min(940, (Number.isFinite(shot.x) ? shot.x : 47) * 10))
                const cy = Math.max(0, Math.min(500, (Number.isFinite(shot.y) ? shot.y : 25) * 10))
                const isSelected = selectedShot?.id === shot.id

                return (
                  <g
                    key={shot.id}
                    className="cursor-pointer transition-transform hover:scale-125"
                    onClick={() => setSelectedShot(shot)}
                  >
                    {/* Pulsing ring if selected */}
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
                      // Made Shot: Glowing Green Marker with 3PT badge
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
                      // Missed Shot: Crisp Red 'X'
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

        {/* Selected Shot Detail Card Overlay */}
        {selectedShot && (
          <div className="mt-3 flex items-center justify-between rounded-xl border border-sky-500/40 bg-[#070d18] p-3 text-xs shadow-lg animate-in fade-in">
            <div className="flex items-center gap-3">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full font-black text-xs ${
                  selectedShot.made ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
                }`}
              >
                {selectedShot.made ? (selectedShot.points === 3 ? '3PT' : '2PT') : 'MISS'}
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-sm">{selectedShot.shooter}</span>
                  <span className="font-mono text-[11px] font-semibold text-sky-400">({selectedShot.teamAbbr})</span>
                  <span className="font-mono text-[11px] text-slate-400">Q{selectedShot.period} {selectedShot.clock}</span>
                </div>
                <p className="text-slate-300 text-xs mt-0.5">{selectedShot.description}</p>
              </div>
            </div>
            <button
              onClick={() => setSelectedShot(null)}
              className="text-slate-400 hover:text-white px-2 py-1 text-xs rounded bg-white/[0.06]"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
})
