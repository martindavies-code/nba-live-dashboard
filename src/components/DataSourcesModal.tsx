import React from 'react'
import { useFocusTrap } from '../utils/useFocusTrap'
import { X, Database, Tv, Sparkles, Activity } from 'lucide-react'

interface DataSourcesModalProps {
  isOpen: boolean
  onClose: () => void
}

export const DataSourcesModal: React.FC<DataSourcesModalProps> = ({ isOpen, onClose }) => {
  const modalRef = useFocusTrap(isOpen, onClose)
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="datasources-modal-title"
        className="w-full max-w-xl rounded-2xl border border-white/[0.12] bg-[#0b1120] p-6 shadow-2xl space-y-5"
      >
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-orange-400" />
            <h2 id="datasources-modal-title" className="text-lg font-bold text-white">
              Data Pipeline & Architecture
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:text-white transition-colors"
            aria-label="Close data sources modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 text-xs leading-relaxed text-slate-300 max-h-[65vh] overflow-y-auto pr-1">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 space-y-1.5">
            <h3 className="font-bold text-white flex items-center gap-1.5 text-sm">
              <Activity className="h-4 w-4 text-emerald-400" />
              Real-Time ESPN NBA API Engine
            </h3>
            <p>
              Data is streamed directly via the live ESPN NBA Scoreboard API (<code>site.api.espn.com</code>)
              with zero-dependency 10-second polling, visibility-based background pause, and cached offline fallback.
            </p>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 space-y-1.5">
            <h3 className="font-bold text-white flex items-center gap-1.5 text-sm">
              <Tv className="h-4 w-4 text-sky-400" />
              Announcing Crew & Officiating Registry
            </h3>
            <p>
              Tracks television and radio broadcast teams across national networks (ABC/ESPN, TNT Sports, NBC/Peacock, NBA TV, Prime Video)
              and all 30 NBA franchise local RSNs (MSG, Spectrum SportsNet, NBC Sports Boston, etc.), alongside official referee assignments.
            </p>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 space-y-1.5">
            <h3 className="font-bold text-white flex items-center gap-1.5 text-sm">
              <Sparkles className="h-4 w-4 text-violet-400" />
              NBA Scorigami Mathematical Engine
            </h3>
            <p>
              Powered by a canonical matrix of historical NBA score combinations since 1946. Computes live novelty probabilities,
              identifies nearest novel score targets with points needed per team, and recaps exact dates/teams when a score last occurred.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
