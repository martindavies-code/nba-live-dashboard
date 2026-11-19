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
    overall: null,
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
  assert.equal(ppgRow?.awayRank, undefined, 'Rank from points total must not be attached to avgPoints row')
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
      pointsConcededOffTurnovers: '14',
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
      pointsConcededOffTurnovers: '21',
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

test('P1 Regression: MIN @ MIA (401909091) rejects mismatched OKC/SAS summary and prevents mixed-source percentages in data and rendered UI', async () => {
  const minComp = {
    id: '16',
    homeAway: 'away',
    score: '131',
    team: { id: '16', name: 'Timberwolves', displayName: 'Minnesota Timberwolves', abbreviation: 'MIN', color: '0c2340', logo: '' },
    statistics: [
      { name: 'fieldGoalsMade', displayValue: '46' },
      { name: 'fieldGoalsAttempted', displayValue: '98' },
      { name: 'fieldGoalPct', displayValue: '46.9' },
      { name: 'threePointFieldGoalsMade', displayValue: '21' },
      { name: 'threePointFieldGoalsAttempted', displayValue: '50' },
      { name: 'threePointFieldGoalPct', displayValue: '42.0' },
      { name: 'freeThrowsMade', displayValue: '18' },
      { name: 'freeThrowsAttempted', displayValue: '29' },
      { name: 'freeThrowPct', displayValue: '62.1' },
    ],
  }
  const miaComp = {
    id: '14',
    homeAway: 'home',
    score: '106',
    team: { id: '14', name: 'Heat', displayName: 'Miami Heat', abbreviation: 'MIA', color: '98002e', logo: '' },
    statistics: [
      { name: 'fieldGoalsMade', displayValue: '38' },
      { name: 'fieldGoalsAttempted', displayValue: '86' },
      { name: 'fieldGoalPct', displayValue: '44.2' },
      { name: 'threePointFieldGoalsMade', displayValue: '12' },
      { name: 'threePointFieldGoalsAttempted', displayValue: '35' },
      { name: 'threePointFieldGoalPct', displayValue: '34.3' },
      { name: 'freeThrowsMade', displayValue: '18' },
      { name: 'freeThrowsAttempted', displayValue: '24' },
      { name: 'freeThrowPct', displayValue: '75.0' },
    ],
  }

  // Fabricated OKC / SAS summary that previously polluted 401909091
  const mismatchedOkcSummary = {
    teamId: '25',
    abbreviation: 'OKC',
    homeAway: 'away',
    leaders: [],
    stats: {
      fieldGoalPct: '49.1',
      threePointPct: '38.4',
      freeThrowPct: '81.9',
    },
    topPlayers: [
      { id: 'sga', name: 'Shai Gilgeous-Alexander', shortName: 'S. Gilgeous-Alexander', min: '35', pts: 31, reb: 5, ast: 6, fg: '11-20', threePt: '2-5', ft: '7-8', stl: 2, blk: 1, tov: 2, plusMinus: '+14' },
    ],
    injuries: [{ playerName: 'Alex Caruso', position: 'SG', status: 'Questionable', detail: 'Hip' }],
    lastFiveGames: [],
  }
  const mismatchedSasSummary = {
    teamId: '24',
    abbreviation: 'SAS',
    homeAway: 'home',
    leaders: [],
    stats: {
      fieldGoalPct: '46.8',
      threePointPct: '35.2',
      freeThrowPct: '78.4',
    },
    topPlayers: [],
    injuries: [],
    lastFiveGames: [],
  }

  const comparison = extractTeamComparisonRows(minComp, miaComp, mismatchedOkcSummary, mismatchedSasSummary, 'post')
  const fgRow = comparison.rows.find((r) => r.key === 'fg')
  const threeRow = comparison.rows.find((r) => r.key === 'threePt')
  const ftRow = comparison.rows.find((r) => r.key === 'ft')

  assert.equal(fgRow?.awayDisplay, '46-98 (46.9%)', 'MIN FG must not combine 46-98 with OKC 49.1%')
  assert.equal(threeRow?.awayDisplay, '21-50 (42%)', 'MIN 3PT must not combine 21-50 with OKC 38.4%')
  assert.equal(ftRow?.awayDisplay, '18-29 (62.1%)', 'MIN FT must not combine 18-29 with OKC 81.9%')

  // Render <CourtMatchupIntel /> to verify mixed-team data cannot appear in the DOM
  const { createServer } = await import('vite')
  const React = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })
  try {
    const { CourtMatchupIntel } = await vite.ssrLoadModule('/src/components/CourtMatchupIntel.tsx')
    const html = renderToStaticMarkup(
      React.createElement(CourtMatchupIntel, {
        gameState: 'post',
        awayComp: minComp,
        homeComp: miaComp,
        summary: {
          eventId: '401909091',
          gameState: 'post',
          awayTeam: mismatchedOkcSummary,
          homeTeam: mismatchedSasSummary,
          shots: [],
          Officials: [],
        },
      })
    )
    assert.equal(html.includes('46-98 (49.1%)'), false, 'Rendered board must not contain mixed-source 46-98 (49.1%)')
    assert.equal(html.includes('21-50 (38.4%)'), false, 'Rendered board must not contain mixed-source 21-50 (38.4%)')
    assert.equal(html.includes('18-29 (81.9%)'), false, 'Rendered board must not contain mixed-source 18-29 (81.9%)')
    assert.equal(html.includes('Shai Gilgeous-Alexander'), false, 'Rendered board must not display OKC box-score players for MIN @ MIA')
    assert.equal(html.includes('46-98 (46.9%)'), true, 'Rendered board must display authentic MIN 46-98 (46.9%)')
  } finally {
    await vite.close()
  }
})

test('P1 Regression: ESPN 401910002 (NY @ TOR) Points Conceded Off Turnovers emphasizes TOR (11 conceded) over NY (22 conceded) and separates Total vs Player Turnovers', async () => {
  const { parseSummaryPayload } = await import('../services/espnApi.ts')

  const nyComp = {
    id: '18',
    homeAway: 'away',
    score: '111',
    team: { id: '18', name: 'Knicks', displayName: 'New York Knicks', abbreviation: 'NY', color: '006bb6', logo: '' },
  }
  const torComp = {
    id: '28',
    homeAway: 'home',
    score: '102',
    team: { id: '28', name: 'Raptors', displayName: 'Toronto Raptors', abbreviation: 'TOR', color: 'ce1141', logo: '' },
  }

  const realShapedNyTorPayload = {
    header: {
      competitions: [
        {
          competitors: [
            { homeAway: 'away', team: { id: '18', abbreviation: 'NY' } },
            { homeAway: 'home', team: { id: '28', abbreviation: 'TOR' } },
          ],
        },
      ],
    },
    boxscore: {
      teams: [
        {
          homeAway: 'away',
          team: { id: '18', abbreviation: 'NY' },
          statistics: [
            { name: 'fieldGoalsMade-fieldGoalsAttempted', displayValue: '41-86' },
            { name: 'fieldGoalPct', displayValue: '47.7' },
            { name: 'pointsInPaint', displayValue: '48', label: 'Points in Paint' },
            { name: 'fastBreakPoints', displayValue: '15', label: 'Fast Break Points' },
            { name: 'turnovers', displayValue: '12', label: 'Turnovers', abbreviation: 'TO' },
            { name: 'teamTurnovers', displayValue: '1', label: 'Team Turnovers', abbreviation: 'TTO' },
            { name: 'totalTurnovers', displayValue: '13', label: 'Total Turnovers', abbreviation: 'ToTO' },
            { name: 'turnoverPoints', displayValue: '22', label: 'Points Conceded Off Turnovers', abbreviation: 'Points Conceded Off Turnovers' },
          ],
        },
        {
          homeAway: 'home',
          team: { id: '28', abbreviation: 'TOR' },
          statistics: [
            { name: 'fieldGoalsMade-fieldGoalsAttempted', displayValue: '39-89' },
            { name: 'fieldGoalPct', displayValue: '43.8' },
            { name: 'pointsInPaint', displayValue: '52', label: 'Points in Paint' },
            { name: 'fastBreakPoints', displayValue: '19', label: 'Fast Break Points' },
            { name: 'turnovers', displayValue: '5', label: 'Turnovers', abbreviation: 'TO' },
            { name: 'teamTurnovers', displayValue: '1', label: 'Team Turnovers', abbreviation: 'TTO' },
            { name: 'totalTurnovers', displayValue: '6', label: 'Total Turnovers', abbreviation: 'ToTO' },
            { name: 'turnoverPoints', displayValue: '11', label: 'Points Conceded Off Turnovers', abbreviation: 'Points Conceded Off Turnovers' },
          ],
        },
      ],
    },
  }

  const summary = parseSummaryPayload('401910002', realShapedNyTorPayload, 'post')
  assert.ok(summary)
  const post = extractTeamComparisonRows(nyComp, torComp, summary.awayTeam, summary.homeTeam, 'post')

  // Turnover points highlight must emphasize TOR ('home') because NY conceded 22 pts off turnovers while TOR conceded only 11
  const tovPtsHighlight = post.highlights.find(
    (h) => h.key === 'ptsConcededOffTov' || h.key === 'ptsOffTov' || h.key === 'turnoverPoints'
  )
  assert.ok(tovPtsHighlight, 'Turnover points highlight must exist')
  assert.equal(tovPtsHighlight.leaderSide, 'home', 'TOR (home) must be emphasized as better when NY conceded 22 pts off turnovers vs TOR 11')
  assert.match(tovPtsHighlight.label, /Conceded|Scored/i, 'Label must explicitly clarify whether points off turnovers are conceded or scored')

  // Turnovers row must use Total Turnovers (13 vs 6) and label it clearly
  const tovRow = post.rows.find((r) => r.key === 'tov')
  assert.ok(tovRow)
  assert.equal(tovRow.label, 'Total Turnovers')
  assert.equal(tovRow.awayDisplay, '13')
  assert.equal(tovRow.homeDisplay, '6')
  assert.equal(tovRow.leaderSide, 'home')

  // Verify rendered board
  const { createServer } = await import('vite')
  const React = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })
  try {
    const { CourtMatchupIntel } = await vite.ssrLoadModule('/src/components/CourtMatchupIntel.tsx')
    const html = renderToStaticMarkup(
      React.createElement(CourtMatchupIntel, {
        gameState: 'post',
        awayComp: nyComp,
        homeComp: torComp,
        summary,
      })
    )
    assert.equal(html.includes('Total Turnovers'), true, 'Rendered board must show Total Turnovers')
    assert.equal(html.includes('Pts Conceded Off TOV'), true, 'Rendered board must clearly label Pts Conceded Off TOV')
  } finally {
    await vite.close()
  }
})

test('P2 Regression: Missing, placeholder, and malformed values stay null and are never coerced to 0 or declared better', async () => {
  const awayComp = {
    id: '2',
    homeAway: 'away',
    score: '0',
    team: { id: '2', name: 'Celtics', displayName: 'Boston Celtics', abbreviation: 'BOS', color: '007a33', logo: '' },
    statistics: [],
  }
  const homeComp = {
    id: '5',
    homeAway: 'home',
    score: '0',
    team: { id: '5', name: 'Cavaliers', displayName: 'Cleveland Cavaliers', abbreviation: 'CLE', color: '860038', logo: '' },
    statistics: [],
  }

  // 1. Pre-game reproduction: awaySummary.stats.avgTurnovers = '12', homeSummary.stats = {}
  const awayPre = {
    teamId: '2',
    abbreviation: 'BOS',
    homeAway: 'away',
    leaders: [],
    stats: { avgTurnovers: '12', avgPointsAgainst: '--' },
    topPlayers: [],
    injuries: [],
    lastFiveGames: [],
  }
  const homePre = {
    teamId: '5',
    abbreviation: 'CLE',
    homeAway: 'home',
    leaders: [],
    stats: { avgPointsAgainst: 'N/A' },
    topPlayers: [],
    injuries: [],
    lastFiveGames: [],
  }

  const pre = extractTeamComparisonRows(awayComp, homeComp, awayPre, homePre, 'pre')
  const tovRow = pre.rows.find((r) => r.key === 'tov')
  assert.ok(tovRow, 'Turnovers row should exist when one team has data')
  assert.equal(tovRow.awayValue, 12)
  assert.equal(tovRow.homeValue, null, 'Missing home turnovers must be null, not 0')
  assert.equal(tovRow.homeDisplay, '—')
  assert.equal(tovRow.leaderSide, 'none', 'Missing side must NEVER be declared better on lower-is-better stats')
  assert.equal(tovRow.awaySharePct, null)
  assert.equal(tovRow.homeSharePct, null)

  // Both absent / placeholder ('--' and 'N/A') must not produce a comparison row
  assert.equal(pre.rows.find((r) => r.key === 'oppPpg'), undefined)

  // 2. Post-game highlight with one side missing must show '—' instead of literal '0'
  const awayPostPartial = {
    ...awayPre,
    stats: { pointsInPaint: '52', fastBreakPoints: '0', largestLead: '12-34' },
  }
  const homePostPartial = {
    ...homePre,
    stats: { fastBreakPoints: '14' },
  }
  const postPartial = extractTeamComparisonRows(awayComp, homeComp, awayPostPartial, homePostPartial, 'post')
  const paintH = postPartial.highlights.find((h) => h.key === 'paint')
  assert.ok(paintH)
  assert.equal(paintH.awayDisplay, '52')
  assert.equal(paintH.homeDisplay, '—', 'Absent opposing highlight value must be — and not literal 0')
  assert.equal(paintH.leaderSide, 'none')

  // Explicit genuine 0 is preserved and compared properly
  const fbH = postPartial.highlights.find((h) => h.key === 'fastBreak')
  assert.ok(fbH)
  assert.equal(fbH.awayValue, 0)
  assert.equal(fbH.awayDisplay, '0')
  assert.equal(fbH.homeValue, 14)
  assert.equal(fbH.leaderSide, 'home')

  // Malformed hyphenated string '12-34' on largestLead must be rejected as null, not stripped into 1234
  assert.equal(postPartial.highlights.find((h) => h.key === 'largestLead'), undefined)

  // Explicit '0-0' record is preserved while missing record is null
  const zeroRecordComp = {
    ...awayComp,
    records: [{ name: 'overall', type: 'total', summary: '0-0' }],
  }
  assert.equal(extractRecordSummary(zeroRecordComp, null).overall, '0-0')
  assert.equal(extractRecordSummary(awayComp, null).overall, null)

  // Verify rendered <CourtDiagram /> with empty shots does not render 0% (0/0)
  const { createServer } = await import('vite')
  const React = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })
  try {
    const { CourtDiagram } = await vite.ssrLoadModule('/src/components/CourtDiagram.tsx')
    const emptyCourtHtml = renderToStaticMarkup(
      React.createElement(CourtDiagram, {
        eventId: 'test-empty-shots',
        competitors: [awayComp, homeComp],
        shots: [],
        gameState: 'in',
        summary: null,
      })
    )
    assert.equal(emptyCourtHtml.includes('0% (0/0)'), false, 'CourtDiagram must not render 0% (0/0) when no shots are available')
    assert.equal(emptyCourtHtml.includes('Tracked Shots: —'), true, 'CourtDiagram must render honest Tracked Shots: — when no shots are available')
  } finally {
    await vite.close()
  }
})

test('P2 Regression: Rank pills are omitted when attached to season totals (points/assists) instead of per-game averages or lacking verified scope (MEM @ CLE 401910007)', () => {
  const memComp = {
    id: '29',
    homeAway: 'away',
    score: '0',
    team: { id: '29', name: 'Grizzlies', displayName: 'Memphis Grizzlies', abbreviation: 'MEM', color: '5d76a9', logo: '' },
    statistics: [
      { name: 'points', displayValue: '1704', rankDisplayValue: '6th' },
      { name: 'avgPoints', displayValue: '121.7' },
      { name: 'assists', displayValue: '404', rankDisplayValue: '3rd' },
      { name: 'avgAssists', displayValue: '28.9' },
      { name: 'threePointPct', displayValue: '36.7', rankDisplayValue: '1st' },
    ],
  }
  const cleComp = {
    id: '5',
    homeAway: 'home',
    score: '0',
    team: { id: '5', name: 'Cavaliers', displayName: 'Cleveland Cavaliers', abbreviation: 'CLE', color: '860038', logo: '' },
    statistics: [
      { name: 'points', displayValue: '1771', rankDisplayValue: '1st' },
      { name: 'avgPoints', displayValue: '118.1' },
      { name: 'assists', displayValue: '412', rankDisplayValue: '1st' },
      { name: 'avgAssists', displayValue: '27.5' },
      { name: 'threePointPct', displayValue: '39.5', rankDisplayValue: '1st' },
    ],
  }

  const comparison = extractTeamComparisonRows(memComp, cleComp, undefined, undefined, 'pre')
  const ppgRow = comparison.rows.find((r) => r.key === 'ppg')
  const apgRow = comparison.rows.find((r) => r.key === 'apg')
  const threePtRow = comparison.rows.find((r) => r.key === 'threePct')

  assert.ok(ppgRow && apgRow && threePtRow, 'PPG, APG, and 3PT% rows must all be present')
  assert.equal(ppgRow?.awayDisplay, '121.7')
  assert.equal(ppgRow?.homeDisplay, '118.1')
  assert.equal(ppgRow?.awayRank, undefined, 'MEM 121.7 PPG must not inherit #6th rank from 1704 total points')
  assert.equal(ppgRow?.homeRank, undefined, 'CLE 118.1 PPG must not inherit #1st rank from 1771 total points')
  assert.equal(apgRow?.awayRank, undefined, 'MEM 28.9 APG must not inherit #3rd rank from 404 total assists')
  assert.equal(apgRow?.homeRank, undefined, 'CLE 27.5 APG must not inherit #1st rank from 412 total assists')
  assert.equal(threePtRow?.awayRank, undefined, 'Unverified/contradictory #1st rank on both teams must be omitted')
  assert.equal(threePtRow?.homeRank, undefined)
})

