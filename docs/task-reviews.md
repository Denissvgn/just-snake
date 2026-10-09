# just-snake task discrepancy reviews

Each task is accepted only after its implementation evidence and remaining discrepancies are reviewed. Detailed diagnostics are retained locally under `.artifacts/tasks/<ID>/`.

## A00 baseline — accepted

Independent reviewer: `/root`. Verified original source/backup hashes, native ARM64, explicit safe staging candidates, no private/runtime staging, and no upstream on the newly initialized branch.

Discrepancy found: workspace-local tooling and worktrees were initially missing from exclusions. Fixed by ignoring `/.tools/` and `/.worktrees/`; independent ignore probes passed afterward. No remaining A00 defect. Node 24 and additional browser engines are recorded as A01 provisioning work.

Initial local baseline commit: `0a7469a`. A01 branch: `task/a01`, verified no upstream. No remote has been configured or pushed.

## A01 test infrastructure — accepted

Independent reviewer: `/root/game_correctness`. Frozen source and dependency lock hashes verified. Independent checks: infrastructure 6/6, static 20/20, ordinary/redirect browser checks 6/6 across Chromium/Firefox/WebKit, and two representative legacy suites. Empty/invalid filters fail correctly; no owned process/server/debug fixture remains.

Discrepancies fixed before acceptance: source-only export guards and function boundaries; actual-render readiness; child-specific timeout escalation; propagation of hidden browser errors; source HTTP/symlink/redirect isolation; one browser-wide trace for multiple tabs; clickable-state/mask-pass fixture waits; real renderable attract fixture cells; executable case discovery; false-success edge cases. Updated Puppeteer removes reported dependency findings. No remaining A01-owned discrepancy. Security/settings/modal/OS preference/demo/HUD/luma work and full dist qualification remain assigned to later tasks, not accepted by these checks.

### A01 follow-up — evidence retention under review

A03 discovered that Playwright cleans its shared browser-output directory at each engine/spec CLI run. Earlier JSON results survive, but linked screenshots/traces do not. Reopened A01 for isolated per-run browser output and report paths plus an objective retention check; dependent task implementation can continue, but evidence must be regenerated before acceptance where stale paths exist.

A01 follow-up accepted after independent retention review: separate invocation/partition report and attachment directories preserve earlier artifacts. Two fresh redirect-only runs passed across all three engines; all 19 earlier report/attachment/aggregate hashes remained intact. Old pre-fix missing traces remain explicitly unusable. No remaining A01 evidence-retention discrepancy.

## A03 URL and stored-data rendering — accepted

Independent reviewer: `/root/game_correctness`. Source and ordinary production checks confirm literal hostile seeds, validated challenge inputs, safe overlay text and escaped ranking/summary data. Twelve independent representative source/dist cases and trace CRCs passed on current source `716c3fb5…`. Prior broad matrices are retained under their original hashes, with affected cases rerun after correction.

Discrepancy found before closure: a stored mode array such as `["classic"]` passed Object.hasOwn key coercion and later crashed toUpperCase. Fixed by requiring primitive string plus enum membership; mixed array/object/number poison regression preserves a valid ranking row and runs in all three engines, source and dist. No remaining A03-owned defect. Existing action bindings initialize early only to test stored-data rendering; B04 still owns full lifecycle/visibility.

A01 automatic source-to-dist selection follow-up also reviewed: replaced anchored grep (which ignored project/file title prefixes) with boundary-aware selection; real CLI discovers 63 currently implemented tests. Missing tests remain failures.

## A02 static distribution — accepted

Independent reviewer: `/root/game_correctness`. Current source `716c3fb5…` and bundle `63c42a64…` verified unchanged during review. Build emits five local allowlisted files, including matching index/compatibility entry and exact third-party notices; total 760,025 bytes, code gzip 224,344 bytes.

Discrepancies fixed before closure: bounded output destination and non-silent asset copying; full manifest reproducibility; ordinary real-control eat and ready-SMAA/local-FXAA fallback checks; dependency parser covering JS side-effect/export/bare imports and CSS imports/url references; negative path, symlink, hardlink and missing-resource rejection. Six platform cases passed, plus independent current Chromium root/project-prefix smoke and rejection/repro checks. No remaining A02-owned discrepancy. Full release feature qualification remains pending.

## B01 requested settings and effective graphics — accepted

Independent reviewer: `/root/implementation_coordinator`. Typed schema2 settings hydrate without writes, preserve optional OS inheritance and explicit false, and separate requests from renderer safety/fallback state. Shared Q/B/M/T persistence and mode-owned walls/next-run selection pass real source and production controls. Current source `f74c0b83…`, bundle `2928b0c1…`: 27 affected browser checks across Chromium/Firefox/WebKit, scoped legacy settings and G6/G9 pass. Unaffected prior matrices remain linked under their original hashes.

Discrepancies fixed before closure: registry/config immutability; fixture reseeding on reload; restored Low→High shadow resolution and caster flags. Independent review verifies actual 2048 shadow targets, stable target identity on repeated High, Low suppression and unchanged simulation, plus five isolated hydration/storage probes and four real production flows. All 103 retained trace archives are CRC-valid; every current payload digest matches. No remaining B01-owned defect. Modal focus/input, complete motion suppression, lifecycle/demo isolation and broader performance budgets remain with their assigned later tasks.

## B02 modal state and input — accepted

Independent reviewer: `/root/implementation_coordinator`. Current source `c85b377d…`, bundle `00170636…`: 18 final focus/return checks across three engines, scoped Game/G9/G10 and five independent production flows pass. Earlier unchanged input/keymap/timer checks retain explicit original hashes. Native held-key review proves zero implicit Resume, one explicit Resume, cleared input, silent audio and applied first direction. All 102 traces are CRC-valid and payload hashes match.

Fixed cleanup naming, held-key activation, WebKit clicked-opener capture and body-focus fallback before closure. Legacy assertions preserve requested graphics; gameplay fixture disables optional haptics through storage without suppressing errors. B10 still owns activated haptics. No remaining B02 defect. A mistaken slot inference was recorded; timestamps prove both writer workers closed before independent startup, so the browser cap was not exceeded. Future launches require explicit slot release.

### B02 full modal traversal follow-up — accepted

B03's WebKit accessibility audit exposed a missing intermediate Tab stop: the original edge-only trap relied on native button-tabbing policy. B02 is reopened for deterministic full traversal and focused INPUT02 source/dist revalidation. Prior accepted evidence remains preserved; the sole B03 writer owns the shared correction.

B02 follow-up accepted on B03 source `4e17d7f8…`: 18 source/dist INPUT02 cases and independent WebKit full-cycle focus proof pass; native activation remains intact.

## B03 accessibility preferences and rendered motion — accepted

Independent WebKit review passes actual High/Low camera matrices/uniforms through eat/death, inherited live media and full menu axe/keyboard/live-region exposure (4 cases). Current source `4e17d7f8…`, bundle `f44ff403…`: source status/focus 6/6, production 15/15, scoped legacy accessibility/camera/speed and G10 pass. Prior unchanged renderer/media/palette evidence retains original hashes. Active live region stays inside the modal; page announcements remain separate. All retained trace archives are CRC-valid, payload hashes match, and no B03-owned discrepancy remains.

## B04 player lifecycle — accepted

Source `85e5dc74…`, bundle `fd61ae…`: source 15/15, production 6/6, scoped legacy run/HUD/audio and G4/V12/G11 pass. Independent Chromium/WebKit checks pass 7/7 for frozen exact metrics, scoped prior best, once-only summary/record, real actions and stale-run callbacks. Payload digests and retained traces verify. HUD fixture explicitly checks player reset; title-demo isolation remains B05 and zero-prior-best HUD presentation remains C04. No B04-owned discrepancy remains.

## B05 demo ownership — accepted

Source `c51b4f73…`, bundle `cedf7f3f…`: 18 current engine checks, attract/combo legacy, V10/G1 and artifact checks pass. Independent review passes three cases covering 3×3000 movement stress, frame-driven accumulator, forced terminal/trap/secondary-growth safety, unchanged player PRNG/context/HUD/storage and enabled-feedback isolation. Full opening grid/prey timers/positions/pillars/direction/queue matches across demo history; real mapped takeover starts a fresh player. Fixtures now use explicit ownership rather than toggling an activity bit. Payload/trace integrity verified; no B05-owned discrepancy remains.

## B06 seeded reset/spawn — accepted

Final source `3a80f4ae…`, bundle `7b74b0b2…`: 30 current startup/UTC/PACK checks and G3/G6/G7 pass; unchanged catalog vector/board/legacy evidence remains at its original hash. Independent four-tuple stream audit matches exact UTF-16 FNV/Mulberry values, states and counts. Review measured two hazard generations on takeover despite one stream draw; fixed fresh-start restoration and independent real-control probe now proves one actual call. All 67 retained traces and payload digests verify. Source-only spawn alias and equivalent legacy assertions are preserved. No B06-owned discrepancy remains; event-time/FPS rules stay B07.

### A01 debug cleanup ownership follow-up — accepted

B07 parallel source/legacy checks reproduced cross-invocation deletion of `__dbg_game.html`; gameplay assertions passed but cleanup failed, so that run remains failed evidence. Reopened A01: a global new-file sweep is not ownership. Source/release runners must never delete another invocation's legacy fixtures; registered child/suite ownership and independent two-invocation retention proof are required.

A01 cleanup reaccepted: independent Node proof 2/2, skipped 0. Exact registered path/hash cleanup runs only after child closure; no global sweep. Foreign/changed files survive; final Game exits 0. Earlier ENOENT remains failed evidence.

## B07 event-time simulation — accepted

Source `8043a38c…`, bundle `b062dd57…`: 36 current engine checks, six statics, final Game and seven retained legacy passes are accounted for with explicit hashes. Independent six-case review proves expiry equality/windows, logical jitter/retry, prospective speed, collision time, fractional/gap pause, pure rendering, protected demo clocks and complete mode/tier/cadence replay. Legacy timers use a source-only adapter; production remains unprivileged. Payload/trace integrity verified; no B07-owned discrepancy remains.

## B08 device-local scores — accepted

Source `7e88e005…`, bundle `c14f9ef9…`: affected source6, production9, legacy2 and G4/G7 pass; unaffected15 source passes retain their original fixture hash. Independent five-context review proves once-only finalization, denied capability preservation/session rankings, no legacy writes and all comparator fields. Global63-scope/top10/UTF8 retention, strict metadata, archive/practice separation and reload pass. Review fixed a null legacy-import flag; failed/aborted evidence remains preserved. All43 trace CRCs and payload digests verify; no B08-owned discrepancy remains.

## B09 lifecycle and GPU recovery — accepted

Source `b61caf0a…`, bundle `ff001a11…`: current resources6/WebKit10/production18, legacy3 and statics3 pass; unaffected prior paths keep exact provenance. Independent current Chromium3 and retained WebKit3 prove actual audio suspension and native GPU cycles with preserved logical state, fresh POST/SMAA/shadows/PMREM and explicit Resume. Review corrected texture identity fixtures, regenerated PMREM, released old GPU objects before restoration and fixed native-loss-before-event rendering. Expected failure diagnostics remain scoped; unknown errors stay strict. Audio waveform fixture now uses a real player. All77 trace CRCs/payload digests verify; no B09-owned discrepancy remains.

## B10 touch and optional device APIs — accepted

Source `0d32cf73…`, bundle `858bdf74…`: source33/production36/audio regression3, legacy2/statics2 pass; original pointer9 retain exact fixture provenance. Independent five-case actual CDP touch proves primary capture, secondary isolation, exact19/20, anchor/queue3, cancellation/loss/blur and modal pan with animation parked in source only. This certifies browser input, not physical device output. Haptics retain requests while truthful effective UI degrades; fullscreen follows enabled API/native element state and catches failures. Genuine preactivation and preserved B09 audio ownership pass. Failed fixture/protocol attempts remain recorded; all120 trace CRCs/payload digests verify. No B10-owned discrepancy remains.

## C01 first-play and return flows — accepted

Source `8a5303bf…`, bundle `cba6c827…`: current help6/production12/legacy4/statics3 pass; original ownership9 retain exact provenance. Independent5 prove pinned/casual selection, native details/focus and canceled old callbacks. One desktop/mobile image batch confirms preserved identity, exact copy and technical details inside collapsed Advanced. Missed initial boot copy fixed; failures retained. C02 owns verified inherited viewport box sizing,14px/44px sizing and touch-only legend suppression. Mechanical detector flags were reviewed in context; no redesign. Payload/trace integrity verifies; no C01-owned discrepancy remains.

## C02 responsive menus and HUD — accepted

Final source `87e2678…`: source/dist label follow-ups9/9 each and retained ba4 fullgeometry/readiness matrices pass with exact provenance; legacy2/statics3 pass. Independent12 computed-label checks cover allsixstates, normal/doubledtext andactualpositive-score record badge; prior independent5 scale/touch/warning checks remain linked. Five viewport/six-state image batch plusoneconfirmation reviewed. Fixed13px specificity, real summaryreadiness, pausespacing/sessionwarning andactual10px recordlabel; original premature-summary evidence remains invalid for that state. Touch/zoom methods labeled withoutphysicalclaims. Payload/trace integrity verifies; no C02-owned discrepancy remains.

## C03 playable sharing and device filters — accepted

Source `d36dd956…`, bundle `67c3c652…`: final production33 and affected source12 pass; legacy2/statics3 retain exact provenance. Independent final5 plus prior7 passed paths prove exact frozen-descriptor card/prefix replay, readonly fallback, latest/modal/rankings cancellation and lifecycle bindings. Fixed native WebKit select height and clarified completed-run ownership on rankings. Opening fixture now captures before first movement, not mismatched times; failed reports retained. Labels/geometry/payload/trace integrity verify; no C03-owned discrepancy remains.

## C04 speed, records and food atmosphere — accepted

Source `4fce6ea5…`, bundle `91d4a2b…`: current source6/production6, retained11 source paths, legacy3/statics2 pass with exact provenance. Independent3 unchanged core cases plus2 corrected cases verify caps15/16/13 andinterval/MAX/ARIA, firstpositive scopedeligible records,40type/combo-varied successfulfood thresholds andprotected demo tint/counters. Same-value/best-only updates produce no redundant HUD writes or logical/RNG changes. Fixture scope/return-state races corrected; earlier pass count corrected to actual11. Payload/trace integrity verifies; no C04-owned discrepancy remains.


## D01 contact shadows and B03 portrait fog follow-up — accepted

Final source `56ec2a3b…`, bundle `00b5cbc4…`: current main-pass source3/production12 and retained ordinary source12 pass. Prior `a825440e…` structure15, production6 and legacy4 retain exact provenance; all72 mode/tier/body/length configurations per engine include441 cells and five fixed slots. Independent4 verifies transforms, active ranges, stable resources and logical purity. Exclusive27 before/after timings have no regression flags; software timings make no physical FPS claim. Visual review found a real portrait fog defect hidden by earlier UI tests; B03 reopened and reaccepted after continuous fit-relative fog, actual common/golden geometry, boundary and native reduced/full-motion proofs. Blank captures and fixture failures remain unqualified. All54 trace CRCs and five payload digests verify; no owned discrepancy remains.


## D02 resize and particle work — accepted

Source `2b5fb4e7…`, bundle `88cd497b…`: source21, return6, production3, legacy4 and statics3 pass; independent5 proves actual final particle uploads then idle zero scans/uploads, unchanged Balanced targets and native GPU loss with changed viewport, preserved run/audio and fresh resources. All engines retain identical warmed resources through100 cycles. Fixed the false mip-shape guard, cancellation epoch, final particle clearing and focus/visible dimension settlement before qualification. Game uses real warmed Low/native Resume for its1.5s clock proof and restores High for graphics; prior callback stalls remain unclassified limitations, preserved for E04 full rerun. All31 trace CRCs and five payload hashes verify; no D02-owned discrepancy remains.


## D03 measured tier budgets — accepted

Source `a6304729…`, bundle `909c9b…`: source12/production3, all six affected legacy suites and V11 pass; independent5 covers480 actual frames and coarse Auto. Pooled lower-tier shading/light gates preserve exact High values and challenge state. Public benchmark commands regenerate evidence; separate27-row software/AppleGPU before/after series retain provenance. Software median reductions are measured, not FPS promises. Two native raw p95 flags remain, with separately labeled matched50-frame investigation showing no sustained cost regression. Fixed luma target/pose/decoder math revealed obsolete noisy2.5 gates on both historical/current code; reviewed1.75/2.0 paired efficacy plus10×control and all absolute/scenario gates pass exact final data without runtime retune. Failed reports remain unqualified. High images/readability/package limits,15 trace CRCs and five payload hashes verify; no D03-owned discrepancy remains.


## E01 public identity, assets and documentation — accepted

Source `ceb78bb5…`: source/production PACK03 six engine cases and independent prefix/alias/decoded-asset case pass. Actual1200×630 gameplay/social typography and local snake SVG inspected; paused-menu capture corrected once. All seven payload hashes/trace CRCs and same-build reproducibility verify, with runtime `909c9b…` unchanged. Generator pose repeats; tiny123-channel/max4 raster differences are disclosed rather than claiming bit identity. Setup/publishing/controls/local privacy and browser evidence are accurate; exact notices preserved, no source-license/ownership grant or invented URL. No E01-owned discrepancy remains.


## E02 qualification and publishing tooling — accepted

Runtime `ceb78bb5…` and seven-file payload remain unchanged. Actual infrastructure21, candidate packaging3 and bounded live flow pass; current Node14 plus independent nine coverage/TAP and four CLI checks reject missing engines/targets, skips, partial qualification and missing review. Playwright config, catalog, structural manifest and all executable inputs bind the attestation; prior-map proof is retained explicitly. Native read-only CI, immutable action pins, protected default-ref deployment, authentic known-good rollback and bounded byte verification are reviewed. Five trace CRCs and current candidate hashes verify. Full integrated qualification, actual independent attestation and hosted execution remain E04/E05; no E02 discrepancy remains.


## E03 historical reconciliation — accepted

Current inventory links public executable assertions and preserves all22 historical spec bodies beneath explicit overrides. V11, accepted contact/resize/idle work, partial P2 and deferred module/revive/ghost work are truthful; qualification/publication statuses are an E03 checkpoint snapshot. Independent DOC01 and fresh candidate check pass alongside Node15. Exact consumed documents are bound to identity. The unreferenced stale game was archived/hash-verified before removal;56 unrelated private recipe/plan files remain untouched and are not fresh-clone prerequisites. Canonical source/assets remain unchanged; no E03 discrepancy remains.


## B05 E04 static compatibility follow-up — accepted

The first full E04 run correctly rejected an old V10 requirement for writes to the retired best-score key. All other checks remain; current assertions prove demo HUD/best exclusion, eligible once-only player finalization through validated v2 persistence, practice/duplicate guards and read-only legacy keys. Independent static passes with canonical source unchanged. Failed qualification evidence is preserved; a fresh complete integrated candidate run follows.


## B03 E04 disclosure/focus fixture follow-up — accepted

Full integration exposed a button-only Tab count and tier actions aimed at collapsed Advanced controls. Fixtures now assert every visible native focus position including Summary, complete forward/reverse wrapping and unchanged axe/ARIA/palette checks; graphics cases open Advanced through real controls. Source9/production6 across all engines and independent production WebKit menu audit pass. Runtime remains unchanged and prior failures remain unqualified; fresh integrated E04 follows.


## B01/B02 E04 settings-consumer follow-ups — accepted

Graphics-dependent settings fixtures now open native Advanced; mode-only flows preserve the collapsed interface. Modal initial focus checks the visible selected mode and retains native trap/inert/opener assertions. Settings69 and INPUT02 eighteen engine checks pass; independent production WebKit shortcuts/focus cases pass4/4. No forced clicks, default-helper change or runtime change. Earlier interrupted full evidence remains unqualified; final full E04 rerun follows.


## A03 E04 security-fixture follow-up — accepted

The full security timeout came from an observed343.2ms active software-rendering gap; simulation83 remained83 and actual Resume completed normally. Security-only ordinary Low preferences and bounded real Resume preserve that safety policy. Tests now isolate every v2 poison field, current challenge rankings and the read-only earlier-rules archive, while retaining literal Unicode/calendar, unknown mode, saved mode and intentional first-duplicate behavior. Current source3/production48 plus retained source48 and independent production3 pass; prior timeout remains incomplete/red. Runtime source remains unchanged; fresh integrated E04 follows.


## A01/B08 E04 explicit-completion follow-ups — accepted

The shared strict finisher remains unchanged; storage opts into guarded, bounded real Resume with no hidden/focus/modal/failure/lost-context bypass. Healthy delayed summary readiness waits correctly. A real active300ms gap has an exact source-only clock equality proof and ordinary production proof, then one1265ms eligible record/no old-key writes. Complete prior storage30 and current gap9 checks plus independent source/production1+1 and guards4 pass. Existing Low pause cause remains unclassified; source/runtime/recovery policy and other consumers are unchanged. Final full E04 rerun follows.


## E04 positive-completion consumer batch — accepted

Five positive summary-flow consumers explicitly use guarded native Resume; observations/counts are attached. RUN02 requires visible enabled Paused/Resume before its deliberate click. Source30/production30 and guards4 pass, plus independent production WebKit5. The strict default, recovery/interruption assertions, native count/trap checks, early-summary restart race and manual-clock loops remain unchanged. No source/runtime edits; previous failed evidence remains unqualified and final integrated E04 follows.


## E04 independent immutable qualification — accepted

Fresh native ARM64 installs and all 52 local case IDs pass: 1,095 real case rows, 20 static suites, 26 legacy suites and all three browser engines against source, exact root distribution and exact project-prefix distribution. Seven payload hashes and all 138 checked input hashes match the frozen candidate; 1,110 final trace archives pass CRC validation. Independent code review, 30 menu-state images and three ordinary production playing views found no remaining discrepancy. The genuine tracked independent attestation binds reviewed revision 5aafcad and input SHA 4ba6c57b to the full sanitized report. Earlier failures, calibrated luma amendment, quantized timing and viewport/software limitations remain explicit. No hosted CI or live publication is claimed; authorized E05/E06 now proceed without changing qualified inputs.
