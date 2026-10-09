# SPEC-G4 — Run structure & summary (Run metrics · End-of-run summary card · Top-10 local leaderboard · Share-as-text · Reachable victory)

> **E03 reconciliation — historical, non-authoritative design.** Current `G4` status: **accepted for the bounded rules-2 release scope** in [ENHANCEMENTS.md](ENHANCEMENTS.md), with executable assertion links and accepted-task provenance. Original detail below is preserved, not a fresh full-release or live-publication claim. [PUBLIC_RELEASE_BACKLOG.md](PUBLIC_RELEASE_BACKLOG.md) DEC02/04/06–10 override conflicting constants, lifecycle, performance and UI clauses.
>
> **Explicit supersession:** B04/B08/C03 supersede old mutable summaries, legacy leaderboard writes and copied-button feedback: frozen once-per-runId summaries, rules-2 scoped scores-v2, exact captured challenge card and status after fulfilled clipboard write. Additional board sizes are deferred.
>
> **Compatibility:** every mutable `window.*` hook described below is source-test-only behind `__SNAKE_TEST_BUILD__` or injected by the temporary source adapter. Normal source and dist expose no mutable game controls. Old ready/DONE labels, patch commands and historical benchmarks below are not implementation authority. See [recipe/adaptor audit](docs/HISTORICAL_RECIPES.md).


**Historical design status:** preserved original proposal; current bounded scope is reconciled above.
**Backlog:** `ENHANCEMENTS.md` → Gameplay ideas → *"Run structure — end-of-run summary (length, time alive, top speed, best combo), top-10 local history, share-as-text; reachable win ('reach length 60') and/or board sizes 15/21/31"*, effort S–M, impact ★★★  
**Depends on:** V12 (HUD design) · G1 (combo multiplier) · V9 (distinct prey) · V3 (death as an event)  
**File:** `snake-three.html`  
**Harness:** `tests/check_g4_contracts.mjs`, `tests/test_run_structure.mjs`  

---

## 1. Problem and Intent

Currently in `snake-three.html`:
1. **Abrupt Run Termination & Zero Closure:** When the player dies, `gameOver(reason)` triggers the death particle scatter and shows a bare text overlay: `"You hit the wall.<br>Score: 50"`. Key achievements accomplished during the run — such as high-intensity combo streaks (G1), acceleration levels attained (V12), time survived, and rare golden prey hunted (V9) — evaporate without trace or acknowledgment.
2. **Missing Longitudinal Progression:** There is no run history or sense of personal progression beyond a single scalar `best` score in `localStorage`. Players cannot review their top past runs, track consistency, or celebrate close attempts.
3. **Unreachable Win Condition:** The only existing win condition requires filling all 441 cells (`GRID * GRID`), which is mathematically out of reach for almost all players, making 100% of player runs end in collision defeat.
4. **Zero Virality / Sharing:** Players who achieve great runs have no built-in way to export or share their achievements to clipboard or social channels.

The intent of **G4** is to transform each playthrough into a structured, rewarding competitive run:
- **Comprehensive Run Metrics (`RUN_STATS`):** Tracks active survival time (freezing during pauses), final length, top speed level, maximum combo multiplier, and breakdown of consumed prey archetypes.
- **End-of-Run Summary Card:** Replaces the plain text message with a sleek, diegetic stat grid highlighting key metrics, with celebratory `[NEW RECORD!]` golden treatment when surpassing prior best.
- **Persistent Top-10 Local Leaderboard:** Stores up to 10 best runs in `localStorage` sorted by score (with tiebreakers), accessible directly via an in-overlay toggle tab.
- **Share-as-Text Clipboard Formatter:** One-click copy generating a clean, emoji-accented summary card suitable for Discord, Twitter, or notes.
- **Reachable Win Milestone:** Introduces a reachable campaign goal (`TARGET_LENGTH = 60`), granting an exhilarating "You Win!" overlay with options to celebrate or continue in endless mode.
- **Strict Hygiene & Zero Allocation:** Zero per-frame allocations during active gameplay, strict isolation from attract mode (demo AI runs never save or contaminate leaderboards), and full non-regression of existing DOM contracts (`#title`, `#message`, `#actionBtn`).

---

## 2. The Five Architectural Pillars

### Pillar 1: Run Metrics Tracking Controller (`RUN_STATS`)
A centralized controller tracks and aggregates metrics for the live run:
1. **Metrics tracked per run:**
   - `startTime`: Timestamp (`performance.now()`) initialized on `startGame()`.
   - `timeAlive`: Cumulative active seconds in `state === 'playing'`, formatted as `MM:SS` (e.g., `01:42`).
   - `finalScore`: Final score attained.
   - `finalLength`: Snake segments count (`segs.length`).
   - `maxSpeedLevel`: Highest speed level achieved ($1 \dots 15$, reading `HUD_FX.speedLevel` or `Math.min(15, Math.floor(score / 30) + 1)`).
   - `maxCombo`: Highest combo multiplier attained ($1 \dots 5$, feeding from G1 `COMBO_FX.streak` / multiplier).
   - `foodBreakdown`: Count of prey eaten by archetype: `{ common: 0, golden: 0, jittery: 0, total: 0 }`.
   - `deathReason`: Reason string (`'wall'`, `'self'`, `'target'`, `'board'`).
   - `isNewBest`: Boolean flag indicating if `finalScore > previousBest && finalScore > 0`.
2. **Lifecycle Methods:**
   - `init()`: Initialize or clear runtime structures.
   - `reset()`: Clear active metrics at the start of every game.
   - `update(dt)`: Accumulate `timeAlive += dt` only when `state === 'playing'`. Clamped by $dt \le 0.1\text{ s}$. Zero GC allocations.
   - `recordEat(preyType, multiplier, points)`: Increment prey counters and update `maxCombo = Math.max(maxCombo, multiplier)` and `maxSpeedLevel = Math.max(maxSpeedLevel, HUD_FX.speedLevel || 1)`.
   - `finalize(reason)`: Lock summary statistics, compute record status against current `best` before saving, insert into leaderboard if eligible, and return an immutable run summary object.

### Pillar 2: End-of-Run Summary Card & Button Lifecycle
1. **Overlay Structure:**
   - `#title`: Displays `"Game Over"` on collision death (strictly matching `/Game Over/i` for backward compatibility) or `"You Win!"` on target completion.
   - `#message`: Populated with a styled run summary card containing:
     - An introductory cause badge (e.g., `Crashed into the ${reason}`).
     - A structured stats grid with key metrics:
       - **Score:** Large numeric readout with glowing `.new-record` pill badge if new best.
       - **Time Alive:** Formatted `MM:SS` (e.g. `01:38`).
       - **Length:** Snake length in cells.
       - **Top Speed:** Formatted `LVL X`.
       - **Best Combo:** Formatted `xX`.
       - **Prey Eaten:** Total count with breakdown dots.
   - Action Button Row:
     - Primary `#actionBtn`: Styled `"Play again"`, always given focus via `actionBtn.focus()` so pressing `[Space]` restarts the game without button focus conflicts.
     - Secondary `#shareBtn`: `"Share Run 📋"` button copying text card to clipboard.
     - Tertiary `#leaderboardBtn`: `"Leaderboard 🏆"` button toggling the top-10 list inside the overlay panel.
2. **Button Visibility Lifecycle:**
   - Ready screen (`state === 'ready'`): `#shareBtn` and `#leaderboardBtn` are `.hidden` (`display: none`).
   - Pause screen (`state === 'paused'`): `#shareBtn` and `#leaderboardBtn` are `.hidden`.
   - Game over screen (`state === 'over'`): `#shareBtn` and `#leaderboardBtn` are visible (`classList.remove('hidden')`).

### Pillar 3: Top-10 Local Leaderboard Persistence
1. **Storage Schema:**
   - Stored in `localStorage` under key `'threejs-snake-leaderboard'`.
   - Array of up to 10 entries sorted descending by `score`:
     ```json
     [
       {
         "score": 340,
         "length": 26,
         "timeSec": 98.4,
         "maxCombo": 4,
         "maxSpeedLevel": 8,
         "date": "2026-10-06T19:30:00.000Z"
       }
     ]
     ```
2. **Sorting & Tiebreaking:**
   - Primary: `score` (descending).
   - Secondary: `length` (descending).
   - Tertiary: `timeSec` (ascending: faster run with same score is higher rank).
3. **Safety & Private Browsing:**
   - All `localStorage` reads/writes wrapped in `try/catch` with memory fallback.
   - Corrupted JSON automatically recovers to `[]`.
   - Attract mode strictly barred from saving runs.

### Pillar 4: Share-as-Text Formatter
1. **Output Format:**
   ```text
   🐍 Three.js Snake — Run Summary
   Score: 320 🏆 [NEW RECORD]
   Length: 28 | Time: 01:38
   Top Speed: LVL 7 | Max Combo: x4
   Prey Eaten: 18 (10 common, 2 golden, 6 jittery)
   Result: wall
   ```
2. **Clipboard Interaction:**
   - Uses `navigator.clipboard.writeText(text)` where available.
   - Falls back gracefully if clipboard API is blocked.
   - UI displays feedback: `#shareBtn.textContent = 'Copied! ✓'` for 1.8 seconds before reverting to `"Share Run 📋"`.

### Pillar 5: Reachable Objective & Win Condition
1. **Target Milestone:**
   - Configurable `TARGET_LENGTH = 60` cells.
   - When `segs.length >= TARGET_LENGTH`, game triggers `winGame('target')`.
   - Overlay displays `"You Win!"` with subtitle `"Reached Target Length 60!"`, celebratory particle burst, and records victory run in leaderboard.
   - Traditional board fill (`segs.length >= GRID * GRID`) triggers `winGame('board')` with `"Perfect Board!"`.
   - Both win paths invoke `RUN_STATS.finalize(reason)`.

---

## 3. Data Structures & API Contracts

```javascript
const RUN_STATS = {
  ON: true,
  TARGET_LENGTH: 60,
  timeAlive: 0.0,
  maxSpeedLevel: 1,
  maxCombo: 1,
  foodBreakdown: { common: 0, golden: 0, jittery: 0, total: 0 },
  lastSummary: null,

  init() { ... },
  reset() { ... },
  update(dt) { ... },
  recordEat(type, mult, pts) { ... },
  finalize(reason) { ... },
  formatTime(seconds) { ... },
  formatShareText(summary) { ... },
  copyShareText() { ... },
  getLeaderboard() { ... },
  saveToLeaderboard(summary) { ... },
  clearLeaderboard() { ... }
};
```

---

## 4. Acceptance Criteria & Tiered Test Plan

### Tier 1: Static AST & Offline Contract Verification (`check_g4_contracts.mjs`)
- Executable in offline/CI environments without headless Chrome.
- Asserts valid JavaScript syntax in `snake-three.html`.
- Asserts `RUN_STATS` controller definition and all methods (`init`, `reset`, `update`, `recordEat`, `finalize`, `getLeaderboard`, `saveToLeaderboard`).
- Asserts `RUN_STATS.update(dt)` has zero runtime object/array allocations.
- Asserts `#shareBtn` and `#leaderboardBtn` element IDs exist in markup.
- Asserts backward compatibility of `#title`, `#message`, `#actionBtn`, `#overlay`.

### Tier 2: Behavioural Acceptance Suite (`test_run_structure.mjs`)
- Executed via Puppeteer / headless Chrome with WebGL support.
- Asserts `timeAlive` accumulates during gameplay and strictly freezes during pause.
- Asserts metrics cleanly reset on game restart.
- Asserts attract mode does not record runs or mutate `localStorage`.
- Asserts end-of-run summary renders correct statistics card in `#message`.
- Asserts `#shareBtn` and `#leaderboardBtn` are hidden on ready/pause screens and visible on game over.
- Asserts leaderboard stores up to 10 entries sorted by score with tiebreakers.
- Asserts `TARGET_LENGTH = 60` triggers `winGame` and marks victory.
- Asserts `actionBtn.focus()` is called on overlay display.

### Tier 3: Non-Regression Suites
- `test_hud.mjs` (V12): All 22 checks PASS.
- `test_combo.mjs` (G1): All 13 checks PASS.
- `test_death.mjs` (V3): All 9 checks PASS.
- `test_prey.mjs` (V9): All 13 checks PASS.
- `test_attract.mjs` (V10): All 14 checks PASS.
- `test_game.mjs`: Autopilot loop & restart PASS.
