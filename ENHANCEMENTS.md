# just-snake enhancement inventory

Current authority: [PUBLIC_RELEASE_BACKLOG.md](PUBLIC_RELEASE_BACKLOG.md), [structural task manifest](plans/public-release.plan.json) and [acceptance catalog](plans/public-release.acceptance.json). This inventory replaces the old unchecked DONE labels. Historical SPEC bodies remain design provenance; their reconciliation notices override obsolete clauses. Accepted below means independently accepted **bounded task scope**, not a new full-current-revision qualification or a live deployment. The open E04/E05/E06 rows are the E03 checkpoint snapshot. Later actual E04 attestation and E05/E06 hosted records supersede that snapshot; this checked inventory is not silently rewritten after qualification.

## Current rules-2 baseline

The canonical source is `snake-three.html`; `_game.js` was removed only after a live-reference audit and byte/hash archival. Grid 21×21, initial length 3, target length 60, queue limit 3. Mode rules are frozen: Calm 140→95 ms / speed step 3 / wrap / one prey / no pillars; Classic 115→62 ms / step 4 / lethal walls / one prey / pillars; Frenzy 90→45 ms / step 4 / lethal walls / two prey / pillars. Displayed maximum speed levels are Calm 16, Classic 15 and Frenzy 13. Walls follow mode; no mutable wall-wrap preference exists.

Common/golden/jittery points are 10/40/20. Golden lifetime is exactly **6000 simulation milliseconds**; historical six-second wording retains its duration but render-delta countdown ownership is superseded. Expiry wins equality before movement/eating. Combo windows are 4500/3900/3300/2700/2400 simulation milliseconds and multiplier caps at ×5. Golden expiry, combo expiry, movement/metrics/respawn and jitter decisions have a fixed event order. Rendering cannot advance logical deadlines, grid cells or gameplay RNG; pause/modal/background time freezes the simulation. Zones change on successful prey counts 10/20/30/40, independent of points/type/combo.

Challenge identity is JSON([2, mode, seed]); food and hazards use distinct tuple-derived FNV-1a/Mulberry32 streams. URL seeds retain allowed Unicode and leading/trailing whitespace; daily identity includes concrete UTC date and mode. Requested settings and effective safety/capability state are separate. Scores use the validated `threejs-snake-scores-v2` envelope and mode/category/seed scopes; older keys are read-only archives, not current rankings. There are no online rankings, accounts or source-license grant.

## Gameplay status and assertions

| ID | Feature | Status | Owning tasks | Executable assertions |
|---|---|---|---|---|
| G1 | Combo multiplier | accepted | B07, C04 | [timers.spec.mjs](tests/release/timers.spec.mjs); [test_combo.mjs](tests/test_combo.mjs) |
| G2 | Prey archetypes | accepted | B06, B07 | [determinism.spec.mjs](tests/release/determinism.spec.mjs); [test_prey_types.mjs](tests/test_prey_types.mjs) |
| G3 | Seeded hazards | accepted | B06, D03 | [determinism.spec.mjs](tests/release/determinism.spec.mjs); [test_hazards.mjs](tests/test_hazards.mjs) |
| G4 | Run lifecycle, summaries and local rankings | accepted | B04, B08, C03 | [run-lifecycle.spec.mjs](tests/release/run-lifecycle.spec.mjs); [test_run_structure.mjs](tests/test_run_structure.mjs) |
| G5 | Optional practice revive | deferred | F02 | Not implemented; see deferred task contract |
| G6 | Calm / Classic / Frenzy | accepted | B01, B06 | [settings.spec.mjs](tests/release/settings.spec.mjs); [test_difficulty.mjs](tests/test_difficulty.mjs) |
| G7 | Rules-2 seeded/daily challenges | accepted | B06, B07 | [determinism.spec.mjs](tests/release/determinism.spec.mjs); [test_seeded_rng.mjs](tests/test_seeded_rng.mjs) |
| G8 | Same-challenge local ghost | deferred | F03 | Not implemented; see deferred task contract |
| G9 | Settings and pause | accepted | B01, B02, C01 | [modal.spec.mjs](tests/release/modal.spec.mjs); [test_settings.mjs](tests/test_settings.mjs) |
| G10 | Menu accessibility and reduced motion | accepted | B03, C02 | [accessibility.spec.mjs](tests/release/accessibility.spec.mjs); [test_accessibility.mjs](tests/test_accessibility.mjs) |
| G11 | Procedural audio | accepted | B09, B10 | [recovery.spec.mjs](tests/release/recovery.spec.mjs); [test_audio.mjs](tests/test_audio.mjs) |
| G12 | Pointer, feedback and fullscreen | accepted | B10, C02 | [touch.spec.mjs](tests/release/touch.spec.mjs); [test_mobile.mjs](tests/test_mobile.mjs) |

## Visual status and assertions

| ID | Feature | Status | Owning tasks | Executable assertions |
|---|---|---|---|---|
| V1 | Continuous tube / segments | accepted | D01, D03 | [test_tube.mjs](tests/test_tube.mjs) |
| V2 | Selective / luma bloom | accepted | D03 | [test_bloom.mjs](tests/test_bloom.mjs) |
| V3 | Death presentation | accepted | B04, B09 | [test_death.mjs](tests/test_death.mjs) |
| V4 | Eat effects | accepted | D02 | [test_eat.mjs](tests/test_eat.mjs) |
| V5 | Arena trails / successful-prey zones | accepted | C04 | [test_arena.mjs](tests/test_arena.mjs) |
| V6 | Speed presentation | accepted | B03, C04 | [test_speed.mjs](tests/test_speed.mjs) |
| V7 | Camera life / steady-motion alternative | accepted | B03, D01 | [test_camera.mjs](tests/test_camera.mjs) |
| V8 | Skin finish / lower-tier gates | accepted | D03 | [test_skin.mjs](tests/test_skin.mjs) |
| V9 | Distinct prey silhouettes | accepted | B03, B07 | [test_prey.mjs](tests/test_prey.mjs) |
| V10 | Independent title demo | accepted | B05, B07 | [test_attract.mjs](tests/test_attract.mjs) |
| V11 | High reflection / gloss / tilt shift | accepted | D03 | [test_high_tier.mjs](tests/test_high_tier.mjs) |
| V12 | Mode-correct HUD / scoped best | accepted | C04 | [test_hud.mjs](tests/test_hud.mjs) |

## Performance and code debt

| Item | Status | Current truth and assertions |
|---|---|---|
| P1 contact-shadow instancing | accepted (D01) | Three preallocated opacity buckets; ≤3 contact draws independent of length, including 441-cell structural arrangements. [performance cases](tests/release/performance.spec.mjs). No promise of ten total scene calls. |
| P2 lower-tier material/light budget | partial (D03) | Pooled Lambert floor and lower-tier physical-finish/beam-light gates are measured and accepted; High identity preserved. Static lighting bake and broader architecture work are deferred, not claimed complete. [profile cases](tests/release/performance.spec.mjs), [measurements](docs/PERFORMANCE.md). |
| P3 resize churn | accepted (D02) | Coalesced latest size/DPR, unchanged-size reuse, lifecycle cancellation/restore. [performance cases](tests/release/performance.spec.mjs). |
| P4 idle particles | accepted (D02) | Unique active pool; final expiry clears/uploads once, then no idle scans/uploads. [performance cases](tests/release/performance.spec.mjs). |
| Module extraction | deferred (F01) | Canonical single HTML remains intentional for this release; no module migration is claimed. |
| Revive / ghost / additional board sizes | deferred | G5→F02 practice-only revive; G8→F03 same-challenge local ghost after F01. Other board sizes are outside the release and have no accepted implementation. |
| Final current qualification | open at E03 checkpoint (E04) | Full 52 local cases, 20 static suites, 26 legacy suites and actual source/ordinary dist engine matrix still require independent final execution. |
| Hosted publication / recovery proof | open at E03 checkpoint (E05/E06) | Local rehearsals are not hosted workflow or live publication evidence. |

Historical absolute draw/timing numbers, blanket zero-allocation/program claims and old luma efficacy ratios are not current promises. [PERFORMANCE.md](docs/PERFORMANCE.md) records actual backend limitations, separate software/hardware-driver evidence and retained raw timing flags. Luma readback uses corrected half-float decoding and a fixed seeded/common-prey pose: added-signal ratio ≥1.75, coverage ratio ≥2, gain ≥10× control floor, with unchanged absolute/control/mask/scenario gates. No runtime High threshold retune or physical-device FPS claim follows from that calibration.

## Evidence and execution order

Accepted-task assertion links above are portable. Task reports live at `.artifacts/tasks/<task>/result.json` and independent review records; they are local evidence, excluded from public dist, and their original source hashes remain explicit. They do not certify every historical clause or replace E04's fresh full report. Continue E03 reconciliation → E04 independent qualification → authorized E05/E06 publication. F01 precedes deferred F02/F03; defer P2's remaining bake work rather than silently marking it done.

[Historical recipes and compatibility adapters](docs/HISTORICAL_RECIPES.md) records the obsolete generator/implementer/plan audit. Do not run old text-replacement recipes or treat their prompts as current development instructions. The original enhancement inventory and removed stale script bytes/hashes are preserved in the E03 task archive.
