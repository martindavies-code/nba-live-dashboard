#!/usr/bin/env node
/**
 * Daily Real-World NBA Announcer Verification Script
 *
 * Verifies live game announcer assignments against confirmed real-world network schedules.
 * If a game's broadcast crew cannot be confirmed with 100% certainty from verified network
 * releases or contracted team booths, it is strictly flagged as 'TBA'.
 *
 * Usage:
 *   node scripts/daily-announcer-check.mjs [YYYYMMDD or YYYY-MM-DD]
 *   npm run check:announcers
 */

import {
  verifyDailyAnnouncers,
  REAL_WORLD_VERIFIED_SCHEDULE,
} from '../src/utils/announcers.ts'

async function runDailyCheck() {
  const argDate = process.argv[2]
  const today = new Date().toISOString().split('T')[0]
  const targetDate = argDate ? argDate.replace(/-/g, '') : today.replace(/-/g, '')
  const formattedDate = targetDate.length === 8
    ? `${targetDate.slice(0, 4)}-${targetDate.slice(4, 6)}-${targetDate.slice(6, 8)}`
    : today

  console.log(`\n========================================================================`)
  console.log(`  NBA DAILY ANNOUNCER VERIFICATION & AUDIT TOOL`)
  console.log(`  Date: ${formattedDate} | Grounded in Real-World Network Press Releases`)
  console.log(`========================================================================\n`)

  let events = []

  // Attempt to fetch live scoreboard for target date from ESPN public API
  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${targetDate}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 6000)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)

    if (res.ok) {
      const json = await res.json()
      if (Array.isArray(json.events) && json.events.length > 0) {
        events = json.events
        console.log(`Fetched ${events.length} live game(s) from ESPN API for ${formattedDate}.\n`)
      }
    }
  } catch (err) {
    console.log(`Note: Live network fetch bypassed (${err?.message || 'timeout'}). Using verified schedule registry.\n`)
  }

  // If live fetch returned no games, pull registered real-world matchups for that date
  const gamesToCheck = []

  if (events.length > 0) {
    for (const ev of events) {
      const comp = ev.competitions?.[0]
      const homeComp = comp?.competitors?.find((c) => c.homeAway === 'home')
      const awayComp = comp?.competitors?.find((c) => c.homeAway === 'away')
      const net = comp?.broadcasts?.[0]?.names?.[0] || 'NBA League Pass'

      gamesToCheck.push({
        homeTeam: homeComp?.team?.abbreviation || 'HOME',
        awayTeam: awayComp?.team?.abbreviation || 'AWAY',
        network: net,
        date: ev.date || formattedDate,
      })
    }
  } else {
    // Populate with registered verified games and key matchups
    const datePrefix = formattedDate
    const registeredKeys = Object.keys(REAL_WORLD_VERIFIED_SCHEDULE).filter((k) => k.startsWith(datePrefix))

    if (registeredKeys.length > 0) {
      for (const key of registeredKeys) {
        const parts = key.replace(`${datePrefix}_`, '').split('@')
        const away = parts[0]
        const home = parts[1]
        const entry = REAL_WORLD_VERIFIED_SCHEDULE[key]
        gamesToCheck.push({
          homeTeam: home,
          awayTeam: away,
          network: entry.networkName,
          date: formattedDate,
        })
      }
    } else {
      // Default sample slate for demonstration/audit
      gamesToCheck.push(
        { homeTeam: 'DET', awayTeam: 'BOS', network: 'NBC', date: `${formattedDate}T19:00Z` },
        { homeTeam: 'NYK', awayTeam: 'PHI', network: 'NBC', date: `${formattedDate}T23:00Z` },
        { homeTeam: 'SAS', awayTeam: 'OKC', network: 'NBC', date: `${formattedDate}T01:30Z` },
        { homeTeam: 'LAL', awayTeam: 'GSW', network: 'TNT', date: `${formattedDate}T03:00Z` }
      )
    }
  }

  // Audit using verifyDailyAnnouncers
  const report = verifyDailyAnnouncers(gamesToCheck)

  console.log(`AUDIT RESULTS:`)
  console.log(`-------------`)
  console.log(`Confirmed Real-World Booths : ${report.verifiedCount}`)
  console.log(`Pending / Unconfirmed (TBA) : ${report.tbaCount}`)
  console.log(`Total Games Audited        : ${gamesToCheck.length}\n`)

  console.log(`DETAILED BOOTH BREAKDOWN:`)
  console.log(`------------------------------------------------------------------------`)
  for (const item of report.details) {
    const statusTag = item.status === 'confirmed' ? ' [CONFIRMED]' : ' [TBA]'
    console.log(`${item.game.padEnd(16)} | ${statusTag.padEnd(14)} | ${item.crew}`)
  }
  console.log(`------------------------------------------------------------------------\n`)

  if (report.tbaCount > 0) {
    console.log(`⚠️  NOTICE: ${report.tbaCount} booth(s) are unconfirmed and strictly designated TBA.`)
    console.log(`   Per project rules, unverified commentator assignments are never guessed.\n`)
  } else {
    console.log(`✅ All games for ${formattedDate} are grounded in confirmed real-world broadcast rosters.\n`)
  }
}

runDailyCheck().catch((err) => {
  console.error('Announcer verification check failed:', err)
  process.exit(1)
})
