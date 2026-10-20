export interface NBATeam {
  id: string
  uid?: string
  name: string
  displayName: string
  abbreviation: string
  location?: string
  color: string // Hex string without '#'
  alternateColor?: string
  logo: string
}

export interface NBALineScore {
  value: number
  displayValue?: string
  period?: number
}

export interface NBACompetitor {
  id: string
  uid?: string
  homeAway: 'home' | 'away'
  winner?: boolean
  score: string
  records?: Array<{
    name?: string
    type?: string
    summary: string
  }>
  team: NBATeam
  linescores?: NBALineScore[]
  fouls?: number
  timeouts?: number
  inBonus?: boolean
  inDoubleBonus?: boolean
}

export interface NBAShot {
  id: string
  x: number // SVG court coordinates (0..94 or 0..100)
  y: number // SVG court coordinates (0..50)
  made: boolean
  points: 2 | 3
  shooter: string
  shooterPhoto?: string
  teamId: string
  teamAbbr: string
  distanceFeet: number
  clock: string
  period: number
  description: string
  zone?: 'Restricted Area' | 'In The Paint (Non-RA)' | 'Mid-Range' | 'Left Corner 3' | 'Right Corner 3' | 'Above the Break 3'
}

export interface NBAPlay {
  id: string
  text: string
  scoringPlay?: boolean
  scoreValue?: number
  clock: { displayValue: string }
  period: { number: number; displayValue: string }
  team?: { id: string }
  homeScore?: number
  awayScore?: number
  coordinate?: { x: number; y: number }
  shootingPlay?: boolean
  shot?: NBAShot
}

export interface NBASituation {
  possession?: string // Team ID
  possessionText?: string
  lastPlay?: NBAPlay
  shotClock?: number // 0-24
  homeFouls?: number
  awayFouls?: number
  homeTimeouts?: number
  awayTimeouts?: number
  isClutch?: boolean // Game within 5 points in last 5 mins of 4Q/OT
  scoringRun?: {
    teamId: string
    teamAbbr: string
    points: number
    opponentPoints: number
    durationText?: string
  }
}

export interface NBAStatusType {
  id: string
  name: string
  state: 'pre' | 'in' | 'post'
  completed: boolean
  description: string
  detail: string
  shortDetail: string
}

export interface NBAStatus {
  clock: number
  displayClock: string
  period: number // 1, 2, 3, 4, 5 (OT1), 6 (OT2)...
  type: NBAStatusType
}

export interface NBAOfficial {
  fullName: string
  displayName: string
  position?: { name?: string; displayName?: string }
  order?: number
}

export interface NBAAnnouncingCrew {
  network: string
  market?: string
  playByPlay: string
  colorAnalyst: string
  sidelineReporter?: string
  radioNetwork?: string
  officials?: Array<{ name: string; role: string }>
}

export interface NBAOdds {
  provider?: {
    id?: string
    name?: string
    displayName?: string
  }
  details?: string
  overUnder?: number
  spread?: number
  awayTeamOdds?: {
    favorite?: boolean
    underdog?: boolean
  }
  homeTeamOdds?: {
    favorite?: boolean
    underdog?: boolean
  }
  moneyline?: {
    home?: {
      close?: { odds?: string }
      open?: { odds?: string }
    }
    away?: {
      close?: { odds?: string }
      open?: { odds?: string }
    }
  }
}

export interface NBALeader {
  name: string
  displayName: string
  shortDisplayName: string
  abbreviation: string
  leaders: Array<{
    displayValue: string
    value: number
    athlete: {
      id: string
      fullName: string
      displayName: string
      shortName: string
      headshot?: { href: string }
      position?: { abbreviation: string }
      team: { id: string; abbreviation: string }
    }
  }>
}

export interface NBACompetition {
  id: string
  uid: string
  date: string
  attendance?: number
  competitors: NBACompetitor[]
  status?: NBAStatus
  situation?: NBASituation | null
  odds?: NBAOdds[]
  broadcasts?: Array<{
    market: string
    names: string[]
  }>
  venue?: {
    fullName: string
    address?: {
      city: string
      state: string
    }
  }
  officials?: NBAOfficial[]
  leaders?: NBALeader[]
  shots?: NBAShot[]
  recentPlays?: NBAPlay[]
  announcingCrew?: NBAAnnouncingCrew
}

export interface NBAEvent {
  id: string
  uid: string
  date: string
  name: string
  shortName: string
  season?: {
    year: number
    type: number
    slug: string
  }
  competitions: NBACompetition[]
  status: NBAStatus
}

export interface NBAScoreboardData {
  events: NBAEvent[]
  day?: {
    date: string
  }
  season?: {
    type: number
    year: number
  }
}

export type GameFilter = 'all' | 'live' | 'clutch' | 'upcoming' | 'final'
