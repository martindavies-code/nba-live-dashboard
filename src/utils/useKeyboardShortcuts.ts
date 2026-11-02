import { useEffect, useRef } from 'react'
import type { GameFilter } from '../types/nba'

export interface KeyboardShortcutHandlers {
  onToggleShortcuts: () => void
  onToggleMute: () => void
  onRefresh: () => void
  onSelectFilter: (filter: GameFilter) => void
}

export interface UseKeyboardShortcutsOptions {
  enabled?: boolean
}

/**
 * Custom hook that safely handles dashboard keyboard navigation.
 * Automatically ignores keystrokes when typing into form inputs or textareas.
 * Cleans up window event listeners on unmount.
 */
export function useKeyboardShortcuts(
  handlers: KeyboardShortcutHandlers,
  options: UseKeyboardShortcutsOptions = {}
): void {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers
  const enabled = options.enabled ?? true

  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tagName = target?.tagName
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || target?.isContentEditable) {
        return
      }

      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault()
        handlersRef.current.onToggleShortcuts()
      } else if (e.key.toLowerCase() === 'm') {
        e.preventDefault()
        handlersRef.current.onToggleMute()
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault()
        handlersRef.current.onRefresh()
      } else if (e.key === '1') {
        handlersRef.current.onSelectFilter('all')
      } else if (e.key === '2') {
        handlersRef.current.onSelectFilter('live')
      } else if (e.key === '3') {
        handlersRef.current.onSelectFilter('clutch')
      } else if (e.key === '4') {
        handlersRef.current.onSelectFilter('upcoming')
      } else if (e.key === '5') {
        handlersRef.current.onSelectFilter('final')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled])
}
