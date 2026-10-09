# just-snake test infrastructure

Use native ARM64 Node 24 (`nvm use`) and exact lockfiles. This workstation also has an ignored workspace-local Node binary; run `export PATH="$PWD/.tools/node_modules/node/bin:$PATH"` from the repository root. Do not change the system Node installation.

```sh
npm ci --cache .tools/npm-cache
npm --prefix tests ci --cache "$PWD/.tools/npm-cache"
PLAYWRIGHT_BROWSERS_PATH="$PWD/.tools/playwright" npm run test:install-browsers
npm run test:static
npm run test:legacy
npm run test:release
npm test
```

The root packages are exactly pinned (Node 24 LTS, Three 0.169.0, esbuild 0.28.2, Playwright 1.64.0, axe-core 4.14.0). Legacy Puppeteer is upgraded exactly to 25.13.0 (Node>=22.12) after recording the original 23.11.1 advisory report; pngjs remains 7.0.0. The exact upgrade removes the vulnerable legacy FTP/proxy/archive stack and is verified against installed Chromium. Install scripts are limited to the official native Node/esbuild binaries when needed. Local caches, engines, diagnostics and fixtures never belong in the public artifact.

`tests/suites.json` explicitly registers all 20 static and 26 legacy browser suites. Root runners reject unregistered files and execute central suites sequentially, one worker and one browser at a time. Release checks run in bounded per-spec/per-engine partitions, with copied per-partition JSON reports; expected failures, skipped tests, missing reports and interruptions never count as passes. Case deadlines are 30 seconds, legacy suite deadlines 180 seconds; the measured bloom/luma/tube suites have explicit 300 second budgets. A failing assertion, missing engine, unusable renderer, timeout, page error or console error returns nonzero. Haptics warnings remain visible until their runtime fix; no generic warning/error suppression is allowed.

| Variable | Purpose |
|---|---|
| `GAME` | Absolute canonical source HTML override for source/static/legacy checks |
| `CHROME` | Native Chromium executable override; otherwise pinned Playwright Chromium |
| `BASE_URL` | Existing target server's directory URL; without it the runner owns a temporary loopback server |
| `SERVE_PREFIX` | Runner-owned mount, e.g. `/just-snake/`; root asset requests return 404 |
| `TEST_ARTIFACTS` | Evidence directory override, default `.artifacts/tests` |
| `PLAYWRIGHT_BROWSERS_PATH` | Native engine installation path, default `.tools/playwright` in root runner |
| `RELEASE_DIST=1` | Release checks use ordinary `index.html` bytes and real controls |
| `DIST_ROOT` | Built-artifact directory override, default `dist` |
| `RELEASE_SOURCE_HOOKS=1` | Optional source-only adapter for difficult simulation fixtures |

Examples:

```sh
npm run test:legacy -- --only=test_game
npm run test:release -- --only=ACC-SEC-01
SERVE_PREFIX=/just-snake/ npm run test:release
RELEASE_DIST=1 DIST_ROOT="$PWD/dist" npm run test:release
BASE_URL=http://127.0.0.1:8080/just-snake/ npm run test:release
```

Every legacy suite imports `helpers/legacy-browser.mjs`, creates isolated contexts and receives bounded navigation/readiness, native engine metadata, request/page/console error evidence, screenshots and Chromium traces. The wrapper rewrites old literal server URLs against `BASE_URL`, including seeded extra pages and reloads. The central runner owns its server and child process group, closes browsers on signals, kills surviving recorded browser groups and removes only debug files created by that run. Temporary source copies still exist for historical inline simulation hooks, but all are local-only. Existing direct invocations require an already running server (`npm run serve`); use root entry points for fully owned cleanup and machine-readable output.

Normal source has no mutable legacy exports. The adapter defines `__SNAKE_TEST_BUILD__` *inside the temporary inline module*, enabling guarded exports and existing source-only hooks. It never changes production bytes. Source imports resolve from the exact local Three package; built artifact tests block non-origin runtime requests and require local packaged dependencies. Production behavior uses real controls rather than adapter privileges.

A01 initially adds four real failing regressions in their owning security/settings/modal/accessibility spec files: hostile URL seed, graphics reload, modal keyboard isolation, inherited OS accessibility preferences. Their owning tasks must repair them. The runner inventories all 54 acceptance cases and fails a full release gate while any local catalog case lacks implementation; a filtered run is explicitly a subset. Later tasks add their assigned cases. No missing case or failed renderer is a pass.

Each invocation receives a unique `.artifacts/tests/<group>-<id>/` directory; partition results, logs, JSON reports, screenshots and traces live beneath it. The root `<group>-results.json` remains a latest-result convenience, while every immutable invocation report is retained. Root static/legacy/release result files aggregate command, target, timeout, duration and exit status. Filtered results explicitly declare filtered_subset scope. Default full release runs source then ordinary dist browser/UI checks under the project prefix; missing dist fails as an open A02 gate. Instrumented-source checks use the sourceHooks fixture option and are never run on a privileged production variant. The root runner supplies an isolated `PLAYWRIGHT_JSON_REPORT_PATH` and `--output` per partition, preserving every linked trace/screenshot; direct Playwright invocations retain the default `.artifacts/release` output. Playwright writes partition JSON reports plus traces/screenshots and per-case browser evidence. Chromium tracing is browser-wide, shared across isolated tabs, because the protocol permits only one active trace per browser. These report SwiftShader logic/resource behavior for Chromium; they do not establish physical-device FPS or touchscreen certification.

The formerly informational V1 tube/path/raycast checks now assert finite actual geometry, allocated-buffer capacity stability, nonzero intersections and exact centre-ray intersections where objective criteria exist. Self-overlap fixtures still measure folded triangles without declaring genuine overlap a winding defect. Timing and screenshot heuristics remain reported measurements; structural acceptance uses actual meshes/render targets.

Release engine selection is explicit: `npm run test:release -- --engines=chromium,firefox` or `--engines=webkit`; empty/unknown/duplicate values and duplicate selectors fail before starting a browser. Omission still selects all three. Hosted required evidence pairs native ubuntu-24.04-arm Chromium/Firefox with native macos-15 ARM64 WebKit; filtered engine reports are not full qualification. Fresh legacy installs must use `PUPPETEER_SKIP_DOWNLOAD=true npm ci --prefix tests`, then install native Playwright Chromium. See [qualification contracts](../docs/RELEASE_QUALIFICATION.md).

Historical enhancement/spec bodies are preserved with rules-2 override notices; [HISTORICAL_RECIPES.md](../docs/HISTORICAL_RECIPES.md) identifies obsolete text-replacement recipes and every current compatibility surface. Do not rerun old Python implementer/generator plans. `_game.js` was archived after a live-reference audit and removed; its private archive is never a test prerequisite. `ACC-DOC-01` uses public docs plus actual canonical constants/compile behavior and current assertion links, not ignored historical files. Mutable aliases and injected clock/arrangement controls exist only in temporary compile-gated source fixtures; read-only readiness/failure diagnostics are distinct.
