import { safeStorage } from './nbaHelpers.ts'

export type TimeZoneMode = 'Europe/London' | 'America/New_York' | 'auto'

export interface TimeZoneOption {
  id: TimeZoneMode
  label: string
  shortLabel: string
  flag: string
  ianaZone?: string
}

export const TIMEZONE_OPTIONS: TimeZoneOption[] = [
  {
    id: 'Europe/London',
    label: 'London (UK)',
    shortLabel: 'London',
    flag: '🇬🇧',
    ianaZone: 'Europe/London',
  },
  {
    id: 'America/New_York',
    label: 'US Eastern (ET)',
    shortLabel: 'US Eastern',
    flag: '🇺🇸',
    ianaZone: 'America/New_York',
  },
  {
    id: 'auto',
    label: 'System Local Time',
    shortLabel: 'Local',
    flag: '🌐',
  },
]

const STORAGE_KEY = 'nba_dashboard_timezone'

/**
 * Retrieves the saved timezone preference or defaults to London, UK (Europe/London).
 */
export function getSavedTimeZone(): TimeZoneMode {
  const saved = safeStorage.getItem(STORAGE_KEY)
  if (saved === 'America/New_York' || saved === 'auto' || saved === 'Europe/London') {
    return saved
  }
  return 'Europe/London'
}

/**
 * Saves the user's timezone preference to localStorage.
 */
export function setSavedTimeZone(tz: TimeZoneMode): void {
  safeStorage.setItem(STORAGE_KEY, tz)
}

/**
 * Resolves the IANA timezone string for the given TimeZoneMode.
 */
export function resolveTimeZone(mode: TimeZoneMode = 'Europe/London'): string {
  if (mode === 'Europe/London') return 'Europe/London'
  if (mode === 'America/New_York') return 'America/New_York'
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London'
  } catch {
    return 'Europe/London'
  }
}

/**
 * Returns the short abbreviation for the timezone (e.g., BST, GMT, EDT, EST).
 */
export function getTimeZoneAbbr(dateInput: Date | string = new Date(), mode: TimeZoneMode = 'Europe/London'): string {
  try {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput
    if (isNaN(d.getTime())) return mode === 'Europe/London' ? 'BST' : 'ET'
    const tz = resolveTimeZone(mode)
    const locale = tz === 'America/New_York' ? 'en-US' : 'en-GB'
    const parts = new Intl.DateTimeFormat(locale, {
      timeZone: tz,
      timeZoneName: 'short',
    }).formatToParts(d)
    const tzPart = parts.find((p) => p.type === 'timeZoneName')
    return tzPart ? tzPart.value : (mode === 'Europe/London' ? 'BST' : 'ET')
  } catch {
    return mode === 'Europe/London' ? 'BST' : 'ET'
  }
}

/**
 * Formats a game kickoff timestamp (e.g., "2026-10-21T23:00Z") into:
 * "Thu 22 Oct • 00:00 BST" (for UK) or "Wed, Oct 21 • 7:00 PM EDT" (for US).
 */
export function formatGameKickoff(
  dateStr?: string,
  mode: TimeZoneMode = 'Europe/London',
  options?: { includeDate?: boolean; hour12?: boolean }
): string {
  if (!dateStr) return 'Scheduled'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return 'Scheduled'

  const tz = resolveTimeZone(mode)
  const isUK = tz === 'Europe/London'

  try {
    if (options?.includeDate === false) {
      // Time only: e.g. "00:00 BST" or "7:00 PM EDT"
      return new Intl.DateTimeFormat(isUK ? 'en-GB' : 'en-US', {
        timeZone: tz,
        hour: isUK ? '2-digit' : 'numeric',
        minute: '2-digit',
        hour12: options?.hour12 ?? !isUK,
        timeZoneName: 'short',
      }).format(d)
    }

    const formatter = new Intl.DateTimeFormat(isUK ? 'en-GB' : 'en-US', {
      timeZone: tz,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: isUK ? '2-digit' : 'numeric',
      minute: '2-digit',
      hour12: options?.hour12 ?? !isUK,
      timeZoneName: 'short',
    })

    const parts = formatter.formatToParts(d)
    const p: Record<string, string> = {}
    for (const part of parts) {
      p[part.type] = part.value
    }

    if (isUK) {
      return `${p.weekday} ${p.day} ${p.month} • ${p.hour}:${p.minute} ${p.timeZoneName}`
    } else {
      return `${p.weekday}, ${p.month} ${p.day} • ${p.hour}:${p.minute} ${p.dayPeriod || ''} ${p.timeZoneName}`.replace(/\s+/g, ' ')
    }
  } catch {
    return dateStr
  }
}

/**
 * Formats a long readable game kickoff timestamp (for spotlight banner):
 * e.g., "Thu, 22 Oct at 00:00 BST"
 */
export function formatGameKickoffLong(
  dateStr?: string,
  mode: TimeZoneMode = 'Europe/London'
): string {
  if (!dateStr) return 'Scheduled'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return 'Scheduled'

  const tz = resolveTimeZone(mode)
  const isUK = tz === 'Europe/London'

  try {
    const formatter = new Intl.DateTimeFormat(isUK ? 'en-GB' : 'en-US', {
      timeZone: tz,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: isUK ? '2-digit' : 'numeric',
      minute: '2-digit',
      hour12: !isUK,
      timeZoneName: 'short',
    })

    const parts = formatter.formatToParts(d)
    const p: Record<string, string> = {}
    for (const part of parts) {
      p[part.type] = part.value
    }

    if (isUK) {
      return `${p.weekday}, ${p.day} ${p.month} at ${p.hour}:${p.minute} ${p.timeZoneName}`
    } else {
      return `${p.weekday}, ${p.month} ${p.day} at ${p.hour}:${p.minute} ${p.dayPeriod || ''} ${p.timeZoneName}`.replace(/\s+/g, ' ')
    }
  } catch {
    return dateStr
  }
}

/**
 * Returns date in YYYY-MM-DD for the current active NBA slate in US Eastern timezone.
 * Used so that UK/European viewers watching games at 1 AM - 5 AM BST are not
 * unexpectedly pushed to tomorrow's slate before tonight's games finish.
 */
export function getNBASlateDate(date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date)
  } catch {
    return date.toISOString().slice(0, 10)
  }
}
