# 🏀 NBA Live Command Center

🔗 **Live Demo:** [https://martindavies-code.github.io/nba-live-dashboard/](https://martindavies-code.github.io/nba-live-dashboard/)

A real-time National Basketball Association (NBA) live scoreboard, dynamic interactive court shot radar, announcing crew directory, and NBA Scorigami novelty tracking dashboard built with **React 19**, **Vite**, **TypeScript**, and **Tailwind CSS v4**.

Data is streamed directly via the [ESPN NBA Scoreboard API](https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard) with zero-dependency polling, visibility-based background pause, and offline resilience.

---

## ⚡ Key Features

### 1. 🎙️ Announcing Crew & Officiating Registry
- **National Broadcast Crews**: Real-time matching for ABC/ESPN (Mike Breen, Doris Burke, Richard Jefferson, Lisa Salters), TNT Sports (Kevin Harlan, Reggie Miller, Stan Van Gundy, Allie LaForce), NBC/Peacock (Noah Eagle, Reggie Miller, Zora Stephenson), and NBA TV.
- **All 30 Franchise RSN Crews**: Dedicated registry for local team regional sports networks (MSG with Walt "Clyde" Frazier, Spectrum SportsNet with Bill Macdonald & Stu Lantz, NBC Sports Boston with Drew Carter & Brian Scalabrine, etc.).
- **Officiating Crew Tracking**: Direct assignment display of Crew Chief, Referee, and Umpire (Scott Foster, Tony Brothers, Zach Zarba, etc.).

### 2. ✨ Live NBA Scorigami Novelty Engine
- **Historical Database**: Canonical matrix of unique NBA score combinations since 1946.
- **Live Novelty Projections**: Real-time pace simulation calculating the percentage chance of finishing on a novel score.
- **Target Scores & Points Needed**: Identifies the nearest unrecorded score with exact points needed per franchise in remaining regulation time.
- **Post-Game Historical Recaps**: Instantly tells you if a score was novel (#2,843 in history) or recaps the exact date, winning franchise, and losing franchise when it last occurred.

### 3. 🎯 Tactical Court Shot Radar & Momentum Flow (`CourtDiagram.tsx`)
- **Regulation 94' x 50' SVG Hardwood Court**: Parquet floorboards, dynamic team-painted keys (lanes), 3-point arcs, restricted area semicircles, and center jump circles.
- **Interactive Live Shot Chart**: Plotted field goal attempts (🟢 Makes with 3PT badges, 🔴 Misses, 💥 Dunks/Alley-oops) with click-to-inspect shooter cards.
- **Shooting Zone Heatmap Overlay**: Real-time efficiency breakdown across Restricted Area, Paint Non-RA, Mid-Range, and 3-Point Zones.
- **Hoops Flow & Momentum Tracker**: Replaces the football drive chart with Shot Clock (24s / reset), Team Bonus / Penalty foul indicators, Timeouts, and live Scoring Run alerts (e.g., *CELTICS ON 11-2 RUN*).

### 4. 📊 Visual Win Probability Split Chart (`WinProbabilityBar.tsx`)
- Dynamic split bar calibrated to the official primary hex colors of each NBA franchise with pre-game betting lines and over/under odds.

---

## 🧪 Automated Testing

Includes a full unit test suite:

```bash
npm test
```

- **NBA Scorigami Test Suite**: Validates canonical hi-lo keys, historical lookups, and live target projections.
- **Announcing Crew Test Suite**: Validates network resolution and local RSN crew lookups.
- **Hoops Helpers Test Suite**: Validates clutch game thresholds, color contrast pairing, and safe numeric parsing.

---

## 🛠️ Local Development

```bash
# Install dependencies
npm install

# Start local Vite development server
npm run dev

# Run unit tests
npm test

# Build production bundle
npm run build
```

---

## 📜 License

MIT License. Designed & engineered for basketball analytics enthusiasts.
