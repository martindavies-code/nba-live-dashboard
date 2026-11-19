import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

test('CSS design system provides responsive utility classes and prevents horizontal overflow', () => {
  const cssPath = path.resolve(__dirname, '../index.css')
  const cssContent = fs.readFileSync(cssPath, 'utf-8')

  // Verify no-scrollbar utilities are present for touch & mobile swipe
  assert.match(cssContent, /\.no-scrollbar::-webkit-scrollbar\s*\{[^}]*display:\s*none/)
  assert.match(cssContent, /\.no-scrollbar\s*\{[^}]*scrollbar-width:\s*none/)
})

test('Dashboard component enforces responsive grid breakpoints and mobile-friendly header flow', () => {
  const dashboardPath = path.resolve(__dirname, 'Dashboard.tsx')
  const dashboardCode = fs.readFileSync(dashboardPath, 'utf-8')

  // Matchups grid must scale from 1 col on mobile to 2 on tablet to 3 on desktop
  assert.match(dashboardCode, /grid-cols-1\s+md:grid-cols-2\s+xl:grid-cols-3/)

  // Header controls must order cleanly on mobile vs desktop
  assert.match(dashboardCode, /order-3\s+lg:order-2/)
  assert.match(dashboardCode, /order-2\s+lg:order-3/)

  // Filter bar must use smooth horizontal scroll with no-scrollbar
  assert.match(dashboardCode, /overflow-x-auto\s+no-scrollbar\s+scroll-smooth/)

  // Section title and helper subtitle must wrap cleanly on mobile
  assert.match(dashboardCode, /flex\s+flex-col\s+sm:flex-row\s+sm:items-baseline/)
})

test('HeroMatchup component protects against text collision and responsive stacking', () => {
  const heroPath = path.resolve(__dirname, 'HeroMatchup.tsx')
  const heroCode = fs.readFileSync(heroPath, 'utf-8')

  // Hero grid must stack cleanly on mobile/tablet and split on desktop
  assert.match(heroCode, /grid-cols-1\s+lg:grid-cols-12/)

  // Team names must be truncated and scores shrink-0 to prevent collision on narrow mobile
  assert.match(heroCode, /truncate[\s\S]*?\{awayComp\?\.team\?\.displayName/)
  assert.match(heroCode, /tabular-nums\s+shrink-0[^>]*>[\s\S]*?\{awayComp\?\.score/)
  assert.match(heroCode, /tabular-nums\s+shrink-0[^>]*>[\s\S]*?\{homeComp\?\.score/)

  // Action pills must wrap cleanly
  assert.match(heroCode, /flex\s+flex-wrap\s+items-center\s+gap-2/)
})

test('WinProbabilityBar component guarantees percentage labels are never crushed by odds text', () => {
  const winProbPath = path.resolve(__dirname, 'WinProbabilityBar.tsx')
  const winProbCode = fs.readFileSync(winProbPath, 'utf-8')

  // Percentage blocks must be shrink-0 so they never collapse
  assert.match(winProbCode, /shrink-0[\s\S]*?calculatedAwayPct/)
  assert.match(winProbCode, /shrink-0[\s\S]*?calculatedHomePct/)

  // Odds details must truncate gracefully on narrow viewports
  assert.match(winProbCode, /max-w-\[130px\]\s+sm:max-w-none/)
})

test('GameCard component formats badges concisely and bounds widths to prevent ellipsis collisions', () => {
  const cardPath = path.resolve(__dirname, 'GameCard.tsx')
  const cardCode = fs.readFileSync(cardPath, 'utf-8')

  // Scorigami label and announcer pill must share width with max-w percentages
  assert.match(cardCode, /max-w-\[55%\]/)
  assert.match(cardCode, /max-w-\[45%\]/)
  assert.match(cardCode, /No Scorigami \(\$\{scorigamiInfo\.currentOccurrences\}x\)/)
})

test('CourtDiagram momentum banner wraps scoring runs and clutch alerts without horizontal spill', () => {
  const courtPath = path.resolve(__dirname, 'CourtDiagram.tsx')
  const courtCode = fs.readFileSync(courtPath, 'utf-8')

  // Banner must wrap its children cleanly
  assert.match(courtCode, /flex\s+flex-wrap\s+items-center\s+gap-2\s+sm:gap-3\s+min-w-0/)
})

test('CourtMatchupIntel enforces 1-col mobile / 12-col desktop court grid and truncation guards', () => {
  const intelPath = path.resolve(__dirname, 'CourtMatchupIntel.tsx')
  const intelCode = fs.readFileSync(intelPath, 'utf-8')

  assert.match(intelCode, /grid-cols-1\s+lg:grid-cols-12/)
  assert.match(intelCode, /overflow-x-auto\s+no-scrollbar/)
  assert.match(intelCode, /truncate/)
})

let loggedBrowserExecutable = false

function isExecutableFile(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

function resolveBrowserExecutable(explicitOverride) {
  const override =
    explicitOverride ||
    process.env.CHROME_PATH ||
    process.env.CHROMIUM_PATH ||
    process.env.BROWSER_BIN

  if (override) {
    if (!isExecutableFile(override)) {
      throw new Error(
        `Browser executable override is not executable or does not exist: "${override}". ` +
          'Set CHROME_PATH, CHROMIUM_PATH, or BROWSER_BIN to a valid Chromium or Google Chrome binary.'
      )
    }
    return override
  }

  const standardCandidates = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/snap/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ]

  for (const candidate of standardCandidates) {
    if (isExecutableFile(candidate)) return candidate
  }

  const pathDirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean)
  const binNames = ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']
  for (const dir of pathDirs) {
    for (const bin of binNames) {
      const candidate = path.join(dir, bin)
      if (isExecutableFile(candidate)) return candidate
    }
  }

  throw new Error(
    `No Chromium/Chrome executable found. Checked standard paths (${standardCandidates.join(', ')}) and PATH. ` +
      'Install Chromium/Chrome or set CHROME_PATH, CHROMIUM_PATH, or BROWSER_BIN.'
  )
}

async function withHeadlessBrowser(fn, options = {}) {
  const executablePath = options.rawSpawnPath || resolveBrowserExecutable(options.browserPath)
  if (!options.rawSpawnPath && !loggedBrowserExecutable) {
    loggedBrowserExecutable = true
    console.log(`[responsiveLayout.test] Browser executable: ${executablePath}`)
  }

  const { createServer } = await import('vite')
  const { spawn } = await import('node:child_process')
  const os = await import('node:os')

  let vite = null
  let userDataDir = null
  let chromeProc = null
  let ws = null

  try {
    vite = await createServer({
      root: path.resolve(__dirname, '../..'),
      server: { port: 0, host: '127.0.0.1' },
      logLevel: 'silent',
      plugins: [
        {
          name: 'test-bridge',
          resolveId(id) {
            if (id === '/__test_bridge.ts') return id
          },
          load(id) {
            if (id === '/__test_bridge.ts') {
              return [
                "import React from 'react'",
                "import ReactDOMClient from 'react-dom/client'",
                "import { HeroMatchup } from '/src/components/HeroMatchup.tsx'",
                "import { clearSummaryCache } from '/src/services/espnApi.ts'",
                'export { React, ReactDOMClient, HeroMatchup, clearSummaryCache }',
              ].join('\n')
            }
          },
        },
      ],
    })
    await vite.listen()
    const appPort = vite.httpServer.address().port
    const baseUrl = `http://127.0.0.1:${appPort}`

    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nba-chrome-test-'))
    chromeProc = spawn(
      executablePath,
      [
        '--headless',
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--remote-debugging-port=0',
        `--user-data-dir=${userDataDir}`,
        'about:blank',
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] }
    )

    const wsBrowserUrl = await new Promise((resolve, reject) => {
      let settled = false
      const settle = (fnToCall, val) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        fnToCall(val)
      }
      const timeout = setTimeout(
        () => settle(reject, new Error(`Timed out waiting for browser DevTools endpoint (${executablePath})`)),
        10000
      )
      let stderrBuf = ''
      chromeProc.on('error', (err) => {
        settle(reject, new Error(`Failed to spawn browser executable "${executablePath}": ${err.message}`))
      })
      chromeProc.stderr.on('data', (chunk) => {
        stderrBuf += chunk.toString()
        const match = stderrBuf.match(/DevTools listening on (ws:\/\/[^\s]+)/)
        if (match) {
          settle(resolve, match[1])
        }
      })
      chromeProc.on('exit', (code) => {
        settle(reject, new Error(`Browser "${executablePath}" exited prematurely with code ${code}: ${stderrBuf}`))
      })
    })

    const cdpPort = new URL(wsBrowserUrl).port
    const listRes = await fetch(`http://127.0.0.1:${cdpPort}/json/list`)
    const targets = await listRes.json()
    const pageTarget = targets.find((t) => t.type === 'page')
    assert.ok(pageTarget, 'Headless browser must expose a debuggable page target')

    ws = new WebSocket(pageTarget.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      ws.onopen = resolve
      ws.onerror = (err) => reject(new Error(`CDP WebSocket error: ${err?.message || 'connection failed'}`))
    })

    let idCounter = 1
    function sendCommand(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = idCounter++
        const handler = (event) => {
          const msg = JSON.parse(event.data)
          if (msg.id === id) {
            ws.removeEventListener('message', handler)
            if (msg.error) reject(new Error(msg.error.message))
            else resolve(msg.result)
          }
        }
        ws.addEventListener('message', handler)
        ws.send(JSON.stringify({ id, method, params }))
      })
    }

    await sendCommand('Page.enable')
    await sendCommand('Runtime.enable')
    await fn({ baseUrl, sendCommand, executablePath })
  } finally {
    if (ws) {
      try {
        ws.close()
      } catch {
        // ignore close errors
      }
    }
    if (chromeProc && chromeProc.exitCode === null && !chromeProc.killed) {
      try {
        chromeProc.kill('SIGKILL')
      } catch {
        // ignore kill errors
      }
    }
    if (vite) {
      await vite.close()
    }
    if (userDataDir) {
      try {
        fs.rmSync(userDataDir, { recursive: true, force: true })
      } catch {
        // ignore temp cleanup errors
      }
    }
  }
}

test('Test runner portability: invalid browser executable rejects cleanly with actionable error and closes Vite without hanging', async () => {
  await assert.rejects(
    withHeadlessBrowser(async () => {}, { browserPath: '/nonexistent/path/to/chrome-binary' }),
    /Browser executable override is not executable or does not exist/
  )
  await assert.rejects(
    withHeadlessBrowser(async () => {}, { rawSpawnPath: '/nonexistent/path/to/chrome-binary' }),
    /Failed to spawn browser executable/
  )
})

test('P1 Regression: Mounted HeroMatchup handles StrictMode, rapid A/B/A switching, clears stale state on failed gameState transitions, and runs bounded TTL refresh', async () => {
  await withHeadlessBrowser(async ({ baseUrl, sendCommand }) => {
    await sendCommand('Page.navigate', { url: `${baseUrl}/` })
    await new Promise((r) => setTimeout(r, 800))

    const evalRes = await sendCommand('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async () => {
        const { React, ReactDOMClient, HeroMatchup, clearSummaryCache } = await import('/__test_bridge.ts')

        const host = document.createElement('div')
        document.body.innerHTML = ''
        document.body.appendChild(host)
        const root = ReactDOMClient.createRoot(host)

        const makeEvent = (id, state, awayAbbr = 'MEM', homeAbbr = 'CLE', awayId = '29', homeId = '5') => ({
          id,
          name: awayAbbr + ' at ' + homeAbbr,
          shortName: awayAbbr + ' @ ' + homeAbbr,
          date: '2026-11-18T00:00Z',
          status: {
            clock: 0,
            displayClock: '0:00',
            period: state === 'pre' ? 0 : 4,
            type: { id: '1', name: state, state, completed: state === 'post', description: state, detail: state, shortDetail: state },
          },
          competitions: [
            {
              id,
              date: '2026-11-18T00:00Z',
              status: {
                clock: 0,
                displayClock: '0:00',
                period: state === 'pre' ? 0 : 4,
                type: { id: '1', name: state, state, completed: state === 'post', description: state, detail: state, shortDetail: state },
              },
              competitors: [
                {
                  id: awayId,
                  homeAway: 'away',
                  score: state === 'pre' ? '0' : '112',
                  team: { id: awayId, name: awayAbbr, displayName: awayAbbr, abbreviation: awayAbbr, color: '5d76a9', logo: '' },
                },
                {
                  id: homeId,
                  homeAway: 'home',
                  score: state === 'pre' ? '0' : '108',
                  team: { id: homeId, name: homeAbbr, displayName: homeAbbr, abbreviation: homeAbbr, color: '860038', logo: '' },
                },
              ],
            },
          ],
        })

        // 1. StrictMode mount + Same-event pre -> post transition failure must NOT keep pre summary active
        clearSummaryCache()
        let shouldFailSummary = false
        let summaryFetchCount = 0
        let delayEventB = false
        let releaseEventB = null
        const origFetch = window.fetch
        window.fetch = async (url) => {
          const urlStr = String(url)
          if (urlStr.includes('summary?event=')) {
            const eventParam = new URL(urlStr).searchParams.get('event')
            summaryFetchCount++
            if (eventParam === 'hero-b' && delayEventB) {
              await new Promise((resolve) => {
                releaseEventB = resolve
              })
              return {
                ok: true,
                status: 200,
                json: async () => ({
                  header: {
                    competitions: [
                      {
                        competitors: [
                          { homeAway: 'away', team: { id: '2', abbreviation: 'BOS' } },
                          { homeAway: 'home', team: { id: '13', abbreviation: 'LAL' } },
                        ],
                      },
                    ],
                  },
                  seasonseries: [{ summary: 'STALE_EVENT_B_SHOULD_NOT_WIN' }],
                  boxscore: {
                    teams: [
                      { homeAway: 'away', team: { id: '2', abbreviation: 'BOS' }, statistics: [{ name: 'avgPointsAgainst', displayValue: '101.0' }] },
                      { homeAway: 'home', team: { id: '13', abbreviation: 'LAL' }, statistics: [{ name: 'avgPointsAgainst', displayValue: '102.0' }] },
                    ],
                  },
                }),
              }
            }
            if (shouldFailSummary) {
              return { ok: false, status: 500, json: async () => ({}) }
            }
            return {
              ok: true,
              status: 200,
              json: async () => ({
                header: {
                  competitions: [
                    {
                      competitors: [
                        { homeAway: 'away', team: { id: '29', abbreviation: 'MEM' } },
                        { homeAway: 'home', team: { id: '5', abbreviation: 'CLE' } },
                      ],
                    },
                  ],
                },
                seasonseries: [{ summary: 'PRE_SCOUTING_MARKER_' + summaryFetchCount }],
                boxscore: {
                  teams: [
                    {
                      homeAway: 'away',
                      team: { id: '29', abbreviation: 'MEM' },
                      statistics: [{ name: 'avgPointsAgainst', displayValue: '109.4' }],
                    },
                    {
                      homeAway: 'home',
                      team: { id: '5', abbreviation: 'CLE' },
                      statistics: [{ name: 'avgPointsAgainst', displayValue: '105.1' }],
                    },
                  ],
                },
              }),
            }
          }
          return origFetch(url)
        }

        const waitForCondition = async (predicate, timeoutMs = 2000) => {
          const start = Date.now()
          while (Date.now() - start < timeoutMs) {
            const val = predicate()
            if (val) return val
            await new Promise((r) => setTimeout(r, 25))
          }
          return predicate()
        }

        const eventA = makeEvent('hero-trans-1', 'pre')
        const eventB = makeEvent('hero-b', 'pre', 'BOS', 'LAL', '2', '13')

        root.render(
          React.createElement(
            React.StrictMode,
            null,
            React.createElement(HeroMatchup, {
              event: eventA,
              summaryRefreshIntervalMs: 220,
            })
          )
        )

        const initialMarkerNum = await waitForCondition(() => {
          const m = (host.textContent || '').match(/PRE_SCOUTING_MARKER_(\\d+)/)
          return m ? Number(m[1]) : 0
        })
        const hadPreMarker = initialMarkerNum >= 1

        // Wait for stationary TTL refresh timer (220ms) to fire without prop changes
        const refreshedMarkerNum = await waitForCondition(() => {
          const m = (host.textContent || '').match(/PRE_SCOUTING_MARKER_(\\d+)/)
          const num = m ? Number(m[1]) : 0
          return num > initialMarkerNum ? num : 0
        })
        const refreshedByTimer = refreshedMarkerNum > initialMarkerNum

        // Same-state refresh failure should keep same-state summary ONLY with visible stale provenance banner
        shouldFailSummary = true
        const showsStaleProvenance = Boolean(
          await waitForCondition(() => {
            const text = host.querySelector('[data-testid="summary-provenance-banner"]')?.textContent || ''
            return text.toLowerCase().includes('cached summary')
          })
        )

        // Rapid A -> B -> A switching where B resolves late must NOT overwrite A
        shouldFailSummary = false
        delayEventB = true
        root.render(
          React.createElement(
            React.StrictMode,
            null,
            React.createElement(HeroMatchup, { event: eventB, summaryRefreshIntervalMs: 60_000 })
          )
        )
        await waitForCondition(() => typeof releaseEventB === 'function', 1000)
        root.render(
          React.createElement(
            React.StrictMode,
            null,
            React.createElement(HeroMatchup, { event: eventA, summaryRefreshIntervalMs: 60_000 })
          )
        )
        await waitForCondition(() => (host.textContent || '').includes('PRE_SCOUTING_MARKER_'), 1000)
        if (typeof releaseEventB === 'function') releaseEventB()
        await new Promise((r) => setTimeout(r, 100))
        const afterSwitchText = host.textContent || ''
        const rapidSwitchKeptA =
          afterSwitchText.includes('PRE_SCOUTING_MARKER_') &&
          !afterSwitchText.includes('STALE_EVENT_B_SHOULD_NOT_WIN')

        // Now fail the network and transition the same event from 'pre' to 'post'
        shouldFailSummary = true
        root.render(
          React.createElement(
            React.StrictMode,
            null,
            React.createElement(HeroMatchup, {
              event: makeEvent('hero-trans-1', 'post'),
              summaryRefreshIntervalMs: 60_000,
            })
          )
        )
        await waitForCondition(() => (host.textContent || '').includes('Final Score'), 1000)
        await new Promise((r) => setTimeout(r, 150))
        const postFailedText = host.textContent || ''
        const leakedPreIntoPost = postFailedText.includes('PRE_SCOUTING_MARKER_') || postFailedText.includes('109.4')

        window.fetch = origFetch
        root.unmount()

        return {
          hadPreMarker,
          refreshedByTimer,
          showsStaleProvenance,
          rapidSwitchKeptA,
          summaryFetchCount,
          leakedPreIntoPost,
          initialMarkerNum,
          refreshedMarkerNum,
        }
      })()`,
    })

    const res = evalRes?.result?.value
    assert.ok(res, `HeroMatchup browser test must return results (evalRes=${JSON.stringify(evalRes)})`)
    assert.equal(res.hadPreMarker, true, `StrictMode mount must load and render initial pre-game summary (res=${JSON.stringify(res)})`)
    assert.equal(res.refreshedByTimer, true, `Stationary HeroMatchup selection must refresh summary when TTL elapses (res=${JSON.stringify(res)})`)
    assert.equal(res.showsStaleProvenance, true, `Failed same-state refresh must display explicit stale-cache provenance banner (res=${JSON.stringify(res)})`)
    assert.equal(res.rapidSwitchKeptA, true, `Rapid A -> B -> A switching must prevent late B payload from overwriting A (res=${JSON.stringify(res)})`)
    assert.equal(res.leakedPreIntoPost, false, `Failed pre->post transition must NOT keep presenting pre-game summary data as post-game stats (res=${JSON.stringify(res)})`)
  })
})

test('P2 Regression: Mobile 360px & 390px tab visibility, readable zone figures, and no-wrap box score cells with 157-shot post-game payload', async () => {
  await withHeadlessBrowser(async ({ baseUrl, sendCommand }) => {
    await sendCommand('Page.navigate', { url: `${baseUrl}/` })
    await new Promise((r) => setTimeout(r, 800))

    // Mount HeroMatchup with a realistic 157-shot post-game payload
    await sendCommand('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async () => {
        const { React, ReactDOMClient, HeroMatchup, clearSummaryCache } = await import('/__test_bridge.ts')

        clearSummaryCache()
        const shots157 = Array.from({ length: 157 }, (_, i) => ({
          id: 'shot-' + (i + 1),
          x: i % 2 === 0 ? 82 : 12,
          y: 10 + (i % 30),
          made: i % 3 !== 0,
          points: i % 4 === 0 ? 3 : 2,
          shooter: i % 2 === 0 ? 'Anthony Edwards' : 'Bam Adebayo',
          teamId: i % 2 === 0 ? '16' : '14',
          teamAbbr: i % 2 === 0 ? 'MIN' : 'MIA',
          distanceFeet: i % 4 === 0 ? 25 : 6,
          clock: '4:15',
          period: (i % 4) + 1,
          description: 'Jump shot',
          zone: i % 4 === 0 ? 'Above the Break 3' : i % 3 === 0 ? 'Left Corner 3' : i % 2 === 0 ? 'Restricted Area' : 'Mid-Range',
        }))

        const event = {
          id: 'mobile-audit-157',
          name: 'Minnesota Timberwolves at Miami Heat',
          shortName: 'MIN @ MIA',
          date: '2026-10-21T23:30Z',
          status: {
            clock: 0,
            displayClock: '0:00',
            period: 4,
            type: { id: '3', name: 'STATUS_FINAL', state: 'post', completed: true, description: 'Final', detail: 'Final', shortDetail: 'Final' },
          },
          competitions: [
            {
              id: 'mobile-audit-157',
              date: '2026-10-21T23:30Z',
              status: {
                clock: 0,
                displayClock: '0:00',
                period: 4,
                type: { id: '3', name: 'STATUS_FINAL', state: 'post', completed: true, description: 'Final', detail: 'Final', shortDetail: 'Final' },
              },
              competitors: [
                {
                  id: '16',
                  homeAway: 'away',
                  score: '131',
                  team: { id: '16', name: 'Timberwolves', displayName: 'Minnesota Timberwolves', abbreviation: 'MIN', color: '0c2340', logo: '' },
                  statistics: [
                    { name: 'fieldGoalsMade', displayValue: '46' },
                    { name: 'fieldGoalsAttempted', displayValue: '98' },
                    { name: 'fieldGoalPct', displayValue: '46.9' },
                  ],
                },
                {
                  id: '14',
                  homeAway: 'home',
                  score: '106',
                  team: { id: '14', name: 'Heat', displayName: 'Miami Heat', abbreviation: 'MIA', color: '98002e', logo: '' },
                  statistics: [
                    { name: 'fieldGoalsMade', displayValue: '38' },
                    { name: 'fieldGoalsAttempted', displayValue: '86' },
                    { name: 'fieldGoalPct', displayValue: '44.2' },
                  ],
                },
              ],
              shots: shots157,
            },
          ],
        }

        window.fetch = async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            header: {
              competitions: [
                {
                  competitors: [
                    { homeAway: 'away', team: { id: '16', abbreviation: 'MIN' } },
                    { homeAway: 'home', team: { id: '14', abbreviation: 'MIA' } },
                  ],
                },
              ],
            },
            boxscore: {
              teams: [
                {
                  homeAway: 'away',
                  team: { id: '16', abbreviation: 'MIN' },
                  statistics: [
                    { name: 'fieldGoalsMade-fieldGoalsAttempted', displayValue: '46-98' },
                    { name: 'fieldGoalPct', displayValue: '46.9' },
                    { name: 'pointsInPaint', displayValue: '56' },
                  ],
                },
                {
                  homeAway: 'home',
                  team: { id: '14', abbreviation: 'MIA' },
                  statistics: [
                    { name: 'fieldGoalsMade-fieldGoalsAttempted', displayValue: '38-86' },
                    { name: 'fieldGoalPct', displayValue: '44.2' },
                    { name: 'pointsInPaint', displayValue: '44' },
                  ],
                },
              ],
              players: [
                {
                  team: { id: '16', abbreviation: 'MIN' },
                  statistics: [
                    {
                      labels: ['MIN', 'FG', '3PT', 'FT', 'REB', 'AST', 'STL', 'BLK', 'TO', '+/-', 'PTS'],
                      athletes: [
                        {
                          didNotPlay: false,
                          starter: true,
                          athlete: { id: '4594268', displayName: 'Anthony Edwards', shortName: 'A. Edwards' },
                          stats: ['36', '13-22', '6-12', '4-5', '8', '6', '2', '1', '2', '+25', '36'],
                        },
                      ],
                    },
                  ],
                },
                {
                  team: { id: '14', abbreviation: 'MIA' },
                  statistics: [
                    {
                      labels: ['MIN', 'FG', '3PT', 'FT', 'REB', 'AST', 'STL', 'BLK', 'TO', '+/-', 'PTS'],
                      athletes: [
                        {
                          didNotPlay: false,
                          starter: true,
                          athlete: { id: '4066261', displayName: 'Bam Adebayo', shortName: 'B. Adebayo' },
                          stats: ['34', '12-24', '1-3', '5-6', '11', '4', '1', '2', '3', '-18', '30'],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          }),
        })

        const host = document.createElement('div')
        host.className = 'p-3 sm:p-6 max-w-7xl mx-auto'
        document.body.innerHTML = ''
        document.body.appendChild(host)
        const root = ReactDOMClient.createRoot(host)
        root.render(React.createElement(HeroMatchup, { event, onTeamClick: () => {} }))
        await new Promise((r) => setTimeout(r, 150))
        return true
      })()`,
    })

    const testViewports = [
      { width: 360, height: 740, mobile: true },
      { width: 390, height: 844, mobile: true },
      { width: 768, height: 1024, mobile: true },
      { width: 1280, height: 800, mobile: false },
      { width: 1920, height: 1080, mobile: false },
    ]

    for (const vp of testViewports) {
      await sendCommand('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 2,
        mobile: vp.mobile,
      })
      await new Promise((r) => setTimeout(r, 60))

      const auditRes = await sendCommand('Runtime.evaluate', {
        returnByValue: true,
        expression: `(() => {
          const hasHorizontalOverflow = document.documentElement.scrollWidth > window.innerWidth
          const allButtons = Array.from(document.querySelectorAll('button'))
          const leadersBtn = allButtons.find((b) => /Leaders/i.test(b.textContent || ''))
          const shotsBtn = allButtons.find((b) => /\\(157\\)/.test(b.textContent || ''))
          const zonesBtn = allButtons.find((b) => /Zones/i.test(b.textContent || ''))
          const tabContainer = leadersBtn?.parentElement

          const containerRect = tabContainer?.getBoundingClientRect()
          const tabMetrics = [leadersBtn, shotsBtn, zonesBtn].map((btn) => {
            if (!btn || !containerRect) return null
            const r = btn.getBoundingClientRect()
            return {
              text: (btn.textContent || '').trim(),
              width: r.width,
              height: r.height,
              leftInside: r.left >= containerRect.left - 1.5,
              rightInside: r.right <= containerRect.right + 1.5,
            }
          })

          // Check Top Box Score Performers FG cells (13-22 and 12-24) do not wrap across lines
          const fgCells = Array.from(document.querySelectorAll('td')).filter((td) => {
            const t = (td.textContent || '').trim()
            return t === '13-22' || t === '12-24'
          })
          const fgMetrics = fgCells.map((td) => {
            const style = window.getComputedStyle(td)
            const r = td.getBoundingClientRect()
            return {
              text: (td.textContent || '').trim(),
              whiteSpace: style.whiteSpace,
              height: r.height,
            }
          })

          return {
            hasHorizontalOverflow,
            tabMetrics,
            fgMetrics,
          }
        })()`,
      })

      const val = auditRes?.result?.value
      assert.ok(val)
      assert.equal(val.hasHorizontalOverflow, false, `Viewport ${vp.width}px must have no document horizontal overflow`)
      assert.equal(val.tabMetrics.length, 3, `All 3 post-game tabs must exist at ${vp.width}px`)
      for (const tab of val.tabMetrics) {
        assert.ok(tab, `Tab button must be present at ${vp.width}px`)
        assert.equal(tab.leftInside, true, `Tab "${tab.text}" left edge must be inside container at ${vp.width}px`)
        assert.equal(tab.rightInside, true, `Tab "${tab.text}" right edge must not clip outside container at ${vp.width}px`)
        assert.equal(tab.width >= 50, true, `Tab "${tab.text}" must have usable width >= 50px at ${vp.width}px (got ${tab.width})`)
        assert.equal(tab.height >= 24, true, `Tab "${tab.text}" must have usable height >= 24px at ${vp.width}px`)
      }

      assert.equal(val.fgMetrics.length >= 2, true, `FG made-attempted cells must be rendered at ${vp.width}px`)
      for (const fg of val.fgMetrics) {
        assert.equal(fg.whiteSpace, 'nowrap', `FG cell "${fg.text}" must use white-space: nowrap at ${vp.width}px`)
        assert.equal(fg.height <= 36, true, `FG cell "${fg.text}" must not wrap across multiple lines at ${vp.width}px (height=${fg.height})`)
      }
    }

    // At 360px, switch to Zones mode and verify readable companion zone cards (font-size >= 11px)
    await sendCommand('Emulation.setDeviceMetricsOverride', {
      width: 360,
      height: 740,
      deviceScaleFactor: 2,
      mobile: true,
    })
    const zonesRes = await sendCommand('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async () => {
        const allButtons = Array.from(document.querySelectorAll('button'))
        const zonesBtn = allButtons.find((b) => /Zones/i.test(b.textContent || ''))
        zonesBtn?.click()
        await new Promise((r) => setTimeout(r, 80))

        const zoneCards = Array.from(document.querySelectorAll('[data-testid="zone-stat-card"]'))
        const cardFontSizes = zoneCards.map((el) => {
          const pctEl = el.querySelector('[data-testid="zone-card-pct"]') || el
          return parseFloat(window.getComputedStyle(pctEl).fontSize)
        })

        // Also click Shots (157) tab and verify team filter buttons & shot selection remain functional
        const shotsBtn = Array.from(document.querySelectorAll('button')).find((b) => /\\(157\\)/.test(b.textContent || ''))
        shotsBtn?.click()
        await new Promise((r) => setTimeout(r, 80))
        const filterButtons = Array.from(document.querySelectorAll('button')).filter((b) =>
          ['ALL', 'MIN', 'MIA'].includes((b.textContent || '').trim().toUpperCase())
        )
        const firstShotGroup = document.querySelector('svg g.cursor-pointer')
        firstShotGroup?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await new Promise((r) => setTimeout(r, 60))
        const selectedShotVisible = (document.body.textContent || '').includes('Jump shot')

        return {
          zoneCardCount: zoneCards.length,
          minZoneFontSize: cardFontSizes.length > 0 ? Math.min(...cardFontSizes) : 0,
          filterButtonCount: filterButtons.length,
          selectedShotVisible,
        }
      })()`,
    })

    const zVal = zonesRes?.result?.value
    assert.ok(zVal)
    assert.equal(zVal.zoneCardCount, 4, 'Zones mode at 360px must render 4 companion readable zone cards')
    assert.equal(zVal.minZoneFontSize >= 11, true, `Zone card figures at 360px must have readable font-size >= 11px (got ${zVal.minZoneFontSize}px)`)
    assert.equal(zVal.filterButtonCount, 3, 'Shot Chart mode must retain ALL / AWAY / HOME team filter buttons')
    assert.equal(zVal.selectedShotVisible, true, 'Clicking a shot marker must display the shot detail card')
  })
})

test('P1 Follow-Up Regression (Reproduction B): Mounted HeroMatchup in post mode rejects lagging pre-game MEM/CLE summary and never shows season averages as Final Game Leaders / GAME TOTAL', async () => {
  await withHeadlessBrowser(async ({ baseUrl, sendCommand }) => {
    await sendCommand('Page.navigate', { url: `${baseUrl}/` })
    await new Promise((r) => setTimeout(r, 800))

    const evalRes = await sendCommand('Runtime.evaluate', {
      awaitPromise: true,
      returnByValue: true,
      expression: `(async () => {
        const { React, ReactDOMClient, HeroMatchup, clearSummaryCache } = await import('/__test_bridge.ts')
        clearSummaryCache()

        const host = document.createElement('div')
        document.body.innerHTML = ''
        document.body.appendChild(host)
        const root = ReactDOMClient.createRoot(host)

        const postMemCleEvent = {
          id: '401910007',
          name: 'Memphis Grizzlies at Cleveland Cavaliers',
          shortName: 'MEM @ CLE',
          date: '2026-11-18T00:00Z',
          status: {
            clock: 0,
            displayClock: '0:00',
            period: 4,
            type: { id: '3', name: 'STATUS_FINAL', state: 'post', completed: true, description: 'Final', detail: 'Final', shortDetail: 'Final' },
          },
          competitions: [
            {
              id: '401910007',
              date: '2026-11-18T00:00Z',
              status: {
                clock: 0,
                displayClock: '0:00',
                period: 4,
                type: { id: '3', name: 'STATUS_FINAL', state: 'post', completed: true, description: 'Final', detail: 'Final', shortDetail: 'Final' },
              },
              competitors: [
                {
                  id: '29',
                  homeAway: 'away',
                  score: '108',
                  team: { id: '29', name: 'Grizzlies', displayName: 'Memphis Grizzlies', abbreviation: 'MEM', color: '5d76a9', logo: '' },
                  leaders: [],
                  statistics: [],
                },
                {
                  id: '5',
                  homeAway: 'home',
                  score: '119',
                  team: { id: '5', name: 'Cavaliers', displayName: 'Cleveland Cavaliers', abbreviation: 'CLE', color: '860038', logo: '' },
                  leaders: [],
                  statistics: [],
                },
              ],
            },
          ],
        }

        const preMemCleSummary = {
          header: {
            id: '401910007',
            competitions: [
              {
                id: '401910007',
                status: { type: { state: 'pre', completed: false } },
                competitors: [
                  { homeAway: 'away', team: { id: '29', abbreviation: 'MEM' } },
                  { homeAway: 'home', team: { id: '5', abbreviation: 'CLE' } },
                ],
              },
            ],
          },
          leaders: [
            {
              team: { id: '29', abbreviation: 'MEM' },
              leaders: [
                {
                  name: 'pointsPerGame',
                  displayName: 'Points Per Game',
                  leaders: [{ displayValue: '25.4', value: 25.4, athlete: { id: '4278', fullName: 'Ty Jerome', displayName: 'Ty Jerome', shortName: 'T. Jerome' } }],
                },
                {
                  name: 'reboundsPerGame',
                  displayName: 'Rebounds Per Game',
                  leaders: [{ displayValue: '9.5', value: 9.5, athlete: { id: '5001', fullName: 'Cameron Boozer', displayName: 'Cameron Boozer', shortName: 'C. Boozer' } }],
                },
                {
                  name: 'assistsPerGame',
                  displayName: 'Assists Per Game',
                  leaders: [{ displayValue: '5.4', value: 5.4, athlete: { id: '5002', fullName: 'Cam Spencer', displayName: 'Cam Spencer', shortName: 'C. Spencer' } }],
                },
              ],
            },
            {
              team: { id: '5', abbreviation: 'CLE' },
              leaders: [
                {
                  name: 'pointsPerGame',
                  displayName: 'Points Per Game',
                  leaders: [{ displayValue: '24.8', value: 24.8, athlete: { id: '3908809', fullName: 'Donovan Mitchell', displayName: 'Donovan Mitchell', shortName: 'D. Mitchell' } }],
                },
              ],
            },
          ],
          boxscore: {
            teams: [
              { homeAway: 'away', team: { id: '29', abbreviation: 'MEM' }, statistics: [{ name: 'avgPointsAgainst', displayValue: '115.2' }] },
              { homeAway: 'home', team: { id: '5', abbreviation: 'CLE' }, statistics: [{ name: 'avgPointsAgainst', displayValue: '108.9' }] },
            ],
          },
        }

        let summaryRequests = 0
        let serveRealPost = false
        const origFetch = window.fetch
        window.fetch = async (url) => {
          const urlStr = String(url)
          if (urlStr.includes('summary?event=401910007')) {
            summaryRequests++
            if (!serveRealPost) {
              return { ok: true, status: 200, json: async () => preMemCleSummary }
            }
            return {
              ok: true,
              status: 200,
              json: async () => ({
                header: {
                  id: '401910007',
                  competitions: [
                    {
                      id: '401910007',
                      status: { type: { state: 'post', completed: true } },
                      competitors: [
                        { homeAway: 'away', team: { id: '29', abbreviation: 'MEM' } },
                        { homeAway: 'home', team: { id: '5', abbreviation: 'CLE' } },
                      ],
                    },
                  ],
                },
                leaders: [
                  {
                    team: { id: '29', abbreviation: 'MEM' },
                    leaders: [
                      {
                        name: 'points',
                        displayName: 'Points',
                        leaders: [{ displayValue: '31', value: 31, athlete: { id: '4279888', fullName: 'Ja Morant', displayName: 'Ja Morant', shortName: 'J. Morant' } }],
                      },
                    ],
                  },
                ],
                boxscore: { teams: [] },
              }),
            }
          }
          return origFetch(url)
        }

        const waitFor = async (predicate, timeoutMs = 2000) => {
          const start = Date.now()
          while (Date.now() - start < timeoutMs) {
            const v = predicate()
            if (v) return v
            await new Promise((r) => setTimeout(r, 25))
          }
          return predicate()
        }

        root.render(
          React.createElement(HeroMatchup, {
            event: postMemCleEvent,
            summaryRefreshIntervalMs: 180,
          })
        )

        await waitFor(() => summaryRequests >= 1, 1500)
        await new Promise((r) => setTimeout(r, 120))
        const textDuringPreLag = host.textContent || ''

        // Now allow the bounded retry to fetch real post-game summary
        serveRealPost = true
        const gotRealPost = Boolean(await waitFor(() => (host.textContent || '').includes('Ja Morant'), 2000))
        const textAfterRealPost = host.textContent || ''

        root.unmount()
        window.fetch = origFetch

        return {
          summaryRequests,
          leakedTyJerome: textDuringPreLag.includes('Ty Jerome') || textDuringPreLag.includes('25.4'),
          leakedBoozer: textDuringPreLag.includes('Cameron Boozer') || textDuringPreLag.includes('9.5'),
          leakedSpencer: textDuringPreLag.includes('Cam Spencer') || textDuringPreLag.includes('5.4'),
          leakedCleAvg: textDuringPreLag.includes('24.8'),
          gotRealPost,
          hasJaMorant31: textAfterRealPost.includes('Ja Morant') && textAfterRealPost.includes('31'),
        }
      })()`,
    })

    const val = evalRes?.result?.value
    assert.ok(val, 'Browser evaluation must return a value')
    assert.equal(val.leakedTyJerome, false, 'Mounted post HeroMatchup must NEVER render pre-game Ty Jerome 25.4 as final game total')
    assert.equal(val.leakedBoozer, false, 'Mounted post HeroMatchup must NEVER render pre-game Cameron Boozer 9.5 as final game total')
    assert.equal(val.leakedSpencer, false, 'Mounted post HeroMatchup must NEVER render pre-game Cam Spencer 5.4 as final game total')
    assert.equal(val.leakedCleAvg, false, 'Mounted post HeroMatchup must NEVER render CLE 24.8 PPG as final game total')
    assert.equal(val.summaryRequests >= 2, true, 'Bounded retry must re-fetch after rejecting lagging pre summary')
    assert.equal(val.gotRealPost, true, 'Mounted post HeroMatchup must recover once real post summary arrives')
    assert.equal(val.hasJaMorant31, true, 'Real integer post-game leader (Ja Morant 31) must render once valid post summary arrives')
  })
})


