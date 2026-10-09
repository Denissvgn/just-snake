# SPEC-G6 — Difficulty Modes (Calm · Classic · Frenzy)

> **E03 reconciliation — historical, non-authoritative design.** Current `G6` status: **accepted for the bounded rules-2 release scope** in [ENHANCEMENTS.md](ENHANCEMENTS.md), with executable assertion links and accepted-task provenance. Original detail below is preserved, not a fresh full-release or live-publication claim. [PUBLIC_RELEASE_BACKLOG.md](PUBLIC_RELEASE_BACKLOG.md) DEC02/04/06–10 override conflicting constants, lifecycle, performance and UI clauses.
>
> **Explicit supersession:** B01/B06 freeze mode rules and separate selected next-run mode from active mode. Calm alone wraps; mutable wrap settings are removed. Profile maxima are Calm16/Classic15/Frenzy13.
>
> **Compatibility:** every mutable `window.*` hook described below is source-test-only behind `__SNAKE_TEST_BUILD__` or injected by the temporary source adapter. Normal source and dist expose no mutable game controls. Old ready/DONE labels, patch commands and historical benchmarks below are not implementation authority. See [recipe/adaptor audit](docs/HISTORICAL_RECIPES.md).


**Historical design status:** preserved original proposal; current bounded scope is reconciled above.
**Backlog:** `ENHANCEMENTS.md` → Gameplay ideas → *"Difficulty modes on the start screen — Calm (wrap, speed capped) / Classic (today's tuning) / Frenzy (90 ms base, two preys at once)"*, effort S, impact ★★★  
**Depends on:** V1 (smooth body tube) · V9 (distinct prey silhouettes) · V12 (HUD design) · G1 (combo multiplier) · G4 (run structure & summary)  
**File:** `snake-three.html`  
**Harness:** `tests/check_g6_contracts.mjs`, `tests/test_difficulty.mjs`  

---

## 1. Problem and Intent

Currently in `snake-three.html`:
1. **Single Fixed Experience Curve:** Every session uses identical physics: `BASE_STEP_MS = 115`, `MIN_STEP_MS = 62`, single prey, and rigid wall death.
2. **Casual Barrier:** New or casual players frequently crash into walls on narrow turns, leading to short, frustrating sessions without an accessible learning environment.
3. **High-Skill Ceiling Cap:** Veteran players quickly master the initial 115 ms pace and must wait through 30–40 eaten prey before reaching exhilarating speeds.
4. **Untapped Multi-Target Dynamics:** Hunting a single food is predictable; managing two simultaneous prey targets creates dynamic route planning and risk/reward choices.

**SPEC-G6** introduces three first-class, tuned difficulty modes selectable from the start screen:
- **Calm 🍃:** Non-lethal wrap-around arena boundaries; relaxing capped speed (`BASE_STEP_MS = 140`, `MIN_STEP_MS = 95`); self-collision remains lethal; single prey.
- **Classic ⚡:** The baseline authentic challenge; lethal walls and self-collision; standard speed progression (`115 ms \to 62 ms`); single prey.
- **Frenzy 🔥:** High-intensity overdrive; aggressive starting speed (`BASE_STEP_MS = 90`, `MIN_STEP_MS = 45`); lethal walls and self-collision; **two concurrent preys** active simultaneously on the arena.

---

## 2. The Four Architectural Pillars

### Pillar 1: Three Discrete Difficulty Modes (`MODES`)
All mode settings are encapsulated in a centralized `MODES` registry:

```javascript
const MODES = {
  calm: {
    id: 'calm',
    name: 'Calm',
    icon: '🍃',
    desc: 'Wrap-around walls · capped speed · relaxed play',
    baseStepMs: 140,
    minStepMs: 95,
    speedStep: 3,
    wrap: true,
    dualFood: false,
    badge: 'CALM'
  },
  classic: {
    id: 'classic',
    name: 'Classic',
    icon: '⚡',
    desc: 'Original tuning · lethal walls · single prey',
    baseStepMs: 115,
    minStepMs: 62,
    speedStep: 4,
    wrap: false,
    dualFood: false,
    badge: 'CLASSIC'
  },
  frenzy: {
    id: 'frenzy',
    name: 'Frenzy',
    icon: '🔥',
    desc: '90ms start speed · two preys at once · high intensity',
    baseStepMs: 90,
    minStepMs: 45,
    speedStep: 4,
    wrap: false,
    dualFood: true,
    badge: 'FRENZY'
  }
};
```

1. **Active Mode State:**
   - `let currentMode = 'classic';`
   - Initialized from `localStorage['threejs-snake-mode']` if present and valid (`'calm'`, `'classic'`, or `'frenzy'`), falling back to `'classic'`.
   - `setMode(modeKey)` validates the key, updates `currentMode`, saves to `localStorage`, refreshes UI selector pills and description, and updates HUD indicators.

2. **Simulation Integration:**
   - `startGame()` initializes `stepMs = MODES[currentMode].baseStepMs`.
   - When eating in `step()`:
     $$\text{stepMs} = \max(\text{minStepMs}, \text{baseStepMs} - \lfloor\text{score} / 30\rfloor \times \text{speedStep})$$
   - HUD speed progression gauge (`HUD_FX.setSpeedProgress`) dynamically computes progress relative to the active mode's `baseStepMs` and `minStepMs`.

---

### Pillar 2: Wrap-Around Boundary Handling & Disjoint Mesh Geometry (Calm Mode)

1. **Toroidal Grid Step:**
   In `step()` when `MODES[currentMode].wrap === true`:
   - Next head coordinate wraps seamlessly:
     $$nx = (head.x + dir.x + GRID) \pmod{GRID}$$
     $$nz = (head.z + dir.z + GRID) \pmod{GRID}$$
   - Wall collision `gameOver('wall')` is bypassed. Self-collision `gameOver('self')` remains fully active.

2. **Smooth Interpolation Across Seams:**
   In `drawSnake(t, dt)`:
   - When segment moves from `px` to `x`:
     If $x - px < -GRID / 2$, segment wrapped eastward: temporary $px' = px - GRID$.
     If $x - px > GRID / 2$, segment wrapped westward: temporary $px' = px + GRID$.
   - Segment smoothly transitions through the wall boundary rather than snapping backwards.

3. **Disjoint Body Tube Topology:**
   - In `buildControlPoints()` / `buildTubeIndex()`:
     If consecutive segments have distance $\Delta d > 2 \cdot CELL$, they reside on opposite sides of the arena across a wrap seam.
     The connecting quads between ring $r$ and $r+1$ are collapsed to zero-area degenerate triangles (`idx = [a, a, a, a, a, a]`), preventing any stretched cylinder from rendering across the playfield.
     The tube cleanly vanishes into the perimeter and emerges on the opposite side.

---

### Pillar 3: Multi-Prey Lifecycle & Concurrent Target Tracking (Frenzy Mode)

1. **Dual Food Entities:**
   - Primary Food: `food` `{ x, z }`, `foodMesh`, `foodLight`, `foodHalo`.
   - Secondary Food: `food2` `{ x, z }`, `foodMesh2`, `foodLight2`, `foodHalo2`.
   - Both prey meshes are registered with `tagBloom('prey', mesh)` during initialization.

2. **Spawning & Collision:**
   - In `Frenzy` mode (`dualFood === true`):
     - `spawnFood()` generates valid coordinates for both `food` and `food2`, ensuring `food` and `food2` never occupy the same cell and neither intersects the snake.
     - Both meshes are rendered and animated concurrently with distinct bobbing/hopping phases.
   - In `Calm` and `Classic` modes:
     - `food2` is deactivated; `foodMesh2.visible = false`, `foodLight2.visible = false`, `foodHalo2.visible = false`.
   - Eating check in `step()`:
     - Checks collision against both `food` and `food2`.
     - When either prey is consumed: awards points, triggers eat juice particles and combo progression, and re-spawns only the eaten prey entity into an available empty cell.

3. **High-Tier Reflection & AI Attract Mode Compatibility:**
   - `HIGH_FX` synchronizes `reflectedPrey2` when active on `high` tier.
   - Demo AI `ATTRACT` mode targets the nearest available prey between `food` and `food2`.

---

### Pillar 4: Diegetic Mode Selector UI, LocalStorage Persistence & Leaderboard Integration

1. **Start Screen Mode Selector (`#modeSelector`):**
   - Renders 3 interactive segmented pills on `#overlay .panel` when `state === 'ready'`:
     `[ 🍃 Calm ]   [ ⚡ Classic ]   [ 🔥 Frenzy ]`
   - Active pill receives `.active` class with glowing cyan/amber border.
   - Subtitle `#modeDesc` displays mode-specific tagline and mechanics summary.
   - Selector is cleanly hidden during active gameplay (`playing`), pause (`paused`), and game-over summary (`over`).

2. **Keyboard / Hotkey Navigation:**
   - Pressing `1`, `2`, `3` on the start screen selects Calm, Classic, or Frenzy respectively.

3. **Run Summary & Local Leaderboard Integration:**
   - `RUN_STATS.finalize(reason)` includes `mode: currentMode`.
   - Game Over summary card displays mode badge (e.g. `Mode: 🔥 Frenzy`).
   - Leaderboard entries stored in `localStorage['threejs-snake-leaderboard']` record `mode`.
   - Leaderboard list displays difficulty badge for each high score entry.

---

## 3. Public APIs & Test Contracts

The following methods and state are exposed on `window`:

```javascript
window.MODES = MODES;
window.getMode = () => currentMode;
window.setMode = (mode) => setMode(mode);
window.getDifficultyState = () => ({
  mode: currentMode,
  wrap: MODES[currentMode].wrap,
  dualFood: MODES[currentMode].dualFood,
  baseStepMs: MODES[currentMode].baseStepMs,
  minStepMs: MODES[currentMode].minStepMs,
  stepMs: stepMs,
  food1: { ...food },
  food2: (MODES[currentMode].dualFood ? { ...food2 } : null)
});
```

---

## 4. Acceptance Criteria

1. **Registry & Mode Integrity:**
   - `MODES` contains valid configurations for `calm`, `classic`, and `frenzy`.
   - `setMode('calm')` sets `currentMode = 'calm'`, updates `stepMs = 140`, and sets `wrap = true`.
   - `setMode('frenzy')` sets `currentMode = 'frenzy'`, updates `stepMs = 90`, and sets `dualFood = true`.
   - `setMode('classic')` restores original `stepMs = 115`, `wrap = false`, `dualFood = false`.

2. **Persistence:**
   - Setting mode writes to `localStorage['threejs-snake-mode']`.
   - Page load restores the persisted mode.

3. **Calm Wrap-Around Mechanics:**
   - In Calm mode, stepping into grid boundaries ($x \ge GRID$ or $x < 0$, $z \ge GRID$ or $z < 0$) wraps to opposite grid coordinate without triggering `gameOver('wall')`.
   - Self-collision in Calm mode triggers `gameOver('self')`.

4. **Frenzy Dual Prey Mechanics:**
   - In Frenzy mode, two prey meshes are visible simultaneously at different grid cells.
   - Consuming either prey increments score, advances length, and respawns the eaten prey while leaving the second prey intact.
   - In Classic/Calm modes, secondary prey mesh is hidden (`visible = false`).

5. **UI Lifecycle:**
   - Start screen renders mode selector pills.
   - Clicking or keyboard selection (`1`, `2`, `3`) switches active pill class and updates description.
   - Mode selector is hidden during gameplay, pause, and summary.
   - Game Over summary card displays the active mode.

6. **Non-Regression:**
   - Full automated pass across all existing suites: V1–V12, G1, G4.
   - Zero console errors; constant WebGL program count; zero runtime GC allocations in `update(dt)`.

---

## 5. Test Plan

- Contract Suite: `tests/check_g6_contracts.mjs`
  - Validates `MODES` registry, `setMode`, `getMode`, DOM elements, and CSS styling.
- Acceptance Suite: `tests/test_difficulty.mjs`
  - Dynamic Puppeteer test:
    - Mode switching and `localStorage` persistence.
    - Calm wrap-around boundary navigation without death.
    - Calm self-collision mortality.
    - Classic wall mortality.
    - Frenzy dual prey visibility and consumption.
    - Run summary and leaderboard mode integration.
