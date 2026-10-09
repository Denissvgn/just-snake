# SPEC-V11 — High-tier extras (Floor contact planar reflection · Gloss boost · Tilt-shift optical blur · Tier gating)

> **E03 reconciliation — historical, non-authoritative design.** Current `V11` status: **accepted for the bounded rules-2 release scope** in [ENHANCEMENTS.md](ENHANCEMENTS.md), with executable assertion links and accepted-task provenance. Original detail below is preserved, not a fresh full-release or live-publication claim. [PUBLIC_RELEASE_BACKLOG.md](PUBLIC_RELEASE_BACKLOG.md) DEC02/04/06–10 override conflicting constants, lifecycle, performance and UI clauses.
>
> **Explicit supersession:** D03 accepts exact original High reflection/gloss/tilt-shift restoration and measured lower-tier gates. Historical blanket zero allocations/program claims are not universal guarantees.
>
> **Compatibility:** every mutable `window.*` hook described below is source-test-only behind `__SNAKE_TEST_BUILD__` or injected by the temporary source adapter. Normal source and dist expose no mutable game controls. Old ready/DONE labels, patch commands and historical benchmarks below are not implementation authority. See [recipe/adaptor audit](docs/HISTORICAL_RECIPES.md).


**Historical design status:** preserved original proposal; current bounded scope is reconciled above.
**Backlog:** `ENHANCEMENTS.md` → Ideas, visual → *"High-tier extras — floor 'reflection' via an inverted, faded copy clipped at y = 0 (or a gloss boost reusing the bloom pyramid); tilt-shift only if the frame budget allows"*, effort M–L, impact ★☆☆  
**Depends on:** V1 (smooth body tube) · V2 (selective bloom layer mask) · V3 (death as an event) · V4 (eat juice) · V5 (reactive arena) · V6 (sell the speed) · V7 (camera life) · V8 (skin liveliness) · V9 (distinct prey silhouettes) · V10 (attract mode)  
**File:** `snake-three.html`  
**Harness:** `tests/check_v11_contracts.mjs`, `tests/test_high_tier.mjs`  

---

## 1. Problem and Intent

Currently in `snake-three.html`:
1. **Underutilized High Tier:** The `high` quality tier enables shadows, 4 bloom pyramid levels, and SMAA. However, the surface appearance of the arena floor and post-processing aesthetics remain virtually identical to `balanced` tier.
2. **Floating Visual Detachment:** The snake body slithers at $y \approx 0.45$ and prey hovers at $y \approx 0.62$ above a matte dark floor ($roughness = 0.78, metalness = 0.18$). While soft contact shadow blobs exist, the lack of specular floor reflection and grounding specular bounce disconnects the vibrant bioluminescent snake and glowing prey from the arena plane.
3. **Missing Miniature / Diorama Depth:** Snake is viewed from a high 3/4 isometric perspective. Without an optical tilt-shift effect, distant perimeter walls and screen margins compete equally for visual attention with the active snake. A subtle optical tilt-shift blur along the vertical screen gradient focuses player attention on the active playfield and produces an exquisite tabletop diorama aesthetic.

The intent of **V11** is to introduce a suite of high-tier visual extras strictly activated on `quality.tier === 'high'`:
- **Planar Floor Contact Reflection:** An inverted, faded copy of the continuous snake body, head, and active prey silhouette rendered beneath the semi-translucent, polished floor plane.
- **Floor Gloss & Specular Boost:** Elevated floor material specular properties ($roughness = 0.32, metalness = 0.45, envMapIntensity = 0.85$) on high tier, creating rich anisotropic glints from the snake's dynamic head light and neon wall trim.
- **Optical Tilt-Shift Blur:** A vertical screen-space gradient blur in the post-processing composite shader (`COMP_FS`) with a tack-sharp horizontal focal zone centered on the snake playfield and smooth progressive peripheral defocus.
- **Strict Tier Gating & Zero Allocation:** All high-tier features automatically deactivate on `balanced` and `low` tiers, incurring zero extra draw calls and zero per-frame runtime allocations.

---

## 2. The Three Architectural Pillars

### Pillar 1: Planar Floor Contact Reflection (`HIGH_FX.reflection`)
1. **Inverted Reflection Group (`reflectionGroup`):**
   - A dedicated `THREE.Group` (`reflectionGroup`) is added to `scene` with `renderOrder = 0`.
   - Placed in default layer 0 only (never tagged with `tagBloom`), ensuring reflected geometries do not leak into the V2 selective bloom mask.
   - Contains:
     - `reflectedSnake`: A `THREE.Mesh` utilizing a dedicated `BufferGeometry` matching the Catmull-Rom tube topology of `snakeMesh`. Each frame in `updateHighFx()`, when `HIGH_FX.reflection` is active, the reflected position buffer mirrors the primary tube vertices with $y_{\text{ref}} = -y$.
     - `reflectedHead`: An inverted clone of the head mesh with position $(head.rp.x, -head.rp.y, head.rp.z)$, matching rotation and scale `(1, -1, 1)`.
     - `reflectedPrey`: A mirrored proxy matching `foodMesh.position` with $y_{\text{ref}} = -foodMesh.position.y$, mirroring current prey archetype geometry (`common`, `golden`, `jittery`) and rotation.
2. **Face Winding & Material Configuration:**
   - Because $y \to -y$ inverts spatial winding, reflected materials explicitly declare `side: THREE.DoubleSide` (or `THREE.BackSide`) so backface culling does not cull inverted triangles.
   - Reflected meshes use `MeshBasicMaterial` with `color: 0x0a2238`, `transparent: true`, `opacity: 0.28`, `blending: THREE.NormalBlending`, `depthWrite: false`.
3. **Floor Transparency & Ordering:**
   - Arena floor plane (`ground`) has `renderOrder = 1` and `depthWrite: false` (or `depthTest: true`).
   - Ground material initializes with `transparent: true` at creation time to prevent Three.js shader recompiles when changing opacity:
     - On `high` tier: `opacity = 0.92`, `roughness = 0.55`, `metalness = 0.18`, `envMapIntensity = 0.85`.
     - On `balanced` and `low` tiers: `opacity = 1.0`, `roughness = 0.78`, `metalness = 0.18`, `envMapIntensity = 0.35`.
   - On `balanced` and `low` tiers: `reflectionGroup.visible = false`, incurring 0 extra draw calls.

### Pillar 2: Optical Tilt-Shift Miniature Defocus (`HIGH_FX.tiltShift`)
1. **Focal Plane & Defocus Gradient in `COMP_FS`:**
   - Composite shader receives tilt-shift uniforms:
     ```glsl
     uniform float uTiltShift;    // 1.0 on high tier, 0.0 on balanced/low
     uniform float uFocusCenter;  // 0.52 (normalized UV y center of focus band)
     uniform float uFocusBand;    // 0.26 (half-height of tack-sharp focal band)
     uniform float uBlurSpread;   // dynamic spread normalized to 1.0 / POST.h
     ```
2. **Defocus Weighting Function:**
   - In `COMP_FS.main()`:
     $$\text{focusDist} = \max(0.0, |vUv.y - uFocusCenter| - uFocusBand)$$
     $$\text{blurAmount} = \text{smoothstep}(0.0, 0.36, \text{focusDist}) \times uTiltShift$$
   - When $\text{blurAmount} > 0.001$:
     Applies a 5-tap vertical sampling kernel along $vUv.y \pm k \times uBlurSpread \times \text{blurAmount}$:
     $$\text{base} = 0.36 \cdot S_0 + 0.22 \cdot (S_{+1} + S_{-1}) + 0.10 \cdot (S_{+2} + S_{-2})$$
   - When $uTiltShift == 0.0$ (or on balanced/low tiers), the branch is skipped, preserving baseline single-tap texture lookup with 0 cost.
   - In `buildPost()`, `compMat.uniforms.uBlurSpread.value = 3.5 / POST.h`, ensuring resolution-independent blur scaling across standard and retina DPR displays.

### Pillar 3: Quality Tier Integration, Lifecycle & Contracts
1. **Controller Configuration (`HIGH_FX`):**
   ```javascript
   const HIGH_FX = {
     ON: true,
     reflection: true,
     tiltShift: true,
     floorGloss: true,
     reflectionOpacity: 0.28,
     focusCenter: 0.52,
     focusBand: 0.26,
     tiltShiftIntensity: 1.0,
     reflectionGroup: null,
     reflectedSnake: null,
     reflectedHead: null,
     reflectedPrey: null
   };
   ```
2. **Core Lifecycle Functions:**
   - `buildHighFx()`: Allocates `reflectionGroup`, reflected meshes, materials, and registers post uniforms.
   - `updateHighFx(dt)`: Synchronizes reflected snake vertices ($y \to -y$), updates reflected head and prey transforms.
   - `applyHighQuality(tier)`: Gated state updates (activates on `high`, deactivates on `balanced`/`low`).
   - `resetHighFx()`: Cleans up active proxies upon game reset.
3. **Strict Resource Hygiene:**
   - Zero per-frame allocations (pre-allocated reflection geometry buffers, reused materials).
   - Zero additional draw calls on `balanced` and `low` tiers.
   - On `high` tier: maximum 3 additional draw calls (`reflectedSnake`, `reflectedHead`, `reflectedPrey`).
   - Constant shader program count when toggling or cycling quality tiers.

---

## 3. Mathematical & Algorithmic Formulation

### 3.1 Planar Reflection Transformation
For any vertex position $\mathbf{p} = (x, y, z)^T$ in the snake or prey mesh:
$$\mathbf{p}_{\text{ref}} = \begin{pmatrix} 1 & 0 & 0 \\ 0 & -1 & 0 \\ 0 & 0 & 1 \end{pmatrix} \begin{pmatrix} x \\ y \\ z \end{pmatrix} = \begin{pmatrix} x \\ -y \\ z \end{pmatrix}$$
Because the ground plane is fixed at $y = 0$, the reflected image appears at depth $-y$ beneath the floor surface. With ground opacity $\alpha_{\text{ground}} = 0.92$, the transmitted reflection luminance is attenuated by:
$$L_{\text{final}} = L_{\text{ground}} + (1 - \alpha_{\text{ground}}) \cdot \alpha_{\text{ref}} \cdot L_{\text{ref}}$$

### 3.2 Optical Tilt-Shift Defocus Kernel
The optical blur circle of confusion (CoC) diameter as a function of vertical screen coordinate $y \in [0, 1]$:
$$\text{focusDist} = \max(0.0, |y - y_0| - w_0)$$
$$\text{blurAmount} = \text{smoothstep}(0.0, 0.36, \text{focusDist}) \times uTiltShift$$
where $y_0 = 0.52$ is the camera optical center on the arena, and $w_0 = 0.26$ is the sharp focal depth width.
The 5-tap discrete convolution samples:
$$k_i \in \{-2, -1, 0, 1, 2\}, \quad W = \{0.10, 0.22, 0.36, 0.22, 0.10\}$$
$$\mathbf{C}_{\text{out}} = \sum_{i=-2}^{2} W_i \cdot \text{sample}\left(\mathbf{u} + (0, k_i \cdot \text{blurAmount} \cdot \frac{3.5}{\text{POST}.h})\right)$$

---

## 4. Verification & Acceptance Criteria

### 4.1 Static & Contract Verification (`tests/check_v11_contracts.mjs`)
1. Controller `HIGH_FX` defined with properties `reflection`, `tiltShift`, `floorGloss`.
2. Functions present: `buildHighFx`, `updateHighFx`, `applyHighQuality`, `resetHighFx`.
3. Shader uniforms declared in `COMP_FS`: `uTiltShift`, `uFocusCenter`, `uFocusBand`, `uBlurSpread`.
4. `reflectionGroup` instantiated in scene and managed in `applyQuality`.
5. Window hooks exposed: `window.HIGH_FX`, `window.applyHighQuality`, `window.resetHighFx`.

### 4.2 Dynamic Acceptance Suite (`tests/test_high_tier.mjs`)
1. **Tier Gating:**
   - On `high` tier: `HIGH_FX.reflection === true`, `HIGH_FX.tiltShift === true`, `reflectionGroup.visible === true`, `ground.material.opacity <= 0.95`.
   - On `balanced` tier: `HIGH_FX.reflection === false`, `HIGH_FX.tiltShift === false`, `reflectionGroup.visible === false`, `ground.material.opacity >= 0.99`.
   - On `low` tier: `HIGH_FX.reflection === false`, `HIGH_FX.tiltShift === false`, `reflectionGroup.visible === false`.
2. **Reflection Geometry Synchronization:**
   - When snake slithers on `high` tier, `reflectedSnake` vertex buffer updates with $y < 0$ matching primary tube length.
   - Reflected prey position mirrors $y_{\text{food}} = -foodMesh.position.y$.
3. **Tilt-Shift Defocus Execution:**
   - Post-processing composite correctly executes tilt-shift kernel when `uTiltShift === 1.0`.
   - Central focal band ($vUv.y \approx 0.52$) exhibits 0 blur divergence.
4. **Non-Regression & Frame Hygiene:**
   - Constant shader program count when toggling quality tiers.
   - Full non-regression across all existing suites (V1–V10).
