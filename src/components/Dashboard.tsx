import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react'
import type { GameFilter, NBAScoreboardData } from '../types/nba'
import { DateSelector } from './DateSelector'
import { HeroMatchup } from './HeroMatchup'
import { GameCard } from './GameCard'
import { fetchNBAScoreboard } from '../services/espnApi'
import { isClutchGame, safeStorage } from '../utils/nbaHelpers'
import {
  playWhistleSound,
  playTactileClick,
} from '../utils/audioFeedback'
import { KeyboardShortcutsModal } from './KeyboardShortcutsModal'
import { DataSourcesModal } from './DataSourcesModal'
import {
  RefreshCw,
  Search,
  WifiOff,
  Volume2,
  VolumeX,
  Eye,
  Keyboard,
  Database,
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
  const triggerRef = useRef(onRefreshTrigger)

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

  // Reset countdown when manual refresh triggers
  useEffect(() => {
    if (isRefreshing) {
      setSecondsLeft(10)
    }
  }, [isRefreshing])

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

export const Dashboard: React.FC = () => {
  const [data, setData] = useState<NBAScoreboardData | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<GameFilter>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
  const [selectedHeroId, setSelectedHeroId] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true)

  const [isMuted, setIsMuted] = useState<boolean>(() => {
    return safeStorage.getItem('nba_muted') === 'true'
  })

  const [isHighContrast, setIsHighContrast] = useState<boolean>(() => {
    return safeStorage.getItem('nba_high_contrast') === 'true'
  })

  const [isShortcutsOpen, setIsShortcutsOpen] = useState<boolean>(false)
  const [isSourcesOpen, setIsSourcesOpen] = useState<boolean>(false)
  const [srAnnouncement, setSrAnnouncement] = useState<string>('')

  const abortControllerRef = useRef<AbortController | null>(null)
  const loadDataRef = useRef<((isManual?: boolean, overrideDate?: string) => void) | null>(null)

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

  // High contrast mode class on document
  useEffect(() => {
    if (isHighContrast) {
      document.documentElement.classList.add('high-contrast')
    } else {
      document.documentElement.classList.remove('high-contrast')
    }
    safeStorage.setItem('nba_high_contrast', String(isHighContrast))
  }, [isHighContrast])

  // Fetch function with AbortController
  const loadData = useCallback(async (isManual = false, overrideDate?: string) => {
    if (isManual) setIsRefreshing(true)

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const controller = new AbortController()
    abortControllerRef.current = controller

    const dateToFetch = overrideDate ?? selectedDate

    try {
      const result = await fetchNBAScoreboard(dateToFetch, controller.signal)
      setData(result.data)
      setLastUpdated(new Date())
      setError(null)
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err.message || 'Failed to fetch NBA scoreboard')
      }
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [selectedDate])

  useEffect(() => {
    loadDataRef.current = loadData
  }, [loadData])

  // Initial load & Date change reload
  useEffect(() => {
    loadData(true)
  }, [loadData, selectedDate])

  // Cleanup pending network request on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  // Handle Quick Date Select (delta days)
  const handleQuickDateSelect = useCallback((deltaDays: number) => {
    const current = new Date(selectedDate)
    current.setDate(current.getDate() + deltaDays)
    const nextStr = current.toISOString().slice(0, 10)
    setSelectedDate(nextStr)
    setSrAnnouncement(`Navigated to date ${nextStr}`)
  }, [selectedDate])

  // Keyboard Shortcuts Handler
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
      } else if (e.key.toLowerCase() === 'h') {
        e.preventDefault()
        setIsHighContrast((prev) => !prev)
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault()
        if (!isMuted) playTactileClick()
        loadData(true)
      } else if (e.key === '1') setFilter('all')
      else if (e.key === '2') setFilter('live')
      else if (e.key === '3') setFilter('clutch')
      else if (e.key === '4') setFilter('fourth')
      else if (e.key === '5') setFilter('halftime')
      else if (e.key === '6') setFilter('upcoming')
      else if (e.key === '7') setFilter('final')
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isMuted, loadData])

  // Filtered Events with memoization
  const events = useMemo(() => data?.events || [], [data?.events])

  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      const comp = ev.competitions?.[0]
      const state = ev.status?.type?.state
      const period = ev.status?.period

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
      if (filter === 'fourth') return state === 'in' && period >= 4
      if (filter === 'halftime') {
        return ev.status?.type?.name === 'STATUS_HALFTIME' || ev.status?.type?.detail === 'Halftime'
      }
      if (filter === 'upcoming') return state === 'pre'
      if (filter === 'final') return state === 'post'
      return true
    })
  }, [events, filter, searchQuery])

  // Filter tab counts
  const tabCounts = useMemo(() => {
    return {
      all: events.length,
      live: events.filter((e) => e.status?.type?.state === 'in').length,
      clutch: events.filter((e) => isClutchGame(e.status, e.competitions?.[0]?.competitors)).length,
      fourth: events.filter((e) => e.status?.type?.state === 'in' && e.status?.period >= 4).length,
      halftime: events.filter(
        (e) => e.status?.type?.name === 'STATUS_HALFTIME' || e.status?.type?.detail === 'Halftime'
      ).length,
      upcoming: events.filter((e) => e.status?.type?.state === 'pre').length,
      final: events.filter((e) => e.status?.type?.state === 'post').length,
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
    (id: string, name: string) => {
      setSelectedHeroId(id)
      setSrAnnouncement(`Spotlighted ${name}`)
      if (!isMuted) playTactileClick()
    },
    [isMuted]
  )

  const isTickerPaused = typeof document !== 'undefined' && document.hidden || isShortcutsOpen || isSourcesOpen

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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
          {/* Logo & Live Status */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-orange-600 to-amber-500 shadow-lg shadow-orange-600/30">
              <span className="text-xl">🏀</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-['Oswald'] text-xl sm:text-2xl font-bold tracking-wide uppercase text-white">
                  NBA Live Command
                </h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                  LIVE FEED
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Announcing Crews • Dynamic Court Shot Radar • Live NBA Scorigami Engine
              </p>
            </div>
          </div>

          {/* Center: Date Selector */}
          <DateSelector
            selectedDate={selectedDate}
            onDateChange={(d) => setSelectedDate(d)}
            onQuickSelect={handleQuickDateSelect}
          />

          {/* Right Controls: Auto-Poll Ticker, Audio, High Contrast, Modals */}
          <div className="flex items-center gap-2">
            {/* Last updated timestamp */}
            <span className="hidden lg:inline text-[10px] font-mono text-slate-400">
              Synced {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>

            {/* Switcher to NFL Dashboard */}
            <a
              href="https://martindavies-code.github.io/nfl-live-dashboard/"
              className="hidden md:flex items-center gap-1 rounded-lg border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] hover:text-white px-2.5 py-1 text-xs font-semibold text-slate-300 transition-colors"
              title="Switch to NFL Live Command Center"
            >
              <span>🏈</span>
              <span>NFL Command</span>
            </a>

            {/* Auto-poll Countdown Pill */}
            <AutoRefreshTicker
              isPaused={isTickerPaused}
              isRefreshing={isRefreshing}
              onRefreshTrigger={() => loadData(false)}
            />

            {/* Manual Refresh */}
            <button
              onClick={() => {
                if (!isMuted) playTactileClick()
                loadData(true)
              }}
              className="p-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] text-slate-300 hover:text-white hover:bg-white/[0.08] transition-colors"
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
                  ? 'border-white/[0.08] bg-white/[0.04] text-slate-400 hover:text-slate-200'
                  : 'border-orange-500/40 bg-orange-500/15 text-orange-300'
              }`}
              title={isMuted ? 'Unmute Arena Audio (M)' : 'Mute Audio (M)'}
              aria-label="Toggle arena sound cues"
            >
              {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>

            {/* High Contrast Toggle */}
            <button
              onClick={() => setIsHighContrast((prev) => !prev)}
              className={`p-1.5 rounded-lg border transition-colors ${
                isHighContrast
                  ? 'border-sky-500/50 bg-sky-500/20 text-sky-200'
                  : 'border-white/[0.08] bg-white/[0.04] text-slate-400 hover:text-slate-200'
              }`}
              title="Toggle High Contrast Pro (H)"
              aria-label="Toggle high contrast mode"
            >
              <Eye className="h-4 w-4" />
            </button>

            {/* Shortcuts Modal Button */}
            <button
              onClick={() => setIsShortcutsOpen(true)}
              className="p-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] text-slate-400 hover:text-slate-200 transition-colors"
              title="Keyboard Shortcuts (?)"
              aria-label="Open keyboard shortcuts"
            >
              <Keyboard className="h-4 w-4" />
            </button>

            {/* Data Pipeline Modal Button */}
            <button
              onClick={() => setIsSourcesOpen(true)}
              className="p-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] text-slate-400 hover:text-slate-200 transition-colors"
              title="Data Pipeline & Scorigami Docs"
              aria-label="Open data pipeline information"
            >
              <Database className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Filter Navigation & Search Bar Strip */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.04]">
          {/* Filter Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto text-xs py-0.5">
            {[
              { id: 'all', label: 'All Matchups', count: tabCounts.all },
              { id: 'live', label: 'Live Now', count: tabCounts.live },
              { id: 'clutch', label: '🔥 Clutch (≤5 pts)', count: tabCounts.clutch },
              { id: 'fourth', label: '4th Quarter', count: tabCounts.fourth },
              { id: 'halftime', label: 'Halftime', count: tabCounts.halftime },
              { id: 'upcoming', label: 'Upcoming', count: tabCounts.upcoming },
              { id: 'final', label: 'Final', count: tabCounts.final },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setFilter(tab.id as GameFilter)
                  setSrAnnouncement(`Filter changed to ${tab.label}`)
                }}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-semibold transition-colors shrink-0 ${
                  filter === tab.id
                    ? 'bg-orange-500 text-white shadow-sm shadow-orange-950'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`font-mono text-[10px] rounded-full px-1.5 py-0.2 ${
                    filter === tab.id ? 'bg-black/30 text-white' : 'bg-white/[0.08] text-slate-300'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative flex items-center min-w-[200px] max-w-[280px] w-full sm:w-auto">
            <Search className="absolute left-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Filter by team, city..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-white/[0.08] bg-[#090f1c] py-1 pl-8 pr-3 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
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
              <HeroMatchup event={heroEvent} onSelectGame={(id) => setSelectedHeroId(id)} />
            ) : (
              <div className="rounded-2xl border border-white/[0.08] bg-[#090f1d] p-12 text-center text-slate-400">
                No matchups found matching the active filter.
              </div>
            )}

            {/* Scoreboard Grid Section */}
            <section className="space-y-4">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
                <div className="flex items-center gap-2">
                  <h2 className="font-['Oswald'] text-lg font-bold uppercase tracking-wider text-white">
                    All Matchups ({filteredEvents.length})
                  </h2>
                  <span className="text-xs text-slate-400 font-mono">
                    Click any matchup to spotlight on the court radar
                  </span>
                </div>
              </div>

              {filteredEvents.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredEvents.map((ev) => (
                    <GameCard
                      key={ev.id}
                      event={ev}
                      isSpotlighted={ev.id === heroEvent?.id}
                      onSpotlight={() => handleSpotlight(ev.id, ev.name)}
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
      <KeyboardShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />
      <DataSourcesModal
        isOpen={isSourcesOpen}
        onClose={() => setIsSourcesOpen(false)}
      />

      {/* Footer */}
      <footer className="border-t border-white/[0.08] bg-[#070b14] py-6 text-center text-xs text-slate-500 space-y-1">
        <p>🏀 NBA Live Command Center • Real-Time Broadcast & Scorigami Engine</p>
        <p>Data provided by ESPN NBA Core Scoreboard API • Non-commercial sports analytics demonstration</p>
      </footer>
    </div>
  )
}
