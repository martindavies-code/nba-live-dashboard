import React, { memo } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'

interface DateSelectorProps {
  selectedDate: string // YYYY-MM-DD
  onDateChange: (dateStr: string) => void
  onQuickSelect: (deltaDays: number) => void
}

export const DateSelector: React.FC<DateSelectorProps> = memo(({
  selectedDate,
  onDateChange,
  onQuickSelect,
}) => {
  const todayStr = new Date().toISOString().slice(0, 10)
  const isToday = selectedDate === todayStr

  return (
    <div className="flex items-center gap-2 text-xs">
      {/* Quick Day Switchers */}
      <div className="flex items-center rounded-lg bg-[#090f1c] border border-white/[0.08] p-0.5">
        <button
          onClick={() => onQuickSelect(-1)}
          className="px-2.5 py-1 text-slate-400 hover:text-white transition-colors"
          title="Previous Day"
          aria-label="Previous Day"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>

        <button
          onClick={() => onDateChange(todayStr)}
          className={`px-3 py-1 rounded font-bold transition-colors ${
            isToday
              ? 'bg-orange-500 text-white shadow-sm shadow-orange-950'
              : 'text-slate-300 hover:text-white'
          }`}
          aria-label="Today"
        >
          Today
        </button>

        <button
          onClick={() => onQuickSelect(1)}
          className="px-2.5 py-1 text-slate-400 hover:text-white transition-colors"
          title="Next Day"
          aria-label="Next Day"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Date Picker Input */}
      <div className="relative flex items-center">
        <Calendar className="absolute left-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => onDateChange(e.target.value)}
          aria-label="Select match date"
          className="rounded-lg border border-white/[0.08] bg-[#090f1c] py-1 pl-8 pr-2.5 text-xs font-mono font-medium text-slate-200 focus:outline-none focus:ring-1 focus:ring-orange-500 cursor-pointer"
        />
      </div>
    </div>
  )
})
