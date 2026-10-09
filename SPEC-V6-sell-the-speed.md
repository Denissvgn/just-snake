# SPEC-V6 — Sell the speed (dynamic FOV · dolly kick · stretched sparks · head ribbon)

> **E03 reconciliation — historical, non-authoritative design.** Current `V6` status: **accepted for the bounded rules-2 release scope** in [ENHANCEMENTS.md](ENHANCEMENTS.md), with executable assertion links and accepted-task provenance. Original detail below is preserved, not a fresh full-release or live-publication claim. [PUBLIC_RELEASE_BACKLOG.md](PUBLIC_RELEASE_BACKLOG.md) DEC02/04/06–10 override conflicting constants, lifecycle, performance and UI clauses.
>
> **Explicit supersession:** B03/C04 supersede unconditional motion and Classic-only HUD speed: requested reduced motion disables FOV/dolly/camera effects; speed derives from active mode interval/profile.
>
> **Compatibility:** every mutable `window.*` hook described below is source-test-only behind `__SNAKE_TEST_BUILD__` or injected by the temporary source adapter. Normal source and dist expose no mutable game controls. Old ready/DONE labels, patch commands and historical benchmarks below are not implementation authority. See [recipe/adaptor audit](docs/HISTORICAL_RECIPES.md).


**Historical design status:** preserved original proposal; current bounded scope is reconciled above.
**Backlog:** `ENHANCEMENTS.md` → Ideas, visual → *"Sell the speed"*, effort S–M, impact ★★☆  
**Depends on:** V1 (smooth body tube) · V2 (selective bloom layer mask) · V3 (death as an event) · V4 (eat juice) · V5 (reactive arena)  
**File:** `snake-three.html`  
**Harness:** `tests/check_v6_contracts.mjs`, `tests/test_speed.mjs`  

---

## 1. Problem and Intent

In classic snake mechanics, the primary indicator of difficulty and progression is step interval acceleration (`stepMs` dropping from `BASE_STEP_MS = 115` ms down to `MIN_STEP_MS = 62` ms as score rises). However, currently in `snake-three.html`:
1. **Static Camera Perspective:** `camera.fov` is permanently pinned at $45.0^\circ$. The camera does not react to acceleration, giving the player no visceral sensory feedback of increasing speed.
2. **Missing Slither Slipstream:** As the snake approaches maximum velocity (16.1 cells/second), the head cuts through the arena with zero aerodynamic wake. There is no motion streak or slipstream trail emanating from the leading edge.
3. **Isotropic Particles:** Particle bursts in `burst()` emit square points (`gl_PointSize`). They do not stretch along their velocity vector $\mathbf{v}$, failing to convey directional kinetic thrust.
4. **No Acceleration Impulse:** Eating prey instantly increases speed (reducing `stepMs`), but there is no transient kick or physical reaction from the viewpoint.

### Scope & Composite Motion Streak Decision
The backlog mentions: *"Sell the speed — FOV/dolly kick tied to 1/stepMs, velocity-stretched sparks, faint additive head ribbon; optional accumulate-blend motion streak on high tier only. fitCamera(), drawCamera(), composite"*.
- **Motion Streak Scope Note:** Accumulate-blend motion blur requires ping-ponging the full HDR scene render target across frames (`POST.prevRT`), which introduces a second full-screen blit pass that risks exceeding the SwiftShader headless frame budget (+15% frame time on software rasterizer). Therefore, full frame accumulate-blend is explicitly **deferred to V11 (high-tier extras)**.
- **V6 Scope Delivery:** V6 delivers the full speed sensation via dynamic FOV scaling, instant dolly kick impulse, velocity-stretched spark streaks, and an aerodynamic head slipstream ribbon, maintaining a strict **+2 draw call** budget on high and **+0 draw calls** on low tier.

---

## 2. The Four Visual Pillars

### Pillar 1: Dynamic Camera FOV & Dolly Kick (`fitCamera()` / `drawCamera()`)
- **Speed Metric:** Normalized speed factor $k_{\text{speed}} \in [0.0, 1.0]$ evaluated against live constants:
  $$k_{\text{speed}} = \text{clamp}\left(\frac{\frac{1}{\text{stepMs}} - \frac{1}{\text{BASE\_STEP\_MS}}}{\frac{1}{\text{MIN\_STEP\_MS}} - \frac{1}{\text{BASE\_STEP\_MS}}}, 0.0, 1.0\right)$$
- **Target Dynamic FOV:** Base FOV is $52.0^\circ$ (matching the original Three.js PerspectiveCamera baseline). Dynamic FOV scales linearly with $k_{\text{speed}}$ up to $+7.0^\circ$:
  $$\text{fov}_{\text{target}} = 52.0^\circ + 7.0^\circ \cdot k_{\text{speed}}$$
- **Dolly Kick Impulse:** On eating prey (`onEat()`), a transient dolly impulse $\text{fovKick} = 3.5^\circ$ is injected. It decays linearly at $8.0^\circ/\text{s}$ ($T_{\text{kick}} \approx 0.437\text{ s}$):
  $$\text{fovKick} \leftarrow \max(0.0, \text{fovKick} - dt \cdot 8.0)$$
- **Camera Coupling:** In `drawCamera(dt)`:
  $$\text{currentFov} \leftarrow \text{currentFov} + (\text{fov}_{\text{target}} - \text{currentFov}) \cdot \min(1.0, 6.0 \cdot dt)$$
  $$\text{camera.fov} = \text{currentFov} + (\text{state} \neq \text{'over'} ? \text{fovKick} : 0.0)$$
  `camera.updateProjectionMatrix()` is called only when $|\Delta \text{fov}| > 0.01^\circ$.
- **Camera Fit Independence:** `fitCamera()` uses constant base FOV ($52.0^\circ$) for bounding sphere distance calculations, ensuring viewport resizing never feeds back into dynamic FOV modulation.
- **Subtle Altitude Dip:** Camera altitude dips slightly under speed to heighten forward perspective:
  $$\Delta y_{\text{speed}} = -0.45 \cdot k_{\text{speed}}$$

### Pillar 2: Velocity-Stretched Sparks (`SPEED_FX.sparkLines`)
- When slithering at moderate-to-high speeds ($k_{\text{speed}} > 0.15$), the snake head sheds high-speed slipstream sparks trailing backward into the wake.
- **Geometry:** Bounded pool of 32 line segments (`THREE.LineSegments`) using pre-allocated `THREE.BufferGeometry` (64 vertices, 192 position floats, 192 color floats).
- **Velocity Stretch:** Each active spark $i$ has head position $\mathbf{p}_i$ and tail position $\mathbf{p}_i - \mathbf{v}_i \cdot \tau_{\text{stretch}}$, where $\tau_{\text{stretch}} = 0.045 \cdot (1.0 + 1.5 \cdot k_{\text{speed}})$.
- **Zero-GC Inactive State:** Inactive sparks have coincident endpoints ($\mathbf{p}_{\text{head}} = \mathbf{p}_{\text{tail}}$) and color $(0.0, 0.0, 0.0)$. Under additive blending (`THREE.AdditiveBlending`), black zero-length lines produce exactly zero visual and mask contribution.
- **Material:** `THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })`.
- **Bloom Tag:** Tagged with `tagBloom('sparks', SPEED_FX.sparkLines)` for emissive glow.

### Pillar 3: Faint Additive Head Ribbon (`SPEED_FX.ribbonMesh`)
- An aerodynamic slipstream ribbon trailing directly behind the leading head mesh.
- **Buffer Geometry:** Quad strip generated from a circular buffer of 16 historical head positions:
  - 16 cross-sections, 32 vertices, **15 quads / 30 triangles** (90 index elements).
  - Width tapers smoothly: $w(u) = 0.32 \cdot (1.0 - u)$ where $u \in [0, 1]$ from head to tail.
  - Opacity scales with speed: $\text{opacity} = 0.35 \cdot k_{\text{speed}}$.
- **Material:** Dedicated additive basic material (`color: 0x38bdf8`, `transparent: true`, `opacity: 0.35`, `blending: THREE.AdditiveBlending`, `depthWrite: false`, `side: THREE.DoubleSide`).
- **Bloom Tag:** Tagged with `tagBloom('fx', SPEED_FX.ribbonMesh)`.
- **Rest State:** At $k_{\text{speed}} = 0$ or when paused/game over, ribbon `visible = false` or opacity is $0.0$, and history points collapse to the head position.

### Pillar 4: Quality Tier Scaling
- **High Tier:** All 32 stretched sparks enabled, 16-sample ribbon enabled, dynamic FOV + dolly kick active.
- **Balanced Tier:** 16 stretched sparks, 10-sample ribbon, dynamic FOV + dolly kick active.
- **Low Tier:** Sparks hidden (`visible = false`), ribbon hidden (`visible = false`), dynamic FOV active (pure camera transform, 0 draw call overhead).

---

## 3. Architecture & Data Structures

All speed visual state is encapsulated in `SPEED_FX`:

```javascript
const SPEED_FX = {
  ON: true,
  SPARK_MAX: 32,
  RIBBON_SAMPLES: 16,
  baseFov: 45.0,
  currentFov: 45.0,
  fovKick: 0.0,
  speedFactor: 0.0,
  sparks: [],           // 32 pooled spark records
  sparkLines: null,     // THREE.LineSegments
  sparkGeo: null,
  ribbonMesh: null,     // THREE.Mesh quad strip
  ribbonGeo: null,
  headHistory: [],      // pre-allocated Vector3 circular buffer
  historyIndex: 0
};
```

### Lifecycle Functions
- `buildSpeedFx()`: Allocates spark line segments, ribbon geometry, materials, pre-allocates history vectors, and registers bloom tags.
- `stepSpeedFx(headPos, dir, dt)`: Updates head position history buffer and spawns slipstream sparks proportional to $k_{\text{speed}}$.
- `updateSpeedFx(dt)`: Advances spark physics (drag, gravity, stretch vector), updates ribbon geometry vertex positions, and damps `fovKick`.
- `triggerSpeedKick()`: Called from `onEat()`; injects $+3.5^\circ$ into `fovKick`.
- `resetSpeedFx()`: Clears active sparks, zeroes ribbon history, resets `fovKick = 0.0`, and restores base FOV $45.0^\circ$. Called in `resetGame()`, `startGame()`, and `gameOver()`.

---

## 4. Headless & Test Contracts

The following hooks must be exposed on `window`:
- `window.SPEED_FX`: Controller object containing pools, fov state, and configuration.
- `window.triggerSpeedKick()`: Hook to manually trigger the dolly kick impulse.
- `window.resetSpeedFx()`: Hook to clear speed visual state.
- `window.getSpeedFactor()`: Returns current normalized $k_{\text{speed}} \in [0, 1]$.
- `window.setStepMs(ms)`: Deterministic debug setter to test speed scaling at any value without requiring 40 prey.

---

## 5. Measured Acceptance Criteria

| # | Criterion | Verification Contract | Budget / Target |
|---|---|---|---|
| 1 | **FOV Scaling** | At `stepMs = 115` ($k=0$), `camera.fov` approaches $52.0^\circ \pm 0.2^\circ$. At `setStepMs(62)` ($k=1$), `camera.fov` widens to $59.0^\circ \pm 0.35^\circ$. | $52.0^\circ \to 59.0^\circ$ |
| 2 | **Dolly Kick Impulse** | Calling `triggerSpeedKick()` increases `camera.fov` by $\ge 2.5^\circ$ (peak $\ge 61.0^\circ$), decaying to $< 0.35^\circ$ within $0.45\text{ s}$. | Peak $\ge 61.0^\circ$, decay $< 0.45\text{ s}$ |
| 3 | **Stretched Spark Pool** | `SPEED_FX.sparkLines` contains 32 segments (64 vertices). Inactive sparks collapse to coincident vertices with $(0,0,0)$ color. | 64 vertices, zero leak |
| 4 | **Head Ribbon Geometry** | `SPEED_FX.ribbonMesh` contains 16 cross-sections, 32 vertices, 30 triangles. Opacity scales with $k_{\text{speed}}$. | 32 verts, 30 tris |
| 5 | **Selective Bloom Registration** | Sparks tagged with `tagBloom('sparks', SPEED_FX.sparkLines)`. Ribbon tagged with `tagBloom('fx', SPEED_FX.ribbonMesh)`. | Tagged in `BLOOM_TAGS` |
| 6 | **Quality Tier Scaling** | On `low` tier, spark and ribbon meshes have `visible = false` (+0 draw calls); dynamic FOV remains active. | +0 calls on `low`, +2 on `high` |
| 7 | **Zero Allocation & Reset** | Zero GC allocations during `updateSpeedFx()`. Calling `resetSpeedFx()` zeroes active sparks, ribbon history, and resets FOV to $52.0^\circ$. | 0 bytes GC / frame |