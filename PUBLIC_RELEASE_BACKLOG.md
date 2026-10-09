# just-snake public release backlog

Prepared 2026-10-09 in Europe/Madrid. Status: **implementation in progress; task states are maintained below and in the manifest**.

This is the authoritative implementation plan for turning the reviewed game into a public GitHub Pages release using autonomous agents. It fixes observed integration defects before adding features, provides all routine product/technical decisions, and defines objective acceptance and bounded fallback behavior. No clarification interview or routine human approval stage is part of the development workflow. Actual platform permissions, credentials and pre-existing repository protections still apply.

Fixed public naming: **repository `just-snake`**, **page title `just-snake`**, project path **`/just-snake/`**. Legacy storage keys and the canonical source filename remain compatibility details, not public branding.

Companion artifacts:

- [Machine-readable task plan](plans/public-release.plan.json)
- [Acceptance fixtures and cases](plans/public-release.acceptance.json)
- [Agent execution and resume runbook](plans/public-release-agent.md)
- [Plan validator](scripts/validate_public_release_plan.py)
- [Historical enhancement inventory](ENHANCEMENTS.md)

## Reviewed input and evidence

- Canonical source: `snake-three.html`, 289,099 bytes, 8,196 lines.
- Source SHA-256: `8d83bc6d244d4dd7dd9b29ddc506858739f5775ddabca6bb804002b6f424f59a`.
- Historical backlog describes a different 73,624-byte / 2,211-line build; its DONE labels are not acceptance evidence.
- Review ran 20 static suites: 19 passed; V6 failed a stale function-signature regex. The gameplay browser harness passed gameplay/render assertions but returned nonzero for a vibration activation warning.
- Browser probes confirmed URL seed script injection, graphics reload loss, ignored OS preferences, background gameplay beneath settings, inactive Share/Leaderboard handlers, demo pillar death/session-best pollution, and landscape settings clipping.
- Demo pollution was observed in displayed/in-memory best; its guarded storage writer does not establish a persisted personal-best overwrite.
- Frenzy reset nondeterminism, incomplete reduced motion, HUD initialization and food-count atmosphere issues were established through source/function checks. Treat current code as input, not as already qualified.
- The workspace had no Git repository during review. Do not assume a remote, owner, upstream, credentials or publication authorization.
- Historical `SPEC-*.md` and `plans/*-implementation.plan.json` are provenance; old scripts and one-turn patch recipes must not drive this release.

## Release definition and automatic gates

| Scope | Tasks | Completion |
|---|---:|---|
| Local release preparation | 25 | All local acceptance cases green; independent E04 qualification; immutable static artifact ready |
| External publication | 2 | E05/E06 only within an authorized publish run; verified live deployment or a precise external blocker |
| Post-release improvements | 3 | Deferred by default; never delay first qualification/publication |

1. Foundation may record known failing regressions without pretending the game is fixed.
2. Runtime fixes must pass their targeted cases before acceptance; source writers are serialized.
3. Player UX and performance follow the repaired simulation/storage contracts.
4. CI exercises the exact built payload and all required engines, including project-prefix hosting.
5. E04 independently qualifies the frozen candidate; source changes invalidate it.
6. E05/E06 publish only with real authorization/access and verify served bytes before reporting success.
7. No credential, permission, runner or protected-review failure excuses skipping independent local work. Record the blocked operation in machine-readable evidence; never substitute a silent skip or invented pass.

**A planning request does not publish the game.** A future local implementation assignment ends at qualified artifacts with publication `pending_authorization`; an explicitly authorized publishing assignment continues automatically through E05/E06 when infrastructure permits. Required runtime permission handling remains binding.

## Implementation order

The JSON dependency graph is authoritative; among ready tasks, use the order below. A shared lock forbids concurrent writes even if task dependencies permit them.

| Order | ID | Task | Depends on | Write locks | Scope |
|---:|---|---|---|---|---|
| 1 | A00 | Establish an isolated execution baseline | — | workspace, git | release |
| 2 | A01 | Create reliable source and artifact test infrastructure | A00 | tests, toolchain, game-source | release |
| 3 | A02 | Build an entirely local static distribution | A01 | toolchain, build, packaging-tests | release |
| 4 | A03 | Eliminate URL and stored-data HTML injection | A01 | game-source, tests | release |
| 5 | B01 | Restore settings and define requested versus effective graphics | A01, A03 | game-source, tests | release |
| 6 | B02 | Make modal navigation and keyboard input coherent | B01 | game-source, tests | release |
| 7 | B03 | Complete accessibility preferences and rendering behavior | B01, B02 | game-source, tests | release |
| 8 | B04 | Repair player lifecycle, metrics and summary actions | B02, B03 | game-source, tests | release |
| 9 | B05 | Isolate attract mode from player state | B04 | game-source, tests | release |
| 10 | B06 | Reset all seeded state before spawning a new run | B05 | game-source, tests | release |
| 11 | B07 | Move gameplay time and prey decisions out of rendering | B06 | game-source, tests | release |
| 12 | B08 | Version and partition device-local records | B04, B07 | game-source, tests | release |
| 13 | B09 | Handle focus loss and rendering recovery | B07 | game-source, tests | release |
| 14 | B10 | Make touch, haptics and fullscreen reliable | B02, B09 | game-source, tests | release |
| 15 | C01 | Provide clear first-play and return-to-title flows | B04, B05, B07 | game-source, tests | release |
| 16 | C02 | Make menus and HUD fit small and zoomed viewports | B02, B03, B10, C01 | game-source, tests | release |
| 17 | C03 | Share playable challenge links with a local fallback | A03, B08, C01 | game-source, tests | release |
| 18 | C04 | Correct speed, records and food-count atmosphere | B04, B07, B08 | game-source, tests | release |
| 19 | D01 | Instance contact shadows without changing gameplay | B07, A02 | game-source, tests | release |
| 20 | D02 | Bound resize allocations and idle particle work | D01 | game-source, tests | release |
| 21 | D03 | Measure budgets and gate expensive rendering by tier | D02, C02 | game-source, performance-evidence, tests | release |
| 22 | E01 | Prepare public metadata, documentation and license notices | A02, C01, C03 | metadata, docs, game-source | release |
| 23 | E02 | Create required CI checks and Pages deployment workflows | A01, A02, E01, D03, C04 | github-workflows | release |
| 24 | E03 | Reconcile historical backlog, specs and obsolete scripts | B08, C04, D03, E01 | historical-docs | release |
| 25 | E04 | Independently qualify the immutable release candidate | A03, B10, C02, C03, C04, D03, E02, E03 | qualification | release |
| 26 | E05 | Discover and publish through existing authorized GitHub access | E04 | git, github-publication | external |
| 27 | E06 | Verify the live deployment and provide automated rollback | E05 | github-publication | external |
| 28 | F01 | Extract simulation and adapters after the release is stable | E04 | game-source, module-extraction | post_release |
| 29 | F02 | Add one optional practice revive without affecting ranked rules | F01, B08 | simulation, ui | post_release |
| 30 | F03 | Add a same-challenge local best ghost | F01, B08 | simulation, render, storage | post_release |

Keep at most three agents active including the coordinator, one writer for `snake-three.html`, two browser processes and one worker per suite. A01 owns the shared toolchain first; A02 can then develop packaging while A03 starts runtime correction. Parallelize disjoint documentation/assets/workflow work, independent review and read-only research. Never let parallel agents run legacy browser suites that share debug output filenames.

## Settled decisions

Decision IDs use DEC01-DEC12; task IDs use A00-F03, avoiding namespace ambiguity. These decisions are implementation requirements, not questions for the user. When existing specs conflict, annotate the superseded section in E03.

### DEC01 Scope and source of truth

Ship release v1.0 as a static browser game named just-snake, preserving the existing dark neon arena, continuous tube, three named modes, procedural audio and effects. The 25 release tasks are mandatory; two external tasks publish/verify only when a publication run has actual authorization/access; three post-release tasks are deferred. No backend, accounts, global leaderboard, analytics, advertisements, paid service, custom domain purchase, framework migration or new game mode is required. This document and the manifest supersede conflicting historical spec sections only for this release. Keep historical specs as provenance. snake-three.html remains canonical source until F01. Do not rerun the old scripts/implement_*.py recipes: many are text-replacement patches for earlier builds.

### DEC02 Frozen gameplay and mode rules

Grid21x21, initial length3, target length60, input queue maximum3, one-cell movement, correct tail-cell hand-off and no reversal. Preserve existing pillar placement clearance and count. Calm: base140ms/min95ms/speedStep3, wrap, one prey, no pillars. Classic:115/62/4, lethal walls, one prey, pillars. Frenzy:90/45/4, lethal walls, two prey, pillars. Movement interval = max(minStepMs,baseStepMs-floor(score/30)*speedStep). Maximum displayed level = 1+ceil((base-min)/speedStep): Calm16,Classic15,Frenzy13. Speed progress = clamp((base-stepMs)/(base-min),0,1). Freeze MODES; mode changes are selection for the next run. Remove custom mutable wrap; settings show a read-only Walls follow difficulty mode explanation. Common10, golden40, jittery20; archetype probabilities70%/15%/15%, initial prey common, golden lifetime6000ms, one successful jittery escape per spawn. Combo score=basePoints*min(streak,5), windows4500/3900/3300/2700/2400ms; expiry resets streak0/multiplier1. Atmosphere zone=min(4,floor(successfulEats/10)). These corrections intentionally introduce rulesVersion2; do not compare old runs as equal challenges.

### DEC03 Toolchain and reproducible packaging

Use Node24 LTS and npm; root .nvmrc=24 and engines>=24<25. Add three exactly0.169.0. Root dev dependencies are esbuild, @playwright/test and axe-core; resolve each stable compatible version once from its official npm package, record exact versions and lock integrity, then use npm ci. Preserve tests/package-lock.json and its legacy Puppeteer/pngjs initially; pin any necessary compatibility upgrade explicitly with evidence. Use native macOS ARM64 for local browsers; local Docker is optional, always explicitly linux/arm64 and verify image architecture before launch. CI uses ubuntu-24.04-arm for Chromium/Firefox/source tests and macos-15 ARM64 for WebKit; if unavailable, use another documented native ARM64 runner with the same coverage, never emulation. Bundle the inline game module into one hashed local ESM asset with esbuild splitting:false, sourcemap:false; keep asynchronous SMAA import semantics and include its dependencies. Published runtime must need no third-party host. Source tests may intercept original CDN imports and fulfill them from the pinned local package. Do not introduce a second maintained game implementation. A01 wraps legacy mutable window exports in a source-test compile flag (__SNAKE_TEST_BUILD__); instrumented source fixtures set it true inside the temporary module. A02 defines it false and removes the adapter by bundling/tree shaking. Production tests use the ordinary artifact via real UI, not a privileged test variant. Read-only boot diagnostics required by the UI may remain; mutable setSeed/setStepMs/cells/state/debug controls may not.

### DEC04 Simulation and ownership contract

Create an immutable run descriptor {rulesVersion:2,runId,kind:'player'|'demo',mode,seed,isDaily,dailyDate:null|string,category:'casual'|'custom'|'daily'|'practice'}. runId is an opaque unique string, excluded from deterministic comparison. Challenge identity=JSON.stringify([2,mode,seed]); derive gameplay food PRNG from FNV1a(identity+'|food') and hazard PRNG from FNV1a(identity+'|hazards'), using Mulberry32. Cosmetic randomness has a separate stream. Use integer simNowMs with fractional frame carry and event-driven advanceTo; timestamps have1ms resolution without requiring a1000Hz render loop. At each timestamp: golden expiries in entity order convert to common in-place without RNG; combo expiry resets; if movement due consume one queued direction, resolve collision/movement/eat/metrics/victory; respawn consumed prey in entity order; then evaluate jittery escapes in entity order at logical grid positions; schedule next movement using the new interval. Expiry wins equality: golden at6000ms gives10 points, combo eat at its deadline starts x1. Jittery escape uses squared Euclidean distance<=4 after movement, candidate tie order east/west/south/north, excludes body/pillars/other prey, and can retry only after later movements when blocked. Timer display derives from deadlines; render functions cannot change score/cells/prey type/RNG/run metrics. Capture the scheduled movement interval before eating; never retroactively subtract the shorter new interval. Include collision timestamp in final survival time. Pause/modal/hidden time advances neither simulation nor hop animations; death slow motion is cosmetic. Active frame gaps>250ms pause with no catch-up; smaller gaps must process all due events deterministically. Reset both prey before any spawn, generate pillars once, then spawn primary before secondary. Initial prey is common; later choose archetype before coordinates, using exactly the defined sequence: archetype roll r<0.15 golden,r<0.30 jittery,otherwise common; initial forced common consumes no archetype roll. Each candidate attempt draws x then z: common/jittery uniformly0..20, golden uniformly6..14, rejecting golden cells outside center Manhattan distance<=4. Stop on the first valid cell, or after64 attempted pairs search eligible cells row-major (z then x) without further RNG. For golden, search free center-diamond cells first; only if none exists convert to common and search the whole board without extra draws. Both streams and attempt counts are exposed only in source test snapshots. Never accept an occupied last candidate. Finalize once per runId; capture descriptor and prior best at start. Keep legacy summary aliases and source hooks until their harnesses migrate; new mutable test controls exist only in a test adapter, never in published code. If the other active prey occupies the last otherwise free cell, leave the unavailable entity inactive and keep the other edible. Award board victory only when snake plus enabled pillars fill all playable cells, not merely when this entity cannot spawn; target-length victory still takes precedence. When a later eat opens capacity, spawn missing entities in stable primary/secondary order.

### DEC05 Challenge URL and daily contract

Support ?seed=<encoded-string>&mode=calm|classic|frenzy&rules=2, parsing the first value for duplicate keys. A valid custom seed has1..128 Unicode code points, no U+0000..001F/U+007F..009F controls, no implicit trimming or Unicode normalization. Markup characters are valid seed text and must remain inert. Missing rules implies2; unsupported explicit rules or invalid seed falls back to a new ordinary Classic run with status This challenge cannot be loaded. Starting a new Classic game. Unknown mode falls back to Classic with status Unknown difficulty. Using Classic. Missing mode with any explicit seed defaults to Classic; a seedless ordinary visit uses saved mode. seed=daily resolves the current UTC date at each new today run; seed=DAILY-YYYY-MM-DD accepts a calendar-valid date and pins it. Daily button uses selected mode; active descriptor never changes at midnight. All shared daily links use the concrete date seed, never daily shorthand. Casual starts/restarts get a new crypto-generated CASUAL-<hex> seed; custom/pinned daily restarts reuse the same tuple. Changing difficulty from a challenge explicitly creates a new tuple shown on title. URL builder uses current document directory/base and URLSearchParams; no hard-coded repository or domain. Opening a URL arms the title screen without automatic player start. Keep selection seedIntent='casual'|'today'|'pinned' distinct from the captured run seed; Play again/Restart reads that intent while active metrics keep their frozen descriptor. The daily button sets today intent; a shared concrete-date URL sets pinned intent.

### DEC06 Settings and score storage schemas

Settings key remains threejs-snake-settings; write a schemaVersion2 object {schemaVersion:2,values:{quality:'auto'|'high'|'balanced'|'low',bloomOn,bloomMask,aa:'smaa'|'fxaa'|'none',bodyMode:'tube'|'segments',sound,haptics,reducedMotion?:boolean,highContrast?:boolean,colorblind:'default'|'colorblind',keymap:'wasd_arrows'|'wasd'|'arrows'|'ijkl'|'hjkl'}}. Missing motion/contrast fields mean inherit OS, not false. Migrate legacy valid fields and drop wrap; never save defaults during initial load. Requested quality defaults auto; sound/haptics default true after gesture capability checks, body tube. Auto chooses balanced for coarse/touch, detects the current desktop tier and may downgrade safely. Apply quality first, then independent presentation preferences and A11Y; keep requested versus effective state separate. Auto changes never overwrite a request; explicit Q cycles high/balanced/low and persists manual selection. Low may force post off/AA none, so UI shows effective unavailability without erasing requested preferences. Scores key=threejs-snake-scores-v2, envelope {schemaVersion:2,records:[],legacy:{best:null|number,records:[]},legacyImported:boolean}. Summary/record fields: schemaVersion,rulesVersion,runId,mode,seed,isDaily,dailyDate,category,score,length,timeMs,maxSpeedLevel,maxCombo,foodBreakdown:{common,golden,jittery,total},outcome:'wall'|'self'|'pillar'|'target'|'board',completedAt ISO string; summary additionally has isNewBest and legacy aliases score/finalScore,length/finalLength,timeSec,formattedTime,deathReason,date. Scope identity JSON.stringify([2,mode,category, category==='casual'?null:seed]); practice is ineligible. Keep top10 per scope; order score desc,length desc,timeMs asc,completedAt asc,runId asc. Retain3 casual scopes and30 most recent scopes each for custom/daily; store<=256KiB by dropping oldest non-casual scopes. Import validated legacy best/top10 once into labeled earlier-rules archive; never infer missing rules/seed or modify old keys. Mark migration only after successful write; session-memory fallback makes repeated failed migration idempotent. Reject nonfinite/negative numbers, invalid modes/dates/seeds, impossible length/combo/food totals and oversized collections. Score/best/HUD comparisons use the active scope. Date/runId metadata are not part of deterministic snapshots.

### DEC07 Input and state transition contract

Use a visible state owner, not scattered CSS checks. Title runs only the demo; start discards demo and creates a fresh player context. Opening settings from playing pauses, clears queued/held input, silences drone and focuses the first meaningful setting. Title settings suspend demo; closing restarts title demo only. Settings from paused/summary return to that state. Modal close never resumes player play; focus restores to opener or Resume. Escape closes modal; Space/Enter use native focused-button activation; R/directions/Q/B/M/T do not operate the game beneath a modal or editable field. Modal background is inert, Tab/Shift-Tab trapped, active/pressed states exposed. Pause offers Resume, Restart run and Return to title; summary offers Play again, Choose mode, Share run and On this device rankings. Restart closes modal, cancels old timers and captures a new runId. Returning to title abandons a live run without a leaderboard entry, retains presentation/mode selection and restores ordinary title actions. Direction takeover honors the selected keymap; queue first legal direction and discard reversal. Visibility hidden, blur,pagehide,contextlost clear held pointers/queued input and pause; returning never resumes automatically. Pointer input is one active primary id with capture, cleanup on cancel/lostcapture/blur,20px steering threshold and queue limit3. Haptics require user activation and player playing/death event eligibility; unsupported haptics/fullscreen degrade without throwing. Demo has its own seed/context and cannot touch player seed/metrics/HUD best/storage/audio/haptics. Demo death/trap/3000-step cycle resets directly without Game Over.

### DEC08 Player copy, interface and metadata

Repository name, public page title, heading, social preview and share-card name are exactly just-snake. The default project-site path is /just-snake/. Meta description: A glowing 3D snake game with three difficulty modes, daily challenges, and scores saved on your device. Title helper: Eat prey, avoid your tail, and reach length 60. Desktop steering: Move with Arrow keys or WASD. Pause with Space. Open settings with Esc. Substitute the actual selected keymap. Touch steering: Drag anywhere on the arena to steer. Lift to move your thumb. How to play details: Common prey:10 points. Golden prey:40 points for6 seconds, then10. Jittery prey:20 points and one escape hop. Eat quickly to build a combo up to x5. Pillars are dangerous in Classic and Frenzy. Calm wraps around walls. Ranking label On this device; legacy label Legacy scores — earlier rules; denied-storage status Scores are saved for this session only. Keep gameplay settings/audio/accessibility visible and collapse Advanced graphics (quality,glow,anti-aliasing,body rendering); use player-friendly main labels and leave SMAA/FXAA/mask/luma detail inside Advanced. Share card lines: just-snake — <Mode> | <Daily YYYY-MM-DD UTC or Custom challenge or Casual run>; Score: <score> | Length: <length> | Time: <mm:ss>; Best combo: x<n> | Top speed: <level>; Result: <outcome>; Play this challenge: <absolute tuple URL>. Clipboard success status Challenge copied.; fallback status Copy the challenge text below. Use a selectable readonly field, no account/social integration. Boot fallback: The game could not start. Reload to try again.; unsupported GPU: This browser cannot display the 3D arena. Try another browser or device. Do not expose developer download/import-map directions in the player flow. Favicon is a code-native SVG snake; social image1200x630 generated from deterministic local gameplay capture. Do not invent ownership/copyright/source license; preserve any existing source license, otherwise state no reuse license has been granted while shipping exact third-party notices.

### DEC09 Acceptance matrix and performance budgets

Required engines: Chromium and Firefox on native Linux/macOS ARM64, WebKit on native macOS ARM64; record exact actual engine versions. Required viewport/UI matrix:320x568,390x844,844x390,768x1024,1440x900, plus200% browser zoom or an explicitly equivalent layout/text-scale fixture. Check title,settings,pause,summary,leaderboard,error; all menu/action targets>=44x44 CSS pixels, menu control text>=14px, labels>=12px, safe-area-aware top/bottom padding and no horizontal overflow. Synthesized touch must exercise steering/cancel/modal scrolling; viewport screenshots alone do not prove gestures. Physical iOS/Android testing is optional when an already available automated device connection exists, not a human approval gate; never call engine emulation physical certification. Preserve high visual identity. Structural budgets: <=3 contact-shadow calls, one effective resize rebuild per animation frame, zero particle scan/upload when idle, no monotonic resource growth after100 resize/tier/restart cycles. Record length3/20/60 metrics at each tier/mode. On the same GPU/device/config, flag >10% median or >15% p95 regression versus the before-task benchmark; investigate rather than silently waiving. SwiftShader verifies logic/resources/relative changes only, never a real-device FPS claim. Dist <=5MiB uncompressed and <=1MiB aggregate gzip for HTML+JS+CSS; one social image may consume an additional<=1MiB. If measured resource/package limits fail, optimize or keep owning task open. No indefinite screenshot polishing: one batched desktop/mobile pass, one correction/confirmation pass.

### DEC10 Published artifact and CI contract

dist allowlist: index.html,snake-three.html,404.html,assets/**,THIRD_PARTY_NOTICES.txt. Alias initially matches index payload; no redirect loses seed query. All runtime URLs are relative; unknown canonical/social absolute URLs are omitted until discovery provides a verified base. Reports,digests,source maps,plans,tests and local agent data remain outside dist. Test prefix-only mount /just-snake/ where /assets/* returns404; block every non-origin request while running the built game. CI PRs have read-only contents and cannot deploy. Required checks build,static,legacy behavioral,release regression,artifact/secret-path checks and engine matrix. Pages deployment depends on all required checks and uploads the already qualified dist digest; github-pages environment, pages:write/id-token:write in deploy only, concurrency cancel-in-progress:false. Keep existing protections. Configure-pages v5/upload-pages-artifact v4/deploy-pages v4 are the currently documented major contracts; implementation resolves official action tags to verified immutable commit SHAs and records them. Pin checkout/setup-node/artifact actions similarly. Publish triggers only on discovered default branch or authorized dispatch; workflow must never deploy untrusted fork PR code. Do not emit .nojekyll or other dotfiles: the mandated upload-pages-artifact transport excludes them, and Actions-only Pages needs no Jekyll suppression. Local qualification validates workflow structure/permissions/digests and rehearses its commands with injected failure; actual hosted-run proof is required during authorized E05. Keep a separate qualified-candidate artifact containing dist, digest map, report and commit/lockfile provenance for30 days or the lower existing repository retention maximum. Rollback selects its artifact id/digest, downloads and verifies it, uploads that checked payload as a new Pages artifact in the current rollback run, then deploys; deploy-pages does not consume a prior run id directly. Expired/missing provenance cannot be used as a rollback.

### DEC11 Evidence and automatic completion

Each task has an implementation agent and independent reviewer. Coordinator owns manifest mutation and accepts a task only after bounded change-specific checks plus reviewer acceptance; known red regression cases may be captured by A01 before fixes, but no release qualification skips them. Task states pending,ready,in_progress,in_review,accepted,blocked_external,deferred. Each task writes .artifacts/tasks/<ID>/result.json containing schemaVersion,taskId,status,sourceHash/commit,changedPaths,checks[{caseId,command,exitCode,evidence}],reviewer,issues,blockers; no tokens/credentials or copied private configuration. E04 writes .artifacts/release/report.json with manifest schema/id,source revision+SHA256,lockfile SHA256,payload SHA256 map,test-suite/case results,browser versions/platform/architecture,capability flags,screenshot/trace paths,resource measurements,limitations,independent reviewer verdict,localQualified boolean,publication status and external blockers. Qualification requires all local_qualification cases passing and no unresolved release blocker; live_publication cases follow E05/E06. Build identity must be maintained across review/test/upload. Source changes after qualification invalidate the report automatically. Repeated source/test failures remain failing tasks; missing GitHub auth/permission is blocked_external, never accepted or published.

### DEC12 Autonomy, publishing routing and blocked infrastructure

This request prepares planning artifacts; it does not itself publish a repository/site. Future agents proceed with local implementation when assigned and with external publication only when the execution request/session explicitly authorizes that action. Do not insert preference interviews, routine confirmation rounds or a new manual approval gate. Follow actual runtime permission/approval requirements; never bypass them. On a local-only assignment, complete E04 and record publication pending_authorization without asking. On an authorized publish assignment, discover the authenticated account and an existing authorized repository named exactly just-snake; reuse only a matching publication target and preserve its default branch/Pages/custom domain. A differently named source remote is not the publication destination. If no matching repository exists, create a dedicated public just-snake repository under the authenticated personal account. If just-snake belongs to unrelated contents or cannot be created with existing access, record blocked_external; do not overwrite it, rename an unrelated repository, or choose an alternative slug. Stage only game/source/test/docs/workflow allowlisted paths, never the workspace wholesale. Use normal same-name branch push and a PR; auto-merge only when policy permits and every required check is green. For an empty newly created repository, initialize main from the qualified allowlist explicitly; never treat a feature-branch push as default-branch publishing. Do not force-push, weaken reviews, invent credentials, change unrelated permissions or infer organization ownership. New branches always use git switch --no-track -c <branch> <base>, immediately inspect git status -sb and git for-each-ref --format='%(refname:short) %(upstream:short)' refs/heads/<branch>; inspect/remove inherited branch.remote/merge if needed. Authorized push is git push --set-upstream <remote> <branch>:refs/heads/<branch>, then verify remote/<branch> and merge refs/heads/<branch>. Blocked/deferred push leaves no upstream. Missing GitHub access, enforced human review, unavailable runner or Pages permission becomes a sanitized machine blocker {taskId,operation,code,reason,requiredExternalCapability,retryCommand,localArtifactsComplete}; finish independent work and stop only that branch of the DAG. Do not repeat prompts or declare deployment complete. Poll API/Pages with exponential backoff for<=10min. Reuse existing protections/custom domain. Updates may automatically rollback only to an already qualified known-good artifact within the same publication authorization; first-deploy failure stays failed. No source-license grant or paid service is assumed. Production rollback is conditional on update verification failure; normal mechanics are rehearsed locally before qualification. A successful candidate must remain live. After successful recovery to a previous artifact, publication status is rolled_back with active previous digest and candidate failure details; the candidate is not published/accepted, and its defect returns to the owning task for repair and new qualification.

## Required artifact contracts

### Future command interface

A01/A02 implement these entry points. They are targets for implementation, not commands currently present in the workspace.

| Command | Required behavior |
|---|---|
| `npm ci` and `npm --prefix tests ci` | Reproduce root and legacy dependencies from their lockfiles |
| `npm run build` | Clean-build allowlisted `dist`; save payload digest map outside `dist` |
| `npm run check:dist` | Reject disallowed paths, symlinks, remote dependencies, invalid references or exceeded budgets |
| `npm run test:static` | Run all 20 existing contract suites with corrected behavioral assertions |
| `npm run test:legacy` | Run all 26 existing browser suites sequentially with explicit exit handling |
| `npm run test:release` | Run all local acceptance cases, source probes and built-artifact browser matrix |
| `npm test` | Run static, legacy and release gates; no subset masquerades as complete coverage |
| `npm run qualify` | Fresh build, checks, full matrix and independent-review evidence assembly; nonzero unless local qualified |
| `npm run publish:discover` | Read-only repository/account/Pages/protection discovery; sanitized results only |
| `npm run verify:live -- --url <discovered-url>` | Verify live entry/assets/hash/challenge startup and player/restart flow |

A release browser case must use real controls for user actions; test adapters may arrange difficult simulation states but cannot replace input/DOM behavior checks. Source tests can instrument a temporary copy; published artifact tests must use the actual published payload without a special untested test build.

### Proposed summary shape

```json
{
  "schemaVersion": 2,
  "rulesVersion": 2,
  "runId": "opaque-unique-string",
  "mode": "classic",
  "seed": "DAILY-2026-10-08",
  "isDaily": true,
  "dailyDate": "2026-10-08",
  "category": "daily",
  "score": 40,
  "length": 4,
  "timeMs": 6000,
  "maxSpeedLevel": 2,
  "maxCombo": 1,
  "foodBreakdown": {"common": 0, "golden": 1, "jittery": 0, "total": 1},
  "outcome": "wall",
  "completedAt": "2026-10-08T12:00:00.000Z",
  "isNewBest": true
}
```

The example is a shape fixture, not a promised natural-game trace. Generate actual expected simulation snapshots once from the accepted rules and independently inspect them. Use the independently calculated spawn vectors in plans/public-release.acceptance.json, including exact PRNG draws and exhaustion fallbacks. Do not bless output from a broken implementation as a golden fixture. Compare logical state, excluding runId/completion wall time/cosmetic state; include cells, directions, queues, food types/positions/deadlines, pillar cells, RNG state/count, score, combo and simulation metrics.

### Blocker and result fields

A blocked external task must say exactly which operation could not complete, which existing external capability is missing, what local checks/artifacts succeeded, and which noninteractive retry command would resume it. Do not log tokens, private environment values or raw credential-bearing URLs. Keep task evidence and public payload separate.

Task results follow DEC11. The independent reviewer records `accepted` or `changes_required` with concrete checks and remaining issues. Only the coordinator updates task status in the manifest. No file named RELEASED/SUCCESS may substitute for an actual checked report.

## Task decomposition


## Phase 0 Foundation and local packaging

### A00 Establish an isolated execution baseline

**Scope:** release. **Owner:** integrator. **Dependencies:** none. **Locks:** workspace, git. **Status:** accepted.

**Expected changed paths:** `.gitignore`, `docs/execution-baseline.json`.

**Current evidence anchors:** `ENHANCEMENTS.md:3`, `tests/README.md`. Resolve by symbol as lines drift.

**Implementation steps**

1. Inventory source, applicable AGENTS.md, available tools, architecture and existing Git metadata; record source SHA-256 and preserve user changes.
2. Create an explicit repository/source allowlist and exclude local agent runtimes, credentials, node_modules, debug pages and generated artifacts. Initialize local Git only during an authorized implementation run if no repository exists.
3. Create task branches without tracking, verify upstreams immediately, and implement the resume-safe status/evidence protocol from the runbook.

**Acceptance**

- Baseline includes the 289099-byte/8196-line reviewed source or explicitly records a newer input hash.
- No workspace secrets or local runtime directories are staged; all new task branches have no upstream until an authorized same-name push.
- All independent local work can continue if GitHub authentication is absent.

**Case IDs:** Task-specific repository/evidence checks; no separate catalog case. **Evidence:** `.artifacts/tasks/A00/result.json`.

### A01 Create reliable source and artifact test infrastructure

**Scope:** release. **Owner:** test-agent. **Dependencies:** A00. **Locks:** tests, toolchain, game-source. **Status:** accepted.

**Expected changed paths:** `package.json`, `package-lock.json`, `playwright.config.mjs`, `scripts/run-tests.mjs`, `scripts/serve.mjs`, `tests/helpers/**`, `tests/release/**`, `tests/README.md`, `snake-three.html`, `tests/*.mjs`, `tests/package.json`, `tests/package-lock.json`, `.nvmrc`, `scripts/install-browsers.mjs`, `tests/infrastructure/**`, `tests/suites.json`, `tests/helpers/player-flow.mjs`, `tests/infrastructure/player-flow.test.mjs` (optional explicit interruption completion), `tests/release/determinism.spec.mjs`, `tests/release/run-lifecycle.spec.mjs`, `tests/release/modal.spec.mjs`, `tests/release/accessibility.spec.mjs`, `tests/release/settings.spec.mjs` (explicit positive completion consumers).

**Current evidence anchors:** `tests/package.json:7`, `tests/check_v6_contracts.mjs:64`. Resolve by symbol as lines drift.

**Implementation steps**

1. Select Node 24, retain locked legacy Puppeteer dependencies, and pin exact root development dependencies according to DEC03 below.
2. Implement shared GAME/CHROME/BASE_URL configuration, isolated browser storage, usable-renderer readiness, bounded test timeouts, sequential legacy suite enumeration and finally-block cleanup.
3. Add a prefix-only static server and machine-readable results; repair the stale V6 signature assertion without weakening its speed-kick requirement.
4. Add initially failing regression cases from the acceptance catalog. Keep behavioral failures visible until their owning fixes land.
5. Guard legacy mutable window exports behind a source-test-only compile flag and provide the instrumented source adapter; repair internal dependencies on those globals. Ordinary source play and the production build must work with all mutable test controls absent.

**Acceptance**

- Source and built-page targets can be selected without editing test scripts.
- Startup failure, unsupported required rendering or assertion failure returns nonzero; no browser or server remains running after failure.
- All 20 static and all 26 existing browser suites are explicitly accounted for; measurement-only scripts become objective gates where criteria exist.
- Failure evidence records page errors, console errors, architecture, browser versions, screenshots and trace paths.

**Case IDs:** Task-specific repository/evidence checks; no separate catalog case. **Evidence:** `.artifacts/tasks/A01/result.json`.

### A02 Build an entirely local static distribution

**Scope:** release. **Owner:** build-agent. **Dependencies:** A01. **Locks:** toolchain, build, packaging-tests. **Status:** accepted.

**Expected changed paths:** `package.json`, `package-lock.json`, `scripts/build.mjs`, `scripts/check-dist.mjs`, `scripts/serve.mjs`, `THIRD_PARTY_NOTICES.txt`, `tests/release/packaging.spec.mjs`, `tests/helpers/packaging.mjs`.

**Current evidence anchors:** `snake-three.html:737`, `snake-three.html:7040`. Resolve by symbol as lines drift.

**Implementation steps**

1. Retain snake-three.html as canonical editable source; extract its inline module and bundle with pinned three@0.169.0 using esbuild ESM, splitting false and no published source maps.
2. Remove the production CDN import map and inline module; insert a relative content-hashed script URL. Include SMAAPass and its required embedded resources.
3. Emit only the approved dist payload, a source-compatible snake-three.html alias and a relative-link 404 page. Actions-backed Pages does not need .nojekyll; do not emit transport-excluded dotfiles.
4. Add structural dependency, symlink, size, secret-path and network-reference checks. Preserve original upstream license text.
5. Define the source-test compile flag false, eliminate its guarded adapter from the production bundle, and assert that no mutable simulation/debug globals are exposed in the actual dist page.

**Acceptance**

- Two clean builds from one lockfile produce byte-identical payloads and digest manifests.
- The game and SMAA load with every external request blocked under both / and /just-snake/.
- dist contains no source documents, plans, test hooks, credentials, debug pages or node_modules.
- Package limits and entry-point rules in DEC03/DEC10 pass.

**Case IDs:** ACC-PACK-01, ACC-PACK-02. **Evidence:** `.artifacts/tasks/A02/result.json`.

A03 dependency adjustment: existing RUN_STATS.setupUI bindings and a null-summary Share guard are initialized early solely to audit poisoned stored data through real UI. B04 still owns complete visibility, metrics, reset and finalization acceptance.

## Phase 1 Security and runtime integration

### A03 Eliminate URL and stored-data HTML injection

**Scope:** release. **Owner:** runtime-agent. **Dependencies:** A01. **Locks:** game-source, tests. **Status:** accepted.

**Expected changed paths:** `snake-three.html`, `tests/release/security.spec.mjs`, `tests/test_run_structure.mjs`, `tests/test_seeded_rng.mjs`.

**Current evidence anchors:** `snake-three.html:2086`, `snake-three.html:6206`, `snake-three.html:6238`. Resolve by symbol as lines drift.

**Implementation steps**

1. Parse and bound URL values according to DEC05; treat display values from URLs, storage and errors as text.
2. Replace unsafe summary/leaderboard interpolation with text-node construction or a documented escaping helper; audit every remaining innerHTML assignment.
3. Keep structural trusted templates isolated from all data values; handle overlength and unsupported rule parameters with the exact fallback copy.
4. Migrate the listed legacy assertions only where an explicitly superseded rule or interface requires it. Preserve equivalent behavioral coverage and record the old/new expectation; never silence a suite to make it pass.

**Acceptance**

- ACC-SEC-01 through ACC-SEC-03 pass in source and distribution.
- A malicious seed creates no injected element, handler, script execution or unexpected network request.
- Valid encoded Unicode seeds round-trip without changing their canonical bytes.

**Case IDs:** ACC-SEC-01, ACC-SEC-02, ACC-SEC-03. **Evidence:** `.artifacts/tasks/A03/result.json`.

### B01 Restore settings and define requested versus effective graphics

**Scope:** release. **Owner:** runtime-agent. **Dependencies:** A01, A03. **Locks:** game-source, tests. **Status:** accepted.

**Expected changed paths:** `snake-three.html`, `tests/release/settings.spec.mjs`, `tests/test_settings.mjs`, `tests/check_g9_contracts.mjs`, `tests/test_difficulty.mjs`, `tests/check_g6_contracts.mjs`.

**Current evidence anchors:** `snake-three.html:2766`, `snake-three.html:2884`. Resolve by symbol as lines drift.

**Implementation steps**

1. Validate and migrate settings into the DEC06 schema; retain presence information for explicit preferences.
2. Apply loaded requested preferences after renderer creation in the documented order; derive effective settings without overwriting stored requests.
3. Add Auto quality selection, make keyboard graphics shortcuts use the settings controller, and remove mutable wrap from settings while preserving mode-owned boundaries.
4. Use memory fallback on storage denial and render selected options with aria-pressed.
5. Migrate the listed legacy assertions only where an explicitly superseded rule or interface requires it. Preserve equivalent behavioral coverage and record the old/new expectation; never silence a suite to make it pass.

**Acceptance**

- ACC-SET-01 through ACC-SET-04 pass.
- Reload preserves low/off/none/segments and explicit accessibility settings; Auto detection never becomes a saved manual override.
- A graphics safety downgrade is reported as effective state while requested state remains persisted.
- Changing graphics never changes the captured challenge tuple or gameplay state.

**Case IDs:** ACC-SET-01, ACC-SET-02, ACC-SET-03, ACC-SET-04. **Evidence:** `.artifacts/tasks/B01/result.json`.

### B02 Make modal navigation and keyboard input coherent

**Scope:** release. **Owner:** runtime-agent. **Dependencies:** B01. **Locks:** game-source, tests. **Status:** accepted.

**Expected changed paths:** `snake-three.html`, `tests/release/modal.spec.mjs`, `tests/test_settings.mjs`, `tests/test_game.mjs`, `tests/test_accessibility.mjs`.

**Current evidence anchors:** `snake-three.html:2895`, `snake-three.html:3966`, `snake-three.html:4006`. Resolve by symbol as lines drift.

**Implementation steps**

1. Implement the DEC07 modal state table, focus capture/trap/restore and inert background behavior.
2. Return from global gameplay shortcut handling while a modal or editable target owns focus; preserve native Enter/Space button activation.
3. Bind explicit Resume, Restart and Return to title actions and expose score/length/simulation time while paused.
4. Make ready-screen directional takeover use the selected key map and apply its first accepted direction.
5. Migrate the listed legacy assertions only where an explicitly superseded rule or interface requires it. Preserve equivalent behavioral coverage and record the old/new expectation; never silence a suite to make it pass.

**Acceptance**

- ACC-INPUT-01 through ACC-INPUT-04 pass.
- Space/Enter in settings activates only the focused control; R cannot restart beneath the modal.
- Escape closes settings without silently resuming a run; Resume resumes exactly once.
- Keyboard focus cannot reach obscured background controls.

**Case IDs:** ACC-INPUT-01, ACC-INPUT-02, ACC-INPUT-03, ACC-INPUT-04. **Evidence:** `.artifacts/tasks/B02/result.json`.

### B03 Complete accessibility preferences and rendering behavior

**Scope:** release. **Owner:** runtime-agent. **Dependencies:** B01, B02. **Locks:** game-source, tests. **Status:** accepted.

**Expected changed paths:** `snake-three.html`, `tests/release/accessibility.spec.mjs`, `tests/test_accessibility.mjs`, `tests/check_g10_contracts.mjs`, `tests/test_camera.mjs`, `tests/test_speed.mjs`.

**Current evidence anchors:** `snake-three.html:2155`, `snake-three.html:8156`, `snake-three.html:8186`. Resolve by symbol as lines drift.

**Implementation steps**

1. Use system media preferences when no explicit override exists; react to later media-query changes only in inherited mode.
2. Gate shake, grain, chromatic aberration, FOV kicks, dolly/death push-in and Dutch roll under reduced motion; keep a stable fitted camera and essential gameplay motion.
3. Provide visible focus, selected-state semantics, sparse status announcements and the established colorblind-safe silhouette palette.
4. Ensure HUD/record animations honor the in-game preference, including when OS reduced motion is false.
5. Migrate the listed legacy assertions only where an explicitly superseded rule or interface requires it. Preserve equivalent behavioral coverage and record the old/new expectation; never silence a suite to make it pass.

**Acceptance**

- ACC-A11Y-01 through ACC-A11Y-04 pass.
- Computed camera state stays stable through eat/death with reduced motion enabled; assertions inspect rendered state, not setter calls.
- All menu controls have accessible names and focus states; no critical/serious automated accessibility finding remains in title/settings/summary.
- Essential motion-dependent gameplay is described accurately; no claim of screen-reader-complete gameplay is made.

**Case IDs:** ACC-A11Y-01, ACC-A11Y-02, ACC-A11Y-03, ACC-A11Y-04. **Evidence:** `.artifacts/tasks/B03/result.json`.

### B04 Repair player lifecycle, metrics and summary actions

**Scope:** release. **Owner:** runtime-agent. **Dependencies:** B02, B03. **Locks:** game-source, tests. **Status:** accepted.

**Expected changed paths:** `snake-three.html`, `tests/release/run-lifecycle.spec.mjs`, `tests/test_run_structure.mjs`, `tests/check_g4_contracts.mjs`, `tests/test_hud.mjs`, `tests/test_audio.mjs`.

**Current evidence anchors:** `snake-three.html:6097`, `snake-three.html:6359`, `snake-three.html:6568`. Resolve by symbol as lines drift.

**Implementation steps**

1. Initialize RUN_STATS and action bindings once at boot; reset run metrics, HUD and effects at player start.
2. Capture immutable run configuration and prior best at start; finalize each run idempotently from the simulation outcome.
3. Replace ambiguous generic .hidden usage with hidden attributes plus safe scoped styling; show Share only for finalized player summaries.
4. Separate authoritative speed/food/combo metrics from HUD DOM reads and retain documented legacy hook aliases.
5. Migrate the listed legacy assertions only where an explicitly superseded rule or interface requires it. Preserve equivalent behavioral coverage and record the old/new expectation; never silence a suite to make it pass.

**Acceptance**

- ACC-RUN-01 through ACC-RUN-03 pass.
- Each player run produces exactly one summary and one eligible leaderboard insertion; repeated finalize is harmless.
- Ready/pause actions are truly invisible and unfocusable; summary actions respond to real clicks.
- First positive eligible score can establish a record, and restart clears old summary/record effects.

**Case IDs:** ACC-RUN-01, ACC-RUN-02, ACC-RUN-03. **Evidence:** `.artifacts/tasks/B04/result.json`.

### B05 Isolate attract mode from player state

**Scope:** release. **Owner:** runtime-agent. **Dependencies:** B04. **Locks:** game-source, tests. **Status:** accepted.

**Expected changed paths:** `snake-three.html`, `tests/release/attract.spec.mjs`, `tests/test_attract.mjs`, `tests/check_v10_contracts.mjs`, `tests/test_combo.mjs`.

**Current evidence anchors:** `snake-three.html:4834`, `snake-three.html:4935`, `snake-three.html:6695`. Resolve by symbol as lines drift.

**Implementation steps**

1. Introduce explicit player/demo run ownership with separate simulation/RNG context or equivalently isolated state containers.
2. Include pillars, wrap rules, growth-aware tail occupancy and both prey in pathfinding safety.
3. Handle all demo terminal outcomes through bounded demo reset without player finalization, record updates, haptics or audio.
4. Restore player HUD and storage view independently; title-demo failure must never replace the title overlay.
5. Migrate the listed legacy assertions only where an explicitly superseded rule or interface requires it. Preserve equivalent behavioral coverage and record the old/new expectation; never silence a suite to make it pass.

**Acceptance**

- ACC-DEMO-01 and ACC-DEMO-02 pass.
- Forced pillar/self/trap/target outcomes leave player best, summary and all player storage byte-identical.
- A 3000-step demo stress run cycles without entering a player Game Over.
- Player takeover resets score, length, timers and RNG deterministically.

**Case IDs:** ACC-DEMO-01, ACC-DEMO-02. **Evidence:** `.artifacts/tasks/B05/result.json`.

## Phase 2 Deterministic play and interruption recovery

### B06 Reset all seeded state before spawning a new run

**Scope:** release. **Owner:** runtime-agent. **Dependencies:** B05. **Locks:** game-source, tests. **Status:** accepted.

**Expected changed paths:** `snake-three.html`, `tests/release/determinism.spec.mjs`, `tests/test_seeded_rng.mjs`, `tests/test_difficulty.mjs`, `tests/test_game.mjs`, `tests/test_prey_types.mjs`, `tests/test_hazards.mjs`, `tests/check_g7_contracts.mjs`.

**Current evidence anchors:** `snake-three.html:5210`, `snake-three.html:5275`. Resolve by symbol as lines drift.

**Implementation steps**

1. Clear both prey occupancy, visibility, entity timers/hop flags, queues and effects before replaying RNG or spawning.
2. Generate hazard layout once from the hazard stream and spawn first then second prey in stable entity order.
3. Use the immutable challenge tuple and DEC05 mode precedence. Keep an active run pinned; every new today-intent run, including Play again and paused Restart, resolves the current UTC date. Explicit custom/pinned DAILY-date requests replay identically.
4. Implement bounded spawn search plus deterministic free-cell fallback; never spin indefinitely on a nearly full board.
5. Migrate the listed legacy assertions only where an explicitly superseded rule or interface requires it. Preserve equivalent behavioral coverage and record the old/new expectation; never silence a suite to make it pass.

**Acceptance**

- ACC-SEED-01 through ACC-SEED-03 pass.
- Clean starts, repeated Frenzy restarts and starts after demo activity produce identical opening snapshots for one tuple.
- The old second prey cannot alter PRNG consumption.
- Tail-cell hand-off, growing-tail exclusion and Calm wrap invariants remain correct.

**Case IDs:** ACC-SEED-01, ACC-SEED-02, ACC-SEED-03. **Evidence:** `.artifacts/tasks/B06/result.json`.

### B07 Move gameplay time and prey decisions out of rendering

**Scope:** release. **Owner:** runtime-agent. **Dependencies:** B06. **Locks:** game-source, tests. **Status:** accepted.

**Expected changed paths:** `snake-three.html`, `tests/release/determinism.spec.mjs`, `tests/release/timers.spec.mjs`, `tests/test_seeded_rng.mjs`, `tests/test_combo.mjs`, `tests/test_prey.mjs`, `tests/test_prey_types.mjs`, `tests/test_camera.mjs`, `tests/test_speed.mjs`, `tests/test_run_structure.mjs`, `tests/test_game.mjs`, `tests/helpers/source-adapter.mjs`.

**Current evidence anchors:** `snake-three.html:4666`, `snake-three.html:7910`. Resolve by symbol as lines drift.

**Implementation steps**

1. Implement the event-time simulation contract DEC04 with integer milliseconds, stable event ordering and separate cosmetic clocks.
2. Move golden expiry, combo decay, jittery escape and run duration into simulation; rendering may read and interpolate but never mutate gameplay.
3. Use stable tie ordering for escape/free-cell choices; expose deterministic test snapshots and manual simulation advance only through the test adapter.
4. Record mode-dependent maximum speed from authoritative timing, not DOM, and keep death slow motion cosmetic.
5. Migrate the listed legacy assertions only where an explicitly superseded rule or interface requires it. Preserve equivalent behavioral coverage and record the old/new expectation; never silence a suite to make it pass.

**Acceptance**

- ACC-SEED-04, ACC-TIME-01 and ACC-TIME-02 pass.
- Identical input traces produce identical snapshots at 30/60/120 FPS and batched rendering for every mode and graphics tier.
- Pause and hidden-tab time consume no golden/combo/run duration; simultaneous timer/eat events follow DEC04.
- No gameplay RNG or gameplay state mutation remains in draw/update-cosmetic paths.

**Case IDs:** ACC-SEED-04, ACC-TIME-01, ACC-TIME-02. **Evidence:** `.artifacts/tasks/B07/result.json`.

### B08 Version and partition device-local records

**Scope:** release. **Owner:** runtime-agent. **Dependencies:** B04, B07. **Locks:** game-source, tests. **Status:** accepted.

**Expected changed paths:** `snake-three.html`, `tests/release/storage.spec.mjs`, `tests/test_run_structure.mjs`, `tests/test_seeded_rng.mjs`, `tests/check_g7_contracts.mjs`, `tests/release/run-lifecycle.spec.mjs`.

**Current evidence anchors:** `snake-three.html:6285`, `snake-three.html:6302`. Resolve by symbol as lines drift.

**Implementation steps**

1. Implement DEC06 summary/records schemas, strict numeric/string validation, runId deduplication and memory fallback.
2. Partition top tens and bests by mode/rules and challenge category; retain seed/daily identity and keep legacy records in a labeled legacy view.
3. Use deterministic tie-breaks and bounded retention; preserve legacy storage without falsely assigning unknown seed/rules eligibility.
4. Write record state only after eligible player finalization and keep displayed in-progress record feedback separate.
5. Migrate the listed legacy assertions only where an explicitly superseded rule or interface requires it. Preserve equivalent behavioral coverage and record the old/new expectation; never silence a suite to make it pass.

**Acceptance**

- ACC-STORE-01 through ACC-STORE-03 pass.
- Daily/custom/casual/legacy records never mix unfairly, and duplicate finalization cannot duplicate records.
- Malformed JSON, invalid numbers, oversized arrays and denied storage do not prevent playing or same-session rankings.
- Mode, canonical seed, daily date and rules survive reload and share round-trip.

**Case IDs:** ACC-STORE-01, ACC-STORE-02, ACC-STORE-03. **Evidence:** `.artifacts/tasks/B08/result.json`.

### B09 Handle focus loss and rendering recovery

**Scope:** release. **Owner:** runtime-agent. **Dependencies:** B07. **Locks:** game-source, tests. **Status:** accepted.

**Expected changed paths:** `snake-three.html`, `tests/release/recovery.spec.mjs`, `tests/test_audio.mjs`, `tests/test_game.mjs`, `tests/test_death.mjs`.

**Current evidence anchors:** `snake-three.html:1259`, `snake-three.html:7891`. Resolve by symbol as lines drift.

**Implementation steps**

1. Pause player simulation and suspend audio on visibility loss, window blur and context loss; clear held pointer/input state.
2. Never auto-resume on return. Offer an explicit Resume action and retain the run if GPU context restores successfully.
3. On unsupported WebGL or failed restore show exact recoverable fallback copy; expose Reload only as an explicit user action.
4. Separate boot import failure, GPU failure and runtime error diagnostics; do not misreport every failure as a CDN problem.
5. Migrate the listed legacy assertions only where an explicitly superseded rule or interface requires it. Preserve equivalent behavioral coverage and record the old/new expectation; never silence a suite to make it pass.

**Acceptance**

- ACC-RECOVER-01 and ACC-RECOVER-02 pass.
- Hidden/background duration cannot kill a run or expire gameplay timers.
- A restored GPU context rebuilds targets/effects without duplicating event listeners or losing cells/score.
- Unsupported rendering produces accessible feedback rather than a dead Start button or an error loop.

**Case IDs:** ACC-RECOVER-01, ACC-RECOVER-02. **Evidence:** `.artifacts/tasks/B09/result.json`.

### B10 Make touch, haptics and fullscreen reliable

**Scope:** release. **Owner:** runtime-agent. **Dependencies:** B02, B09. **Locks:** game-source, tests. **Status:** accepted.

**Expected changed paths:** `snake-three.html`, `tests/release/touch.spec.mjs`, `tests/test_mobile.mjs`, `tests/check_g12_contracts.mjs`, `tests/test_audio.mjs`.

**Current evidence anchors:** `snake-three.html:2580`, `snake-three.html:3941`. Resolve by symbol as lines drift.

**Implementation steps**

1. Track one active primary pointer id, use pointer capture and clear pad state on pointercancel/lostcapture/blur/visibility loss.
2. Retain the 20px continuous-steering threshold and queue depth 3; keep browser gesture suppression limited to the play canvas.
3. Require eligible player state plus user activation before vibration; treat missing/false vibration as supported degradation without console noise.
4. Feature-detect fullscreen and display unavailable state or omit its control when unsupported; catch promise rejection and synchronize state.
5. Migrate the listed legacy assertions only where an explicitly superseded rule or interface requires it. Preserve equivalent behavioral coverage and record the old/new expectation; never silence a suite to make it pass.

**Acceptance**

- ACC-TOUCH-01 and ACC-TOUCH-02 pass with synthesized touch events.
- Second fingers cannot steal steering, canceled gestures never stick, and scrolling inside settings remains usable.
- No navigator.vibrate user-activation warning appears in the real start-click flow.
- Unsupported haptics/fullscreen never breaks play or presents a misleading active control.

**Case IDs:** ACC-TOUCH-01, ACC-TOUCH-02. **Evidence:** `.artifacts/tasks/B10/result.json`.

## Phase 3 Player experience and sharing

### C01 Provide clear first-play and return-to-title flows

**Scope:** release. **Owner:** ui-agent. **Dependencies:** B04, B05, B07. **Locks:** game-source, tests. **Status:** accepted.

**Expected changed paths:** `snake-three.html`, `tests/release/navigation.spec.mjs`, `tests/test_settings.mjs`, `tests/test_difficulty.mjs`, `tests/test_attract.mjs`, `tests/test_seeded_rng.mjs`.

**Current evidence anchors:** `snake-three.html:801`, `snake-three.html:4054`. Resolve by symbol as lines drift.

**Implementation steps**

1. Apply the exact copy/content decisions DEC08 while preserving the current visual identity and mode names.
2. Show concise device-appropriate steering help, length-60 goal and optional How to play details covering prey, combos and pillars.
3. Add Choose mode/Return to title from pause and summary; retain last mode/settings and select a new casual seed only when starting a new casual run.
4. Keep title primary actions simple and move technical controls into an initially collapsed Advanced graphics section.
5. Migrate the listed legacy assertions only where an explicitly superseded rule or interface requires it. Preserve equivalent behavioral coverage and record the old/new expectation; never silence a suite to make it pass.

**Acceptance**

- ACC-NAV-01 and ACC-NAV-02 pass.
- A player can finish a run, change difficulty and start again without reloading.
- All three prey rules and the target goal are discoverable without an unskippable tutorial.
- Title/demo and restart flows do not overwrite pinned challenge settings.

**Case IDs:** ACC-NAV-01, ACC-NAV-02. **Evidence:** `.artifacts/tasks/C01/result.json`.

### C02 Make menus and HUD fit small and zoomed viewports

**Scope:** release. **Owner:** ui-agent. **Dependencies:** B02, B03, B10, C01. **Locks:** game-source, tests. **Status:** accepted.

**Expected changed paths:** `snake-three.html`, `tests/release/responsive.spec.mjs`, `tests/test_mobile.mjs`, `tests/test_hud.mjs`.

**Current evidence anchors:** `snake-three.html:374`, `snake-three.html:393`. Resolve by symbol as lines drift.

**Implementation steps**

1. Add safe-area-aware controls/HUD, bounded panel heights and vertically scrollable dialog content.
2. Use at least 44x44 CSS-pixel menu/action targets, readable 14px control text and explicit focus styles; permit labels to wrap.
3. Prevent score/best/top-right controls from overlapping; retain visible essential board area and avoid desktop-key legends on touch-only presentation.
4. Validate the DEC09 viewport matrix, 200% zoom/text scale and scrolling under synthesized touch.
5. Migrate the listed legacy assertions only where an explicitly superseded rule or interface requires it. Preserve equivalent behavioral coverage and record the old/new expectation; never silence a suite to make it pass.

**Acceptance**

- ACC-RESP-01 through ACC-RESP-03 pass.
- At 844x390 and 320x568, all settings and Done/close actions are reachable without horizontal page scrolling.
- Title, paused, summary, leaderboard and error panels remain operable at 200% scale.
- No HUD control occludes another interactive target; touch targets and safe-area padding meet the contract.

**Case IDs:** ACC-RESP-01, ACC-RESP-02, ACC-RESP-03. **Evidence:** `.artifacts/tasks/C02/result.json`.

### C03 Share playable challenge links with a local fallback

**Scope:** release. **Owner:** ui-agent. **Dependencies:** A03, B08, C01. **Locks:** game-source, tests. **Status:** accepted.

**Expected changed paths:** `snake-three.html`, `tests/release/share.spec.mjs`, `tests/test_run_structure.mjs`, `tests/test_seeded_rng.mjs`, `tests/release/run-lifecycle.spec.mjs`.

**Current evidence anchors:** `snake-three.html:6250`, `snake-three.html:6266`. Resolve by symbol as lines drift.

**Implementation steps**

1. Construct challenge links from the actual current site base, canonical seed, explicit mode and rules=2; freeze daily date by sharing its concrete seed.
2. Copy exact DEC08 summary text using clipboard only after the Share click; provide a selectable readonly text field if clipboard is denied.
3. Label rankings On this device and implement mode/category filters without implying online rankings.
4. Keep feedback in a status region and never send messages, post to social accounts or invoke paid services.
5. Migrate the listed legacy assertions only where an explicitly superseded rule or interface requires it. Preserve equivalent behavioral coverage and record the old/new expectation; never silence a suite to make it pass.

**Acceptance**

- ACC-SHARE-01 and ACC-SHARE-02 pass.
- A copied challenge URL produces the same opening tuple under project-prefix hosting.
- Clipboard denial still leaves a complete copyable challenge card.
- No share action causes external transmission other than the user choosing to copy text.

**Case IDs:** ACC-SHARE-01, ACC-SHARE-02. **Evidence:** `.artifacts/tasks/C03/result.json`.

### C04 Correct speed, records and food-count atmosphere

**Scope:** release. **Owner:** runtime-agent. **Dependencies:** B04, B07, B08. **Locks:** game-source, tests. **Status:** accepted.

**Expected changed paths:** `snake-three.html`, `tests/release/hud.spec.mjs`, `tests/test_hud.mjs`, `tests/check_v12_contracts.mjs`, `tests/test_arena.mjs`, `tests/check_v5_contracts.mjs`, `tests/test_speed.mjs`.

**Current evidence anchors:** `snake-three.html:1724`, `snake-three.html:6588`. Resolve by symbol as lines drift.

**Implementation steps**

1. Drive speed progress and MAX level from each mode's actual base/minimum/speed increment per DEC02.
2. Initialize prior-best snapshots, show eligible record feedback for positive new best, and reset all record/level effects on a new run.
3. Drive zones by successful prey count at 10/20/30/40 eats, capped at zone4, independently of prey points and multiplier.
4. Give demo atmosphere a separate food counter and keep HUD changes gated to changed values.
5. Migrate the listed legacy assertions only where an explicitly superseded rule or interface requires it. Preserve equivalent behavioral coverage and record the old/new expectation; never silence a suite to make it pass.

**Acceptance**

- ACC-HUD-01 and ACC-HUD-02 pass.
- Classic/Calm/Frenzy cap levels are 15/16/13 respectively; MAX appears only at the actual speed floor.
- Record feedback works for fresh and existing players without demo contamination.
- Atmosphere changes on the tenth prey even when score differs through combos/types.

**Case IDs:** ACC-HUD-01, ACC-HUD-02. **Evidence:** `.artifacts/tasks/C04/result.json`.

## Phase 4 Performance and public assets

### D01 Instance contact shadows without changing gameplay

**Scope:** release. **Owner:** render-agent. **Dependencies:** B07, A02. **Locks:** game-source, tests. **Status:** accepted.

**Expected changed paths:** `snake-three.html`, `tests/release/performance.spec.mjs`, `tests/test_tube.mjs`, `tests/test_raycast.mjs`, `tests/test_paths.mjs`, `tests/test_bloom.mjs`.

**Current evidence anchors:** `snake-three.html:3599`, `ENHANCEMENTS.md:84`. Resolve by symbol as lines drift.

**Implementation steps**

1. Replace per-segment shadow meshes with three preallocated InstancedMesh opacity buckets, keeping current taper/position/quality behavior.
2. Preallocate capacity for all 441 cells plus fixed pooled objects and update only active instance ranges.
3. Retain the continuous tube and segments fallback; preserve bloom ownership and resource cleanup.
4. Migrate the listed legacy assertions only where an explicitly superseded rule or interface requires it. Preserve equivalent behavioral coverage and record the old/new expectation; never silence a suite to make it pass.

**Acceptance**

- ACC-PERF-01 passes in tube and segments modes.
- The contact-shadow pass adds at most three draw calls independent of snake length.
- Cell simulation and challenge snapshots are unchanged; no per-frame geometry/material allocation is introduced.
- Golden/low-quality visibility and shadow appearance pass a bounded desktop/mobile screenshot review.

**Case IDs:** ACC-PERF-01. **Evidence:** `.artifacts/tasks/D01/result.json`.

### D02 Bound resize allocations and idle particle work

**Scope:** release. **Owner:** render-agent. **Dependencies:** D01. **Locks:** game-source, tests. **Status:** accepted.

**Expected changed paths:** `snake-three.html`, `tests/release/performance.spec.mjs`, `tests/test_game.mjs`, `tests/test_arena.mjs`, `tests/test_eat.mjs`, `tests/test_death.mjs`.

**Current evidence anchors:** `snake-three.html:3911`, `snake-three.html:3401`. Resolve by symbol as lines drift.

**Implementation steps**

1. Coalesce resize events into one pending animation-frame resize with final-size verification and no rebuild when effective dimensions are unchanged.
2. Dispose replaced render targets and cancel scheduled work on shutdown/context loss.
3. Maintain particle active indices/count; skip both full-array scanning and attribute uploads when no particle is alive.
4. Keep the existing live-upload gate while measuring actual buffer/render-target resource counts.
5. Migrate the listed legacy assertions only where an explicitly superseded rule or interface requires it. Preserve equivalent behavioral coverage and record the old/new expectation; never silence a suite to make it pass.

**Acceptance**

- ACC-PERF-02 and ACC-PERF-03 pass.
- One burst of 100 resize events schedules at most one rebuild per rendered frame and settles to correct final dimensions.
- After effects expire, particle CPU updates and uploads are zero until the next burst.
- Repeated resize/quality/restart cycles do not monotonically grow retained target/material/program counts.

**Case IDs:** ACC-PERF-02, ACC-PERF-03. **Evidence:** `.artifacts/tasks/D02/result.json`.

### D03 Measure budgets and gate expensive rendering by tier

**Scope:** release. **Owner:** render-agent. **Dependencies:** D02, C02. **Locks:** game-source, performance-evidence, tests. **Status:** accepted.

**Expected changed paths:** `snake-three.html`, `tests/release/performance.spec.mjs`, `docs/PERFORMANCE.md`, `tests/test_high_tier.mjs`, `tests/check_v11_contracts.mjs`, `tests/test_bloom.mjs`, `tests/test_luma.mjs`, `tests/test_tube.mjs`, `tests/test_skin.mjs`, `tests/helpers/performance-benchmark.mjs`, `tests/test_game.mjs`.

**Current evidence anchors:** `ENHANCEMENTS.md:90`, `SPEC-V11-high-tier-extras.md`. Resolve by symbol as lines drift.

A public benchmark helper must regenerate evidence from a fresh install. Local before/after comparisons require the identical GPU/config/method; hosted structural evidence never compares timings across GPUs.

**Implementation steps**

1. Record draw calls/triangles/programs/resources at length3/20/60 for each mode/tier, with native GPU versus SwiftShader clearly separated.
2. Default touch/coarse devices to Auto balanced and permit safe downgrade; keep costly clearcoat/sheen/reflections/extra lights for high only when budget evidence supports them.
3. Profile the ground/non-snake materials and sweeping light; reduce measured unnecessary per-fragment cost on balanced/low while preserving high identity.
4. Enforce structural/resource/package budgets from DEC09; treat unmeasured real-device frame rate as an explicit limitation, not an invented pass.
5. Migrate the listed legacy assertions only where an explicitly superseded rule or interface requires it. Preserve equivalent behavioral coverage and record the old/new expectation; never silence a suite to make it pass.

**Acceptance**

- ACC-PERF-04 passes and performance evidence covers all required lengths/tiers.
- There is no release-blocking rendering regression or unbounded growth in repeated runs.
- Balanced/low remain visibly readable and do not change challenge state.
- No hardware frame-rate promise is based solely on software-rendered timing.

**Case IDs:** ACC-PERF-04. **Evidence:** `.artifacts/tasks/D03/result.json`.

### E01 Prepare public metadata, documentation and license notices

**Scope:** release. **Owner:** docs-assets-agent. **Dependencies:** A02, C01, C03. **Locks:** metadata, docs, game-source. **Status:** accepted.

**Expected changed paths:** `snake-three.html`, `assets/**`, `README.md`, `PUBLISHING.md`, `THIRD_PARTY_NOTICES.txt`, `tests/helpers/social-preview.mjs`, `tests/release/packaging.spec.mjs`.

**Current evidence anchors:** `snake-three.html:6`, `snake-three.html:7`. Resolve by symbol as lines drift.

**Implementation steps**

1. Set the public title, heading, share-card and social-preview name to just-snake, add the fixed description/controls/local-storage explanation from DEC08, and provide a distinctive code-native SVG favicon.
2. Generate a 1200x630 social preview from a deterministic gameplay capture plus plain title typography; avoid requiring image-generation credentials.
3. Include exact third-party notices for shipped dependencies; preserve any existing source license and do not invent ownership or grant a new license.
4. Document local setup, commands, source-versus-dist layout, scope of browser evidence and bug-report links derived from repository discovery.

**Acceptance**

- ACC-PACK-03 passes.
- Public docs make no claim of global rankings, physical-device certification or a source license that was never granted.
- No placeholder URLs appear in production metadata; absolute canonical/social URLs are emitted only when the deployment URL is known.
- Assets are local, reproducible and within distribution budgets.

**Case IDs:** ACC-PACK-03. **Evidence:** `.artifacts/tasks/E01/result.json`.

## Phase 5 CI and documentation reconciliation

### E02 Create required CI checks and Pages deployment workflows

**Scope:** release. **Owner:** ci-agent. **Dependencies:** A01, A02, E01, D03, C04. **Locks:** github-workflows, release-tooling, tests, docs. **Status:** accepted.

**Expected changed paths:** `.github/workflows/ci.yml`, `.github/workflows/pages.yml`, `scripts/verify-live.mjs`, `scripts/discover-publishing.mjs`, `scripts/rollback.mjs`, `scripts/check-workflows.mjs`, `scripts/retain-qualified-artifact.mjs`, `package.json`, `package-lock.json`, `scripts/qualify.mjs`, `scripts/run-tests.mjs`, `scripts/release-contract.mjs`, `.github/action-pins.json`, `tests/infrastructure/release-contract.test.mjs`, `tests/infrastructure/workflows.test.mjs`, `tests/README.md`, `README.md`, `PUBLISHING.md`, `docs/RELEASE_QUALIFICATION.md`, `docs/RELEASE_QUALIFICATION.schema.json`, `.github/release-attestation.json` (final record is authored by independent E04), `tests/release/packaging.spec.mjs`, `tests/infrastructure/foundation.test.mjs` (candidate identity and read-only diagnostic compatibility checks).

**Current evidence anchors:** `tests/package.json:7`. Resolve by symbol as lines drift.

**Implementation steps**

1. Implement ARM64 build/source/Chromium/Firefox and ARM64 macOS WebKit jobs with pinned dependencies/actions, one browser worker and bounded timeouts.
2. Test the exact static artifact at root and prefixed mount; preserve/compare its digest across test/upload/deploy stages.
3. Allow deployments only for the discovered default branch or explicit authorized workflow dispatch, never for untrusted PR code; keep deploy credentials out of test jobs.
4. Use github-pages, minimum deploy permissions, explicit needs and deployment concurrency without canceling active deployments. Do not add manual approval steps.
5. Implement publishing discovery, live verification and rollback tooling now, before E04 freezes the candidate. Validate workflow graph/permissions and execute its entry commands with local failure injection; actual hosted run proof belongs to E05.
6. Retain qualified dist plus digest/provenance/report in a separate generic Actions artifact for 30 days or the repository's lower enforced maximum. Rollback downloads a selected previously qualified artifact, verifies its provenance/digests, re-uploads it as a Pages artifact in the current run, then deploys and verifies. Missing/expired prior artifacts mean rollback unavailable, never unchecked-code fallback.
7. Rehearse rollback selection, digest/provenance validation and re-upload mechanics locally without replacing a successful live deployment; production rollback is failure recovery, not a routine success-path drill.

**Acceptance**

- ACC-CI-01 and ACC-CI-02 pass.
- Every release-critical suite runs and every nonzero result blocks artifact deployment.
- Only the checked dist artifact is uploaded; PR jobs cannot publish.
- Action versions are recorded as verified immutable commit SHAs, and existing protection rules remain intact.

**Case IDs:** ACC-CI-01, ACC-CI-02. **Evidence:** `.artifacts/tasks/E02/result.json`.

### E03 Reconcile historical backlog, specs and obsolete scripts

**Scope:** release. **Owner:** docs-agent. **Dependencies:** B08, C04, D03, E01. **Locks:** historical-docs, tests, release-tooling. **Status:** accepted.

**Expected changed paths:** `ENHANCEMENTS.md`, `SPEC-*.md`, `tests/README.md`, `scripts/implement_*.py`, `_game.js`, `docs/HISTORICAL_RECIPES.md`, `tests/infrastructure/historical-docs.test.mjs`, `scripts/release-contract.mjs`, `docs/RELEASE_QUALIFICATION.md`, `tests/infrastructure/release-contract.test.mjs` (bind documents actually consumed by DOC01).

**Current evidence anchors:** `ENHANCEMENTS.md:3`, `ENHANCEMENTS.md:75`, `ENHANCEMENTS.md:110`. Resolve by symbol as lines drift.

**Implementation steps**

1. Replace historical claims with accepted/partial/open/deferred status and link evidence; include V11 and the new current baseline.
2. Mark superseded spec sections explicitly, including wall-wrap preferences, six-second golden lifetime and simulation-owned timers.
3. Audit stale generator/implementer scripts for references; archive them as historical and remove the unreferenced _game.js after reference checks.
4. Document all compatibility hooks and test adapter behavior; old recipe plans are never used as new implementation instructions.

**Acceptance**

- ACC-DOC-01 passes.
- Every accepted item links to an assertion/evidence; outstanding G5/G8/P2/module work remain explicit and correctly ordered.
- There are no contradictory authoritative constants or false DONE claims.
- Historical material is preserved or intentionally archived; unreferenced broken copies cannot enter the release payload.

**Case IDs:** ACC-DOC-01. **Evidence:** `.artifacts/tasks/E03/result.json`.

## Phase 6 Independent release qualification

### E04 Independently qualify the immutable release candidate

**Scope:** release. **Owner:** independent-reviewer. **Dependencies:** A03, B10, C02, C03, C04, D03, E02, E03. **Locks:** qualification. **Status:** accepted.

**Expected changed paths:** `docs/RELEASE_CHECKLIST.md`, `.github/release-attestation.json`, `.artifacts/release/report.json`, `.artifacts/release/screenshots/**`.

**Current evidence anchors:** `PUBLIC_RELEASE_BACKLOG.md`. Resolve by symbol as lines drift.

**Implementation steps**

1. Run all release-required acceptance cases from a fresh install against source and the exact clean-built dist artifact.
2. Perform independent bounded code/visual review with desktop/portrait/landscape captures and verify no known regression remains.
3. Produce the DEC11 report with hashes, versions, full result matrix, evidence paths, limitations and explicit eligible-to-publish verdict.
4. Route any failure to its owning task and repeat only affected suites plus the final integrated qualification after fixes.

**Acceptance**

- All release-required cases pass; no P0/P1 issue remains unresolved.
- Evidence proves source-to-build-to-tested-artifact identity and contains no secrets.
- Browser/viewport evidence is distinguished from actual hardware testing.
- The reviewer did not implement the changes they are qualifying; no self-approved incomplete release is marked accepted.

**Case IDs:** Task-specific repository/evidence checks; no separate catalog case. **Evidence:** `.artifacts/tasks/E04/result.json`.

## Phase 7 Conditional publication and live verification

### E05 Discover and publish through existing authorized GitHub access

**Scope:** external. **Owner:** release-agent. **Dependencies:** E04. **Locks:** git, github-publication. **Status:** in_progress.

**Expected changed paths:** `.artifacts/publishing-plan.json`, `.artifacts/publishing-status.json`.

**Current evidence anchors:** `plans/public-release-agent.md`. Resolve by symbol as lines drift.

**Implementation steps**

1. Discover authorization, remotes, authenticated account, repo permissions/default branch, Pages settings and deployment protections using read-only calls first.
2. Apply DEC12 publication routing: reuse an authorized repository named exactly just-snake, or create just-snake under the authenticated personal account only in an explicitly authorized publish run. Name conflicts produce blocked_external; never choose a fallback slug or overwrite unrelated contents.
3. Push only a verified same-name task/release refspec, create a PR and use normal auto-merge/checks when permitted; never bypass protected-branch requirements.
4. Enable Actions-backed Pages when permissions allow, trigger the verified workflow and record returned deployment identity. Otherwise record a sanitized external blocker and keep all local artifacts complete.
5. Run the already qualified publication/discovery scripts without editing them; require successful actual hosted checks/workflow and artifact identity evidence before deployment. Local workflow rehearsal is not represented as a hosted CI pass.

**Acceptance**

- ACC-PUBLISH-01 passes when publication authorization/access exists.
- Any pushed branch tracks remote/same-name and never the default branch accidentally.
- Missing credentials/protected review/Pages permissions produce a specific blocked_external result, with no repeated clarification questions or invented success.
- No unrelated workspace files are published; existing Pages custom-domain/protection settings are preserved.

**Case IDs:** ACC-PUBLISH-01. **Evidence:** `.artifacts/tasks/E05/result.json`.

### E06 Verify the live deployment and provide automated rollback

**Scope:** external. **Owner:** release-agent. **Dependencies:** E05. **Locks:** github-publication. **Status:** pending.

**Expected changed paths:** `.artifacts/release/live-report.json`, `.artifacts/publishing-status.json`.

**Current evidence anchors:** `plans/public-release-agent.md`. Resolve by symbol as lines drift.

**Implementation steps**

1. Poll the deployment URL with bounded backoff, verify entry/assets/tuple startup and a minimal player run/restart using the exact artifact digest.
2. Record commit/artifact/page deployment identifiers and compare served JavaScript/assets with the qualified manifest.
3. Only after a candidate verification failure on an authorized update, execute the already qualified E02 rollback workflow using a retained known-good artifact/digest. Download, verify and re-upload it into the current run. A successful candidate stays live; no routine production rollback drill is run. Do not edit source/workflow files after E04.
4. On first-deployment failure record failed publication; on an update rollback automatically only when an existing authorized known-good artifact is available.

**Acceptance**

- ACC-PUBLISH-02 passes.
- The candidate is marked published only while its verified bytes are live; project-prefix challenge links work. If recovery redeploys the old artifact, report rolled_back with that active artifact and the failed candidate, then return the defect to its owner rather than accepting this candidate release.
- Rollback redeploys an immutable known-good artifact and reruns smoke verification without weakening protections.
- No live status is marked published until verification succeeds.

**Case IDs:** ACC-PUBLISH-02. **Evidence:** `.artifacts/tasks/E06/result.json`.

## Phase 8 Deferred improvements after qualification

### F01 Extract simulation and adapters after the release is stable

**Scope:** post_release. **Owner:** architecture-agent. **Dependencies:** E04. **Locks:** game-source, module-extraction. **Status:** deferred.

**Expected changed paths:** `src/simulation/**`, `src/render/**`, `src/ui/**`, `src/storage/**`, `snake-three.html`, `scripts/build.mjs`, `tests/**`.

**Current evidence anchors:** `PUBLIC_RELEASE_BACKLOG.md`. Resolve by symbol as lines drift.

**Implementation steps**

1. Extract pure simulation, rendering, UI and storage behind the already accepted contracts in small commits.
2. Move legacy tests to module-based adapters while preserving coverage; retain the production debug exclusion already completed by A01/A02.
3. Keep one canonical entry and update the build without changing public behavior or rules version.

**Acceptance**

- Every existing acceptance case and deterministic trace passes unchanged.
- Source-to-dist no longer relies on text injection for new tests; no second stale implementation is introduced.
- Module ownership permits non-overlapping concurrent implementation only after interfaces are accepted.

**Case IDs:** Task-specific repository/evidence checks; no separate catalog case. **Evidence:** `.artifacts/tasks/F01/result.json`.

### F02 Add one optional practice revive without affecting ranked rules

**Scope:** post_release. **Owner:** gameplay-agent. **Dependencies:** F01, B08. **Locks:** simulation, ui. **Status:** deferred.

**Expected changed paths:** `src/simulation/**`, `src/ui/**`, `tests/release/revive.spec.mjs`, `SPEC-G5-last-chance.md`.

**Current evidence anchors:** `ENHANCEMENTS.md:49`. Resolve by symbol as lines drift.

**Implementation steps**

1. Add an off-by-default pre-run Practice assist option. When enabled, create category=practice at run creation even if unused; it cannot be toggled during a live run. Maintain eight complete movement snapshots including cells, prey, clocks, RNG, score and metrics.
2. Intercept collision before finalization. Restore the snapshot four moves earlier, or the earliest available safe snapshot, with the same runId. Consume the one-revive flag outside restored history so rewinding cannot replenish it; cancel future events/history. If unavailable/declined/already consumed, finalize normally as practice.
3. Show a one-second paused ghost-trail countdown before explicit continuation, rather than allowing out-of-grid invulnerable movement.
4. Classify any assisted run as practice and keep it out of normal/daily rankings; update the historical G5 concept to this exact contract.

**Acceptance**

- Restoration reproduces the full earlier snapshot and cannot duplicate food/points or retain future RNG state.
- Assistance is limited to once, normal/daily behavior remains unchanged when off, and assisted results are visibly practice.
- Storage quota/unavailable snapshot falls back to normal death without breaking the game.

**Case IDs:** Task-specific repository/evidence checks; no separate catalog case. **Evidence:** `.artifacts/tasks/F02/result.json`.

### F03 Add a same-challenge local best ghost

**Scope:** post_release. **Owner:** gameplay-agent. **Dependencies:** F01, B08. **Locks:** simulation, render, storage. **Status:** deferred.

**Expected changed paths:** `src/replay/**`, `src/render/**`, `tests/release/ghost.spec.mjs`, `SPEC-G8-ghost-replay.md`.

**Current evidence anchors:** `ENHANCEMENTS.md:52`. Resolve by symbol as lines drift.

**Implementation steps**

1. Record canonical input events/movement timestamps only for eligible completed player runs; replay through the accepted simulator. Bound recording to 100000 input events; exceeding the limit disables that run's ghost recording, without interrupting play or score eligibility.
2. Store at most ten challenge replays and two MiB in IndexedDB, with deterministic LRU eviction; storage failure disables ghost persistence only.
3. Render a non-colliding translucent ribbon for the best replay with an exactly matching seed/mode/rules tuple; default off and use fewer samples on low tier.
4. Validate replay headers/state hashes and discard incompatible/corrupt traces without altering player state.

**Acceptance**

- Ghost playback is identical across rendering FPS and cannot consume player RNG, collide or change scoring.
- Different challenge tuples never race each other; corrupt data and quota denial are safe.
- Memory/draw-call budgets are bounded and no server/account is required.

**Case IDs:** Task-specific repository/evidence checks; no separate catalog case. **Evidence:** `.artifacts/tasks/F03/result.json`.

## Traceability to the historical enhancement backlog

| Existing area | New work | Release treatment |
|---|---|---|
| G1 combo, G2/V9 prey, G7 seeds | B06/B07/B08/C03 | Restore deterministic timing, reset, challenge identity and local ranking comparability |
| G3 hazards, G6 modes | B05/B06/D02 | Preserve mode rules; fix demo/pathfinding/reset integration |
| G4 summaries/share/leaderboard | A03/B04/B08/C01/C03 | Required correctness and actual UI operation |
| G9 settings/pause | B01/B02/B09/C01 | Preferences restore; modal owns input; mode owns wall behavior |
| G10 accessibility | B03/C02 | Honor inherited OS preferences and all promised camera/DOM behaviors |
| G11 audio | B05/B09/B10 | Preserve synthesis; enforce gesture/demo/pause eligibility |
| G12 mobile | B10/C02 | Gesture interruption, haptic/fullscreen degradation, usable layout |
| V1/V2 tube/bloom | A01/A02/D01/D03 | Preserve strengths and real rendering gates |
| V3/V4/V6/V7/V8 effects | B03/B04/B07/D02 | Keep cosmetic ownership, complete reset/motion behavior |
| V5 zones | C04 | Successful-eat count instead of score-derived progression |
| V10 attract | B05 | Separate player/demo state and terminal paths |
| V11 extras | D03/E03 | Include in inventory; keep expensive effects tier-gated |
| V12 HUD | B04/C04 | Correct initialization, speed caps and record scope |
| P1 shadow/body instancing | D01 | Finish shadows; retain single tube mesh |
| P2 light budget | D03 | Measure and reduce non-snake cost in lower tiers |
| P3 resize | D02 | Coalesce and dispose resources |
| P4 particles | D02/E03 | Preserve existing upload gate; finish idle CPU gate |
| G5 revive | F02 | Deferred, off-by-default practice-only assistance |
| G8 ghost | F03 | Deferred, local matching-challenge replay |
| Stale _game.js / patch recipes / spec status | E03 | Reconcile/archive; never ship |

## Definition of done

A local release is complete when all 25 local tasks are accepted, all 52 local qualification cases pass, every declared source suite is accounted for, local workflow contracts are checked (hosted execution is separately proved by E05), the distribution passes root/prefix/offline-host checks, and an independent reviewer accepts an immutable candidate report. External publication is separately complete only when E05/E06 and their two live-publication cases succeed. Missing credentials or policy-controlled review is an external blocker, not a reason to ask product questions or mislabel a local artifact as a live game.

The three post-release tasks remain deferred unless an execution request includes them. No extra revive, ghost, backend, framework or cosmetic redesign is needed to qualify v1.0.

## Official references checked for this plan

- [GitHub Pages custom workflow and permissions](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [GitHub Pages entry point](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)
- [GitHub hosted runner architectures](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- [Node release status](https://nodejs.org/en/about/previous-releases)
- [esbuild splitting and dynamic imports](https://esbuild.github.io/api/#splitting)
- [Playwright system requirements](https://playwright.dev/docs/intro#system-requirements)
- [Playwright CI workers](https://playwright.dev/docs/ci#workers)
- [Playwright WebKit scope](https://playwright.dev/docs/browsers#webkit)
- [Chrome for Testing platform support](https://github.com/GoogleChromeLabs/chrome-for-testing#supported-platforms)

Runtime/source details above are reviewed local evidence. Dependency/action/runner availability must be capability-checked again when executing; use the specified bounded fallback rather than inventing availability. The old blanket claim that Chrome for Testing never supports Linux ARM64 must be reconciled against the actual selected version.
