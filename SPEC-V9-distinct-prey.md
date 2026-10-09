# SPEC-V9 — Distinct prey silhouettes + idle behaviour (varied geometries · idle micro-behaviors · escape hop)

> **E03 reconciliation — historical, non-authoritative design.** Current `V9` status: **accepted for the bounded rules-2 release scope** in [ENHANCEMENTS.md](ENHANCEMENTS.md), with executable assertion links and accepted-task provenance. Original detail below is preserved, not a fresh full-release or live-publication claim. [PUBLIC_RELEASE_BACKLOG.md](PUBLIC_RELEASE_BACKLOG.md) DEC02/04/06–10 override conflicting constants, lifecycle, performance and UI clauses.
>
> **Explicit supersession:** B06/B07 supersede updatePrey-owned logical timers/hops: drawing is cosmetic; golden expires at6000 simulation ms before equal-time eat, jitter logic runs after movement with deterministic exclusions/ties.
>
> **Compatibility:** every mutable `window.*` hook described below is source-test-only behind `__SNAKE_TEST_BUILD__` or injected by the temporary source adapter. Normal source and dist expose no mutable game controls. Old ready/DONE labels, patch commands and historical benchmarks below are not implementation authority. See [recipe/adaptor audit](docs/HISTORICAL_RECIPES.md).


**Historical design status:** preserved original proposal; current bounded scope is reconciled above.
**Backlog:** `ENHANCEMENTS.md` → Ideas, visual → *"Distinct prey silhouettes + idle behaviour"*, effort M, impact ★★☆  
**Depends on:** V1 (smooth body tube) · V2 (selective bloom layer mask) · V3 (death as an event) · V4 (eat juice) · V5 (reactive arena) · V6 (sell the speed) · V7 (camera life) · V8 (skin liveliness)  
**File:** `snake-three.html`  
**Harness:** `tests/check_v9_contracts.mjs`, `tests/test_prey.mjs`  

---

## 1. Problem and Intent

Currently in `snake-three.html`:
1. **Monotonous Prey Appearance:** Food is permanently rendered as a single static orange `OctahedronGeometry` with a generic glow sprite. Every food item looks, spins, and behaves identically throughout an entire playthrough.
2. **Absence of Idle Life:** The food rotates at a constant yaw ($\Delta \psi = dt \cdot 1.3$) and bob frequency ($\sin(4t)$). It does not react to the approaching predator or exhibit organic micro-behaviors (such as nervous twitches, rapid shimmer, or energetic pulses).
3. **Missing Escape Mechanics:** Prey never evades, lacking the tactile urgency promised by gameplay concept G2.

---

## 2. The Three Visual Pillars

### Pillar 1: Distinct Geometric Silhouettes & PBR Materials
A pre-allocated pool of three distinct prey archetypes:
1. **Common Prey (Bio-Sphere / Apple)**:
   - **Geometry:** `THREE.IcosahedronGeometry(0.38, 1)` (smooth, organic geodesic sphere).
   - **Material:** Vivid coral-red `MeshPhysicalMaterial`: `color: 0xff5a1f`, `emissive: 0xff3b00`, `roughness: 0.25`, `clearcoat: 1.0`.
   - **Point Value:** $+10$ points.
   - **Glow & Light:** Orange halo (`color: 0xffb347`, scale `2.4`), point light intensity `1.6`.
2. **Golden Prey (Radiant Sun Gem / High-Value Bait)**:
   - **Geometry:** Faceted `THREE.OctahedronGeometry(0.46, 0)` (sharp crystalline gem).
   - **Material:** Gleaming metallic gold `MeshPhysicalMaterial`: `color: 0xffd700`, `metalness: 0.88`, `roughness: 0.12`, `clearcoat: 1.0`, `emissive: 0xff9900`, `emissiveIntensity: 2.4`.
   - **Point Value:** $+40$ points (aligned with G2).
   - **Timer:** 7.0 s countdown before reverting to common prey, accompanied by golden halo pulsing.
   - **Glow & Light:** Brilliant golden halo (scale `3.2`), point light intensity `2.5`.
3. **Jittery Prey (Bioluminescent Critter / Electric Beetle)**:
   - **Geometry:** Compact elongated `THREE.CapsuleGeometry(0.22, 0.30, 8, 12)` (critter capsule).
   - **Material:** Neon emerald / electric turquoise `MeshPhysicalMaterial`: `color: 0x10b981`, `emissive: 0x059669`, `roughness: 0.28`, `sheen: 0.85`.
   - **Point Value:** $+20$ points.
   - **Escape Hop:** Senses head within 2 grid cells and executes a 1-cell escape hop.
   - **Glow & Light:** Emerald halo (`color: 0x34d399`, scale `2.2`), point light intensity `1.8`.

### Pillar 2: Dynamic Idle Micro-Behaviors & Proximity Reactions
Each archetype features a unique kinetic rhythm in `drawFood(dt)`:
- **Common:** Rhythmic levitation bobbing ($y(t) = 0.62 + 0.08 \cdot \sin(3.6 t)$) and gentle tumbling ($1.2	ext{ rad/s}$).
- **Golden:** Dual-axis rapid tumble ($3.6	ext{ rad/s}$ yaw, $2.0	ext{ rad/s}$ pitch) with high-frequency vertical shimmer ($\sin(8.0 t) \cdot 0.04$) and timer-dependent intensity.
- **Jittery:** Periodic nervous twitching (impulsive yaw shifts $\Delta \psi = \pm 0.35$ rad every $0.35	ext{ s}$ via deterministic timer) and energetic flutter.
- **Proximity Agitation:** Normalized 2D board distance:
  $$d_{\text{board}} = \text{hypot}(\text{food.x} - \text{head.x}, \text{food.z} - \text{head.z})$$
  When $d_{\text{board}} < 3.0$ cells, $\text{proximityNear} = \text{clamp}(1.0 - d_{\text{board}} / 3.0, 0.0, 1.0)$.
  Golden pulses halo scale ($2.4 \to 3.2$), Jittery vibrates laterally.

### Pillar 3: Jittery Escape Hop Mechanic
- When Jittery senses the approaching snake head at $d_{\text{board}} \le 2.0$ cells and has not yet hopped (`hasHopped === false`):
  1. Identifies valid unoccupied adjacent cells (up, down, left, right within grid boundaries not occupied by snake segments).
  2. Picks an escape direction moving away from the head vector.
  3. Executes a parabolic visual hop over $0.18\text{ s}$ ($\Delta y = 0.45 \cdot \sin(\pi \tau)$), setting new grid coordinates `food = { x: targetX, z: targetZ }`.
  4. Sets `hasHopped = true` (one hop per life cycle to preserve player fairness).

---

## 3. Architecture & Data Structures

All prey archetype state is encapsulated in `PREY_FX`:

```javascript
const PREY_FX = {
  ON: true,
  currentType: 'common', // 'common' | 'golden' | 'jittery'
  types: {
    common: { points: 10, name: 'common' },
    golden: { points: 40, name: 'golden' },
    jittery: { points: 20, name: 'jittery' }
  },
  assets: {
    geometries: {},
    materials: {},
    haloColors: {}
  },
  goldenTimer: 0.0,
  hasHopped: false,
  hopProgress: 0.0,
  hopStart: { x: 0, z: 0 },
  hopTarget: { x: 0, z: 0 },
  twitchTimer: 0.0,
  twitchYaw: 0.0,
  proximityNear: 0.0
};
```

### Lifecycle Functions
- `buildPreyFx()`: Pre-allocates all 3 geometries and materials, caches halo colors, and registers `foodMesh` with `tagBloom('prey', foodMesh)`.
- `spawnPrey(type)`: Selects prey type based on spawn policy (70% common, 15% jittery, 15% golden) or debug parameter. Resets timers, hop state, and swaps geometry/material references.
- `updatePrey(dt, headPos)`: Updates idle bob, rotation, nervous twitches, golden countdown timer, and proximity detection / escape hop.
- `getPreyPoints()`: Returns active point value ($10$, $40$, or $20$).
- `resetPreyFx()`: Resets to common prey archetype, neutral timers, and zero proximity agitation.

---

## 4. Headless & Test Contracts

The following hooks must be exposed on `window`:
- `window.PREY_FX`: The prey controller.
- `window.setPreyType(type)`: Manually forces the active prey type for testing.
- `window.getPreyState()`: Returns active type, point value, geometry name, halo scale, and proximity near factor.
- `window.triggerEscapeHop()`: Triggers the Jittery escape hop for verification.
- `window.resetPreyFx()`: Clears state back to default common prey.

---

## 5. Measured Acceptance Criteria

| # | Criterion | Verification Contract | Target / Tolerance | Performance Budget |
|---|---|---|---|---|
| 1 | **3 Distinct Silhouettes & Archetypes** | Calling `setPreyType('golden')` or `setPreyType('jittery')` swaps geometry, material color, and halo appearance. | Distinct geometries & colors | 0 new objects allocated at runtime |
| 2 | **Dynamic Point Value Scaling** | `getPreyPoints()` returns 10 for common, 40 for golden, 20 for jittery; `onEat()` awards matching points. | 10 / 40 / 20 exact | 0 layout thrash |
| 3 | **Distinct Idle Animations** | Golden exhibits higher rotational speed than common ($> 2.5\times$ yaw rate); Jittery exhibits impulsive twitch yaw. | Golden yaw rate $> 2.5\times$ common | 0 draw calls |
| 4 | **Proximity Reactive Agitation** | Head distance $d < 2.5$ triggers positive `proximityNear > 0.5` and micro-vibration / halo pulse. | `proximityNear > 0.5` | 0 draw calls |
| 5 | **Jittery Escape Hop Execution** | Calling `triggerEscapeHop()` or approaching within 2 cells causes Jittery to displace to adjacent cell with parabolic hop trajectory. | Displaces 1 grid cell | 0 draw calls |
| 6 | **Clean Reset** | Calling `resetPreyFx()` restores common prey archetype and zero proximity agitation. | `type === 'common'`, `near === 0` | 0 draw calls |
| 7 | **Zero Memory Allocation** | All geometries and materials are pre-allocated at startup; switching types performs zero `new` allocations. | 0 bytes GC / spawn | 0 programs |\n