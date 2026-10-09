# SPEC-V8 — Skin liveliness (flowing scales · grazing iridescence · slither muscle roll)

> **E03 reconciliation — historical, non-authoritative design.** Current `V8` status: **accepted for the bounded rules-2 release scope** in [ENHANCEMENTS.md](ENHANCEMENTS.md), with executable assertion links and accepted-task provenance. Original detail below is preserved, not a fresh full-release or live-publication claim. [PUBLIC_RELEASE_BACKLOG.md](PUBLIC_RELEASE_BACKLOG.md) DEC02/04/06–10 override conflicting constants, lifecycle, performance and UI clauses.
>
> **Explicit supersession:** D03 supersedes Balanced iridescence/physical finish claims: clearcoat/sheen/iridescence are High-only; lower-tier pooled materials remain stable, High original values restore exactly.
>
> **Compatibility:** every mutable `window.*` hook described below is source-test-only behind `__SNAKE_TEST_BUILD__` or injected by the temporary source adapter. Normal source and dist expose no mutable game controls. Old ready/DONE labels, patch commands and historical benchmarks below are not implementation authority. See [recipe/adaptor audit](docs/HISTORICAL_RECIPES.md).


**Historical design status:** preserved original proposal; current bounded scope is reconciled above.
**Backlog:** `ENHANCEMENTS.md` → Ideas, visual → *"Skin liveliness"*, effort S, impact ★★☆  
**Depends on:** V1 (smooth body tube) · V2 (selective bloom layer mask) · V3 (death as an event) · V4 (eat juice) · V5 (reactive arena) · V6 (sell the speed) · V7 (camera life)  
**File:** `snake-three.html`  
**Harness:** `tests/check_v8_contracts.mjs`, `tests/test_skin.mjs`  

---

## 1. Problem and Intent

Currently in `snake-three.html`:
1. **Static Scale Parameterization:** Scale normal and roughness maps are sampled using static texture UV coordinates. While the snake slithers forward at 8.7 to 16.1 cells/second, the scales stay locked to the parametric spine. There is no sensation of scales sliding or undulating across the underlying muscular core.
2. **Flat Specular Response at Grazing Angles:** While the skin uses `clearcoat` and `sheen`, reptilian scales in nature exhibit subtle structural coloration — glancing angles produce faint iridescence (thin-film interference) that shifts hue with the incident light angle.
3. **Rigid Tube Banking:** The continuous tube (V1) bends laterally using centripetal Catmull-Rom splines, but its radial cross-section has zero torsion/roll around the spine tangent $\mathbf{T}$. Real snakes actively roll their body outward/inward through curves to press ribs against the ground. Without torsional banking, the body reads as an extruded rubber hose rather than living muscle.

---

## 2. The Three Visual Pillars

### Pillar 1: Flowing Scales (Texture Matrix Uniform Scrolling)
- **Texture Matrix Offset:** Rather than re-uploading vertex buffer attributes, scale flow is driven through texture coordinate offsets on `skinMaps.normalMap` and `skinMaps.roughnessMap`:
  $$\text{normalMap.offset.y} = s_{\text{flow}}, \quad \text{roughnessMap.offset.y} = s_{\text{flow}}$$
  This is a pure uniform update in the material shader (zero vertex buffer mutations, zero GPU memory upload bandwidth).
- **Modulo 1.0 Wrap & Precision Guard:**
  $$s_{\text{flow}} \leftarrow (s_{\text{flow}} + \Delta s_{\text{flow}}) \pmod{1.0}$$
  where $\Delta s_{\text{flow}} = 0.28 \cdot \text{motionFactor} \cdot \left(\frac{1000}{\text{stepMs}} \cdot dt\right) / \text{CELL}$.
  Tuned with gain $0.28$ to avoid temporal aliasing/strobing at high speeds, reading as a smooth muscular scale shimmer.
- Seamless with `wrapS = wrapT = THREE.RepeatWrapping`.

### Pillar 2: Grazing-Angle Iridescence (`MeshPhysicalMaterial`)
- Three.js r169 `MeshPhysicalMaterial` provides native thin-film interference without custom GLSL passes.
- **Physical Parameters on `bodyMat` and `allSkinMats`:**
  - `iridescence`: `0.45` (subtle, non-overpowering thin-film sheen)
  - `iridescenceIOR`: `1.33` (reptilian keratin optical index)
  - `iridescenceThicknessRange`: `[120, 380]` (nanometers, producing faint green-cyan-violet highlights at glancing angles)
- **Quality Tier Gating:**
  - High / Balanced tiers: `iridescence: 0.45`
  - Low tier: `iridescence: 0.0`
- **Selective Bloom Integrity:** Iridescence contributes purely to direct and specular lighting in `sceneRT`; it has zero emissive component and produces $\le 2\%$ leak into `POST.bloomRT`, satisfying V2 contracts.

### Pillar 3: Per-Segment Slither Muscle Roll (Torsional Spine Banking)
- **Biological Banking:** When snake muscle contracts in a transverse wave, the ribcage twists subtly into the curve.
- **Harmonic Torsion Formulation:** In `emitRings(rings)`:
  For ring $i$ at arc distance $s = \text{ringS}[i]$:
  $$\theta_{\text{roll}}(s) = \text{rollAmp} \cdot \cos\left(\text{elapsed} \cdot 7.2 - \frac{s}{\text{CELL}} \cdot 0.85\right)$$
  where $\text{rollAmp} = 0.16 \cdot \text{motionFactor} \cdot \min\left(1.0, \frac{s}{3.0 \cdot \text{CELL}}\right)$.
- **Angular Radial Evaluation:**
  For each radial cross-section vertex $c \in [0, R]$:
  $$\theta = \frac{c}{R} \cdot 2\pi + \theta_{\text{roll}}(s)$$
  $$\text{cs} = \cos(\theta), \quad \text{sn} = \sin(\theta)$$
- **Normal & Shading Consistency:**
  The geometric normal `tubeNrm` is evaluated from the rotated `cs, sn`. Consequently, the belly/back vertex bake (`writeTubeColours`) and specular highlights naturally rotate with the muscle banking.

---

## 3. Architecture & Data Structures

All skin liveliness parameters are encapsulated in `SKIN_FX`:

```javascript
const SKIN_FX = {
  ON: true,
  scrollOffset: 0.0,
  scrollSpeed: 0.28,
  iridescence: 0.45,
  iridescenceIOR: 1.33,
  iridescenceThicknessRange: [120, 380],
  rollGain: 0.16,
  motionFactor: 0.0,
  maxRollSample: 0.0
};
```

### Lifecycle Functions
- `buildSkinFx()`: Applies iridescence parameters to `bodyMat`, `allSkinMats`, and exposes window test hooks.
- `updateSkinFx(dt)`: Advances `scrollOffset` with modulo 1.0 wrap, updates texture offsets on `skinMaps.normalMap` and `skinMaps.roughnessMap`.
- `applySkinQuality(tier)`: Gates iridescence across quality tiers (0.45 on high/balanced, 0.0 on low).
- `resetSkinFx()`: Resets `scrollOffset = 0.0`, zeroes texture offsets, and restores base configuration.

---

## 4. Headless & Test Contracts

The following hooks must be exposed on `window`:
- `window.SKIN_FX`: The skin liveliness controller.
- `window.resetSkinFx()`: Resets skin scroll and state.
- `window.setSkinScrollSpeed(spd)`: Debug speed multiplier.
- `window.getSkinState()`: Returns `scrollOffset`, `iridescence`, texture offsets, and `rollGain`.

---

## 5. Measured Acceptance Criteria

| # | Criterion | Verification Contract | Target / Tolerance | Performance Budget |
|---|---|---|---|---|
| 1 | **Motion-Coupled UV Scrolling** | When moving (`motionFactor > 0`), `skinMaps.normalMap.offset.y` advances proportionally and wraps modulo 1.0. When stationary (`motionFactor === 0`), scroll stays paused. | $\Delta s > 0$ when moving, $= 0$ at rest | 0 draw calls |
| 2 | **Physical Iridescence Integration** | `bodyMat.iridescence === 0.45`, `bodyMat.iridescenceIOR === 1.33`, `bodyMat.iridescenceThicknessRange` set. | Exact property presence | 0 new programs |
| 3 | **Quality Tier Gating** | On `low` tier, `bodyMat.iridescence === 0.0`. On `high` and `balanced`, restored to `0.45`. | Tier-synchronized | 0 draw calls |
| 4 | **Per-Segment Slither Muscle Roll** | `rollGain === 0.16`; mid-body radial vertices rotate with harmonic slither roll during movement, returning to 0 at rest. | $\text{rollAmp} \in [0.10, 0.20]\text{ rad}$ | 0 draw calls |
| 5 | **Zero Selective Bloom Leak** | Iridescence produces zero emissive contribution; `test_bloom.mjs` passes within $\le 2\%$ leak ratio. | $\le 2\%$ leak threshold | 0 leak |
| 6 | **Clean Reset** | Calling `resetSkinFx()` zeroes `scrollOffset = 0.0` and resets texture offsets to 0. | `scrollOffset === 0` | 0 draw calls |
| 7 | **Zero Memory Allocation** | Zero object allocations inside `updateSkinFx()` or `emitRings()`. Pre-allocated buffers. | 0 bytes GC / frame | 0 programs |\n