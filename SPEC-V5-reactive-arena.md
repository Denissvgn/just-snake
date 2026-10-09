# SPEC-V5 — Reactive arena (bioluminescent trail · wall death pulse · zone color grading)

> **E03 reconciliation — historical, non-authoritative design.** Current `V5` status: **accepted for the bounded rules-2 release scope** in [ENHANCEMENTS.md](ENHANCEMENTS.md), with executable assertion links and accepted-task provenance. Original detail below is preserved, not a fresh full-release or live-publication claim. [PUBLIC_RELEASE_BACKLOG.md](PUBLIC_RELEASE_BACKLOG.md) DEC02/04/06–10 override conflicting constants, lifecycle, performance and UI clauses.
>
> **Explicit supersession:** C04 supersedes score-derived zones: transitions at 10/20/30/40 successful prey; demo has a separate eat counter and restores player atmosphere.
>
> **Compatibility:** every mutable `window.*` hook described below is source-test-only behind `__SNAKE_TEST_BUILD__` or injected by the temporary source adapter. Normal source and dist expose no mutable game controls. Old ready/DONE labels, patch commands and historical benchmarks below are not implementation authority. See [recipe/adaptor audit](docs/HISTORICAL_RECIPES.md).


**Historical design status:** preserved original proposal; current bounded scope is reconciled above.
**Backlog:** `ENHANCEMENTS.md` → Ideas, visual → *"Reactive arena"*, effort M, impact ★★★  
**Depends on:** V1 (smooth body tube) · V2 (selective bloom layer mask) · V3 (death as an event) · V4 (eat juice)  
**File:** `snake-three.html`  

---

## 1. Problem and Intent

Currently, the arena is a static, inert container:
1. **Inert floor:** The dark ground plane (`#0a1120`) and grid helper (`0x2b6a94`) never respond to the snake's slithering. The snake leaves no physical or luminescent wake, separating the character from the board.
2. **Disconnected death impacts:** When the snake hits a wall in V3, an impact flash and floor shockwave ring appear, but the perimeter neon trim (`0x0ea5e9`) stays rigid and unaffected. There is no kinetic energy transfer around the boundary of the arena.
3. **No visual game progression:** Regardless of whether the player has eaten 1 prey or 50 prey, the overall atmosphere and color grade remain identical. There is no sensory reward for reaching deep game lengths or surviving high speeds.

SPEC-V5 transforms the arena into a living, responsive reactive environment with 3 visual pillars.

---

## 2. The Three Visual Pillars

### Pillar 1: Bioluminescent Floor Trail (`ARENA_FX.trailPool`)
- As the snake moves, cells vacated by the head/body emit a soft, glowing bioluminescent floor footprint.
- **Elevation:** $y = 0.016$ (situated above floor grid $y = 0.012$ and below eat shockwave $y = 0.025$).
- **Geometry:** Horizontal planar quads (`THREE.PlaneGeometry(0.85, 0.85)` rotated with `rotateX(-Math.PI / 2)`).
- **Material:** Dedicated pooled `THREE.MeshBasicMaterial` instances with `color: 0x0ea5e9`, `transparent: true`, `opacity: 0.45`, `blending: THREE.AdditiveBlending`, `depthWrite: false`.
- **Pool Size:** Fixed pool of 24 quads (`ARENA_FX.TRAIL_MAX = 24`). Zero allocations during play.
- **Lifetime & Decay:** Duration $T = 1.25\text{ s}$. Opacity decays following an ease-out curve:
  $$\text{opacity}(t) = 0.45 \cdot \left(1 - \frac{t}{T}\right)^2$$
- **Bloom Integration:** Tagged with `tagBloom('fx', mesh)` for soft emissive radiance.
- **Zero Idle Cost:** Inactive quads have `visible = false` (0 extra draw calls when stopped or empty).

### Pillar 2: Wall Perimeter Energy Pulse on Death (`ARENA_FX.pulsePool`)
- Upon impact death (`startDeath(reason)`), the kinetic energy transfers into the wall trim.
- Two luminescent energy wave packets spawn at the impact point $\mathbf{p}_{\text{impact}}$ on the wall trim and travel along the perimeter in opposite directions (clockwise and counter-clockwise).
- **Geometry & Mesh:** 2 pooled trim pulse meshes (`THREE.BoxGeometry(0.35, 0.72, 0.35)`).
- **Material:** Additive glowing basic material (`color: 0x38bdf8`, `opacity: 0.9`, `depthWrite: false`, `transparent: true`).
- **Speed & Lifetime:** Velocity $v = 18\text{ units/s}$ along perimeter paths; lifetime $T_{\text{pulse}} = 0.65\text{ s}$.
- **Decay:** Opacity decays smoothly to $0.0$ at expiry.
- **Bloom Integration:** Tagged with `tagBloom('fx', mesh)`.
- **Zero Idle Cost:** At rest, `visible = false`.

### Pillar 3: Zone Atmosphere & Color Grading (`uZoneTint` in `COMP_FS`)
- A new uniform `uniform vec3 uZoneTint;` is added to `COMP_FS` and integrated into the ACES post-processing pass:
  $$\mathbf{c}_{\text{tinted}} = (\mathbf{c}_{\text{base}} + \mathbf{c}_{\text{bloom}} \cdot \text{bloomStrength}) \cdot \mathbf{u}_{\text{ZoneTint}}$$
  $$\mathbf{c}_{\text{final}} = \text{aces}(\mathbf{c}_{\text{tinted}} \cdot 1.06)$$
- **Zone Thresholds:** Transitions trigger every 10 foods eaten (each food worth 10 score points; $\text{zone} = \min(4, \lfloor\text{score} / 100\rfloor)$):
  - **Zone 0 (Score 0–90, 0–9 foods):** *Cyber Cyan* — $\mathbf{t}_0 = [1.00, 1.00, 1.00]$ (baseline neutrality)
  - **Zone 1 (Score 100–190, 10–19 foods):** *Bio Emerald* — $\mathbf{t}_1 = [0.82, 1.15, 0.88]$ (deep bioluminescent green)
  - **Zone 2 (Score 200–290, 20–29 foods):** *Solar Amber* — $\mathbf{t}_2 = [1.18, 1.02, 0.70]$ (electric warm gold)
  - **Zone 3 (Score 300–390, 30–39 foods):** *Synthwave Violet* — $\mathbf{t}_3 = [1.12, 0.80, 1.22]$ (atmospheric purple)
  - **Zone 4 (Score 400+, 40+ foods):** *Hyper Crimson* — $\mathbf{t}_4 = [1.25, 0.72, 0.75]$ (high-intensity overdrive red; clamped terminal zone)
- **Transition Smoothing:** Atmosphere changes do not jump instantly; they smoothly drift over $\approx 1.4\text{ s}$ using exponential lerp:
  $$\mathbf{u}_{\text{ZoneTint}} \leftarrow \mathbf{u}_{\text{ZoneTint}} + (\mathbf{t}_{\text{target}} - \mathbf{u}_{\text{ZoneTint}}) \cdot \min(1.0, 2.2 \cdot dt)$$
- **Reset Hygiene:** On restart or reset, immediately snaps back to Zone 0 $[1.0, 1.0, 1.0]$.

---

## 3. Architecture & Data Structures

All reactive arena state is unified under the `ARENA_FX` controller:

```javascript
const ARENA_FX = {
  ON: true,
  TRAIL_MAX: 24,
  TRAIL_LIFE_S: 1.25,
  PULSE_LIFE_S: 0.65,
  trailPool: [],       // 24 pooled floor quads
  pulsePool: [],       // 2 pooled wall pulse meshes
  currentZone: 0,
  targetTint: new THREE.Vector3(1.0, 1.0, 1.0),
  currentTint: new THREE.Vector3(1.0, 1.0, 1.0)
};
```

### Lifecycle Functions
- `buildArenaFx()`: Pre-allocates all 24 trail meshes, 2 pulse meshes, and configures bloom tags.
- `stepArenaTrail(cellX, cellZ)`: Called when the snake moves; activates a pooled trail quad at the cell coordinate.
- `triggerWallPulse(impactPoint, wallReason)`: Called from `startDeath()`; launches twin perimeter pulse waves.
- `updateArenaFx(dt)`: Updates trail fading, wall pulse propagation, and smooth zone tint interpolation.
- `checkZoneProgression(score)`: Evaluates current score and sets `targetTint` accordingly.
- `resetArenaFx()`: Immediately clears active trails, hides wall pulses, and restores Zone 0 $[1.0, 1.0, 1.0]$ tint.

---

## 4. Acceptance Criteria

1. **Floor Trail Elevation & Alignment:** Trail quads reside at elevation $y = 0.016 \pm 0.002$ and have horizontal orientation (`rotation.x = -Math.PI / 2`).
2. **Trail Lifespan & Bounded Pools:** Trail quads fade out continuously over $1.25\text{ s}$; pool capacity never exceeds 24 quads; zero runtime allocations.
3. **Wall Perimeter Pulse:** On wall collision death, 2 pulse meshes spawn at impact point, travel along the wall trim, and return to pool within $0.65\text{ s}$.
4. **Composite Zone Tint:** `COMP_FS` includes `uniform vec3 uZoneTint;` applied to composite color before tone-mapping.
5. **Zone Progression Dynamics:** Scoring 100 points switches from Zone 0 to Zone 1, shifting `currentTint` away from $[1.0, 1.0, 1.0]$.
6. **Selective Bloom Compliance:** Both trail quads and pulse meshes are registered with `tagBloom('fx', mesh)`.
7. **Clean Reset & Hygiene:** `resetArenaFx()` clears all active trails and pulses and resets zone tint to $[1.0, 1.0, 1.0]$.
