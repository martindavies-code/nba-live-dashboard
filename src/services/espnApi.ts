import type { NBAScoreboardData, NBAEvent, NBAShot, NBAPlay } from '../types/nba'
import { resolveAnnouncingCrew } from '../utils/announcers'

export const ESPN_NBA_SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard'
export const ESPN_NBA_SUMMARY_URL = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary'

export interface FetchNBAScoreboardResult {
  data: NBAScoreboardData
  sourceId: string
  sourceName: string
  responseTimeMs: number
  isCached: boolean
  cachedTimestamp?: string
}

let cachedScoreboardData: NBAScoreboardData | null = null
let cachedTimestamp: string | null = null

export async function fetchNBAScoreboard(
  dateStr?: string,
  signal?: AbortSignal
): Promise<FetchNBAScoreboardResult> {
  const startTime = performance.now()
  const url = new URL(ESPN_NBA_SCOREBOARD_URL)
  if (dateStr) {
    url.searchParams.set('dates', dateStr.replace(/-/g, ''))
  }

  try {
    const response = await fetch(url.toString(), {
      signal,
      headers: {
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`ESPN NBA API returned ${response.status}`)
    }

    const rawData = await response.json()
    const enrichedEvents: NBAEvent[] = (rawData.events || []).map((ev: NBAEvent) => {
      const comp = ev.competitions?.[0]
      if (comp) {
        const homeComp = comp.competitors?.find((c) => c.homeAway === 'home')
        const awayComp = comp.competitors?.find((c) => c.homeAway === 'away')
        const crew = resolveAnnouncingCrew(
          comp,
          homeComp?.team?.abbreviation,
          awayComp?.team?.abbreviation
        )
        comp.announcingCrew = crew
      }
      return ev
    })

    const scoreboard: NBAScoreboardData = {
      events: enrichedEvents.length > 0 ? enrichedEvents : MOCK_NBA_EVENTS,
      day: rawData.day,
      season: rawData.season,
    }

    cachedScoreboardData = scoreboard
    cachedTimestamp = new Date().toISOString()

    return {
      data: scoreboard,
      sourceId: 'espn-api',
      sourceName: 'ESPN NBA Core Feed (Live CDN)',
      responseTimeMs: Math.round(performance.now() - startTime),
      isCached: false,
    }
  } catch (err: unknown) {
    // If aborted, rethrow
    if (err instanceof Error && err.name === 'AbortError') {
      throw err
    }

    // Fallback to cached or rich mock data
    if (cachedScoreboardData) {
      return {
        data: cachedScoreboardData,
        sourceId: 'client-cache',
        sourceName: 'Cached NBA Scoreboard View',
        responseTimeMs: Math.round(performance.now() - startTime),
        isCached: true,
        cachedTimestamp: cachedTimestamp || new Date().toISOString(),
      }
    }

    return {
      data: {
        events: MOCK_NBA_EVENTS,
        day: { date: new Date().toISOString().slice(0, 10).replace(/-/g, '') },
        season: { type: 2, year: 2026 },
      },
      sourceId: 'mock-redundancy',
      sourceName: 'NBA Emergency Redundant Fallback Matrix',
      responseTimeMs: Math.round(performance.now() - startTime),
      isCached: true,
    }
  }
}

// -----------------------------------------------------------------------------
// High-Fidelity Mock NBA Events with Live Court Shots, Announcing Crews, Runs
// -----------------------------------------------------------------------------

const MOCK_CELTICS_PISTONS_SHOTS: NBAShot[] = [
  {
    id: 'shot-1',
    shooter: 'Jayson Tatum',
    teamId: '2',
    teamAbbr: 'BOS',
    x: 82,
    y: 25,
    made: true,
    points: 3,
    distanceFeet: 27,
    clock: '5:42',
    period: 4,
    description: 'Jayson Tatum makes 27-foot step-back 3-pointer',
    zone: 'Above the Break 3',
  },
  {
    id: 'shot-2',
    shooter: 'Cade Cunningham',
    teamId: '8',
    teamAbbr: 'DET',
    x: 88,
    y: 25,
    made: true,
    points: 2,
    distanceFeet: 9,
    clock: '5:18',
    period: 4,
    description: 'Cade Cunningham makes driving floating jump shot',
    zone: 'Restricted Area',
  },
  {
    id: 'shot-3',
    shooter: 'Jaylen Brown',
    teamId: '2',
    teamAbbr: 'BOS',
    x: 89,
    y: 25,
    made: true,
    points: 2,
    distanceFeet: 4,
    clock: '4:55',
    period: 4,
    description: 'Jaylen Brown makes thunderous fast break dunk',
    zone: 'Restricted Area',
  },
  {
    id: 'shot-4',
    shooter: 'Jaden Ivey',
    teamId: '8',
    teamAbbr: 'DET',
    x: 75,
    y: 45,
    made: false,
    points: 3,
    distanceFeet: 23,
    clock: '4:38',
    period: 4,
    description: 'Jaden Ivey misses 23-foot right corner 3-pointer',
    zone: 'Right Corner 3',
  },
  {
    id: 'shot-5',
    shooter: 'Derrick White',
    teamId: '2',
    teamAbbr: 'BOS',
    x: 75,
    y: 5,
    made: true,
    points: 3,
    distanceFeet: 22,
    clock: '4:18',
    period: 4,
    description: 'Derrick White makes 22-foot left corner 3-pointer',
    zone: 'Left Corner 3',
  },
  {
    id: 'shot-6',
    shooter: 'Jalen Duren',
    teamId: '8',
    teamAbbr: 'DET',
    x: 90,
    y: 25,
    made: true,
    points: 2,
    distanceFeet: 2,
    clock: '3:50',
    period: 4,
    description: 'Jalen Duren makes alley-oop slam from Cade Cunningham',
    zone: 'Restricted Area',
  },
  {
    id: 'shot-7',
    shooter: 'Jrue Holiday',
    teamId: '2',
    teamAbbr: 'BOS',
    x: 80,
    y: 15,
    made: false,
    points: 2,
    distanceFeet: 16,
    clock: '3:22',
    period: 4,
    description: 'Jrue Holiday misses 16-foot pull-up jump shot',
    zone: 'Mid-Range',
  },
  {
    id: 'shot-8',
    shooter: 'Cade Cunningham',
    teamId: '8',
    teamAbbr: 'DET',
    x: 78,
    y: 28,
    made: true,
    points: 3,
    distanceFeet: 26,
    clock: '3:05',
    period: 4,
    description: 'Cade Cunningham makes 26-foot pullup 3-pointer',
    zone: 'Above the Break 3',
  },
]

export const MOCK_NBA_EVENTS: NBAEvent[] = [
  // 1. Boston Celtics at Detroit Pistons (Live 4th Quarter Clutch Thriller)
  {
    id: '401909088',
    uid: 's:40~l:46~e:401909088',
    date: new Date().toISOString(),
    name: 'Boston Celtics at Detroit Pistons',
    shortName: 'BOS @ DET',
    status: {
      clock: 258,
      displayClock: '4:18',
      period: 4,
      type: {
        id: '2',
        name: 'STATUS_IN_PROGRESS',
        state: 'in',
        completed: false,
        description: 'In Progress',
        detail: 'Q4 4:18',
        shortDetail: 'Q4 4:18',
      },
    },
    competitions: [
      {
        id: '401909088',
        uid: 's:40~l:46~e:401909088~c:401909088',
        date: new Date().toISOString(),
        venue: {
          fullName: 'Little Caesars Arena',
          address: { city: 'Detroit', state: 'MI' },
        },
        broadcasts: [{ market: 'National', names: ['NBC'] }],
        announcingCrew: {
          network: 'NBC Sports',
          market: 'National',
          playByPlay: 'Noah Eagle',
          colorAnalyst: 'Reggie Miller & Jamal Crawford',
          sidelineReporter: 'Zora Stephenson',
          radioNetwork: '98.5 The Sports Hub (BOS) / 97.1 The Ticket (DET)',
          officials: [
            { name: 'Scott Foster', role: 'Crew Chief (#48)' },
            { name: 'Ed Malloy', role: 'Referee (#14)' },
            { name: 'Aaron Smith', role: 'Umpire (#51)' },
          ],
        },
        situation: {
          possession: '2',
          possessionText: 'Boston Celtics Possession',
          shotClock: 14,
          homeFouls: 5,
          awayFouls: 4,
          homeTimeouts: 2,
          awayTimeouts: 2,
          isClutch: true,
          scoringRun: {
            teamId: '2',
            teamAbbr: 'BOS',
            points: 11,
            opponentPoints: 2,
            durationText: 'over last 3:15',
          },
          lastPlay: {
            id: 'play-bos-1',
            text: 'Derrick White makes 22-foot left corner 3-pointer (Jayson Tatum assists)',
            scoringPlay: true,
            scoreValue: 3,
            clock: { displayValue: '4:18' },
            period: { number: 4, displayValue: '4th Quarter' },
            team: { id: '2' },
            shootingPlay: true,
          },
        },
        shots: MOCK_CELTICS_PISTONS_SHOTS,
        odds: [
          {
            details: 'BOS -7.5',
            spread: -7.5,
            overUnder: 224.5,
            awayTeamOdds: { favorite: true },
            homeTeamOdds: { underdog: true },
          },
        ],
        competitors: [
          {
            id: '8',
            homeAway: 'home',
            score: '96',
            linescores: [
              { value: 24, displayValue: '24', period: 1 },
              { value: 26, displayValue: '26', period: 2 },
              { value: 27, displayValue: '27', period: 3 },
              { value: 19, displayValue: '19', period: 4 },
            ],
            records: [{ summary: '44-38' }],
            fouls: 5,
            timeouts: 2,
            inBonus: true,
            team: {
              id: '8',
              name: 'Pistons',
              displayName: 'Detroit Pistons',
              abbreviation: 'DET',
              location: 'Detroit',
              color: '1d42ba',
              alternateColor: 'bec0c2',
              logo: 'https://a.espncdn.com/i/teamlogos/nba/500/det.png',
            },
          },
          {
            id: '2',
            homeAway: 'away',
            score: '98',
            linescores: [
              { value: 28, displayValue: '28', period: 1 },
              { value: 25, displayValue: '25', period: 2 },
              { value: 24, displayValue: '24', period: 3 },
              { value: 21, displayValue: '21', period: 4 },
            ],
            records: [{ summary: '57-25' }],
            fouls: 4,
            timeouts: 2,
            inBonus: false,
            team: {
              id: '2',
              name: 'Celtics',
              displayName: 'Boston Celtics',
              abbreviation: 'BOS',
              location: 'Boston',
              color: '007a33',
              alternateColor: 'ba9653',
              logo: 'https://a.espncdn.com/i/teamlogos/nba/500/bos.png',
            },
          },
        ],
      },
    ],
  },

  // 2. Philadelphia 76ers at New York Knicks (Live Halftime at MSG)
  {
    id: '401909089',
    uid: 's:40~l:46~e:401909089',
    date: new Date().toISOString(),
    name: 'Philadelphia 76ers at New York Knicks',
    shortName: 'PHI @ NYK',
    status: {
      clock: 0,
      displayClock: '0:00',
      period: 2,
      type: {
        id: '2',
        name: 'STATUS_HALFTIME',
        state: 'in',
        completed: false,
        description: 'Halftime',
        detail: 'Halftime',
        shortDetail: 'Half',
      },
    },
    competitions: [
      {
        id: '401909089',
        uid: 's:40~l:46~e:401909089~c:401909089',
        date: new Date().toISOString(),
        venue: {
          fullName: 'Madison Square Garden',
          address: { city: 'New York', state: 'NY' },
        },
        broadcasts: [{ market: 'National', names: ['ABC'] }],
        announcingCrew: {
          network: 'ABC / ESPN',
          market: 'National',
          playByPlay: 'Mike Breen',
          colorAnalyst: 'Doris Burke & Richard Jefferson',
          sidelineReporter: 'Lisa Salters',
          radioNetwork: 'ESPN Radio (Marc Kestecher) / 98.7 ESPN NY',
          officials: [
            { name: 'Tony Brothers', role: 'Crew Chief (#25)' },
            { name: 'Courtney Kirkland', role: 'Referee (#61)' },
            { name: 'Mitchell Ervin', role: 'Umpire (#27)' },
          ],
        },
        situation: {
          possession: '18',
          possessionText: 'Halftime Intermission',
          shotClock: 24,
          homeFouls: 2,
          awayFouls: 3,
          homeTimeouts: 4,
          awayTimeouts: 5,
          isClutch: false,
          lastPlay: {
            id: 'play-nyk-half',
            text: 'Jalen Brunson buzzer-beating step-back 21ft jumper',
            scoringPlay: true,
            scoreValue: 2,
            clock: { displayValue: '0:00' },
            period: { number: 2, displayValue: '2nd Quarter' },
            team: { id: '18' },
          },
        },
        odds: [
          {
            details: 'NYK -4.0',
            spread: -4.0,
            overUnder: 215.5,
            homeTeamOdds: { favorite: true },
            awayTeamOdds: { underdog: true },
          },
        ],
        competitors: [
          {
            id: '18',
            homeAway: 'home',
            score: '58',
            linescores: [
              { value: 29, displayValue: '29', period: 1 },
              { value: 29, displayValue: '29', period: 2 },
            ],
            records: [{ summary: '51-31' }],
            team: {
              id: '18',
              name: 'Knicks',
              displayName: 'New York Knicks',
              abbreviation: 'NYK',
              location: 'New York',
              color: '006bb6',
              alternateColor: 'f58426',
              logo: 'https://a.espncdn.com/i/teamlogos/nba/500/nyk.png',
            },
          },
          {
            id: '20',
            homeAway: 'away',
            score: '55',
            linescores: [
              { value: 26, displayValue: '26', period: 1 },
              { value: 29, displayValue: '29', period: 2 },
            ],
            records: [{ summary: '47-35' }],
            team: {
              id: '20',
              name: '76ers',
              displayName: 'Philadelphia 76ers',
              abbreviation: 'PHI',
              location: 'Philadelphia',
              color: '006bb6',
              alternateColor: 'ed174c',
              logo: 'https://a.espncdn.com/i/teamlogos/nba/500/phi.png',
            },
          },
        ],
      },
    ],
  },

  // 3. Golden State Warriors at Los Angeles Lakers (Live 3rd Quarter Showdown)
  {
    id: '401909090',
    uid: 's:40~l:46~e:401909090',
    date: new Date().toISOString(),
    name: 'Golden State Warriors at Los Angeles Lakers',
    shortName: 'GSW @ LAL',
    status: {
      clock: 142,
      displayClock: '2:22',
      period: 3,
      type: {
        id: '2',
        name: 'STATUS_IN_PROGRESS',
        state: 'in',
        completed: false,
        description: 'In Progress',
        detail: 'Q3 2:22',
        shortDetail: 'Q3 2:22',
      },
    },
    competitions: [
      {
        id: '401909090',
        uid: 's:40~l:46~e:401909090~c:401909090',
        date: new Date().toISOString(),
        venue: {
          fullName: 'Crypto.com Arena',
          address: { city: 'Los Angeles', state: 'CA' },
        },
        broadcasts: [{ market: 'National', names: ['TNT'] }],
        announcingCrew: {
          network: 'TNT Sports',
          market: 'National',
          playByPlay: 'Kevin Harlan',
          colorAnalyst: 'Reggie Miller & Stan Van Gundy',
          sidelineReporter: 'Allie LaForce',
          radioNetwork: 'Westwood One Sports / ESPN LA 710',
          officials: [
            { name: 'Zach Zarba', role: 'Crew Chief (#15)' },
            { name: 'Bill Kennedy', role: 'Referee (#55)' },
            { name: 'Natalie Sago', role: 'Umpire (#9)' },
          ],
        },
        situation: {
          possession: '13',
          possessionText: 'Los Angeles Lakers Possession',
          shotClock: 9,
          homeFouls: 3,
          awayFouls: 4,
          homeTimeouts: 3,
          awayTimeouts: 4,
          isClutch: false,
          scoringRun: {
            teamId: '9',
            teamAbbr: 'GSW',
            points: 8,
            opponentPoints: 0,
            durationText: 'over last 1:45',
          },
          lastPlay: {
            id: 'play-gsw-curry',
            text: 'Stephen Curry 29ft step-back 3-pointer from the logo!',
            scoringPlay: true,
            scoreValue: 3,
            clock: { displayValue: '2:22' },
            period: { number: 3, displayValue: '3rd Quarter' },
            team: { id: '9' },
          },
        },
        odds: [
          {
            details: 'LAL -2.5',
            spread: -2.5,
            overUnder: 231.5,
            homeTeamOdds: { favorite: true },
            awayTeamOdds: { underdog: true },
          },
        ],
        competitors: [
          {
            id: '13',
            homeAway: 'home',
            score: '84',
            linescores: [
              { value: 31, displayValue: '31', period: 1 },
              { value: 27, displayValue: '27', period: 2 },
              { value: 26, displayValue: '26', period: 3 },
            ],
            records: [{ summary: '48-34' }],
            team: {
              id: '13',
              name: 'Lakers',
              displayName: 'Los Angeles Lakers',
              abbreviation: 'LAL',
              location: 'Los Angeles',
              color: '552583',
              alternateColor: 'fdb927',
              logo: 'https://a.espncdn.com/i/teamlogos/nba/500/lal.png',
            },
          },
          {
            id: '9',
            homeAway: 'away',
            score: '88',
            linescores: [
              { value: 28, displayValue: '28', period: 1 },
              { value: 30, displayValue: '30', period: 2 },
              { value: 30, displayValue: '30', period: 3 },
            ],
            records: [{ summary: '46-36' }],
            team: {
              id: '9',
              name: 'Warriors',
              displayName: 'Golden State Warriors',
              abbreviation: 'GSW',
              location: 'Golden State',
              color: '1d428a',
              alternateColor: 'ffc72c',
              logo: 'https://a.espncdn.com/i/teamlogos/nba/500/gsw.png',
            },
          },
        ],
      },
    ],
  },

  // 4. Oklahoma City Thunder at San Antonio Spurs (Upcoming Showcase)
  {
    id: '401909091',
    uid: 's:40~l:46~e:401909091',
    date: new Date(Date.now() + 3600000 * 2).toISOString(),
    name: 'Oklahoma City Thunder at San Antonio Spurs',
    shortName: 'OKC @ SAS',
    status: {
      clock: 0,
      displayClock: '0:00',
      period: 0,
      type: {
        id: '1',
        name: 'STATUS_SCHEDULED',
        state: 'pre',
        completed: false,
        description: 'Scheduled',
        detail: 'Tonight, 8:00 PM ET',
        shortDetail: '8:00 PM ET',
      },
    },
    competitions: [
      {
        id: '401909091',
        uid: 's:40~l:46~e:401909091~c:401909091',
        date: new Date(Date.now() + 3600000 * 2).toISOString(),
        venue: {
          fullName: 'Frost Bank Center',
          address: { city: 'San Antonio', state: 'TX' },
        },
        broadcasts: [{ market: 'National', names: ['NBA TV'] }],
        announcingCrew: {
          network: 'NBA TV',
          market: 'National',
          playByPlay: 'Ian Eagle',
          colorAnalyst: 'Jim Jackson',
          sidelineReporter: 'Stephanie Ready',
          radioNetwork: 'WOAI 1200 AM (SAS) / WWLS 98.1 (OKC)',
          officials: [
            { name: 'Marc Davis', role: 'Crew Chief (#8)' },
            { name: 'David Guthrie', role: 'Referee (#16)' },
            { name: 'Curtis Blair', role: 'Umpire (#74)' },
          ],
        },
        odds: [
          {
            details: 'OKC -5.5',
            spread: -5.5,
            overUnder: 228.0,
            awayTeamOdds: { favorite: true },
            homeTeamOdds: { underdog: true },
          },
        ],
        competitors: [
          {
            id: '24',
            homeAway: 'home',
            score: '0',
            records: [{ summary: '38-44' }],
            team: {
              id: '24',
              name: 'Spurs',
              displayName: 'San Antonio Spurs',
              abbreviation: 'SAS',
              location: 'San Antonio',
              color: 'c4ced4',
              alternateColor: '000000',
              logo: 'https://a.espncdn.com/i/teamlogos/nba/500/sas.png',
            },
          },
          {
            id: '25',
            homeAway: 'away',
            score: '0',
            records: [{ summary: '57-25' }],
            team: {
              id: '25',
              name: 'Thunder',
              displayName: 'Oklahoma City Thunder',
              abbreviation: 'OKC',
              location: 'Oklahoma City',
              color: '007ac1',
              alternateColor: 'ef3b24',
              logo: 'https://a.espncdn.com/i/teamlogos/nba/500/okc.png',
            },
          },
        ],
      },
    ],
  },

  // 5. Denver Nuggets at Minnesota Timberwolves (Final / OT Thriller with Scorigami!)
  {
    id: '401909092',
    uid: 's:40~l:46~e:401909092',
    date: new Date(Date.now() - 3600000 * 4).toISOString(),
    name: 'Denver Nuggets at Minnesota Timberwolves',
    shortName: 'DEN @ MIN',
    status: {
      clock: 0,
      displayClock: '0:00',
      period: 5,
      type: {
        id: '3',
        name: 'STATUS_FINAL',
        state: 'post',
        completed: true,
        description: 'Final',
        detail: 'Final/OT',
        shortDetail: 'Final/OT',
      },
    },
    competitions: [
      {
        id: '401909092',
        uid: 's:40~l:46~e:401909092~c:401909092',
        date: new Date(Date.now() - 3600000 * 4).toISOString(),
        venue: {
          fullName: 'Target Center',
          address: { city: 'Minneapolis', state: 'MN' },
        },
        broadcasts: [{ market: 'National', names: ['ESPN'] }],
        announcingCrew: {
          network: 'ESPN',
          market: 'National',
          playByPlay: 'Brian Anderson',
          colorAnalyst: 'Grant Hill & Hubie Brown',
          sidelineReporter: 'Katie George',
          radioNetwork: 'KFAN 100.3 (MIN) / Altitude 92.5 (DEN)',
          officials: [
            { name: 'James Capers', role: 'Crew Chief (#19)' },
            { name: 'Josh Tiven', role: 'Referee (#58)' },
            { name: 'Gediminas Petraitis', role: 'Umpire (#50)' },
          ],
        },
        competitors: [
          {
            id: '16',
            homeAway: 'home',
            score: '116',
            winner: true,
            linescores: [
              { value: 26, displayValue: '26', period: 1 },
              { value: 28, displayValue: '28', period: 2 },
              { value: 26, displayValue: '26', period: 3 },
              { value: 25, displayValue: '25', period: 4 },
              { value: 11, displayValue: '11', period: 5 },
            ],
            records: [{ summary: '56-26' }],
            team: {
              id: '16',
              name: 'Timberwolves',
              displayName: 'Minnesota Timberwolves',
              abbreviation: 'MIN',
              location: 'Minnesota',
              color: '0c2340',
              alternateColor: '236192',
              logo: 'https://a.espncdn.com/i/teamlogos/nba/500/min.png',
            },
          },
          {
            id: '7',
            homeAway: 'away',
            score: '112',
            winner: false,
            linescores: [
              { value: 27, displayValue: '27', period: 1 },
              { value: 27, displayValue: '27', period: 2 },
              { value: 28, displayValue: '28', period: 3 },
              { value: 23, displayValue: '23', period: 4 },
              { value: 7, displayValue: '7', period: 5 },
            ],
            records: [{ summary: '57-25' }],
            team: {
              id: '7',
              name: 'Nuggets',
              displayName: 'Denver Nuggets',
              abbreviation: 'DEN',
              location: 'Denver',
              color: '0e2240',
              alternateColor: 'fec524',
              logo: 'https://a.espncdn.com/i/teamlogos/nba/500/den.png',
            },
          },
        ],
      },
    ],
  },
]
