import React, { useState, useEffect, useRef, memo } from 'react'
import { RefreshCw } from 'lucide-react'

export interface AutoRefreshTickerProps {
  isPaused: boolean
  isRefreshing: boolean
  onRefreshTrigger: () => void
}

/**
 * Isolated Auto-Refresh Ticker component.
 * Manages its own 1-second interval to avoid re-rendering the entire dashboard on every tick.
 */
export const AutoRefreshTicker: React.FC<AutoRefreshTickerProps> = memo(({
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
AutoRefreshTicker.displayName = 'AutoRefreshTicker'
