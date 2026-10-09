# SPEC-V4 — Eat juice (shockwave · squash-pop · spark shaders · world score)

> **E03 reconciliation — historical, non-authoritative design.** Current `V4` status: **accepted for the bounded rules-2 release scope** in [ENHANCEMENTS.md](ENHANCEMENTS.md), with executable assertion links and accepted-task provenance. Original detail below is preserved, not a fresh full-release or live-publication claim. [PUBLIC_RELEASE_BACKLOG.md](PUBLIC_RELEASE_BACKLOG.md) DEC02/04/06–10 override conflicting constants, lifecycle, performance and UI clauses.
>
> **Explicit supersession:** D02 supersedes full-array idle particle updates: active-index pool, unique overwrites, final clear/upload once, idle early return. Sensory effects do not own gameplay metrics.
>
> **Compatibility:** every mutable `window.*` hook described below is source-test-only behind `__SNAKE_TEST_BUILD__` or injected by the temporary source adapter. Normal source and dist expose no mutable game controls. Old ready/DONE labels, patch commands and historical benchmarks below are not implementation authority. See [recipe/adaptor audit](docs/HISTORICAL_RECIPES.md).


**Historical design status:** preserved original proposal; current bounded scope is reconciled above.
**Backlog:** `ENHANCEMENTS.md` → Ideas, visual → *"Eat juice"*, effort S, impact ★★☆  
**Depends on:** V1 (smooth body tube) · V2 (selective bloom layer mask) · V3 (death as an event)  
**File:** `snake-three.html`  

---

## 1. Problem

Eating prey is the core reward loop of Snake, executed every few seconds. Today, `onEat()` executes in a single instant with noticeable visual debt:

| What happens today | Where | What the player experiences |
|---|---|---|
| Food instantly relocates | `step()` / `spawnFood()` | Food instantaneously teleports to a new grid cell in the exact same frame. There is no sense of ingestion or consumption. |
| Flat spark burst | `burst()` | 20 points generated using uniform-size `PointsMaterial(size: 0.17)`. Size is static across life; alpha is faked by multiplying RGB to black. Sparks feel like rigid confetti rather than expanding/fading heat. |
| DOM floating score | `popScore()` | Appends an HTML `<div>` with `position: absolute` via `project(camera)`. Causes DOM allocation, style recalculation, and layout thrashing every eat. Floats *over* 3D arena walls, HUD panels, and overlays, ignoring scene depth. |
| No physical floor impact | `onEat()` | Only camera shake (`shake = 0.35`) occurs; no floor ripple or arena reaction connects the eat event to the physical arena floor. |

---

## 2. Goals and Non-Goals

### Goals
1. **Visceral physical impact:** A rapid ground shockwave ripples outward along the arena floor under the snake's jaws.
2. **Prey squash-then-pop:** Consumed prey squashes under impact (anticipation) and pops outward in a flash before vanishing, while newly spawned prey pops in with an inviting bounce.
3. **Dynamic particle rendering:** Spark burst upgraded with custom `ShaderMaterial` supporting per-particle `pSize` (scale-over-life) and true `pAlpha` fading.
4. **World-space floating score:** Replace DOM `popScore` with a pooled in-scene 3D sprite billboard that respects 3D depth, perspective, and occluders, eliminating all DOM allocations and reflows.
5. **Selective Bloom integration (V2):** Shockwave, pop flash, sparks, and floating score participate in `tagBloom('fx'/'prey'/'sparks')` with clean thresholds.
6. **Zero runtime allocations (0 GC):** Shockwaves, prey proxies, and score billboards are pre-allocated at startup into small fixed pools.
7. **Deterministic & testable:** Every effect integrates with manual simulation stepping and headless test harnesses.

### Non-Goals
- Sound synthesis (backlog **G11**).
- Camera FOV kick on eat (backlog **V6**).
- Arena floor tile trail / glowing path (backlog **V5**).
- Multiple food types or combos (backlog **G1** / **G2**).

---

## 3. Design

### 3.1 Timeline of an Eat Event

When `nx === food.x && nz === food.z` in `step()`:

```
 t = 0 ms     onEat() triggered:
             ├── Ground shockwave spawns at (food.x, 0.025, food.z), radius 0.2
             ├── Prey squash proxy spawns at food position, scale (1.35, 0.35, 1.35)
             ├── New prey spawned at (new.x, 0.62, new.z) with pop-in scale 0.0 -> 1.0
             ├── Spark burst (24 particles) with randomized initial sizes (0.18…0.32)
             └── World score "+10" spawns at (food.x, 0.85, food.z), rising smoothly

 0…80 ms     Prey squashes flat; shockwave ring expands rapidly to r = 0.8; sparks expand.
 80…200 ms   Prey pops outward to scale 1.6 and vanishes; shockwave fades to r = 1.4; score rises.
 200…360 ms  Shockwave alpha reaches 0.0; sparks settle with bounce and fade; new food settles.
 360…750 ms  World score floats upward (+1.4 y) and eases alpha to 0.0; recycled into pool.
```

State is managed cleanly in an `EAT_FX` controller object:

```javascript
const EAT_FX = {
  ringPool: [],       // Array of 2 pooled shockwave ring meshes
  popPool: [],        // Array of 2 pooled prey squash/pop meshes
  scorePool: [],      // Array of 4 pooled world-space score sprite billboards
  scoreTex: null      // Cached CanvasTexture with rendered "+10"
};
```

---

### 3.2 Ground Shockwave Ring (`eatRing`)

- **Geometry:** `THREE.RingGeometry(0.7, 1.0, 32)` positioned horizontally on the floor at `y = 0.025` (above the floor plane `y = 0.02`, below the snake body `y ~ 0.44`).
- **Material:** `THREE.MeshBasicMaterial` with `color: 0xffa033`, `transparent: true`, `opacity: 0.85`, `blending: THREE.AdditiveBlending`, `depthWrite: false`, `side: THREE.DoubleSide`.
- **Bloom:** Tagged with `tagBloom('fx', mesh)`.
- **Animation:**
  - Radius: scales from `scale = 0.25` to `scale = 1.45` over `RING_DURATION = 0.35 s`.
  - Opacity: eases out quadratically: $\alpha(t) = 0.85 \times (1 - t / T)^2$.
  - Hidden and marked inactive when $t \ge T$.

---

### 3.3 Prey Squash-then-Pop (`eatPreyProxy`)

- **Geometry & Appearance:** Pre-allocated mesh matching the food geometry (`OctahedronGeometry(0.42, 0)`) with an emissive-boosted material (`MeshPhysicalMaterial`, color `0xff7a45`, emissive `0xff6a20`, emissiveIntensity `2.5`).
- **Dynamics:**
  - Anticipation Squash ($0 \le t < 0.08\text{ s}$):
    $$s_y(t) = 1.0 - 0.65 \times (t / 0.08)$$
    $$s_x(t) = s_z(t) = 1.0 + 0.38 \times (t / 0.08)$$
  - Explosive Pop ($0.08 \le t \le 0.26\text{ s}$):
    Progress $p = (t - 0.08) / 0.18$:
    $$s_y(t) = 0.35 + 1.25 \times (1 - (p - 1)^2)$$
    $$\text{opacity} = 1.0 - p^{1.8}$$
    Scale rapidly collapses to 0.0 at the end.
- **Spawn Bounce on New Prey:** Newly spawned `foodMesh` animates scale from `0.2` to `1.0` with an overshoot spring ($1.0 + 0.3 \times e^{-8t} \times \sin(18t)$), giving it a lively entrance.

---

### 3.4 Custom Particle ShaderMaterial (`pSize` & `pAlpha`)

Replace `PointsMaterial` with a dedicated, lightweight `ShaderMaterial`:

```glsl
// Vertex Shader
attribute float pSize;
attribute float pAlpha;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vColor = color;
  vAlpha = pAlpha;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = pSize * (300.0 / -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
}

// Fragment Shader
uniform sampler2D map;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec4 tex = texture2D(map, gl_PointCoord);
  gl_FragColor = vec4(vColor, 1.0) * tex * vAlpha;
}
```

#### Particle Attributes in `P` Pool:
- `pSize` array (`Float32Array(MAX_P)`): initial size set to `0.20 + random * 0.14`.
- `pAlpha` array (`Float32Array(MAX_P)`): initial alpha `1.0`.
- Update loop updates:
  $$pSize[i] = initialSize[i] \times (0.25 + 0.75 \times (life / maxLife)^{0.8})$$
  $$pAlpha[i] = (life / maxLife)^{1.4}$$
Sparks pop big and fiery upon birth and shrink to glowing embers before disappearing.

---

### 3.5 World-Space Floating Score (`floatScore`)

- **Eliminating DOM Reflow:** Remove `document.createElement('div')` and `popScore(worldPos)` DOM insertion.
- **Offscreen Canvas Texture:**
  - Render "+10" onto a $128 \times 64$ offscreen canvas once at startup.
  - Golden font `#ffd166` with dark edge outline (`#1a0f00`, lineWidth 4) and soft glow.
  - Wrapped in `THREE.CanvasTexture`.
- **Sprite Billboard Pool:**
  - 4 pooled `THREE.Sprite` instances using `THREE.SpriteMaterial({ map: scoreTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })`.
  - Added to `scene` and tagged with `tagBloom('fx', sprite)`.
- **Trajectory:**
  - Initial position: `(x, 0.85, z)`.
  - Upward drift: $y(t) = 0.85 + 1.5 \times (t / 0.75)^{0.85}$.
  - Scale punch: springs from `(0.8, 0.4)` to `(1.2, 0.6)` then settles to `(1.0, 0.5)`.
  - Alpha: holds $1.0$ until $t = 0.4\text{ s}$, then fades linearly to $0.0$ at $0.75\text{ s}$.
  - Depth tested: naturally occluded by foreground obstacles, creating authentic scene depth.

---

## 4. Interaction with Existing Systems

1. **Selective Bloom (V2):**
   - Shockwave ring and floating score sprite are tagged `'fx'` (threshold: `0.75`).
   - Prey pop proxy is tagged `'prey'` (threshold: `0.70`).
   - Particles remain tagged `'sparks'` (threshold: `0.60`).
   - In mask mode (`M`), all eat juice elements render to `POST.bloomRT` without leaking onto untagged walls or floor.
2. **Smooth Tube (V1):**
   - Shockwave ring sits at $y = 0.025$, cleanly passing under the dynamic Catmull-Rom tube body ($y \approx 0.44$).
3. **Death as an Event (V3):**
   - Resetting or dying clears active eat juice effects (`resetEatFx()`), leaving no lingering sprites or shockwaves on game over.
4. **Quality Tiers:**
   - On `low` quality tier: particle count per burst is reduced from 20 to 12; shockwave ring uses 16 segments instead of 32.

---

## 5. Performance and Resource Budget

- **Draw calls:** At rest: **0 additional draw calls** (all pooled meshes have `visible = false`).
- **During an eat event:**
  - +1 call for active shockwave ring.
  - +1 call for prey pop proxy (lasts 0.26 s).
  - +1 call for floating score sprite (lasts 0.75 s).
  - Maximum temporary surge: **+3 draw calls**, returning to 0 within 0.75 s.
- **CPU / Memory:**
  - Zero DOM node allocations.
  - Zero `new THREE.Mesh` or `new THREE.BufferGeometry` inside frame loops.
  - Pre-allocated Float32Array buffers for `pSize` and `pAlpha`.
  - Fragment shader is ~4 instructions (one texture sample, one multiply).

---

## 6. Acceptance Criteria

1. **Ground Shockwave:**
   - An eat event spawns a planar ring at floor level ($y = 0.025$).
   - Ring expands from radius $\le 0.3$ to $\ge 1.3$ and disappears completely within $0.4\text{ s}$.
2. **Prey Squash and Pop:**
   - Eaten prey displays a visible vertical squash ($s_y \le 0.5$) before scaling to zero.
   - Newly spawned food scales in smoothly rather than snapping instantly.
3. **Particle Size and Alpha Attenuation:**
   - Points buffer geometry contains `pSize` and `pAlpha` attributes.
   - Particles exhibit size variance and non-binary alpha decay across their lifetime.
4. **World-Space Floating Score:**
   - Score popup is rendered as a 3D sprite in `scene`, not as a DOM `<div>` in `document.body`.
   - `document.querySelectorAll('.floatScore').length === 0` at all times.
   - Sprite floats upward and fades to opacity $0$ within $0.8\text{ s}$.
5. **Selective Bloom Integrity (V2):**
   - All eat juice meshes are registered with `tagBloom`.
   - In mask mode, eat juice objects contribute cleanly to `POST.bloomRT`.
6. **Zero Memory Leaks & Reset Cleanliness:**
   - Restarting the game or triggering death cleanly resets all active eat juice pools.
   - Frame rate maintains 60 FPS target with 0 GC allocations during continuous eating.
