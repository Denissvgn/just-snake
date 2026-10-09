# Historical recipes and source-test compatibility

Current development authority is [PUBLIC_RELEASE_BACKLOG.md](../PUBLIC_RELEASE_BACKLOG.md), the [structural release manifest](../plans/public-release.plan.json), [acceptance catalog](../plans/public-release.acceptance.json) and [agent runbook](../plans/public-release-agent.md). [ENHANCEMENTS.md](../ENHANCEMENTS.md) supplies the reconciled current inventory. Historical SPEC detail remains below explicit current override notices.

## Obsolete local recipe audit

The pre-release workspace contained text-replacement `scripts/implement_*.py`, spec-writing `scripts/generate_*.py`, root `v*-implementation.plan.json`, old `plans/*-implementation.plan.json` and `plans/spec-*.plan.json`. Their prompts and anchors target earlier single-file builds; they can overwrite corrected behavior or stale tests. They are **historical and non-authoritative: do not execute them**. They are not current CI/qualification inputs or an alternative maintained game. Unrelated previously untracked recipes/plans remain untouched locally and are not required in a fresh public clone; do not stage or publish them wholesale.

The E03 audit records exact local file names and SHA256 values in `.artifacts/tasks/E03/recipe-audit.json`. Those local-only artifacts are excluded from the public payload. Portable current execution uses npm scripts and checked `.mjs` helpers; the only Python script consumed by the current release workflow is the plan validator when explicitly invoked, not a legacy patch recipe.

`_game.js` was an unused stale extracted game copy. A search of canonical HTML, current `.mjs`/validator tooling, package/configuration and test imports found no consumer. References in the old enhancement inventory, structural task description and historical execution-baseline metadata were provenance, not imports. Original bytes were archived at `.artifacts/tasks/E03/archive/_game.js` before removal; SHA256 `cdb8de9d04cc4ce1d1870eda18d0f5d1c877d03e6c2e6a08a1523407d8bfc207`. The original enhancement inventory is archived alongside it. No current build/test command reads the stale copy or requires its private archive.

## Existing compatibility surfaces

Normal source and production dist expose **no mutable game controls**. Canonical legacy controller/function aliases are conditional on the module-local `__SNAKE_TEST_BUILD__` compile flag. [source-adapter.mjs](../tests/helpers/source-adapter.mjs) defines that flag only in a temporary canonical inline-module copy; the production build defines it false and removes those aliases. Built artifacts cannot be passed through this adapter. Ordinary UI cases use actual production bytes and controls.

The retained source-only alias families cover arena/hazards, speed/camera/tube/skin/prey/combo effects, mode/seed/settings/accessibility/audio/mobile controllers, run metrics and legacy state accessors. Their historical SPEC hook lists describe compatibility for tests, never a public supported API. The source adapter also injects `advanceSimulation`, `simulationTime` and `arrangeNextMovement` for difficult event-time fixtures; per-spec temporary `__*` arrangements are injected into that same local module. These controls never ship.

`localImports` maps the source's pinned Three.js CDN spelling to installed local vendor bytes on the owned source server. [release-fixture.mjs](../tests/helpers/release-fixture.mjs) records strict page/console/non-origin diagnostics and supplies explicit sourceHooks only when needed. [legacy-browser.mjs](../tests/helpers/legacy-browser.mjs) resolves native Playwright Chromium, isolates legacy contexts and owns diagnostic fixtures. Registry/hash ownership cleanup occurs only after the child closes; later invocations retain previous reports and traces.

The ordinary diagnostic surface is the boot readiness flag (`__snakeBooted`, a boolean assignment), plus read-only completed-frame (`__snakeRenderedFrames`) and frozen-failure (`__snakeFailure`) getters; these are not simulation setters or an instrumentation privilege. [foundation.test.mjs](../tests/infrastructure/foundation.test.mjs) checks compile exclusion of mutable exports. [qualification procedure](RELEASE_QUALIFICATION.md) binds the actual source, consumed scripts/tests/configuration/docs/locks/workflows and payload; historical prompts cannot bypass it.

## Explicit superseded decisions

- Mutable wall-wrap preferences and mutation of mode rules are removed. Walls follow the frozen mode; selection affects the next run.
- Historical six-second golden wording retains the duration, but means exactly 6000 integer simulation milliseconds, not time consumed by drawing or a wall-clock countdown. Older seven-second V9 prose is superseded too.
- Logical golden/combo deadlines and jitter decisions belong to the simulation event clock; renderer callbacks cannot consume gameplay RNG or mutate grid/metrics. Pause, modal and hidden time do not advance that clock; death slowdown is presentation only.
- Legacy score keys are read-only imports into an earlier-rules archive. Current validated scores-v2 partitions modes/category/challenge identity; there are no online rankings.
- Historical absolute GPU figures, blanket allocation claims, unpinned luma calibration and physical-device assumptions are not release guarantees. Current [performance evidence](PERFORMANCE.md) states its method and limitations.

F01 module extraction, G5/F02 practice revive and G8/F03 local same-challenge ghost remain deferred. D03 completed measured lower-tier P2 gates; static lighting bake is still deferred. No historical ready/DONE label overrides those statuses.
