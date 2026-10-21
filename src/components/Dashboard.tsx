import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react'
import type { GameFilter, NBAScoreboardData } from '../types/nba'
import { DateSelector } from './DateSelector'
import { HeroMatchup } from './HeroMatchup'
import { GameCard } from './GameCard'
import { fetchNBAScoreboard } from '../services/espnApi'
import { isClutchGame, safeStorage } from '../utils/nbaHelpers'
import {
  getSavedTimeZone,
  setSavedTimeZone,
  getTimeZoneAbbr,
  getNBASlateDate,
  TIMEZONE_OPTIONS,
  type TimeZoneMode,
} from '../utils/timezone.ts'
import {
  playWhistleSound,
  playTactileClick,
} from '../utils/audioFeedback'
const KeyboardShortcutsModal = React.lazy(() =>
  import('./KeyboardShortcutsModal').then((m) => ({ default: m.KeyboardShortcutsModal }))
)
import {
  RefreshCw,
  Search,
  WifiOff,
  Volume2,
  VolumeX,
  Keyboard,
  AlertCircle,
} from 'lucide-react'

/**
 * Isolated Auto-Refresh Ticker component.
 * Manages its own 1-second interval to avoid re-rendering the whole dashboard every second.
 */
interface AutoRefreshTickerProps {
  isPaused: boolean
  isRefreshing: boolean
  onRefreshTrigger: () => void
}

const AutoRefreshTicker: React.FC<AutoRefreshTickerProps> = memo(({
  isPaused,
  isRefreshing,
  onRefreshTrigger,
}) => {
  const [secondsLeft, setSecondsLeft] = useState<number>(10)
  const [prevIsRefreshing, setPrevIsRefreshing] = useState<boolean>(isRefreshing)
  const triggerRef = useRef(onRefreshTrigger)

  if (isRefreshing !== prevIsRefreshing) {
    setPrevIsRefreshing(isRefreshing)
    if (isRefreshing) {
      setSecondsLeft(10)
    }
  }

  useEffect(() => {
    triggerRef.current = onRefreshTrigger
  }, [onRefreshTrigger])

  useEffect(() => {
    if (isPaused) return

    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          triggerRef.current()
          return 10
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [isPaused])

  return (
    <div
      className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-black/40 px-2.5 py-1 text-xs font-mono text-slate-300"
      title="Next auto-refresh in seconds"
    >
      <RefreshCw className={`h-3 w-3 text-orange-400 ${isRefreshing ? 'animate-spin' : ''}`} />
      <span className="tabular-nums font-bold">{secondsLeft}s</span>
    </div>
  )
})

/**
 * Fast structural equality comparison to avoid triggering React reconciliation cycles
 * when polling returns identical live game states, scores, and clocks.
 */
function areScoreboardsEqual(prev: NBAScoreboardData | null, next: NBAScoreboardData | null): boolean {
  if (prev === next) return true
  if (!prev || !next) return false
  if (prev.events.length !== next.events.length) return false

  for (let i = 0; i < prev.events.length; i++) {
    const p = prev.events[i]
    const n = next.events[i]
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
  }

  return true
}

export const Dashboard: React.FC = () => {
  const [data, setData] = useState<NBAScoreboardData | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<GameFilter>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [selectedHeroId, setSelectedHeroId] = useState<string | null>(null)
  const [timeZoneMode, setTimeZoneMode] = useState<TimeZoneMode>(getSavedTimeZone)
  const [selectedDate, setSelectedDate] = useState<string>(() => getNBASlateDate())
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true)

  const [isMuted, setIsMuted] = useState<boolean>(() => {
    return safeStorage.getItem('nba_muted') === 'true'
  })

  const [isShortcutsOpen, setIsShortcutsOpen] = useState<boolean>(false)
  const [srAnnouncement, setSrAnnouncement] = useState<string>('')

  const activeTzOption = useMemo(() => {
    return TIMEZONE_OPTIONS.find((o) => o.id === timeZoneMode) || TIMEZONE_OPTIONS[0]
  }, [timeZoneMode])

  const handleCycleTimeZone = useCallback(() => {
    const currentIndex = TIMEZONE_OPTIONS.findIndex((o) => o.id === timeZoneMode)
    const nextIndex = (currentIndex + 1) % TIMEZONE_OPTIONS.length
    const nextMode = TIMEZONE_OPTIONS[nextIndex].id
    setTimeZoneMode(nextMode)
    setSavedTimeZone(nextMode)
    setSrAnnouncement(`Timezone changed to ${TIMEZONE_OPTIONS[nextIndex].label}`)
  }, [timeZoneMode])

  const selectedDateRef = useRef(selectedDate)
  const isMutedRef = useRef(isMuted)
  const abortControllerRef = useRef<AbortController | null>(null)
  const loadDataRef = useRef<((isManual?: boolean, overrideDate?: string) => void) | null>(null)

  useEffect(() => {
    isMutedRef.current = isMuted
  }, [isMuted])

  // Online / Offline Detection
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      loadDataRef.current?.(true)
    }
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Fetch function with AbortController and unchanged data bailout
  const loadData = useCallback(async (isManual = false, overrideDate?: string) => {
    if (isManual) setIsRefreshing(true)

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const controller = new AbortController()
    abortControllerRef.current = controller

    const dateToFetch = overrideDate ?? selectedDateRef.current

    try {
      const result = await fetchNBAScoreboard(dateToFetch, controller.signal)
      setData((prev) => (areScoreboardsEqual(prev, result.data) ? prev : result.data))
      setError(null)
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err.message || 'Failed to fetch NBA scoreboard')
      }
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadDataRef.current = loadData
  }, [loadData])

  // Memoized auto-refresh handler preventing AutoRefreshTicker memo invalidation
  const handleAutoRefresh = useCallback(() => {
    loadDataRef.current?.(false)
  }, [])

  // Initial load & Date change reload
  useEffect(() => {
    selectedDateRef.current = selectedDate
    loadData(true, selectedDate)
  }, [selectedDate, loadData])

  // Cleanup pending network request on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  // Handle Quick Date Select (delta days) with NaN guard and timezone stability
  const handleQuickDateSelect = useCallback((deltaDays: number) => {
    setSelectedDate((prevDate) => {
      let current = new Date(prevDate)
      if (isNaN(current.getTime())) {
        current = new Date()
      }
      current.setDate(current.getDate() + deltaDays)
      const nextStr = current.toISOString().slice(0, 10)
      setSrAnnouncement(`Navigated to date ${nextStr}`)
      return nextStr
    })
  }, [])

  // Keyboard Shortcuts Handler - uses stable refs so registered once on mount
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return

      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault()
        setIsShortcutsOpen((prev) => !prev)
      } else if (e.key.toLowerCase() === 'm') {
        e.preventDefault()
        setIsMuted((prev) => {
          const next = !prev
          safeStorage.setItem('nba_muted', String(next))
          setSrAnnouncement(next ? 'Sound cues muted' : 'Sound cues active')
          return next
        })
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault()
        if (!isMutedRef.current) playTactileClick()
        loadDataRef.current?.(true)
      } else if (e.key === '1') setFilter('all')
      else if (e.key === '2') setFilter('live')
      else if (e.key === '3') setFilter('clutch')
      else if (e.key === '4') setFilter('upcoming')
      else if (e.key === '5') setFilter('final')
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Filtered Events with memoization
  const events = useMemo(() => data?.events || [], [data?.events])

  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      const comp = ev.competitions?.[0]
      const state = ev.status?.type?.state

      // Text Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchName = ev.name.toLowerCase().includes(q)
        const matchTeams = comp?.competitors?.some(
          (c) =>
            c.team.displayName.toLowerCase().includes(q) ||
            c.team.abbreviation.toLowerCase().includes(q) ||
            c.team.location?.toLowerCase().includes(q)
        )
        if (!matchName && !matchTeams) return false
      }

      // Category Tabs
      if (filter === 'live') return state === 'in'
      if (filter === 'clutch') return isClutchGame(ev.status, comp?.competitors)
      if (filter === 'upcoming') return state === 'pre'
      if (filter === 'final') return state === 'post'
      return true
    })
  }, [events, filter, searchQuery])

  // Single-pass filter tab counts without intermediate array allocations
  const tabCounts = useMemo(() => {
    let live = 0
    let clutch = 0
    let upcoming = 0
    let final = 0
    for (let i = 0; i < events.length; i++) {
      const e = events[i]
      const state = e.status?.type?.state
      if (state === 'in') live++
      else if (state === 'pre') upcoming++
      else if (state === 'post') final++
      if (isClutchGame(e.status, e.competitions?.[0]?.competitors)) clutch++
    }
    return {
      all: events.length,
      live,
      clutch,
      upcoming,
      final,
    }
  }, [events])

  // Selected Hero Spotlight Event: Default to selected, live clutch, live, or first game
  const heroEvent = useMemo(() => {
    return (
      events.find((e) => e.id === selectedHeroId) ||
      events.find((e) => isClutchGame(e.status, e.competitions?.[0]?.competitors)) ||
      events.find((e) => e.status?.type?.state === 'in') ||
      events[0] ||
      null
    )
  }, [events, selectedHeroId])

  const handleSpotlight = useCallback(
    (id?: string, name?: string) => {
      if (!id) return
      setSelectedHeroId(id)
      if (name) setSrAnnouncement(`Spotlighted ${name}`)
      if (!isMutedRef.current) playTactileClick()
    },
    []
  )

  const isTickerPaused = (typeof document !== 'undefined' && document.hidden) || isShortcutsOpen

  return (
    <div className="min-h-screen bg-[#060a12] text-slate-100 flex flex-col font-sans">
      {/* Screen Reader Live Announcer */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {srAnnouncement}
      </div>

      {/* Offline Alert Strip */}
      {!isOnline && (
        <div className="flex items-center justify-center gap-2 bg-amber-500/20 border-b border-amber-500/30 px-4 py-1.5 text-xs font-bold text-amber-300">
          <WifiOff className="h-4 w-4" />
          <span>Offline mode: Displaying cached NBA scoreboard data</span>
        </div>
      )}

      {/* Error Alert Strip */}
      {error && (
        <div className="flex items-center justify-between bg-rose-500/20 border-b border-rose-500/30 px-4 py-2 text-xs font-bold text-rose-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-400" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => loadData(true)}
            className="rounded bg-rose-600 hover:bg-rose-500 px-2.5 py-0.5 text-white text-[11px] font-semibold"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main Command Header */}
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#070b14]/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 sm:py-3.5 flex flex-wrap items-center justify-between gap-3 sm:gap-4">
          {/* Logo & Live Status */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-orange-600 to-amber-500 shadow-lg shadow-orange-600/30 shrink-0">
              <span className="text-lg sm:text-xl">🏀</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-['Oswald'] text-xl sm:text-2xl font-bold tracking-wide uppercase text-white leading-tight">
                  NBA Live Command
                </h1>
              </div>
              <p className="text-xs sm:text-[13px] text-slate-300 font-medium hidden md:block">
                Real-Time Scores, Dynamic Win Probability & Broadcast Crews
              </p>
            </div>
          </div>

          {/* Center: Date Selector */}
          <div className="order-3 lg:order-2 w-full lg:w-auto flex justify-center sm:justify-start lg:justify-center">
            <DateSelector
              selectedDate={selectedDate}
              onDateChange={setSelectedDate}
              onQuickSelect={handleQuickDateSelect}
            />
          </div>

          {/* Right Controls: Timezone, Auto-Poll Ticker, Audio, Shortcuts */}
          <div className="order-2 lg:order-3 flex items-center gap-1.5 sm:gap-2 ml-auto lg:ml-0">
            {/* Timezone Selector Pill */}
            <button
              onClick={handleCycleTimeZone}
              className="flex items-center gap-1.5 rounded-lg border border-white/[0.15] bg-white/[0.06] hover:bg-white/[0.12] hover:border-amber-400/50 px-2 sm:px-2.5 py-1 text-xs font-semibold text-slate-200 transition-colors shadow-sm"
              title={`Active Timezone: ${activeTzOption.label}. Click to switch between London UK, US Eastern, and Local.`}
              aria-label={`Timezone: ${activeTzOption.label}. Click to cycle.`}
            >
              <span className="text-sm">{activeTzOption.flag}</span>
              <span className="font-medium text-slate-200 hidden sm:inline">{activeTzOption.shortLabel}</span>
              <span className="font-mono text-amber-300 font-bold text-xs">
                ({getTimeZoneAbbr(new Date(), timeZoneMode)})
              </span>
            </button>

            {/* Auto-poll Countdown Pill */}
            <AutoRefreshTicker
              isPaused={isTickerPaused}
              isRefreshing={isRefreshing}
              onRefreshTrigger={handleAutoRefresh}
            />

            {/* Manual Refresh */}
            <button
              onClick={() => {
                if (!isMuted) playTactileClick()
                loadData(true)
              }}
              className="p-1.5 rounded-lg border border-white/[0.15] bg-white/[0.06] text-slate-200 hover:text-white hover:bg-white/[0.12] transition-colors"
              title="Refresh Now (Space)"
              aria-label="Refresh live scores"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>

            {/* Sound Toggle */}
            <button
              onClick={() => {
                const next = !isMuted
                setIsMuted(next)
                safeStorage.setItem('nba_muted', String(next))
                if (!next) playWhistleSound()
              }}
              className={`p-1.5 rounded-lg border transition-colors ${
                isMuted
                  ? 'border-white/[0.12] bg-white/[0.04] text-slate-400 hover:text-slate-200'
                  : 'border-orange-500/50 bg-orange-500/20 text-orange-200'
              }`}
              title={isMuted ? 'Unmute Arena Audio (M)' : 'Mute Audio (M)'}
              aria-label="Toggle arena sound cues"
            >
              {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>

            {/* Shortcuts Modal Button */}
            <button
              onClick={() => setIsShortcutsOpen(true)}
              className="p-1.5 rounded-lg border border-white/[0.12] bg-white/[0.04] text-slate-300 hover:text-white hover:bg-white/[0.08] transition-colors"
              title="Keyboard Shortcuts (?)"
              aria-label="Open keyboard shortcuts"
            >
              <Keyboard className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Filter Navigation & Search Bar Strip */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex flex-col md:flex-row md:items-center justify-between gap-2.5 border-t border-white/[0.08]">
          {/* Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth py-1 w-full md:w-auto -mx-1 px-1">
            {[
              { id: 'all', label: 'All Matchups', count: tabCounts.all },
              { id: 'live', label: 'Live Now', count: tabCounts.live },
              { id: 'clutch', label: '🔥 Clutch (≤5 pts)', count: tabCounts.clutch },
              { id: 'upcoming', label: 'Upcoming', count: tabCounts.upcoming },
              { id: 'final', label: 'Final', count: tabCounts.final },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setFilter(tab.id as GameFilter)
                  setSrAnnouncement(`Filter changed to ${tab.label}`)
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-colors shrink-0 text-xs sm:text-sm ${
                  filter === tab.id
                    ? 'bg-orange-500 text-white shadow-sm shadow-orange-950 font-bold'
                    : 'text-slate-300 hover:text-white hover:bg-white/[0.08] border border-transparent'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`font-mono text-xs rounded-full px-2 py-0.5 ${
                    filter === tab.id ? 'bg-black/30 text-white font-bold' : 'bg-white/[0.1] text-slate-200'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative flex items-center w-full md:w-[220px] shrink-0">
            <Search className="absolute left-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Filter by team, city..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-white/[0.15] bg-[#0c1322] py-1 pl-8 pr-3 text-xs text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
            />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
        {isLoading && !data ? (
          <div className="rounded-2xl border border-white/[0.08] bg-[#090f1d] p-16 text-center space-y-3">
            <RefreshCw className="h-8 w-8 text-orange-400 animate-spin mx-auto" />
            <p className="text-sm font-semibold text-slate-300">Loading Live NBA Scores & Scorigami...</p>
          </div>
        ) : (
          <>
            {/* Spotlight Hero Matchup */}
            {heroEvent ? (
              <HeroMatchup event={heroEvent} onSelectGame={setSelectedHeroId} timeZoneMode={timeZoneMode} />
            ) : (
              <div className="rounded-2xl border border-white/[0.08] bg-[#090f1d] p-12 text-center text-slate-400">
                No matchups found matching the active filter.
              </div>
            )}

            {/* Scoreboard Grid Section */}
            <section className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between border-b border-white/[0.08] pb-2 gap-1">
                <h2 className="font-['Oswald'] text-lg sm:text-xl font-bold uppercase tracking-wider text-white">
                  All Matchups ({filteredEvents.length})
                </h2>
                <span className="text-xs sm:text-sm text-slate-400 font-mono">
                  Click any matchup to spotlight on the court radar
                </span>
              </div>

              {filteredEvents.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredEvents.map((ev) => (
                    <GameCard
                      key={ev.id}
                      event={ev}
                      isSpotlighted={ev.id === heroEvent?.id}
                      onSpotlight={handleSpotlight}
                      timeZoneMode={timeZoneMode}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-white/[0.08] bg-[#090f1d] p-8 text-center text-slate-400">
                  No games found for this selection.
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {/* Modals */}
      {isShortcutsOpen && (
        <React.Suspense fallback={null}>
          <KeyboardShortcutsModal
            isOpen={isShortcutsOpen}
            onClose={() => setIsShortcutsOpen(false)}
          />
        </React.Suspense>
      )}

      {/* Footer */}
      <footer className="border-t border-white/[0.08] bg-[#070b14] py-6 text-center text-xs text-slate-500 space-y-1">
        <p>🏀 NBA Live Command Center • Real-Time Broadcast & Scorigami Engine</p>
        <p>Data provided by ESPN NBA Core Scoreboard API • Non-commercial sports analytics demonstration</p>
      </footer>
    </div>
  )
}
