import React from 'react'
import { useFocusTrap } from '../utils/useFocusTrap'
import { X, Keyboard } from 'lucide-react'

interface ShortcutItem {
  keyLabel: string
  action: string
  category: 'Navigation' | 'Filters' | 'Controls'
}

const SHORTCUTS: ShortcutItem[] = [
  { keyLabel: '1', action: 'Filter: All Matchups', category: 'Filters' },
  { keyLabel: '2', action: 'Filter: Live Games', category: 'Filters' },
  { keyLabel: '3', action: 'Filter: Clutch Games (≤5 pts)', category: 'Filters' },
  { keyLabel: '4', action: 'Filter: Upcoming', category: 'Filters' },
  { keyLabel: '5', action: 'Filter: Final Games', category: 'Filters' },
  { keyLabel: 'M', action: 'Toggle audio sound cues', category: 'Controls' },
  { keyLabel: 'Space', action: 'Trigger immediate manual refresh', category: 'Controls' },
  { keyLabel: 'ArrowDown', action: 'Spotlight next game', category: 'Navigation' },
  { keyLabel: 'ArrowUp', action: 'Spotlight previous game', category: 'Navigation' },
  { keyLabel: '?', action: 'Open Keyboard Shortcuts', category: 'Controls' },
  { keyLabel: 'Esc', action: 'Close any open modal', category: 'Controls' },
]

interface KeyboardShortcutsModalProps {
  isOpen: boolean
  onClose: () => void
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({ isOpen, onClose }) => {
  const modalRef = useFocusTrap(isOpen, onClose)
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-modal-title"
        className="w-full max-w-lg rounded-2xl border border-white/[0.12] bg-[#0b1120] p-6 shadow-2xl space-y-4"
      >
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
          <div className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-orange-400" />
            <h2 id="shortcuts-modal-title" className="text-lg font-bold text-white">
              Keyboard Shortcuts
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:text-white transition-colors"
            aria-label="Close keyboard shortcuts modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {['Navigation', 'Filters', 'Controls'].map((cat) => (
            <div key={cat} className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">{cat}</h3>
              <div className="grid grid-cols-1 gap-2">
                {SHORTCUTS.filter((s) => s.category === cat).map((s) => (
                  <div
                    key={s.keyLabel}
                    className="flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2 text-xs"
                  >
                    <span className="text-slate-300">{s.action}</span>
                    <kbd className="font-mono font-bold text-orange-300 bg-white/[0.08] border border-white/[0.1] px-2 py-0.5 rounded">
                      {s.keyLabel}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
