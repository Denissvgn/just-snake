# SPEC-G2 — Prey Types (Archetypes · 3D Countdown Arc · Center Placement Bias · Dual-Prey Lifecycle)

> **E03 reconciliation — historical, non-authoritative design.** Current `G2` status: **accepted for the bounded rules-2 release scope** in [ENHANCEMENTS.md](ENHANCEMENTS.md), with executable assertion links and accepted-task provenance. Original detail below is preserved, not a fresh full-release or live-publication claim. [PUBLIC_RELEASE_BACKLOG.md](PUBLIC_RELEASE_BACKLOG.md) DEC02/04/06–10 override conflicting constants, lifecycle, performance and UI clauses.
>
> **Explicit supersession:** B06/B07 supersede render-owned golden timers and escape logic. Six seconds means exactly 6000 simulation ms; expiry before equal-time movement. Jitter decisions use post-movement squared cell distance ≤4 and one successful hop per spawn.
>
> **Compatibility:** every mutable `window.*` hook described below is source-test-only behind `__SNAKE_TEST_BUILD__` or injected by the temporary source adapter. Normal source and dist expose no mutable game controls. Old ready/DONE labels, patch commands and historical benchmarks below are not implementation authority. See [recipe/adaptor audit](docs/HISTORICAL_RECIPES.md).


**Historical design status:** preserved original proposal; current bounded scope is reconciled above.
**Backlog:** `ENHANCEMENTS.md` → Gameplay ideas → *"G2 Prey types"*, effort M, impact ★★★  
**Depends on:** V9 (distinct prey silhouettes) · G6 (difficulty modes & dual prey) · G4 (run structure & summary) · G1 (combo multiplier) · V2 (selective bloom)  
**File:** `snake-three.html`  
**Harness:** `tests/check_g2_contracts.mjs`, `tests/test_prey_types.mjs`, `tests/test_prey.mjs`

---

## 1. Problem and Intent

Currently in `snake-three.html`:
1. **Secondary Prey Neglect in Frenzy Mode:** When Frenzy mode is enabled, `food2` is treated as a generic placeholder with a hardcoded material and no archetype logic. Eating `food2` is hardcoded as `common` (+10 pts) in `RUN_STATS`, ignoring archetype variety.
2. **Missing Diegetic Timer Visuals:** While golden prey has a temporary lifespan, players have no in-world visual representation of the remaining time. Gameplay concept G2 explicitly specifies a 6.0s timer with a 3D arc drawn over the prey to communicate urgency diegetically.
3. **No Risk/Reward Placement Dynamics:** All prey spawns with uniform spatial randomness across the grid. High-value bait (+40 pts) does not test player nerve because it is not placed in the hazardous, coiled center of the arena.
4. **Disjointed Statistics:** Dual-prey runs do not reflect genuine multi-prey consumption in the end-of-run breakdown.

---

## 2. The Four Pillars of G2

### Pillar 1: Full Dual-Prey Independent Lifecycle
- Generalize `PREY_FX` to maintain independent state for both prey entities (`entity 0` for `foodMesh` and `entity 1` for `foodMesh2`).
- Both entities independently roll archetypes upon respawning:
  - 70% Common (`+10` pts)
  - 15% Golden (`+40` pts)
  - 15% Jittery (`+20` pts)
- In Frenzy mode, eating either entity awards the exact point value of its current archetype (`getPreyPoints(0)` or `getPreyPoints(1)`).
- `RUN_STATS.recordEat(type, mult, pts)` receives the authentic archetype of the consumed prey, updating the run breakdown accurately.
- Each entity maintains independent idle rotation, bobbing, golden countdown timer, proximity agitation, and jittery escape hops.

### Pillar 2: Diegetic 3D Countdown Arc Ring
- Timed prey (golden prey with 6.0s lifespan) features a diegetic 3D countdown arc floating directly above the mesh:
  - Geometry: Pre-allocated `THREE.RingGeometry(0.34, 0.44, 64, 1, 0, Math.PI * 2)`.
  - Material: Glowing golden `MeshBasicMaterial({ color: 0xffd700, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })`.
  - Layer / Bloom: Tagged with `tagBloom('fx', arcMesh)` to emit an emissive bloom aura in selective bloom mode.
  - Placement: Placed horizontally (`rotation.x = -Math.PI / 2`) floating at `y = foodMesh.position.y + 0.52`.
  - Depletion: Clockwise dynamic draw range sweep:
    $$\tau = \text{clamp}\left(\frac{\text{timer}}{\text{maxTimer}}, 0.0, 1.0\right)$$
    $$\text{drawCount} = \lfloor \tau \times 64 \rfloor \times 6$$
    `arcGeo.setDrawRange(0, drawCount)`.
  - Urgency Warning: When $\text{timer} \le 2.0\text{ s}$, the arc pulses rapidly (flashing white/gold at 24 rad/s) warning the player of imminent expiration.
  - Zero Runtime Allocations: The geometry and indices are allocated once at initialization in `buildFood()`. Updating `drawRange.count` incurs zero garbage collection or buffer reallocations.

### Pillar 3: Risk/Reward Center-Biased Placement
- High-value bait (golden prey, +40 pts) incentivizes daring gameplay by spawning preferentially in the high-hazard arena center:
  - Center Zone: Manhattan distance $d_{\text{center}}(x, z) = |x - 10| + |z - 10| \le 4$.
  - When rolling `golden` prey in `spawnFood()`, the spawn algorithm attempts up to 50 iterations targeting unoccupied cells within $d_{\text{center}} \le 4$.
  - Fallback: If all center cells are occupied by the snake's coils, it gracefully falls back to any free cell on the board, ensuring zero deadlocks.
  - Exposed helper: `isCenterCell(x, z)` returning `Math.abs(x - 10) + Math.abs(z - 10) <= 4`.

### Pillar 4: Archetype Tuning, Expiration & Run Stats Integration
- Golden prey lifespan is calibrated to **6.0 s** (aligned with G2 backlog).
- Upon expiration without being eaten, golden prey cleanly transitions back to `common` prey, hiding the countdown arc ring.
- Jittery prey senses approaching snake head ($d \le 2.0$ cells) and executes an anticipatory 1-cell escape hop away from the predator.
- `RUN_STATS.foodBreakdown` accurately aggregates consumption for both entities (`common`, `golden`, `jittery`, and `total`).
- End-of-run summary card and clipboard share text display the verified breakdown.

---

## 3. Architecture & Data Structures

```javascript
const PREY_FX = {
  ON: true,
  types: {
    common: { points: 10, name: 'common', maxTimer: 0 },
    golden: { points: 40, name: 'golden', maxTimer: 6.0 },
    jittery: { points: 20, name: 'jittery', maxTimer: 0 }
  },
  geos: {},
  mats: {},
  haloColors: { common: 0xffb347, golden: 0xffd700, jittery: 0x34d399 },
  entities: [
    {
      index: 0,
      type: 'common',
      timer: 0.0,
      maxTimer: 0.0,
      hasHopped: false,
      isHopping: false,
      hopProgress: 0.0,
      hopStartX: 0, hopStartZ: 0, hopTargetX: 0, hopTargetZ: 0,
      twitchTimer: 0.0,
      proximityNear: 0.0
    },
    {
      index: 1,
      type: 'common',
      timer: 0.0,
      maxTimer: 0.0,
      hasHopped: false,
      isHopping: false,
      hopProgress: 0.0,
      hopStartX: 0, hopStartZ: 0, hopTargetX: 0, hopTargetZ: 0,
      twitchTimer: 0.0,
      proximityNear: 0.0
    }
  ],
  // Backward-compatibility getters/setters for entity 0
  get currentType() { return this.entities[0].type; },
  set currentType(v) { this.entities[0].type = v; },
  get goldenTimer() { return this.entities[0].timer; },
  set goldenTimer(v) { this.entities[0].timer = v; },
  get hasHopped() { return this.entities[0].hasHopped; },
  set hasHopped(v) { this.entities[0].hasHopped = v; },
  get isHopping() { return this.entities[0].isHopping; },
  set isHopping(v) { this.entities[0].isHopping = v; },
  get proximityNear() { return this.entities[0].proximityNear; },
  set proximityNear(v) { this.entities[0].proximityNear = v; },
  get twitchTimer() { return this.entities[0].twitchTimer; },
  set twitchTimer(v) { this.entities[0].twitchTimer = v; },
  forcedType: null
};
```

---

## 4. API & Public Contracts

- `window.PREY_FX`: Controller object with dual entities and shared archetype assets.
- `window.setPreyType(type, index = 0)`: Force archetype on entity 0 or 1.
- `window.getPreyState(index = 0)`: Returns detailed archetype and visual state for entity 0 or 1.
- `window.getPreyPoints(index = 0)`: Returns points for entity 0 or 1 ($10$, $40$, or $20$).
- `window.triggerEscapeHop(index = 0)`: Manually trigger escape hop for entity 0 or 1.
- `window.isCenterCell(x, z)`: Returns boolean indicating whether cell $(x, z)$ is in center zone ($|x - 10| + |z - 10| \le 4$).
- `window.resetPreyFx()`: Resets both entities to common prey and zeroes all timers.

---

## 5. Verification & Test Plan

1. **Static AST & Contract Verification (`tests/check_g2_contracts.mjs`):**
   - Asserts dual-entity state structure in `PREY_FX`.
   - Asserts 3D countdown arc geometry and mesh creation (`RingGeometry`, `foodArc1`, `foodArc2`).
   - Asserts center-biased spawn logic targeting $d_{\text{center}} \le 4$.
   - Asserts `getPreyPoints` and `getPreyState` accept entity index.
   - Asserts Frenzy mode eating awards dynamic entity points and records them into `RUN_STATS`.
2. **Dynamic Acceptance Verification (`tests/test_prey_types.mjs`):**
   - Verifies countdown arc visibility and dynamic draw range reduction over time.
   - Verifies 6.0 s golden timer countdown and expiration reversion.
   - Verifies low-timer flashing alert ($t \le 2.0\text{ s}$).
   - Verifies center-biased placement distribution for golden prey ($>80\%$ center hit rate on open boards).
   - Verifies Frenzy mode dual-prey independent archetypes, independent timers, and separate points scoring.
   - Verifies full non-regression against `test_prey.mjs`, `test_difficulty.mjs`, `test_combo.mjs`, and `test_run_structure.mjs`.
