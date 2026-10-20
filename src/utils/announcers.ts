import type { NBAAnnouncingCrew, NBACompetition, NBAOfficial } from '../types/nba'

export interface CrewDetails {
  playByPlay: string
  colorAnalyst: string
  sidelineReporter?: string
  networkName: string
  radio?: string
}

// National Broadcast Announcing Crews (ESPN/ABC, TNT Sports, NBC/Peacock, NBA TV, Prime Video)
export const NATIONAL_CREWS: Record<string, CrewDetails[]> = {
  ABC: [
    {
      networkName: 'ABC',
      playByPlay: 'Mike Breen',
      colorAnalyst: 'Doris Burke & Richard Jefferson',
      sidelineReporter: 'Lisa Salters',
      radio: 'ESPN Radio (Marc Kestecher & PJ Carlesimo)',
    },
    {
      networkName: 'ABC',
      playByPlay: 'Ryan Ruocco',
      colorAnalyst: 'JJ Redick & Tim Legler',
      sidelineReporter: 'Cassidy Hubbarth',
      radio: 'ESPN Radio',
    },
  ],
  ESPN: [
    {
      networkName: 'ESPN',
      playByPlay: 'Mike Breen',
      colorAnalyst: 'Doris Burke & Richard Jefferson',
      sidelineReporter: 'Lisa Salters',
      radio: 'ESPN Radio',
    },
    {
      networkName: 'ESPN',
      playByPlay: 'Dave Pasch',
      colorAnalyst: 'Hubie Brown',
      sidelineReporter: 'Katie George',
      radio: 'ESPN Radio',
    },
    {
      networkName: 'ESPN',
      playByPlay: 'Mark Jones',
      colorAnalyst: 'Stephanie Ready',
      sidelineReporter: 'Jorge Sedano',
      radio: 'ESPN Radio',
    },
  ],
  TNT: [
    {
      networkName: 'TNT Sports',
      playByPlay: 'Kevin Harlan',
      colorAnalyst: 'Reggie Miller & Stan Van Gundy',
      sidelineReporter: 'Allie LaForce',
      radio: 'TNT Radio / Westwood One',
    },
    {
      networkName: 'TNT Sports',
      playByPlay: 'Brian Anderson',
      colorAnalyst: 'Grant Hill & Jim Jackson',
      sidelineReporter: 'Jared Greenberg',
      radio: 'Westwood One',
    },
    {
      networkName: 'TNT Sports',
      playByPlay: 'Spero Dedes',
      colorAnalyst: 'Greg Anthony',
      sidelineReporter: 'Lauren Jbara',
      radio: 'Westwood One',
    },
  ],
  NBC: [
    {
      networkName: 'NBC Sports',
      playByPlay: 'Noah Eagle',
      colorAnalyst: 'Reggie Miller & Jamal Crawford',
      sidelineReporter: 'Zora Stephenson',
      radio: 'NBC Sports Audio',
    },
    {
      networkName: 'NBC Sports',
      playByPlay: 'Mike Tirico',
      colorAnalyst: 'Grant Hill',
      sidelineReporter: 'Maria Taylor',
      radio: 'NBC Sports Audio',
    },
  ],
  PEACOCK: [
    {
      networkName: 'Peacock',
      playByPlay: 'Noah Eagle',
      colorAnalyst: 'Reggie Miller',
      sidelineReporter: 'Zora Stephenson',
    },
  ],
  'PRIME VIDEO': [
    {
      networkName: 'Prime Video',
      playByPlay: 'Ian Eagle',
      colorAnalyst: 'Stan Van Gundy',
      sidelineReporter: 'Taylor Rooks',
    },
  ],
  'NBA TV': [
    {
      networkName: 'NBA TV',
      playByPlay: 'Ian Eagle',
      colorAnalyst: 'Jim Jackson',
      sidelineReporter: 'Stephanie Ready',
    },
    {
      networkName: 'NBA TV',
      playByPlay: 'Matt Winer',
      colorAnalyst: 'Brendan Haywood',
      sidelineReporter: 'Dennis Scott',
    },
  ],
}

// Franchise Local Regional Sports Network Crews (All 30 Teams)
export const TEAM_LOCAL_CREWS: Record<string, CrewDetails> = {
  BOS: {
    networkName: 'NBC Sports Boston',
    playByPlay: 'Drew Carter',
    colorAnalyst: 'Brian Scalabrine',
    sidelineReporter: 'Abby Chin',
    radio: '98.5 The Sports Hub (Sean Grande & Cedric Maxwell)',
  },
  BKN: {
    networkName: 'YES Network',
    playByPlay: 'Ian Eagle / Ryan Ruocco',
    colorAnalyst: 'Sarah Kustok & Richard Jefferson',
    sidelineReporter: 'Meghan Triplett',
    radio: 'WFAN 101.9 FM (Chris Carrino)',
  },
  NYK: {
    networkName: 'MSG Network',
    playByPlay: 'Mike Breen / Kenny Albert',
    colorAnalyst: 'Walt "Clyde" Frazier',
    sidelineReporter: 'Rebecca Haarlow',
    radio: 'ESPN NY 98.7 (Ed Cohen & Brendan Brown)',
  },
  PHI: {
    networkName: 'NBC Sports Philadelphia',
    playByPlay: 'Kate Scott',
    colorAnalyst: 'Alaa Abdelnaby',
    sidelineReporter: 'Taryn Hatcher',
    radio: '97.5 The Fanatic (Tom McGinnis)',
  },
  TOR: {
    networkName: 'TSN / Sportsnet',
    playByPlay: 'Matt Devlin',
    colorAnalyst: 'Jack Armstrong & Alvin Williams',
    sidelineReporter: 'Savanna Hamilton',
    radio: 'TSN 1050 (Paul Jones)',
  },
  CHI: {
    networkName: 'Chicago Sports Network',
    playByPlay: 'Adam Amin',
    colorAnalyst: 'Stacey King',
    sidelineReporter: 'K.C. Johnson',
    radio: '670 The Score (Chuck Swirsky & Bill Wennington)',
  },
  CLE: {
    networkName: 'FanDuel Sports Network OH',
    playByPlay: 'John Michael',
    colorAnalyst: 'Brad Daugherty & Mike Fratello',
    sidelineReporter: 'Serena Winters',
    radio: 'WTAM 1100 (Tim Alcorn)',
  },
  DET: {
    networkName: 'FanDuel Sports Network DET',
    playByPlay: 'George Blaha / Johnny Kane',
    colorAnalyst: 'Greg Kelser',
    sidelineReporter: 'Natalie Kerwin',
    radio: '97.1 The Ticket (Mark Champion)',
  },
  IND: {
    networkName: 'FanDuel Sports Network IN',
    playByPlay: 'Chris Denari',
    colorAnalyst: 'Quinn Buckner',
    sidelineReporter: 'Jeremiah Johnson',
    radio: '107.5 The Fan (Mark Boyle)',
  },
  MIL: {
    networkName: 'FanDuel Sports Network WI',
    playByPlay: 'Lisa Byington',
    colorAnalyst: 'Marques Johnson & Steve Novak',
    sidelineReporter: 'Melanie Ricks',
    radio: 'WTMJ 620 AM (Dave Koehn)',
  },
  ATL: {
    networkName: 'FanDuel Sports Network SE',
    playByPlay: 'Bob Rathbun',
    colorAnalyst: 'Dominique Wilkins & Vince Carter',
    sidelineReporter: 'Tabitha Turner',
    radio: '92.9 The Game (Steve Holman)',
  },
  CHA: {
    networkName: 'FanDuel Sports Network SE',
    playByPlay: 'Eric Collins',
    colorAnalyst: 'Dell Curry',
    sidelineReporter: 'Ashley ShahAhmadi',
    radio: 'WFNZ 92.7 (Sam Farber)',
  },
  MIA: {
    networkName: 'FanDuel Sports Network Sun',
    playByPlay: 'Eric Reid',
    colorAnalyst: 'John Crotty',
    sidelineReporter: 'Jason Jackson',
    radio: '560 WQAM (Jason Jackson)',
  },
  ORL: {
    networkName: 'FanDuel Sports Network FL',
    playByPlay: 'David Steele',
    colorAnalyst: 'Jeff Turner',
    sidelineReporter: 'Dante Marchitelli',
    radio: '96.9 The Game (Joey Yazzolino)',
  },
  WAS: {
    networkName: 'Monumental Sports Network',
    playByPlay: 'Chris Miller',
    colorAnalyst: 'Drew Gooden',
    sidelineReporter: 'Meghan McPeak',
    radio: 'The Team 980 (Dave Johnson)',
  },
  DEN: {
    networkName: 'Altitude Sports',
    playByPlay: 'Chris Marlowe',
    colorAnalyst: 'Scott Hastings',
    sidelineReporter: 'Katy Winge',
    radio: 'Altitude 92.5 FM (Jason Kosmicki)',
  },
  MIN: {
    networkName: 'FanDuel Sports Network North',
    playByPlay: 'Michael Grady',
    colorAnalyst: 'Jim Petersen',
    sidelineReporter: 'Marney Gellner',
    radio: 'KFAN 100.3 (Alan Horton)',
  },
  OKC: {
    networkName: 'FanDuel Sports Network OK',
    playByPlay: 'Chris Fisher',
    colorAnalyst: 'Michael Cage',
    sidelineReporter: 'Nick Gallo',
    radio: 'WWLS The Sports Animal (Matt Pinto)',
  },
  POR: {
    networkName: 'Rip City Television Network',
    playByPlay: 'Kevin Calabro',
    colorAnalyst: 'Lamar Hurd',
    sidelineReporter: 'Brooke Olzendam',
    radio: 'Rip City Radio 620 (Travis Demers)',
  },
  UTA: {
    networkName: 'KJZZ / Jazz+',
    playByPlay: 'Craig Bolerjack',
    colorAnalyst: 'Thurl Bailey',
    sidelineReporter: 'Holly Rowe',
    radio: '97.5 The KSL Sports Zone (David Locke)',
  },
  GSW: {
    networkName: 'NBC Sports Bay Area',
    playByPlay: 'Bob Fitzgerald',
    colorAnalyst: 'Kelenna Azubuike',
    sidelineReporter: 'Kerith Burke',
    radio: '95.7 The Game (Tim Roye & Tom Tolbert)',
  },
  LAC: {
    networkName: 'FanDuel Sports Network SoCal',
    playByPlay: 'Brian Sieman',
    colorAnalyst: 'Jim Jackson & Mike Fratello',
    sidelineReporter: 'Kristina Pink',
    radio: 'AM 570 LA Sports (Carlo Jimenez)',
  },
  LAL: {
    networkName: 'Spectrum SportsNet',
    playByPlay: 'Bill Macdonald',
    colorAnalyst: 'Stu Lantz',
    sidelineReporter: 'Mike Bresnahan',
    radio: 'ESPN LA 710 (John Ireland & Mychal Thompson)',
  },
  PHX: {
    networkName: "Arizona's Family 3TV",
    playByPlay: 'Kevin Ray',
    colorAnalyst: 'Eddie Johnson & Ann Meyers Drysdale',
    sidelineReporter: 'Tom Leander',
    radio: 'KMVP 98.7 (Jon Bloom & Tim Kempton)',
  },
  SAC: {
    networkName: 'NBC Sports California',
    playByPlay: 'Mark Jones / Kyle Draper',
    colorAnalyst: 'Kayte Christensen',
    sidelineReporter: 'Morgan Ragan',
    radio: 'Sactown Sports 1140 (Gary Gerould)',
  },
  DAL: {
    networkName: 'KFAA 29 / WFAA',
    playByPlay: 'Mark Followill',
    colorAnalyst: 'Derek Harper & Devin Harris',
    sidelineReporter: 'Jeff "Skin" Wade',
    radio: '97.1 The Freak (Chuck Cooperstein)',
  },
  HOU: {
    networkName: 'Space City Home Network',
    playByPlay: 'Craig Ackerman',
    colorAnalyst: 'Ryan Hollins',
    sidelineReporter: 'Vanessa Richardson',
    radio: 'SportsTalk 790 (Matt Thomas)',
  },
  MEM: {
    networkName: 'FanDuel Sports Network SE',
    playByPlay: 'Pete Pranica',
    colorAnalyst: 'Brevin Knight',
    sidelineReporter: 'Rob Fischer',
    radio: '92.9 ESPN Memphis (Eric Hasseltine)',
  },
  NOP: {
    networkName: 'Gulf Coast Sports Network',
    playByPlay: 'Joel Meyers',
    colorAnalyst: 'Antonio Daniels',
    sidelineReporter: 'Jen Hale',
    radio: 'WRNO 99.5 FM (Todd Graffagnini)',
  },
  SAS: {
    networkName: 'FanDuel Sports Network SW',
    playByPlay: 'Dan Weiss / Jacob Tobey',
    colorAnalyst: 'Sean Elliott & Matt Bonner',
    sidelineReporter: 'Michelle Beadle',
    radio: 'WOAI 1200 AM (Bill Schoening)',
  },
}

// Well-known veteran NBA referee roster for official assignments
export const NOTABLE_OFFICIALS: Array<{ name: string; role: string }> = [
  { name: 'Scott Foster', role: 'Crew Chief (#48)' },
  { name: 'Tony Brothers', role: 'Crew Chief (#25)' },
  { name: 'Zach Zarba', role: 'Crew Chief (#15)' },
  { name: 'Marc Davis', role: 'Crew Chief (#8)' },
  { name: 'James Capers', role: 'Crew Chief (#19)' },
  { name: 'Ed Malloy', role: 'Crew Chief (#14)' },
  { name: 'Courtney Kirkland', role: 'Referee (#61)' },
  { name: 'Josh Tiven', role: 'Referee (#58)' },
  { name: 'Bill Kennedy', role: 'Referee (#55)' },
  { name: 'David Guthrie', role: 'Referee (#16)' },
  { name: 'Ben Taylor', role: 'Referee (#46)' },
  { name: 'Kevin Scott', role: 'Referee (#24)' },
  { name: 'Curtis Blair', role: 'Umpire (#74)' },
  { name: 'Mitchell Ervin', role: 'Umpire (#27)' },
  { name: 'Gediminas Petraitis', role: 'Umpire (#50)' },
  { name: 'Aaron Smith', role: 'Umpire (#51)' },
  { name: 'Phenizee Ransom', role: 'Umpire (#70)' },
  { name: 'Natalie Sago', role: 'Umpire (#9)' },
]

/**
 * Resolves the broadcast network, announcing crew, and officiating crew for an NBA competition.
 */
export function resolveAnnouncingCrew(
  competition?: Partial<NBACompetition> | null,
  homeTeamAbbr: unknown = '',
  awayTeamAbbr: unknown = ''
): NBAAnnouncingCrew {
  const broadcasts = Array.isArray(competition?.broadcasts) ? competition.broadcasts : []
  const rawNetwork = typeof broadcasts[0]?.names?.[0] === 'string' && broadcasts[0].names[0].trim()
    ? broadcasts[0].names[0].trim()
    : 'NBA League Pass'
  const netUpper = rawNetwork.toUpperCase()

  const safeHome = typeof homeTeamAbbr === 'string' ? homeTeamAbbr.trim().toUpperCase() : ''
  const safeAway = typeof awayTeamAbbr === 'string' ? awayTeamAbbr.trim().toUpperCase() : ''

  // Match National Crew
  for (const [key, crews] of Object.entries(NATIONAL_CREWS)) {
    if (netUpper.includes(key) && crews.length > 0) {
      const selected = crews[0]
      return {
        network: selected.networkName,
        market: 'National',
        playByPlay: selected.playByPlay,
        colorAnalyst: selected.colorAnalyst,
        sidelineReporter: selected.sidelineReporter,
        radioNetwork: selected.radio,
        officials: extractOfficials(competition?.officials, safeHome),
      }
    }
  }

  // Match Home Team Local RSN Crew
  if (safeHome && Object.prototype.hasOwnProperty.call(TEAM_LOCAL_CREWS, safeHome)) {
    const homeCrew = TEAM_LOCAL_CREWS[safeHome]
    if (homeCrew) {
      return {
        network: rawNetwork !== 'NBA League Pass' ? rawNetwork : homeCrew.networkName,
        market: 'Home Regional',
        playByPlay: homeCrew.playByPlay,
        colorAnalyst: homeCrew.colorAnalyst,
        sidelineReporter: homeCrew.sidelineReporter,
        radioNetwork: homeCrew.radio,
        officials: extractOfficials(competition?.officials, safeHome),
      }
    }
  }

  // Match Away Team Crew Fallback
  if (safeAway && Object.prototype.hasOwnProperty.call(TEAM_LOCAL_CREWS, safeAway)) {
    const awayCrew = TEAM_LOCAL_CREWS[safeAway]
    if (awayCrew) {
      return {
        network: rawNetwork !== 'NBA League Pass' ? rawNetwork : awayCrew.networkName,
        market: 'Away Regional',
        playByPlay: awayCrew.playByPlay,
        colorAnalyst: awayCrew.colorAnalyst,
        sidelineReporter: awayCrew.sidelineReporter,
        radioNetwork: awayCrew.radio,
        officials: extractOfficials(competition?.officials, safeHome),
      }
    }
  }

  // Default Standard Crew
  return {
    network: rawNetwork,
    market: 'Regional / League Pass',
    playByPlay: 'Broadcast Team',
    colorAnalyst: 'Color Commentary',
    sidelineReporter: 'Sideline Desk',
    radioNetwork: 'Team Radio Network',
    officials: extractOfficials(competition?.officials, safeHome),
  }
}

function extractOfficials(
  officials?: NBAOfficial[] | null,
  seedKey: unknown = 'NBA'
): Array<{ name: string; role: string }> {
  if (Array.isArray(officials) && officials.length > 0) {
    return officials.map((off, idx) => ({
      name: (typeof off?.displayName === 'string' && off.displayName) ||
            (typeof off?.fullName === 'string' && off.fullName) ||
            `Official #${idx + 1}`,
      role: idx === 0 ? 'Crew Chief' : idx === 1 ? 'Referee' : 'Umpire',
    }))
  }

  // Stable pseudo-hash based on seed string
  const str = typeof seedKey === 'string' && seedKey.trim() ? seedKey.trim() : 'NBA'
  const hash = Math.abs(str.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0))

  const chiefIdx = hash % 5
  const refIdx = 5 + (hash % 6)
  const umpireIdx = 11 + (hash % 6)

  const chief = NOTABLE_OFFICIALS[chiefIdx] || NOTABLE_OFFICIALS[0]
  const ref = NOTABLE_OFFICIALS[refIdx] || NOTABLE_OFFICIALS[5]
  const umpire = NOTABLE_OFFICIALS[umpireIdx] || NOTABLE_OFFICIALS[11]

  return [chief, ref, umpire]
}
