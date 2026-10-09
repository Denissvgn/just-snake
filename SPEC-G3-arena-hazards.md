# SPEC-G3 — Arena Hazards (Seeded Pillars · Sweeping Perimeter Light Beam · Mode Dynamics)

> **E03 reconciliation — historical, non-authoritative design.** Current `G3` status: **accepted for the bounded rules-2 release scope** in [ENHANCEMENTS.md](ENHANCEMENTS.md), with executable assertion links and accepted-task provenance. Original detail below is preserved, not a fresh full-release or live-publication claim. [PUBLIC_RELEASE_BACKLOG.md](PUBLIC_RELEASE_BACKLOG.md) DEC02/04/06–10 override conflicting constants, lifecycle, performance and UI clauses.
>
> **Explicit supersession:** B06 replaces direct RNG.seed coupling with a separate tuple-derived hazard stream and one explicit generation per fresh run. D03 preserves the beam visually but gates its extra point light to High.
>
> **Compatibility:** every mutable `window.*` hook described below is source-test-only behind `__SNAKE_TEST_BUILD__` or injected by the temporary source adapter. Normal source and dist expose no mutable game controls. Old ready/DONE labels, patch commands and historical benchmarks below are not implementation authority. See [recipe/adaptor audit](docs/HISTORICAL_RECIPES.md).


**Historical design status:** preserved original proposal; current bounded scope is reconciled above.
**Backlog:** `ENHANCEMENTS.md` → Gameplay ideas → *"G3 Arena hazards"*, effort M, impact ★★★  
**Depends on:** V2 (selective bloom) · V5 (reactive arena) · G6 (difficulty modes & wrap-around navigation) · G4 (run structure & summary)  
**File:** `snake-three.html`  
**Harness:** `tests/check_g3_contracts.mjs`, `tests/test_hazards.mjs`

---

## 1. Problem and Intent

Currently in `snake-three.html`:
1. **Empty Board Interior:** Between the boundary walls, the $21 \times 21$ arena is completely barren. There are no spatial obstacles, choke points, or corridors to navigate, meaning the player only ever collides with walls or their own tail.
2. **Static Perimeter Atmosphere:** Outer boundary walls remain visually static with fixed emissive intensity unless a collision wave is triggered on death (V5). There is no dynamic perimeter lighting sweeping across the arena trim during active play.
3. **Mode Differentiation Potential:** Calm mode provides casual wrap-around boundary navigation without death (G6), but Classic and Frenzy modes lack distinct spatial hazards that reward maneuvering skill and high-speed precision.

---

## 2. The Four Pillars of G3

### Pillar 1: Deterministic Per-Run Seeded Pillars
- Pre-allocated pool of 4–5 architectural pillars placed deterministically per run based on a seed or run sequence.
- **Placement Rules:**
  - Placed strictly on valid grid cells $x, z \in [1, \text{GRID}-2]$ (leaving at least 1 cell border clear for wall navigation).
  - **Player Safety Clearance:** Pillars never spawn within Manhattan distance $\le 3$ of the snake's initial head position $(10, 10)$ or on initial body segments, guaranteeing an unobstructed launch at the start of every run.
  - **Symmetric & Corridor-Forming Distribution:** Default seed produces 4 balanced quadrant anchor pillars at $(5, 5)$, $(15, 5)$, $(5, 15)$, and $(15, 15)$, creating strategic corridors and risk zones.
  - **Food & Prey Exclusion:** In `spawnFood()` and `triggerEscapeHop()`, active pillar cells are strictly treated as occupied, preventing food or jittery prey from ever generating inside an obstacle.

### Pillar 2: Diegetic 3D Pillar Geometry & Contact Shadows
- **Mesh Design:**
  - Geometry: Pre-allocated `THREE.CylinderGeometry(0.38, 0.44, 1.05, 16)` with vertical bevel.
  - Material: Dark industrial composite `MeshStandardMaterial({ color: 0x111e33, roughness: 0.35, metalness: 0.5 })`.
  - Neon Trim: Emissive accent ring `MeshBasicMaterial({ color: 0x0ea5e9 })` tagged with `tagBloom('walls', mesh)` to bloom in selective bloom mode.
  - Contact Shadow: Ground-plane contact shadow blob at $y = 0.015$ using shared `shadowTex` and `blobGeo`.
- **Zero Runtime Allocations:**
  - All pillar meshes and shadow quads are created once during `buildArena()` / `buildHazards()` and repositioned / toggled via visibility.

### Pillar 3: Continuous Sweeping Perimeter Light Beam
- A high-energy light beam continuously travels along the perimeter of the outer wall trim:
  - Coordinate Parametrization: Perimeter distance $s(t) = (t \times \text{speed}) \pmod{4 \times \text{BOARD}}$ with `speed = 5.5` units/s (~14.5s full loop).
  - Mesh & Light: Sleek cyan/azure emitter `BoxGeometry(0.25, 0.74, 0.25)` floating on the wall trim ($y = 0.35$), tagged with `tagBloom('fx', beamMesh)`.
  - Dynamic PointLight: Dedicated `PointLight(0x38bdf8, 1.8, 8.0)` sweeping along the wall, casting moving highlights and dynamic shadows across the arena floor, pillars, and snake body.
  - Freezes when paused, active during playing and attract modes.

### Pillar 4: Collision Integration & Mode Dynamics
- **Lethal Pillar Collisions:**
  - In `step()`:
    $$\text{collision} \iff (nx, nz) \in \text{HAZARDS.pillars}$$
    Triggers `gameOver('pillar')`.
  - Particle burst with pillar theme (`0x0ea5e9`), camera shake, and overlay message:
    `"You crashed into a pillar.<br>Score: ${score}"`.
  - `RUN_STATS.finalize('pillar')` records `'pillar'` as the death reason in summary card and share text.
- **Difficulty Mode Integration:**
  - **Calm Mode:** In casual wrap-around mode (`MODES.calm.wrap === true`), arena hazards can be toggled or disabled (`hazards: false`), fulfilling the specification: *"Alternative: wrap-around mode for casual play"*.
  - **Classic Mode:** Active seeded pillars (`hazards: true`).
  - **Frenzy Mode:** Active seeded pillars + dual simultaneous prey (`hazards: true`).

---

## 3. Data Structures & API Contracts

```javascript
const HAZARDS = {
  ON: true,
  seed: 1,
  pillars: [],          // array of { x, z, mesh, shadow }
  activeCount: 4,
  beam: {
    mesh: null,
    light: null,
    pos: 0.0,
    speed: 5.5
  },
  init() { ... },
  generatePillars(seed) { ... },
  getPillars() { ... },
  isPillar(x, z) { ... },
  update(dt) { ... },
  reset() { ... }
};
```

### Public Window Hooks
- `window.HAZARDS`: Controller object.
- `window.isPillarCell(x, z)`: Returns boolean whether cell $(x, z)$ contains a hazard pillar.
- `window.getPillarPositions()`: Returns array of `{ x, z }` coordinates of currently active pillars.
- `window.generatePillars(seed)`: Generates and positions pillars using specified integer seed.
- `window.getHazardsState()`: Returns active state of pillars and sweeping beam.

---

## 4. Verification Plan

1. **Static AST & Contract Suite (`tests/check_g3_contracts.mjs`):**
   - Asserts `HAZARDS` controller defined with `pillars`, `beam`, `isPillar`, `generatePillars`.
   - Asserts `buildArena()` builds hazards without runtime shader re-compiles.
   - Asserts `step()` incorporates pillar collision check triggering `gameOver('pillar')`.
   - Asserts `spawnFood()` and `triggerEscapeHop()` exclude active pillar coordinates.
   - Asserts public hooks `window.HAZARDS`, `window.isPillarCell`, `window.getPillarPositions`.
2. **Dynamic Acceptance Suite (`tests/test_hazards.mjs`):**
   - Asserts default pillars initialized and safely cleared from head spawn $(10, 10)$.
   - Asserts lethal collision against pillar triggers `state === 'over'` with `deathReason === 'pillar'`.
   - Asserts sweeping light beam advances position along wall perimeter over time.
   - Asserts Calm mode disables pillar collision or wraps safely.
   - Asserts clean reset on game restart.
