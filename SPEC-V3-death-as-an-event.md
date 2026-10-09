# SPEC-V3 — Death as an event (scatter · drain · impact)

> **E03 reconciliation — historical, non-authoritative design.** Current `V3` status: **accepted for the bounded rules-2 release scope** in [ENHANCEMENTS.md](ENHANCEMENTS.md), with executable assertion links and accepted-task provenance. Original detail below is preserved, not a fresh full-release or live-publication claim. [PUBLIC_RELEASE_BACKLOG.md](PUBLIC_RELEASE_BACKLOG.md) DEC02/04/06–10 override conflicting constants, lifecycle, performance and UI clauses.
>
> **Explicit supersession:** B04/B07/B09 supersede wall-clock gameplay ownership: collision timestamp finalizes simulation metrics, death slowdown is cosmetic, stale callbacks cancel by runId; interruption never auto-resumes.
>
> **Compatibility:** every mutable `window.*` hook described below is source-test-only behind `__SNAKE_TEST_BUILD__` or injected by the temporary source adapter. Normal source and dist expose no mutable game controls. Old ready/DONE labels, patch commands and historical benchmarks below are not implementation authority. See [recipe/adaptor audit](docs/HISTORICAL_RECIPES.md).


**Historical design status:** preserved original proposal; current bounded scope is reconciled above.
**Backlog:** `ENHANCEMENTS.md` → Ideas, visual → *"Death as an event"*, effort S–M, impact ★★★
**Depends on:** V1 (the body is one mesh — that changes the backlog's plan, see §3.2) · V2 (tag-based glow makes the impact fx emitters and the debris provably non-emitters)
**File:** `snake-three.html`

---

## 1. Problem

`gameOver()` is five statements, and the interesting ones happen behind a frosted-glass panel:

| what happens today | where | what the player actually gets |
|---|---|---|
| `state = 'over'` | `gameOver()` | the sim stops dead; `animate()` then pins `acc = stepMs`, so the body renders frozen on its final cells forever |
| `shake = 0.9` | `drawCamera()` | `shake` falls linearly at `2.4/s` and jitter amplitude scales as `shake²`, so it is down to **36 % of peak by 150 ms** and exactly zero at 375 ms — over before the eye arrives |
| `burst(head, 0xef4444, 26)` | `burst()` | 26 additive spark points (`size 0.17`), life 0.42–0.74 s: the only "body" event in the game is a puff of dots at the skull |
| `allSkinMats.emissive = 0x4c0d0d` | `gameOver()` | every material flips to one flat dark red — no ramp, no time, and it erases the head→tail character V1 built |
| `showOverlay(...)` | `gameOver()` | **same frame**, `#overlay` covers the viewport with `rgba(2,6,23,.58)` + `backdrop-filter: blur(4px)`, `z-index: 20` |

That last row is the whole problem: everything a death animation could say is painted *behind* a blurred, dimmed scrim that appears on the same frame as the death. The body stays frozen mid-arena — correct for reading the board afterwards, wrong as an ending. Death currently reads as a UI event rather than a physical one, and it carries no information about *what* killed you: the wall you hit looks exactly the same afterwards, in exactly the same place as the wall that is still guarding you.

## 2. Goals and non-goals

**Goals**
1. Death is a **physical event**: the body breaks into pieces that fly with velocity + gravity and settle on the floor.
2. Death is **legible**: the wall actually hit flashes, and a shockwave ring marks where it happened.
3. The overlay **waits** for the event — and still can never be lost to a throttled tab.
4. **Zero cost while alive.** No draw calls, no allocations, no shader variants until something dies.
5. **Deterministic**: the same death replayed bit-identically, so it can be asserted rather than sampled (every harness in `tests/` works by driving the sim by hand).
6. Interaction with V1 and V2 is explicit and covered by acceptance criteria — including "debris cannot glow in mask mode".
7. Interruptible at any point; restart mid-flight leaves no trace.

**Non-goals**
- Camera push-in / roll on death — that is backlog **V7**, and it wants a decision about `camera.fov` vs the composite target first.
- Audio (backlog G11), gore, blood, particles beyond what exists.
- Physics beyond a floor bounce: no per-piece wall collision, no piece-to-piece collision.
- Persistent debris across a restart.
- Slow motion of the **simulation** — it is already stopped; only visuals dilate. `stepMs` and `acc` are not touched.
- New GLSL. Everything here is transforms, vertex colours, existing textures and material uniforms (the same discipline V2 §6 set).

## 3. Design

### 3.1 Timeline

```
 t=0     gameOver() ─► startDeath(reason)
        │   body → K pieces · tube hidden · contact blobs off · flash + ring spawn
        │
        ├── slow-mo: visuals run at 0.3× for SLOW_MS, ease back to 1× over EASE_MS
        │
 0…250   pieces accelerate (travel + radial ejection), colour drain front leaves the impact end
 ~420    overlay fades in (wall-clock deadline, never later — §3.7)
 250…700 gravity takes over, drain reaches the far end, ring fades out
 ≤1400   pieces settle on the floor and stay there until restart
```

State lives in one object, mirroring `BLOOM_MASK` / `TUBE`:

```js
DEATH = { active, at /* performance.now() */, t /* ms of visual time since death */,
          reason, impact /* Vector3 */, wall /* mesh or null */, pieces: [...], ... }
```

### 3.2 The V1 problem: there are no segments any more

The backlog line says *"per-segment scatter (velocity + gravity)"*. That was written against the pre-V1 build, where the body **was** up to ~440 cylinder meshes with their own transforms (`ENHANCEMENTS.md` warns its line numbers refer to that build). Post-V1 the body is one `BufferGeometry` and a draw range — so "move each segment" is no longer available, and displacing vertices of a connected surface *stretches* it rather than detaching it.

Three ways out; **(a) is the plan**:

| option | verdict |
|---|---|
| **(a) Copy the arcs out at death** — partition the tube's rings into K arcs, copy each into a pooled mesh, hide `tubeMesh`, fly the pieces | **Chosen.** V1 keeps positions/normals/colours in flat `Float32Array`s (`tubePos` / `tubeNrm` / `tubeCol`) with ring *i* occupying the contiguous block `[i·stride, (i+1)·stride)` where `stride = TUBE.RADIAL + 1`. So a piece is `subarray()` + one copy, done **once** at death; after that it is transform-only. The snapshot captures the body exactly as posed (gait, bend bulge, taper included), and `motionFactor` decays to 0 in `'over'`, so nothing double-animates. |
| (b) Displace vertices inside the single mesh | Rejected: zero new draw calls, but a connected surface cannot separate — it reads as rubber, not debris. |
| (c) `InstancedMesh` of generic chunks | Rejected for now: decouples the debris from the body's silhouette, and "these *were* your rings" is the entire point. Revisit only if (a)'s one-off copy ever measures hot (§10). |

Legacy `segments` mode (`T`) keeps its natural path — those meshes still have their own transforms, so they detach in place with no copying at all (§4).

**The head is free.** `headGroup` is a plain `Object3D` inside the never-transformed `snakeGroup`, so skull + jaw + eyeballs + tongue fly as rigid body #0 by writing `position`/`rotation` — no reparenting, no extra draw calls. Piece 1 starts ~1 cell behind the skull so the neck rings don't intersect it.

### 3.3 Where time comes from: one scalar, visuals only

```js
function deathTimeScale(t /* ms */) {
  if (!DEATH.active || t >= DEATH.SLOW_MS + DEATH.EASE_MS) return 1;
  if (t <= DEATH.SLOW_MS) return DEATH.SLOW_SCALE;
  return THREE.MathUtils.lerp(DEATH.SLOW_SCALE, 1, (t - DEATH.SLOW_MS) / DEATH.EASE_MS);
}
```

`animate()` multiplies the **visual** dt by it and passes the result to `updateDeath()`, `updateParticles()` and the shake decay. The simulation block is untouched: `stepMs`, `acc` and the step loop keep their current shape, so a restart can never desync the gait.

Two consequences that must be handled explicitly:

- **Freeze auto-tune for the sequence.** `autoTune()` averages 90 frames and drops `high → low` above 34 ms, `→ balanced` above 21 ms. A deliberately expensive 250 ms effect must not permanently downgrade a good machine, so tuning accumulation is skipped while `DEATH.active` (the existing `tuneWarmup` counter can absorb the tail).
- **Sub-step the integration.** At 30 fps and 0.3× dilation a piece moves less per frame than at full speed, but a post-stall `dt` clamped to 0.25 s must not let a piece tunnel through the floor: integrate in fixed steps of ≤ 8 ms.

### 3.4 Deterministic impulses — no `Math.random()` anywhere in V3

The existing `burst()` and `drawCamera()` use `Math.random()`, which is fine for them and fatal for a test that wants to assert a scatter. Every number below derives from the death state (piece index, arc position, death cell), so a replayed death is bit-identical.

```
u        = arc distance from the struck point to the piece, normalised 0…1
           (wall death: struck point is the head, so u is plain arc length from ring 0;
            self death: it is |arc − arc of the struck cell|, so pieces on BOTH sides of
            the wound are thrown outward from it — which is what makes the two deaths look different)
travel   = direction of the last simulation step (dir)
outward  = ring binormal at that arc (already computed in ringBin), sign alternating by piece parity
energy   = 1 - smoothstep(0, 1, u)

v₀ = travel × TRAVEL_GAIN × (1 - u × TRAVEL_FALLOFF)
   + outward × RADIAL_GAIN × energy
   + up × POP_GAIN × energy

ω₀ = axis from hash(pieceIndex, deathCell), |ω| ≤ SPIN_MAX            // deterministic "randomness"

each sub-step:  v.y -= GRAVITY × dt;  v ×= DRAG;  pos += v × dt
                if (pos.y < r_piece) { pos.y = r_piece; v.y *= -BOUNCE; ω ×= 0.7 }
```

`GRAVITY / DRAG / BOUNCE` are deliberately the same constants as `updateParticles()` (7.4 / 0.965 / 0.32) so debris and sparks fall as one family.

### 3.5 Desaturation drain — V1's ramp makes this free

`writeTubeColours()` already evaluates a per-vertex colour from `ringS[i] / tubeArc` (hue head→tail) plus the belly bake from the vertex normal. At death those colours are copied into the pieces, so "drain" is rewriting piece vertex colours:

```
front  = DEATH.t / DRAIN_MS          // drain front travels outward from the struck point
sat    = lerp(1, DRAIN_FLOOR, smoothstep(u, front - 0.35, front))   // smoothstep(x, lo, hi)
colour = lerp(grey(luma(colour)), colour, sat)                      // Rec.709 luma: brightness survives, chroma dies
```

Budget: ≤ `VERTS_BUDGET` (12 000) vertices × 3 floats per frame ≈ negligible CPU, uploaded through the existing partial-range `flagUpload()`. The material-level emissive change that exists today (`0x4c0d0d`, and `emissiveIntensity` dropping to 0.5 in `'over'`) stays, but becomes part of the same timed ramp instead of an instant switch.

**Known limitation, accepted:** legacy segment mode shares 8 bucket materials, so there its drain is per-bucket rather than per-piece. The fallback path is allowed to be less good; it must not be *broken*.

### 3.6 Impact flash and shockwave ring (V2-aware)

- **Where it happened.** `gameOver(reason)` needs no signature change. Both branches in `step()` return *before* the head position is assigned, so in either case the impact cell is `head + dir` — for `'wall'` that cell is outside the board and identifies which of the four walls was hit by its plane; for `'self'` it is the body cell that was struck. Deterministic, no bookkeeping.
- **Why not tint the wall.** `buildArena()` keeps `wallMeshes` local and gives all four walls **one shared `wallMat`** — a material tweak flashes the whole arena. So: a pooled **impact mesh** (small plane, additive, reusing the existing radial glow texture) placed flush on the hit wall's inner face at head height, intensity `FLASH_PEAK → 0` over `FLASH_MS`.
- **Shockwave ring.** Floor-aligned, centred on that impact point (just inside the wall face for a wall death). It sits at **y = 0.02**: the ground plane is at y = 0 and `GridHelper` at y = 0.012, so anything lower z-fights the grid. Scaled `RING_R0 → RING_R1` over `RING_MS`, opacity from the same clock.
- **Bloom.** Both fx meshes get a new **`fx`** tag (`BLOOM_TAGS.fx = true`, plus the matching `bloomTagged.fx = []` key): they are emitters by intent, so in mask mode they glow — while the debris, being skin and untagged by default, must not. Consequences worth stating:
  - HUD `bloom mask·10` becomes **`mask·12`** (ring + flash are registered permanently). Tagging invisible objects is free: three.js drops `visible === false` before the layer test, so they cost no draw calls and no fill.
  - `setBloomTag('fx', false)` must remove them within one frame without touching prey or walls — that is V2's per-group control being used for its intended purpose.

### 3.7 Overlay and input

- The panel appears at `OVERLAY_DELAY_MS` (~420 ms) with a short fade, via a CSS transition on `#overlay`.
- **Only the death path waits.** `showOverlay()` has three other callers — the title screen at boot, `pauseGame()`, and `winGame()` — and all three must stay instant. So the delay lives in a new `showDeathOverlay()` wrapper that schedules the same DOM update; `showOverlay()` itself keeps its current immediate behaviour, which also means criterion 6 cannot be satisfied by accident.
- **The deadline is wall-clock** (`performance.now() - DEATH.at >= OVERLAY_DELAY_MS`), *not* accumulated dt: `animate()` clamps `dt` to 0.25 s, so in a throttled tab the slow-mo can take arbitrarily long in real time while the panel must still appear. The check lives in `animate()`, not in a bare `setTimeout`, and `visibilitychange` forces it — losing the score screen is a bug we cannot ship.
- Input during the sequence: `Space` / `Enter` / `R` already call `startGame()` from `'over'`; that path must cancel cleanly (§8.5). The panel is `display: none` until shown, so there is no window where a click lands on an invisible button. (`K` is unclaimed today, which is why it takes the V3 A/B toggle next to `T` for the body and `M` for the bloom mode.)
- There is currently **no** `visibilitychange` or blur handler in the file — nothing pauses on tab switch. V3 adds the only one, and its job is narrow: force the overlay deadline check so returning to a backgrounded tab cannot land on a screen with no score panel.
- **`winGame()` deliberately does not scatter.** A full board is an achievement, not a wreck; it keeps today's instant panel.

## 4. Ownership: what hides, what moves, what comes back

| object | during the sequence | restored by |
|---|---|---|
| `tubeMesh` | `visible = false` from t = 0 (its rings live in the pieces now) | `endDeath()` |
| legacy `segs[i].mesh` (`TUBE.MODE !== 'tube'`) | stays visible, becomes piece geometry — transform driven by the death sim instead of `drawSnake()` | `endDeath()` |
| `headGroup` (skull, jaw, eyes, tongue) | rigid body #0, flies and tumbles | `endDeath()` repositions from `segs[0]` |
| `blobGroup` (all contact shadows incl. `parts.headBlob`) | `visible = false` — a contact shadow under a flying piece is the tell that gives the whole trick away | `endDeath()` |
| food, halo, `foodLight`, arena, grid | untouched; the board state stays readable | — |
| particles (`burst`) | updated with dilated dt | — |
| camera shake | decay uses dilated dt, so the shake lasts as long as the event | — |
| composite chromatic aberration (`ca = shake²·0.9`) | inherits the dilated shake automatically | — |
| overlay `#overlay` | hidden until the deadline, then fades in | `startGame()` hides it immediately |

## 5. Configuration

One block next to `TUBE` / `BLOOM_MASK`, same style:

```js
const DEATH = {
  ON: true,                 // master switch; K toggles it for A/B, like T for the tube
  SLOW_MS: 250, SLOW_SCALE: 0.3, EASE_MS: 400,
  PIECES_MIN: 3, PIECES_MAX: 16, CELLS_PER_PIECE: 4, VERTS_BUDGET: 12000,
  GRAVITY: 7.4, DRAG: 0.965, BOUNCE: 0.32,          // parity with updateParticles()
  TRAVEL_GAIN: 2.6, TRAVEL_FALLOFF: 0.55, RADIAL_GAIN: 1.8, POP_GAIN: 2.2, SPIN_MAX: 7.0,
  FLY_MS: 1400, DRAIN_MS: 520, DRAIN_FLOOR: 0.16,
  RING_MS: 600, RING_R0: 0.4, RING_R1: 7.0,
  FLASH_MS: 260, FLASH_PEAK: 3.4,
  OVERLAY_DELAY_MS: 420, OVERLAY_FADE_MS: 160
};
```

`TIERS` gains a debris budget so weak tiers pay less: `debris: 16 | 8 | 5` for high / balanced / low (piece count is `clamp(ceil(len / CELLS_PER_PIECE), PIECES_MIN, tier.debris)`).

**What `VERTS_BUDGET` actually costs.** Worst case is the whole tube: `TUBE_VERTS_MAX = (440·4 + 1) × 21 ≈ 37 000` vertices. The budget admits ~570 rings, so it stays inert up to roughly **140 cells** of body and past that keeps about one ring per cell instead of four. Chunks keep their length and lose facets — coarser debris rather than a visible stall — and the fallback direction if that ever reads badly at high scores is to raise the budget and lower `debris`, not to change the mechanism.

## 6. Code changes

| location | change |
|---|---|
| config block (near `TUBE`, `BLOOM_MASK`) | add `DEATH` |
| `TIERS` | add `debris` count per tier |
| new `buildDeathPool()` — called once from `buildScene()` after `buildBodyTube()` | allocate the piece pool: `BufferGeometry` per piece **sharing the existing `bodyMat`** (the tube already renders with per-vertex colours, so a piece needs no material of its own — see the note below the table), each with an index buffer sized for its share of `VERTS_BUDGET`; index templates precomputed once per `(rings, RADIAL)` pair actually used, since indices depend on nothing else — decimation changes the ring count, so it selects a template rather than generating one. Allocate ring and impact meshes reusing existing textures; `tagBloom('fx', …)` both; everything `visible = false`. Like V1's tube pool, this exists to move a cost out of the death frame and into init. |
| `gameOver()` | keep the shake/burst/emissive lines, call `startDeath(reason)`; route the panel through `showDeathOverlay()` so the delay lives in one place — `showOverlay()` stays immediate for boot, `pauseGame()` and `winGame()` |
| new `startDeath(reason)` / `updateDeath(dt)` / `endDeath()` | `updateDeath` is a **pure function of dt**, called from `animate()`, and callable by the harness with a fixed step — the same hook shape that made V1's and V2's tests possible |
| `animate()` | compute the time scale, advance `updateDeath()`, pass dilated dt to particles and shake, skip body positioning while `DEATH.active`, freeze tuning accumulation, check the overlay deadline |
| `drawSnake()` | early-return the body/head/blobs positioning while `DEATH.active` (the pieces own those transforms) |
| `resetGame()` | call `endDeath()` before rebuilding: restore visibility, reset piece matrices, re-derive base colours, cancel the overlay deadline |
| `buildArena()` | hoist `wallMeshes` to module scope (needed to place the impact mesh; same change V2 needed for tagging) |
| `BLOOM_TAGS`, `bloomTagged` | add the `fx` group |
| `onKeyDown` | `K` (unclaimed today) toggles `DEATH.ON`; HUD shows `death fx on/off` in the same suffix style as `tube · bloom mask·N` |
| CSS `#overlay` | opacity transition + `.show` class instead of a bare `display` flip |

No shader changes anywhere, and — deliberately — **no new skin materials**: pieces share `bodyMat`, so the program cache key cannot change and §8.4 is a regression check rather than a hope.

**Pieces do not fade.** They fly, bounce, settle and stay for the rest of the run: opaque geometry, one material, no alpha, no sorting questions inside the HDR target. Lingering wreckage is a feature — it is the "where did I die" read that criterion 2 is about — and if playtesting says otherwise, `FLY_MS` + an opacity ramp on a cloned material is the fallback, paid for in §8.4.

## 7. Suggested PR breakdown

1. **Skeleton + scatter + overlay delay.** Pool built at init, `startDeath/updateDeath/endDeath`, pieces from tube rings, head as body #0, blobs off, deterministic impulses, deferred panel, `K` toggle. This is already the whole read of "death is physical"; it lands with tests for criteria 1–6.
2. **Drain + impact flash + ring + slow-mo easing + auto-tune freeze.** Tuning PR against criteria 2 and 6.
3. **`tests/test_death.mjs` committed**, docs/backlog updates, and a decision on the legacy-mode per-bucket drain deviation.

## 8. Acceptance criteria

1. **Zero idle cost.** At an identical snake length and camera, `renderer.info.render.calls` and `.triangles` before any death are unchanged from the pre-V3 baseline (V1's harness pins these: 84 calls / 6 484 triangles at length 60 in tube mode). No new geometry or texture is created during play: `renderer.info.memory.geometries` / `.textures` constant across N deaths.
2. **Sequence cost bounded.** While debris is alive: ≤ `tier.debris + 2` draw calls (pieces + ring + flash), total debris vertices ≤ `VERTS_BUDGET` regardless of snake length, and the longest frame after death ≤ 2× that tier's median frame measured in the same run. Triangle count cannot exceed the alive frame's body triangles plus a few hundred — the pieces *are* the body's own vertices.
3. **Determinism.** Same path, same death cell, same fixed tick sequence ⇒ identical piece transform and colour buffers at every tick (compare a hash). Requires zero `Math.random()` in V3 code; a grep assertion is part of the test.
4. **Programs constant.** `renderer.info.programs.length` does not change across death → restart → death. If V3 genuinely introduces a variant, it must appear during init, never at first death — a compile hitch inside the effect is exactly what this feature cannot afford.
5. **Clean restart mid-flight.** Restart at 60 ms, 200 ms and 700 ms into the sequence: no debris visible, tube visible, `blobGroup.visible === true`, panel hidden, bloom tag counts unchanged, tube colour buffer hash equal to the pre-death hash, and the *next* death identical to the first (criterion 3 again).
6. **Overlay deadline.** Panel hidden for ≥ `OVERLAY_DELAY_MS` after `gameOver()`, shown within +150 ms; a simulated rAF stall of > 250 ms must neither skip the sequence nor leave the panel permanently hidden; `Space` during the sequence restarts cleanly.
7. **V2 interaction.** In mask mode, `POST.bloomRT` is unchanged (within noise) by the presence of debris — skin is untagged, so it contributes exactly zero — while ring and flash contribute measurably more than noise. `setBloomTag('fx', false)` removes them within one frame without touching prey or walls.
8. **No regressions.** V1's suites (`test_tube`, `test_paths`), V2's `test_bloom`, and the gameplay autopilot all green; no NaN in the HDR targets at any tick of the sequence; zero console errors; SMAA still ready.

## 9. Test plan — `tests/test_death.mjs`

Follows the house pattern exactly: load, force tier high, **park the simulation**, drive it by hand.

- Expose for testing: `window.DEATH`, `startDeath()`, `updateDeath(dt)`, `endDeath()`, plus a helper that kills the snake at a chosen cell/direction so deaths are reproducible.
- **Fixed ticks.** Advance in 16.67 ms steps; record per tick: piece transform hash, colour hash, `render.calls`, `render.triangles`, `programs.length`, `memory.geometries`.
- **Screenshots** at ~80 / 300 / 900 ms into the sequence → `.artifacts/` for eyeballing (never asserted on — pixel diffs across runs are noise, as V2 §14.3 learned).
- **Determinism.** Run the identical death twice and compare hashes; also assert no `Math.random` in the V3 source region.
- **Restart matrix** (§8.5) and **overlay deadline** with a busy-wait stall injected in-page.
- **Bloom readback** reuses V2's harness helpers (`rtStats(POST.bloomRT)`, `rtFinite`) for criterion 7 — the same trick that proved mask mode cannot leak.

## 10. Risks & mitigations

| risk | mitigation |
|---|---|
| Spawn hitch from the copy (worst case a board-filling snake: ~37 k vertices ≈ 1.4 MB plus indices) | happens **once per death**, not per frame; `VERTS_BUDGET` decimates arcs for long snakes (dropping rings reads as coarser chunks, not as a stall); criterion 2 bounds it against the tier's own median |
| Auto-tune downgrades a good machine because of a deliberate effect | tuning accumulation frozen while `DEATH.active`; `tuneWarmup` absorbs the tail |
| Pieces tunnel through the floor after a stall | fixed sub-steps ≤ 8 ms, floor clamp identical to `updateParticles()` |
| Panel never appears (throttled tab, exception during the sequence) | wall-clock deadline checked in `animate()`, forced on `visibilitychange`, and a try/catch around `updateDeath` that shows the panel on error |
| Debris left behind by a restart mid-flight | single `endDeath()` owner for every visibility/matrix/colour restore; criterion 5 tests three points in the sequence |
| Pieces culled wrongly (the tube already sets `frustumCulled = false` with a hand-computed sphere) | pieces use per-piece bounding spheres computed once at spawn from the copied positions, so they still leave the frustum when they should |
| Someone adds a fade and drags transparency/alpha-sorting into the HDR target | pieces are opaque by design (§6); if a fade is wanted later, it needs a cloned material *and* a re-run of criterion 4 |
| Mask mode makes debris look like it emits | skin stays untagged by default (V2's decision); criterion 7 proves it with a readback rather than by eye |
| Slow-mo feels like lag | it is 250 ms and eases back; `SLOW_SCALE` is the first knob to turn down if playtesters read it as stutter, and `K` gives an instant A/B |

## 11. Alternatives considered

| approach | why not |
|---|---|
| Vertex-shader shatter (`onBeforeCompile`, per-piece matrices in a uniform array) | breaks the no-GLSL rule V2 set for cheapness, and every variant is another pipeline compile on low-end GPUs — the same argument as V2 §11.3 |
| `InstancedMesh` of generic chunks | cheapest possible draw cost, but the debris stops being *your* body; also fights per-piece colour (needs instanced attributes) |
| A bigger particle puff | already exists, already invisible behind the panel, and does not make the body feel physical — it is the thing V3 replaces |
| Freeze-frame + screen-space zoom | hides the board state the player wants to read ("where did I die?"), and collides with V7's camera work |
| A physics library for 16 rigid bodies | a dependency, a bundle and a per-frame solver for what is 20 lines of parabola |

## 12. Tuning knobs

| knob | effect |
|---|---|
| `SLOW_SCALE` / `SLOW_MS` / `EASE_MS` | how long the moment hangs; too high reads as lag, too low as a skipped frame |
| `PIECES_MAX`, `CELLS_PER_PIECE` | chunk size vs draw calls; per-tier via `TIERS.debris` |
| `VERTS_BUDGET` | decimation crossover (~140 cells today) — cost vs silhouette fidelity at high scores |
| `TRAVEL_GAIN`, `RADIAL_GAIN`, `POP_GAIN`, `SPIN_MAX` | the shape of the explosion: forward throw, sideways fan, lift, tumble |
| `GRAVITY`, `BOUNCE`, `DRAG` | shared with particles on purpose; changing them desynchronises debris from sparks |
| `DRAIN_MS`, `DRAIN_FLOOR` | how fast and how far the colour dies; 0.16 leaves a grey ghost, 0 reads as a cardboard cut-out |
| `FLASH_PEAK`, `FLASH_MS` | legibility of "this wall"; must stay below the level where it blooms into an unreadable blob |
| `RING_R1`, `RING_MS` | how far the impact is announced across the arena |
| `OVERLAY_DELAY_MS` | the whole feature in one number: too short hides the event, too long delays the score |

## 13. Why this is cheap now — and what changed since the backlog line

**V1 made the scatter possible as a buffer copy.** The body's posed vertices are already flat `Float32Array`s with a contiguous ring layout and a per-ring colour ramp; slicing arcs, copying normals and draining colour through the existing ramp are all array work plus one `needsUpdate`, using an upload path (`flagUpload`) that already avoids full-buffer uploads. The head is already a rigid `Object3D`. Without V1 the "scatter" would have been 440 mesh transforms and a per-segment colour rewrite through 8 shared materials.

**V2 made it legible.** Tag-based glow means the impact flash and ring can be *made to emit* while the debris is provably non-emissive — and V2 left behind a harness that proves exactly that by reading `POST.bloomRT`, so criterion 7 is an assertion rather than an opinion.

**What the backlog line got wrong (by accident of timing):** "per-segment scatter" describes the pre-V1 scene graph. Same intent, different mechanism: partition the tube's rings, not a list of segment meshes. Everything else in that line — velocity + gravity, desaturation ramp head→tail, flash on the wall hit, shockwave ring, ~250 ms slow-mo at `stepMs × 0.3` — is kept, with one correction: the slow-mo scales *visual* dt rather than `stepMs`, because the simulation is already stopped and touching its clock would risk the gait that V1 just made the game's whole look.
