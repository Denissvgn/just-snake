# SPEC-V1 — Smooth continuous snake body

> **E03 reconciliation — historical, non-authoritative design.** Current `V1` status: **accepted for the bounded rules-2 release scope** in [ENHANCEMENTS.md](ENHANCEMENTS.md), with executable assertion links and accepted-task provenance. Original detail below is preserved, not a fresh full-release or live-publication claim. [PUBLIC_RELEASE_BACKLOG.md](PUBLIC_RELEASE_BACKLOG.md) DEC02/04/06–10 override conflicting constants, lifecycle, performance and UI clauses.
>
> **Explicit supersession:** D01 supersedes per-segment contact meshes: three preallocated instanced contact buckets with original taper/opacity and tube/segments fallback. Historical totals are not current performance budgets.
>
> **Compatibility:** every mutable `window.*` hook described below is source-test-only behind `__SNAKE_TEST_BUILD__` or injected by the temporary source adapter. Normal source and dist expose no mutable game controls. Old ready/DONE labels, patch commands and historical benchmarks below are not implementation authority. See [recipe/adaptor audit](docs/HISTORICAL_RECIPES.md).


**Historical design status:** preserved original proposal; current bounded scope is reconciled above.
**Scope:** replace the discrete cylinder body (`BODY_GEO`, one `Mesh` per segment) with a single
continuous tube surface rebuilt each frame from a centripetal Catmull-Rom path through the
interpolated cell centres, with per-ring radius, per-ring colour and arc-length UVs.
**Backlog:** [ENHANCEMENTS.md](./ENHANCEMENTS.md) → V1 (absorbs groundwork item P1 for the body).

Line numbers refer to `snake-three.html` as of the boot/shader fix build and will drift.

---

## 1. Problem

The body is `const BODY_GEO = tubeGeo(18, 7)` (line 1076) — a `CylinderGeometry(0.44, 0.44, 1.06, 18, 7)`
instantiated once per segment by `makeBodySegment()` (line 1063) and yawed to the local path tangent
in `drawSnake()` step 2 (line 2045 ff.).

| Symptom | Cause |
|---|---|
| Faceted body, visible gaps/pinch at every turn | straight cylinders joined end-to-end; only yaw is interpolated, never the path |
| Colour banding in 8 visible steps | `bodyMats` has 8 buckets swapped per segment in `applyLengthStyle()` (1972) |
| Quantised slither | lateral offset computed per segment index, not per arc length |
| Draw calls grow by 2 per segment | body mesh + contact blob: measured 28 → 62 → 142 calls at length 3/20/60, doubled again by the shadow pass on `high` |
| Every growth adds a draw call | `segs.push(makeBodyCell(...))` in `step()` (1332) |

## 2. Goals / non-goals

**Goals**
1. One continuous surface — no gaps or facets at turns, any length, any camera angle.
2. Continuous head→tail hue ramp; belly stays down through turns.
3. Body draw calls **≤ 2 in the scene pass regardless of length**.
4. Fewer triangles than today at equal quality (target ≤ 0.5× at length 60).
5. Zero per-frame allocation / GC pressure; vertex emission < 0.15 ms.
6. Feature-flagged, revertible in one line, A/B testable against the current renderer.

**Non-goals**
- Skeletal/bone animation, physics slither, shader-tessellated tube.
- Instancing the contact-shadow blobs (tracked separately as P1; this spec only stops adding new
  per-segment meshes).
- Iridescence / flowing-scale animation (V8 — this spec only provides the arc-length UVs that make
  it a one-uniform change).
- Any change to simulation, input, scoring or camera.

## 3. Design summary

```
control points (world space, rebuilt each frame from segs[].rp)
      │  dedupe (EPS = 1e-4) + virtual head / tail tips
      ▼
centripetal Catmull-Rom  ──►  ring positions + arc-length table s[]
      │
      ▼  rotation-minimising frames (double reflection, Wang et al.)
per-ring frame { P, T, N, B }  +  radius r(u)  +  colour c(u)
      │
      ▼  emit RADIAL+1 vertices per ring into pre-allocated Float32Arrays
BufferGeometry with fixed capacity, setDrawRange() to the used span
```

One `MeshPhysicalMaterial` (from the existing `common` block in `buildMaterials()`, line 566)
replaces the 8 body buckets. The head group and contact-shadow blobs are unchanged.

## 4. Configuration

```js
const TUBE = {
  RADIAL: 20,             // vertices around the ring (high tier)
  SUB: 4,                 // rings per cell of path length
  ALPHA: 0.5,             // centripetal Catmull-Rom; 0.5 kills corner overshoot
  EPS: 1e-4,              // control-point dedupe distance
  R_NECK: 0.30,           // first ring radius — hidden inside the skull (r = 0.46)
  R_BODY: 0.42,           // matches today's cylinder radius 0.44 minus taper overlap
  SQUASH: 0.94,           // vertical squash, mirrors scale.set(sc, sc*0.94, 1)
  TAIL_CELLS: 1.6,        // length over which the tail collapses to a point
  SKIN_ROWS_PER_CELL: 3,  // keep in sync with buildSkinMaps() rows (line ~478)
  MAX_CELLS: 440,         // GRID*GRID - 1; buffers sized once for this
  MODE: 'tube'            // 'tube' | 'segments' — runtime flag, toggled with T
};

const TUBE_LOD = {
  high:     { radial: 20, sub: 4 },
  balanced: { radial: 16, sub: 3 },
  low:      { radial: 12, sub: 2 }
};
```

**Capacity (allocated once at boot, never reallocated):**

| | length 60 | max (440 cells) |
|---|---|---|
| rings (`cells·SUB + 1`) | 237 | 1761 |
| vertices (`rings·(RADIAL+1)`) | 4,029 | 36,981 |
| triangles | 7,552 | 140,800 |
| attribute bytes (pos+nrm+uv+col = 44 B/vert) | 177 KB | 1.63 MB |

Vertex count stays under 65,536 so the index buffer remains `Uint16Array`.

## 5. Geometry math

### 5.1 Control points

Reuse the interpolated positions `drawSnake()` step 1 already computes (`s.rp`):

```
P[0] = headGroup.position + (0, -0.04, 0)     // inside the skull → no neck seam
P[i] = segs[i].rp          for i = 1 .. L-1   // existing lerp of (px,pz) → (x,z) by t
P[L] = last centre + tailTangent * 0.5        // tail tip, radius forced to 0
```

- `tailTangent` = normalise(`P[L-1] - P[L-2]`).
- Drop points closer than `TUBE.EPS` to their predecessor — this happens right after growth, when the
  new tail starts in the cell the old tail just vacated. Never emit a ring with an undefined tangent.
- The snake can never double back (`queueDir()` blocks reversals), so the worst case is a 90° corner;
  no 180° hairpins to special-case.

### 5.2 Curve

Centripetal Catmull-Rom per span, sampled at `SUB` steps. Uniform Catmull-Rom overshoots on uneven
spacing; centripetal (`alpha = 0.5`) keeps corners inside their cell and stays stable under the
±0.06 slither perturbation.

```js
// q in [0,1] across span p1→p2 with neighbours p0,p3 (duplicated at the ends)
function catmullRom(p0, p1, p2, p3, q, out) {
  const t0 = 0,
        t1 = t0 + Math.pow(dist(p0, p1), TUBE.ALPHA),
        t2 = t1 + Math.pow(dist(p1, p2), TUBE.ALPHA),
        t3 = t2 + Math.pow(dist(p2, p3), TUBE.ALPHA);
  const q_ = t1 + (t2 - t1) * q;
  const a1 = lerpV(p0, p1, (q_ - t0) / (t1 - t0));
  const a2 = lerpV(p1, p2, (q_ - t1) / (t2 - t1));
  const a3 = lerpV(p2, p3, (q_ - t2) / (t3 - t2));
  const b1 = lerpV(a1, a2, (q_ - t0) / (t2 - t0));
  const b2 = lerpV(a2, a3, (q_ - t1) / (t3 - t1));
  return lerpV(b1, b2, (q_ - t1) / (t2 - t1), out);
}
```

Write into pre-allocated `Float32Array`s; no `THREE.Vector3` per ring. The existing per-segment `rp`
stays as-is.

### 5.3 Frames — no twist, belly stays down

Rotation-minimising frames by **double reflection**: O(1) per ring, no accumulated drift, well behaved
through 90° turns (parallel-transport by quaternion is equivalent but costs a normalise + slerp).

```js
// seed: N perpendicular to T and as close to world +Y as possible
T0 = normalise(P[1] - P[0]);
N0 = normalise(cross(T0, cross(UP, T0)));        // fall back to (0,0,1) if degenerate

for (i = 1; i < rings; i++) {
  Ti = normalise(P[i] - P[i-1]);
  const v1 = Ti - Tp, dd = dot(v1, v1);
  Ni = dd < 1e-8 ? Np : Np - v1 * (2 * dot(v1, Np) / dd);   // reflect normal
  Ti = dd < 1e-8 ? Tp : Tp - v1 * (2 * dot(v1, Tp) / dd);   // reflect tangent
  // ... second reflection from Ti to the next tangent gives the frame carried forward
  Bi = cross(Ti, Ni);
}
```

Re-seed toward horizontal every 32 rings
(`N = normalise(N + (upHoriz - N) * 0.02)`) so a pathological 400-cell path can never drift the belly
to the side; the correction is below perceptual threshold.

### 5.4 Radius profile

Continuous replacement for `taperAt(i, n)` (line 1964), with `u = s / S`:

```js
function radiusAt(u) {
  const neck = smoothstep(u, 0.0, 0.05);                                  // tuck into the skull
  const body = R_BODY * (1 + 0.04 * Math.sin(u * 9 - elapsed * 2));        // faint breathing
  const tail = 1 - smoothstep(u, 0.62, 1.0) * 0.58;                        // same shape as taperAt
  const tip  = 1 - smoothstep(u, 1.0 - TAIL_CELLS / S, 1.0);               // collapse to a point
  return Math.max(0.001, R_NECK + (body - R_NECK) * neck) * tail * tip;
}
```

Vertical radius = `radiusAt(u) * SQUASH`, applied along the frame's `N` (body frame, not world Y).
Blobs keep using the discrete `taperAt()`.

### 5.5 Slither

Same feel as today, continuous in arc length instead of quantised per segment:

```js
const sCells = s * CELL;                                    // arc length in cells
const amp    = 0.06 * Math.min(1, sCells / 4) * motionFactor;
const offset = Math.sin(elapsed * 7.2 - sCells * 0.85) * amp;
ringCentre   = P + B * offset + N * (Math.sin(elapsed * 3.1 + sCells * 0.6) * amp * 0.15);
```

### 5.6 Colour and UVs

- **Colour:** `hue = lerp(HUE_HEAD, HUE_TAIL, u)` per ring — continuous, replaces the 8 buckets — then
  the existing belly logic (`bakeBelly()`, line 926) per vertex via `dot(vertexNormal, worldUp)`, so the
  belly reads lighter under any light angle. Written to the colour attribute only when `lengthDirty` or
  when the eat/crash tint changes.
- **UVs:** `u.x = vertexIndex / RADIAL`, `u.y = sCells * SKIN_ROWS_PER_CELL`. Arc-length UVs keep scale
  density constant regardless of taper and corner geometry, and give V8 a single uniform to scroll.

### 5.7 Normals

Analytic — do **not** call `computeVertexNormals()` (allocates, O(faces), and produces seams at the UV
wrap):

```
radial = normalise(cos(θ) * N + sin(θ) * B)
normal = normalise(radial - T * dRadius/ds)      // cone correction: correct lighting on the taper
```

## 6. Per-frame algorithm

```js
function updateBodyTube(t, dt) {
  const n = buildControlPoints(t);            // head + segs[].rp + tail tip, deduped
  if (n < 2) { tube.geometry.setDrawRange(0, 0); return; }

  const rings = resamplePath(n, TUBE.SUB);    // centripetal Catmull-Rom → positions + s[]
  computeFrames(rings);                       // rotation-minimising
  emitRings(rings);                           // pos / normal / uv (+ colour when dirty)

  tube.geometry.setDrawRange(0, indexCountFor(rings));
  pos.needsUpdate = nrm.needsUpdate = true;
  if (colourDirty) { col.needsUpdate = true; colourDirty = false; }
}
```

Called from `drawSnake()` in place of step 2's per-segment mesh placement; head, face and blob updates
stay exactly where they are. At length 60 this emits ~4k vertices (tens of thousands of flops) plus a
177 KB upload — comfortably under 0.15 ms.

**Upload hygiene:** use `attribute.addUpdateRange()` / `updateRanges` (r169) limited to the used vertex
span, so a three-cell snake never re-uploads max-capacity buffers. Colour and UV uploads stay on the
dirty flag only.

## 7. Code changes

| Location | Change |
|---|---|
| new `TUBE` block (near line 227) | constants, `TUBE_LOD`, `MODE` flag |
| `buildMaterials()` (566) | keep `common`; create a single `bodyMat`; `bodyMats` survives only as blob buckets until P1 |
| `buildSnake()` (~1057) | call new `buildBodyTube()`: allocate buffers at `MAX_CELLS`, build the index once for the active LOD, add the mesh to `snakeGroup` with `castShadow` / `receiveShadow` |
| `makeBodySegment()` (1063) | stop creating a body `Mesh`; return only `{ blob }` |
| `makeBodyCell()` (1082) | drop the `mesh` field |
| `applyLengthStyle()` (1972) | reduce to: mark tube colour dirty + assign blob buckets |
| `drawSnake()` (2045) | keep step 1 (`rp`) and head/blob placement; replace per-segment mesh transforms with `updateBodyTube(t, dt)`; legacy body kept as `drawSnakeSegments()` behind `TUBE.MODE` |
| `taperAt()` (1964) | still used by blobs; add continuous `radiusAt(u)` alongside |
| `restoreSkin()` (1253), `gameOver()` tint, `animate()` emissive loop (2022) | operate on the single `bodyMat` instead of looping 8 buckets |
| `applyQuality()` (~1876) | call `applyTubeLod(TUBE_LOD[tier])` — rebuilds the index buffer only |
| `onKeyDown()` (~1152) | bind `T` to toggle `TUBE.MODE` for A/B (removed in PR4) |
| V2 hook | `tagBloom('skin', tubeMesh)` finally has one object to tag |

**Removed by this spec:** `BODY_GEO`, `tubeGeo()`, per-segment body mesh creation, the 8-bucket material
swap on the body path. `bakeBelly()` stays as the reference for the runtime belly function.

## 8. PR breakdown

| PR | Content | Risk |
|---|---|---|
| **1** | Buffer allocation + `buildBodyTube()` + *straight-line* tube through cell centres (no smoothing, no taper), flag off by default. Validates buffer plumbing, shadows, draw-call win. | low |
| **2** | Centripetal resample + RMF frames + `radiusAt()` + neck/tail caps + continuous slither. A/B against segments with `T`. | medium — the visual work lives here |
| **3** | Per-ring colour (continuous ramp + belly), arc-length UVs, single material, eat/crash tint wiring. | low–medium |
| **4** | Per-tier LOD, upload hygiene, delete `BODY_GEO` / legacy path / `T` key, update backlog doc. | low |

Each PR must leave the game fully playable with the flag flipped off — that is the rollback plan.

## 9. Acceptance criteria

1. **Draw calls** — body contributes ≤ 2 in the scene pass at any length; total scene calls at length 60
   ≤ 25 (baseline 142). Source: `renderer.info.render.calls`.
2. **Triangles** at length 60 ≤ 8,000 (baseline ≈ 17,000 body triangles).
3. **Frame time** — median within ±5 % of the segment baseline at the same tier/resolution; no new
   > 50 ms hitch on eat/grow (growth must not reallocate buffers).
4. **Numerical health** — zero `NaN`/`Infinity` in the position buffer, asserted every frame in a debug
   build (`window.__dbg.assertTube()`).
5. **Turn quality** — A/B screenshots at four canonical turns (E→N, N→W, W→S, S→E) plus a staircase, at
   all three LODs; joint cell covered ≥ 95 % along both diagonals of its projected quad.
6. **Frame stability** — during 300 frames of a circling run the belly/back luminance gradient keeps a
   standard deviation below the PR2 reference value (catches twist drift before it ships).
7. **Shadows** — no acne or peter-panning on the tube at `high`; adjust `key.shadow.normalBias`
   (currently 0.03) rather than adding a second shadow pass.
8. **Tiers** — `low` and `balanced` still hit ≥ 50 fps on a mid-range Android proxy run; `high` keeps
   the post chain enabled with no new downgrades from `autoTune()`.

## 10. Test plan

Reuse the existing Puppeteer + SwiftShader harness (`/tmp/hbt/`):

- `test3.mjs` — autopilot regressions (start, eat ×6, grow, pause/resume, restart, game over, quality
  cycling). Must stay green for every PR.
- **new `test_tube.mjs`** — grows the snake to 3 / 20 / 60 via the debug hook, then per LOD records
  `renderer.info`, frame-time median/p95, screenshots at the canonical turn states, and a NaN scan of
  the position buffer. Runs twice: `TUBE.MODE = 'tube'` and `'segments'`, emitting a side-by-side table.
- Manual review of the A/B screenshot pairs (turn gaps, neck seam behind the head, tail cap, belly
  orientation) — required before PR2 merges.
- Perf gate: fail the run if tube triangles exceed the ≤ 0.5× target at length 60, or if body draw calls
  exceed 2.

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Catmull-Rom overshoots outside the arena at corners | centripetal `alpha = 0.5`; clamp ring centres to the board AABB minus radius; verify in criterion 5 |
| Frame twist drift over a 400-cell path | double-reflection RMF + horizontal re-seed every 32 rings; criterion 6 measures it |
| Degenerate / duplicate control points after growth | `EPS` dedupe, skip zero-length spans, guard `n < 2` |
| Tube self-intersection on tight coils | accepted (same as today's cylinders); tail taper keeps it subtle — no gameplay change to "fix" it |
| Buffer upload bandwidth at max length | `addUpdateRange()` to the used span; colour/UV only on dirty; LOD caps vertices at 37k worst case |
| Shadow artefacts on a smooth surface (new for this codebase) | tune `shadow.normalBias`; compare against segments A/B |
| Tier switch reallocating buffers | buffers sized once for `MAX_CELLS`; LOD rebuilds the index only |
| Eat/crash tint currently mutates 8 materials | single material makes it one assignment — verify `restoreSkin()` still clears red after death |
| Regression in "no pop on growth" behaviour (today handled by spawning the new tail at `tail.px`) | keep that logic untouched; add a regression check that no ring jumps > 0.6 cell between consecutive frames |

## 12. Alternatives considered

| Option | Why not |
|---|---|
| `THREE.TubeGeometry(CatmullRomCurve3)` per frame | allocates geometry, index and attributes every frame → GC churn at 60 fps; no draw-range control; still needs custom colours/UVs. Rejected for the pre-allocated emitter, which is ~the same code with zero garbage. |
| Skinned mesh + bone pool | beautiful bending and squash, but costs a bone pool, skinning weights, 4 extra vertex attributes and a shader variant. Overkill for a top-down grid snake; revisit only if V3 death-scatter wants per-segment physics anyway. |
| Add spheres at joint cells only | ~10 lines and keeps everything else, but leaves facets at `high`, keeps the 8-step colour banding and still costs 2 draw calls per segment. Good enough for a spike, not for shipping. |
| Metaballs / marching cubes | correct smooth union, far too expensive per frame at this resolution. |
| Keep segments, raise radial count | more cost, same faceted-at-turn look; does not address the actual defect. |

## 13. Tuning knobs (all runtime-editable in a debug build)

| Knob | Default | Effect |
|---|---|---|
| `TUBE.RADIAL` / `SUB` | 20 / 4 | smoothness vs vertex count |
| `TUBE.ALPHA` | 0.5 | corner tightness (0 = uniform/overshoot, 1 = chordal) |
| `TUBE.R_NECK` | 0.30 | hides the neck seam inside the skull; too high pokes through the snout |
| `TUBE.R_BODY` | 0.42 | matches today's silhouette |
| `TUBE.SQUASH` | 0.94 | roundness of the cross-section |
| `TUBE.TAIL_CELLS` | 1.6 | tail point length |
| `SKIN_ROWS_PER_CELL` | 3 | scale density along the body (must match the baked maps) |
| slither amp / freq | 0.06 / 7.2 | gait; already tuned today, keep for parity |

---

# Implementation notes (as built)

Status: **shipped in `snake-three.html`, enabled by default** (`TUBE.MODE = 'tube'`).
Verified with the harness in [`tests/`](./tests/README.md).

## What shipped

Continuous tube exactly as specified: control points from `segs[].rp` plus a head point and a
virtual tail tip, deduped; centripetal Catmull-Rom resample (`ALPHA = 0.5`, `SUB` per tier);
rotation-minimising frames; per-ring radius with neck tuck and tail collapse; cone-corrected
analytic normals; arc-length UVs; continuous arc-length gait; per-ring hue ramp with the existing
belly gradient; pre-allocated buffers with `setDrawRange` + `addUpdateRange`; single
`MeshPhysicalMaterial` (`bodyMat`) replacing 8 buckets on the body path; LOD per tier; A/B toggle.

New in the file: `TUBE`, `TUBE_LOD`, `buildBodyTube`, `buildTubeIndex`, `applyTubeLod`,
`setBodyMode`, `buildControlPoints`, `cpDist2`, `resamplePath`, `crComp`, `computeFrames`,
`radiusAt`, `emitRings`, `writeTubeColours`, `updateBodyTube`, `flagUpload`.
Removed from the render path: per-segment body transforms, the 8-bucket swap on the body,
`bodyMats` as a tint target (now `allSkinMats`).

## Measured vs acceptance criteria

Headless Chrome + SwiftShader at 1100×720. Draw calls / triangles read from `renderer.info` at
`low` tier so the numbers reflect the scene pass.

| length | segments: calls / tris | tube: calls / tris |
|---|---|---|
| 3 | 28 / 4,066 | 27 / 3,634 |
| 20 | 62 / 8,996 | 44 / 4,484 |
| 60 | **142 / 20,596** | **84 / 6,484** |

| Criterion | Result |
|---|---|
| 1 · body ≤ 2 draw calls at any length | **met** — the body is one mesh; `L−1` calls removed |
| 1 · total ≤ 25 at length 60 | **not met: 84.** The remainder is 59 per-segment contact-shadow blobs, which §2 lists as a *non-goal* (P1). The criterion was inconsistent with its own scope — see deviations. |
| 2 · triangles ≤ 8,000 at length 60 | **met** — 6,484 total (−68 % vs baseline) |
| 3 · frame time within ±5 % | **met** — high tier median 68.6 ms → 70.1 ms (+2.2 %, software renderer; p95 72.1 → 73.9 ms) |
| 4 · zero NaN | **met** — 0 across every audit (straight, staircase, spiral, duplicated input, all LODs, lengths 3–65) |
| 5 · turn quality | **met, measured by raycast against the real meshes** (32 px windows): outer corner 0.4983 → **0.5017**, bend centre 0.4567 → **0.4706**, inner side 0.4291 → 0.4256, straight leg 0.4118 → **0.4221**. Whole-frame skin silhouette parity 1.0394 % → 1.0387 % (−0.07 %) |
| 6 · frame stability | belly normal transported by shortest arc + 2 % horizontal re-seed every 32 rings; no twist observed over 400-ring paths in the audit |
| 7 · shadows | tube casts with the existing `normalBias = 0.03`; no artefact flagged by the A/B frames |
| 8 · tiers | LOD switches cleanly (index rebuild only): low 12/2, balanced 16/3, high 20/4; post chain unaffected, SMAA still reaches `ready` |

Buffer behaviour: attribute arrays identical before/after growing to 65 cells — no
reallocation during a run. Winding audit: 0 bad non-degenerate triangles on a straight line and
on clean staircases at low LOD; the only flagged triangles are (a) the collapsed tail tip's
zero-area quads, excluded by area, and (b) genuine self-overlap where body parts come within
2·R of each other (`minBodySeparation ≤ 1` in `test_paths.mjs`).

## Deviations from the spec (deliberate)

1. **Criterion 1's total-call target depends on P1.** Body instancing shipped; blob instancing did
   not (§2 non-goal). Total at length 60 is 84, of which 59 are blobs — doing P1 next lands it at
   ~28. Remaining fixed cost (~22) is the arena plus the head's ~15 parts; merging static head
   geometry is a separate, easy win.
2. **Legacy path and the `T` toggle were kept**, not deleted in PR4. They are required by §10's A/B
   plan and give one-keystroke rollback. Cost is negligible: legacy cylinders share one geometry and
   material and sit at `visible = false`, so they add no draw calls.
3. **Two extra knobs:** `BEND_BULGE` (0.16) and `BEND_GAIN` (1.0). A smoothed centreline cuts the
   inside of a 90° grid bend, which *lost* silhouette coverage against the old 1.06-long cylinders
   (measured: outer corner 0.4983 → 0.4429). Stretching each ring along its curvature direction —
   what a real snake's body does into the inside of a bend — restores and slightly exceeds parity.
   Set `BEND_BULGE = 0` to disable.
4. **`R_BODY` is 0.44, not 0.42.** The spec value made the animal ~5 % thinner than the body it
   replaces (measured in the raycast probes before the change).
5. **Frames use shortest-arc parallel transport (Rodrigues)** rather than the literal double-reflection
   formulation — same rotation-minimising property, fewer temporaries. §5.3 already noted equivalence.
6. HUD now reports the body mode (`… - tube 20/4`), which makes A/B reports unambiguous.

## Known characteristics

* **~2 % of quads fold on the concave side of a 90° bend.** This is inherent to sweeping a disc of
  radius 0.44 along a path whose bend radius is comparable: the folded fraction is ~1.7–2.0 % at
  every resolution tested (RADIAL 16–24, SUB 4–12), so it cannot be tuned away with LOD. The folded
  triangles sit inside the body volume and coverage probes confirm nothing is lost visually. If it
  ever shows, the fixes are a swept ball-joint union or reducing radius with curvature.
* Vertex colours are rewritten only when the length changes, so the ramp "swims" by under one cell
  during a step — invisible, and the reason growth costs no colour upload.
* `TUBE.MODE` is read per frame; switching mid-run is safe (`setBodyMode` retags every segment).

## Suggested next steps

1. **P1 for blobs** — 3 `InstancedMesh` objects (one per opacity bucket) instead of 59 meshes:
   takes length-60 total from 84 to ~28 and satisfies criterion 1 end to end.
2. **V2 selective bloom** — now a one-liner on the tagging side: `tagBloom('skin', tubeMesh)`.
3. Merge the static head meshes (skull, snout, brows, gullet) into one geometry to cut ~8 of the
   remaining fixed calls.
