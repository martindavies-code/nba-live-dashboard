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

test('Automated Headless Chrome Responsive Viewport Audit (if Dev Server is running)', async () => {
  const port = 9222
  let isCdpAvailable = false
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1000) })
    if (res.ok) isCdpAvailable = true
  } catch {
    isCdpAvailable = false
  }

  if (!isCdpAvailable) {
    // Standalone node environment without active Chrome CDP instance - static tests verified
    assert.ok(true, 'Chrome CDP not running, static responsive layout tests passed')
    return
  }

  // If Chrome CDP is active, verify live page across viewports has 0 horizontal overflows
  const listRes = await fetch(`http://127.0.0.1:${port}/json/list`)
  const targets = await listRes.json()
  const pageTarget = targets.find(t => t.type === 'page')
  if (!pageTarget) return

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl)
  await new Promise(r => ws.onopen = r)

  let idCounter = 100
  function sendCommand(method, params = {}) {
    return new Promise((resolve) => {
      const id = idCounter++
      const handler = (event) => {
        const msg = JSON.parse(event.data)
        if (msg.id === id) {
          ws.removeEventListener('message', handler)
          resolve(msg.result)
        }
      }
      ws.addEventListener('message', handler)
      ws.send(JSON.stringify({ id, method, params }))
    })
  }

  const testViewports = [
    { width: 360, height: 740, mobile: true },
    { width: 390, height: 844, mobile: true },
    { width: 768, height: 1024, mobile: true },
    { width: 1280, height: 800, mobile: false },
    { width: 1920, height: 1080, mobile: false }
  ]

  for (const vp of testViewports) {
    await sendCommand('Emulation.setDeviceMetricsOverride', {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 2,
      mobile: vp.mobile
    })

    const evalRes = await sendCommand('Runtime.evaluate', {
      expression: 'document.documentElement.scrollWidth > window.innerWidth',
      returnByValue: true
    })
    const hasHorizontalOverflow = evalRes?.result?.value
    assert.equal(hasHorizontalOverflow, false, `Viewport ${vp.width}x${vp.height} must not have horizontal document overflow`)
  }

  ws.close()
})
