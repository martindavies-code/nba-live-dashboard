import test from 'node:test'
import assert from 'node:assert/strict'
import {
  extractHeadshotUrl,
  extractRecordSummary,
  extractStatLeaders,
  extractTeamComparisonRows,
  computeShootingZones,
} from './matchupStats.ts'

test('extractHeadshotUrl handles string, object, and malicious URL inputs safely', () => {
  assert.equal(
    extractHeadshotUrl('https://a.espncdn.com/i/headshots/nba/players/full/1966.png'),
    'https://a.espncdn.com/i/headshots/nba/players/full/1966.png'
  )
  assert.equal(
    extractHeadshotUrl({ href: 'https://a.espncdn.com/i/headshots/nba/players/full/3945274.png', alt: 'Luka' }),
    'https://a.espncdn.com/i/headshots/nba/players/full/3945274.png'
  )
  assert.equal(extractHeadshotUrl('javascript:alert(1)'), '')
  assert.equal(extractHeadshotUrl({ href: 'data:text/html,<svg onload=alert(1)>' }), '')
  assert.equal(extractHeadshotUrl(null), '')
})

test('extractRecordSummary parses overall, home/road splits, streak, and lastTen', () => {
  const comp = {
    id: '5',
    homeAway: 'home',
    score: '0',
    team: { id: '5', name: 'Cavaliers', displayName: 'Cleveland Cavaliers', abbreviation: 'CLE', color: '860038', logo: '' },
    records: [
      { name: 'overall', type: 'total', summary: '14-1' },
      { name: 'Home', type: 'home', summary: '8-0' },
      { name: 'Road', type: 'road', summary: '6-1' },
    ],
  }
  const summary = {
    teamId: '5',
    abbreviation: 'CLE',
    homeAway: 'home',
    leaders: [],
    stats: { streak: 'W6', lastTen: '9-1' },
    topPlayers: [],
    injuries: [],
    lastFiveGames: [],
  }

  assert.deepEqual(extractRecordSummary(comp, summary), {
    overall: '14-1',
    home: '8-0',
    road: '6-1',
    streak: 'W6',
    lastTen: '9-1',
  })

  assert.deepEqual(extractRecordSummary(undefined, null), {
    overall: '0-0',
    home: undefined,
    road: undefined,
    streak: undefined,
    lastTen: undefined,
  })
})

test('extractStatLeaders enriches pre-game leaders with injury alerts and rating lines', () => {
  const awayComp = {
    id: '29',
    homeAway: 'away',
    score: '0',
    team: { id: '29', name: 'Grizzlies', displayName: 'Memphis Grizzlies', abbreviation: 'MEM', color: '5d76a9', logo: '' },
    leaders: [
      {
        name: 'pointsPerGame',
        displayName: 'Points Per Game',
        leaders: [
          {
            displayValue: '19.8',
            value: 19.8,
            athlete: {
              id: '4278',
              fullName: 'Ty Jerome',
              displayName: 'Ty Jerome',
              shortName: 'T. Jerome',
              headshot: 'https://a.espncdn.com/i/headshots/nba/players/full/4278.png',
              jersey: '2',
              position: { abbreviation: 'PG' },
            },
          },
        ],
      },
      {
        name: 'reboundsPerGame',
        displayName: 'Rebounds Per Game',
        leaders: [
          {
            displayValue: '9.2',
            value: 9.2,
            athlete: {
              id: '4066',
              fullName: 'Jaren Jackson Jr.',
              displayName: 'Jaren Jackson Jr.',
              shortName: 'J. Jackson Jr.',
              jersey: '13',
              position: { abbreviation: 'PF' },
            },
          },
        ],
      },
      {
        name: 'rating',
        displayName: 'Rating',
        leaders: [
          {
            displayValue: '19.8 PPG, 3.1 RPG, 5.4 APG',
            value: 25,
            athlete: {
              id: '4278',
              fullName: 'Ty Jerome',
              displayName: 'Ty Jerome',
              shortName: 'T. Jerome',
            },
          },
        ],
      },
    ],
  }

  const teamSummary = {
    teamId: '29',
    abbreviation: 'MEM',
    homeAway: 'away',
    leaders: [],
    stats: {},
    topPlayers: [],
    injuries: [
      { playerName: 'Ty Jerome', position: 'PG', status: 'Out', detail: 'Knee' },
    ],
    lastFiveGames: [],
  }

  const leaders = extractStatLeaders(awayComp, teamSummary, 'pre')
  assert.equal(leaders.length, 2)
  assert.equal(leaders[0].category, 'PTS')
  assert.equal(leaders[0].primaryValue, '19.8')
  assert.equal(leaders[0].primaryUnit, 'PPG')
  assert.equal(leaders[0].injuryStatus, 'Out')
  assert.equal(leaders[0].injuryDetail, 'Knee')
  assert.equal(leaders[0].subline, '19.8 PPG, 3.1 RPG, 5.4 APG')
  assert.equal(leaders[1].category, 'REB')
  assert.equal(leaders[1].subline, 'Pos: PF')
})

test('extractStatLeaders attaches game box score lines in post-game mode', () => {
  const homeComp = {
    id: '16',
    homeAway: 'home',
    score: '119',
    team: { id: '16', name: 'Timberwolves', displayName: 'Minnesota Timberwolves', abbreviation: 'MIN', color: '0c2340', logo: '' },
    leaders: [
      {
        name: 'points',
        displayName: 'Points',
        leaders: [
          {
            displayValue: '34',
            value: 34,
            athlete: {
              id: '4594268',
              fullName: 'Anthony Edwards',
              displayName: 'Anthony Edwards',
              shortName: 'A. Edwards',
              headshot: { href: 'https://a.espncdn.com/i/headshots/nba/players/full/4594268.png' },
            },
          },
        ],
      },
    ],
  }

  const teamSummary = {
    teamId: '16',
    abbreviation: 'MIN',
    homeAway: 'home',
    leaders: [],
    stats: {},
    topPlayers: [
      {
        id: '4594268',
        name: 'Anthony Edwards',
        shortName: 'A. Edwards',
        min: '38',
        pts: 34,
        reb: 6,
        ast: 5,
        fg: '12-23',
        threePt: '5-11',
        ft: '5-6',
        stl: 2,
        blk: 1,
        tov: 2,
        plusMinus: '+11',
      },
    ],
    injuries: [],
    lastFiveGames: [],
  }

  const leaders = extractStatLeaders(homeComp, teamSummary, 'post')
  assert.equal(leaders.length, 1)
  assert.equal(leaders[0].primaryValue, '34')
  assert.equal(leaders[0].primaryUnit, 'PTS')
  assert.equal(leaders[0].subline, '12-23 FG • 5-11 3PT • 6 REB • 5 AST')
  assert.equal(
    leaders[0].headshot,
    'https://a.espncdn.com/i/headshots/nba/players/full/4594268.png'
  )
})

test('extractTeamComparisonRows respects lowerIsBetter for defense/turnovers and computes splits/highlights', () => {
  const awayComp = {
    id: '2',
    homeAway: 'away',
    score: '0',
    team: { id: '2', name: 'Celtics', displayName: 'Boston Celtics', abbreviation: 'BOS', color: '007a33', logo: '' },
    statistics: [
      { name: 'avgPoints', displayValue: '120.4' },
      { name: 'points', displayValue: '120.4', rankDisplayValue: '2nd' },
      { name: 'fieldGoalPct', displayValue: '48.2', rankDisplayValue: '5th' },
    ],
  }
  const homeComp = {
    id: '5',
    homeAway: 'home',
    score: '0',
    team: { id: '5', name: 'Cavaliers', displayName: 'Cleveland Cavaliers', abbreviation: 'CLE', color: '860038', logo: '' },
    statistics: [
      { name: 'avgPoints', displayValue: '118.0' },
      { name: 'points', displayValue: '118.0', rankDisplayValue: '4th' },
      { name: 'fieldGoalPct', displayValue: '49.5', rankDisplayValue: '1st' },
    ],
  }
  const awaySummary = {
    teamId: '2',
    abbreviation: 'BOS',
    homeAway: 'away',
    leaders: [],
    stats: { avgPointsAgainst: '108.4', avgTurnovers: '11.2' },
    topPlayers: [],
    injuries: [],
    lastFiveGames: [],
  }
  const homeSummary = {
    teamId: '5',
    abbreviation: 'CLE',
    homeAway: 'home',
    leaders: [],
    stats: { avgPointsAgainst: '112.6', avgTurnovers: '13.5' },
    topPlayers: [],
    injuries: [],
    lastFiveGames: [],
  }

  const pre = extractTeamComparisonRows(awayComp, homeComp, awaySummary, homeSummary, 'pre')
  const ppgRow = pre.rows.find((r) => r.key === 'ppg')
  const oppRow = pre.rows.find((r) => r.key === 'oppPpg')
  const fgRow = pre.rows.find((r) => r.key === 'fgPct')
  const tovRow = pre.rows.find((r) => r.key === 'tov')

  assert.equal(ppgRow?.leaderSide, 'away')
  assert.equal(ppgRow?.awayRank, '2nd')
  assert.equal(oppRow?.leaderSide, 'away') // 108.4 < 112.6 is better defense
  assert.equal(oppRow?.lowerIsBetter, true)
  assert.equal(fgRow?.leaderSide, 'home')
  assert.equal(tovRow?.leaderSide, 'away') // Fewer turnovers is better
  assert.equal((ppgRow?.awaySharePct ?? 0) + (ppgRow?.homeSharePct ?? 0), 100)

  // Post-game highlights
  const postAway = {
    ...awaySummary,
    stats: {
      fgMadeAttempted: '42-84',
      fieldGoalPct: '50.0',
      pointsInPaint: '54',
      fastBreakPoints: '18',
      turnoverPoints: '21',
      largestLead: '14',
    },
  }
  const postHome = {
    ...homeSummary,
    stats: {
      fgMadeAttempted: '38-85',
      fieldGoalPct: '44.7',
      pointsInPaint: '46',
      fastBreakPoints: '22',
      turnoverPoints: '14',
      largestLead: '6',
    },
  }

  const post = extractTeamComparisonRows(awayComp, homeComp, postAway, postHome, 'post')
  assert.equal(post.rows.find((r) => r.key === 'fg')?.awayDisplay, '42-84 (50%)')
  assert.equal(post.highlights.find((h) => h.key === 'paint')?.leaderSide, 'away')
  assert.equal(post.highlights.find((h) => h.key === 'fastBreak')?.leaderSide, 'home')
  assert.equal(post.highlights.length, 4)
})

test('computeShootingZones dynamically aggregates paint, mid-range, corner 3, and above-the-break 3', () => {
  const empty = computeShootingZones([])
  assert.equal(empty.paint.pct, '--')
  assert.equal(empty.corner3.pct, '--')

  const shots = [
    { id: '1', x: 85, y: 25, made: true, points: 2, shooter: 'A', teamId: '1', teamAbbr: 'BOS', distanceFeet: 2, clock: '10:00', period: 1, description: '', zone: 'Restricted Area' },
    { id: '2', x: 80, y: 24, made: false, points: 2, shooter: 'B', teamId: '1', teamAbbr: 'BOS', distanceFeet: 7, clock: '9:00', period: 1, description: '', zone: 'In The Paint (Non-RA)' },
    { id: '3', x: 87, y: 4, made: true, points: 3, shooter: 'C', teamId: '1', teamAbbr: 'BOS', distanceFeet: 23, clock: '8:00', period: 1, description: '', zone: 'Left Corner 3' },
    { id: '4', x: 64, y: 25, made: false, points: 3, shooter: 'D', teamId: '1', teamAbbr: 'BOS', distanceFeet: 26, clock: '7:00', period: 1, description: '', zone: 'Above the Break 3' },
    { id: '5', x: 70, y: 20, made: true, points: 2, shooter: 'E', teamId: '1', teamAbbr: 'BOS', distanceFeet: 16, clock: '6:00', period: 1, description: '', zone: 'Mid-Range' },
  ]

  const zones = computeShootingZones(shots)
  assert.deepEqual(zones.paint, { made: 1, total: 2, pct: '50%' })
  assert.deepEqual(zones.corner3, { made: 1, total: 1, pct: '100%' })
  assert.deepEqual(zones.aboveBreak3, { made: 0, total: 1, pct: '0%' })
  assert.deepEqual(zones.midRange, { made: 1, total: 1, pct: '100%' })
})
