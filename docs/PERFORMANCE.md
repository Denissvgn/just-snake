# just-snake rendering budgets

Run the benchmark from a fresh checkout with native ARM64 Node 24:

```sh
npm ci
npm ci --prefix tests
npm run test:install-browsers
node tests/helpers/performance-benchmark.mjs --phase before --engine chromium --output-root .artifacts/performance
# Apply the change being measured, with no other browser workload.
node tests/helpers/performance-benchmark.mjs --phase after --engine chromium --output-root .artifacts/performance
```

Each invocation creates a new report directory and never overwrites an existing run. The helper uses the current canonical game by default; it does not read previous reports or ignored local scripts. `--engine webkit` uses the native engine's default backend. Compare only reports with the same engine/backend/GPU, both dependency locks, viewport, method and sample configuration. Run one benchmark browser at a time with no concurrent test/render workload.

The method fixes an 800×600 CSS viewport, DPR 1, paused seeded pose and tube body. It measures all three modes, all three quality tiers, and lengths 3/20/60. Each configuration warms ten frames before twenty samples. Each sample renders the snake and scene, calls `gl.finish`, and reads a pixel to fence actual GPU completion. Reports include raw samples, median/p95 wall time, calls/triangles, materials/programs/resources, actual GL vendor/renderer, SMAA/shadow-map state and logical/RNG snapshots. The paused synthetic render excludes normal simulation, input and ongoing effects. It is a relative rendering-cost measurement, not a playable FPS promise.

For a bounded precision investigation, the same public helper supports:

```sh
node tests/helpers/performance-benchmark.mjs --phase after --engine webkit --backend native \
  --batch-frames 50 --cases classic:high:20,frenzy:low:3 \
  --output-root .artifacts/performance
```

An explicit `--source-file <immutable-snapshot.html>` requires `--expected-source-sha <sha256>` and verifies that hash before launch. This is optional diagnostic input, not a second maintained game. Batch results report percentiles of normalized per-frame **batch means**, which must not be presented as single-frame tail latency.

## Qualified local measurements

D03's original 27-configuration before/after method hash was `c378110655a88dcf2ad29372e64198cf5cec2c8e46ec316901bb42b726587d22`. The before source was `2b5fb4e729e5a325e6c99d67f98686fc1753841c79445065cd7f3c0de72a2502`; the after source was `a6304729ba088335731129648d1544507defe243edc956bdc6170b5f287994c6`. The extended precision helper was measured as a separate matched pair, preserving the original reports and their flags.

On local macOS ARM64 Chromium, GL identified ANGLE/Vulkan SwiftShader. Median ranges across the nine configurations per tier were:

| Tier | Before, ms | After, ms |
| --- | ---: | ---: |
| Low | 9.50–12.90 | 4.70–7.70 |
| Balanced | 24.70–28.05 | 18.60–20.90 |
| High | 36.35–43.10 | 33.10–38.60 |

No same-configuration Chromium median exceeded +10%, and no p95 exceeded +15%. High rendering parameters remain unchanged; its timing variation does not establish a promised improvement. SwiftShader results describe software rendering only.

Native macOS WebKit reported `Apple Inc.` / `Apple GPU`, without a model identifier. Its single-frame timer was quantized to 1 ms. Two raw p95 flags remain recorded: Classic/High/20 rose 3→4 ms and Frenzy/Low/3 rose 1→2 ms, with unchanged medians. A separate, exclusive matched investigation used 20 samples of 50 fenced frames on the hash-validated before/current sources. Classic/High/20 normalized median changed 1.06→0.99 ms and p95 batch mean 1.48→1.26 ms; Frenzy/Low/3 changed 0.54→0.50 ms and 0.60→0.56 ms. It found no sustained cost increase at finer averaging precision. This does **not** replace the raw single-frame p95 observations or resolve sub-millisecond tail behavior. There is no cross-GPU comparison and no physical iOS/Android certification or hardware FPS guarantee.

## Tier policy and release gates

Auto starts Balanced on touch/coarse devices. Effective performance downgrades retain the requested preference. High keeps the original physical skin/prey finishes, Standard floor, shadows, reflections, tilt shift and sweeping point light. Balanced/Low use one preallocated Lambert floor, omit clearcoat/sheen and iridescence, and retain the visible sweeping beam without its extra point light. Prey colors, geometry, points, collisions, clocks, challenge identity and RNG are independent of these choices.

The acceptance suite checks actual material/light values after cosmetic updates, prey changes, demo/restore and restart; exact High restoration; pooled material identity; logical purity; and default/safety preference behavior. Luma calibration uses an explicitly rendered, parked, grain-free pose, a pinned challenge and common prey, corrected half-float decoding, the full threshold/scenario/control matrix and strict unknown-error checks. Its units are the mean positive paired difference of decoded pre-AA display-encoded RGB-channel means; spread counts sampled pixels with a difference above 0.005. Matched accepted-baseline/current measurements invalidated the historical noisy 2.5× premise. The reviewed gates require at least 1.75× added signal, 2× coverage, and paired gain at least ten times the measured control floor. Absolute signal, coverage, clipping, wash, populated-mask and control limits remain unchanged; runtime threshold 0.6/knee 0.45 and High appearance are unchanged. Historical failed or method-invalid reports are retained, not counted as passes.

Required structural/package limits are at most three contact-shadow draws, one effective resize rebuild per frame, zero idle particle scans/uploads, stable warmed resources after 100 cycles, at most 5 MiB uncompressed public payload and 1 MiB aggregate HTML/JS/CSS gzip. Built artifacts have the same source/lock provenance and are checked separately from local same-GPU timing evidence. Hosted CI should enforce current structural and package budgets; it must not compare a different machine's timings with these local numbers.

Neon District measurements select and synchronize the actual scene/camera tuple. The source-only benchmark uses an 800×600, DPR 1 surface, fits each camera without stretching cells, fences GPU work, and restores the real viewport owner. `--presentation original|neon-district` selects the view; `--backend native` selects the supported native Chromium Metal profile. Keep the immutable Original baseline and final Original comparison within +10% median/+15% p95, separately from final Original versus Neon (+10%/+20%).

The pre-Ion-Vault three-case native Chromium/WebKit sample showed low-cost timer quantization. Those historical raw comparisons remain recorded as failures where appropriate. Its matched exclusive 50-frame batch investigation stayed within both budgets: Original's worst change was +1.22% median/+2.17% p95 of batch means; Neon was 10–33% cheaper by median in those cases. These numbers describe the earlier matte Original scene, not the added background. Batch percentiles describe means, not individual-frame tail latency or physical mobile FPS. Firefox supplies its own structural resource/draw proof rather than borrowing another engine's timing.

Original's Ion Vault backdrop is static and uses one retained geometry, material and local image texture in the existing scene pass. It adds no animation owner or render target. The decorative floor is bounded close to the arena perimeter, leaving the surrounding background visible. High contrast and forced colors suppress the image, and an unavailable image keeps the matte backdrop playable. Current qualification checks asset serving, cover cropping, accessibility fallback and retained ownership through the existing context-recovery stress run; it does not claim physical mobile FPS from the historical timing samples.

One warmed resource test alternates presentations for 50 cycles, performs actual native context loss/restoration, then runs 50 more cycles. It verifies disposal/rebuilt ownership, strict equivalent endpoint counts, stable retained pools outside recovery and actual base-pass draw calls. Neon retains 6 geometries, 10 materials, 2 textures and 8,985,600 decoded bytes; representative Frenzy/wrap base passes use 16/15 calls within the 16/16/22 tier caps. Aggregate added JS/CSS is capped at 80 KiB gzip against the unchanged reviewed Original build's 242,236 bytes; raw copied modules are included.
