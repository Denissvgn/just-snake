# just-snake test infrastructure

Use native ARM64 Node 24 and the exact committed locks. For the ignored workstation-local binary, prepend `$PWD/.tools/node_modules/node/bin` to PATH; do not change the system installation.

```sh
npm ci
PUPPETEER_SKIP_DOWNLOAD=true npm ci --prefix tests
npm run test:install-browsers
npm run build
npm run check:dist
npm run test:infrastructure
npm run test:static
npm run test:legacy
npm run test:release
npm run qualify
```

Root dependencies pin Three.js, esbuild, Playwright, axe-core and the workflow YAML parser. Legacy tests pin Puppeteer and pngjs; Puppeteer uses installed native Playwright Chromium rather than a downloaded x86 browser. `tests/suites.json` registers all20 static and26 legacy suites. Machine acceptance IDs, gates, explicit target requirements and deterministic fixtures are in [support/release-cases.json](support/release-cases.json); the review-record schema is [support/release-attestation.schema.json](support/release-attestation.schema.json). There are52 local cases and2 live-publication cases. No planning/spec document is needed to run these commands.

One worker/browser executes each bounded partition. Release case timeouts are30 seconds unless explicitly justified; suite watchdogs are180 seconds, with recorded300-second bounds for measured bloom/luma/tube legacy suites. Expected failures, skips/todo, missing results, timeouts, unusable renderers and page/console/non-origin errors never count as passes. Full qualification requires complete source, ordinary project-prefix and ordinary root case coverage across native ARM64 Chromium/Firefox and macOS ARM64 WebKit.

| Variable | Purpose |
|---|---|
| `GAME` | Canonical source override for explicit source/static/legacy checks |
| `CHROME` | Native Chromium executable override |
| `BASE_URL` | Existing target directory URL; otherwise the runner owns a loopback server |
| `SERVE_PREFIX` | Owned mount such as `/just-snake/`; root asset requests return404 |
| `TEST_ARTIFACTS` | Isolated evidence output root |
| `PLAYWRIGHT_BROWSERS_PATH` | Browser install path, default `.tools/playwright` |
| `RELEASE_DIST=1` | Ordinary built bytes and real controls |
| `DIST_ROOT` | Checked distribution directory |
| `RELEASE_SOURCE_HOOKS=1` | Temporary source-only arrangements for difficult invariants |

Examples:

```sh
npm run test:legacy -- --only=test_game
npm run test:release -- --only=ACC-SEC-01
npm run test:release -- --engines=chromium,firefox
RELEASE_DIST=1 SERVE_PREFIX=/just-snake/ npm run test:release -- --production-ui
```

Empty/unknown/duplicate engine selectors fail. Omission selects all3 locally; hosted jobs use ubuntu-24.04-arm Firefox (native Mesa llvmpipe under owned Xvfb) and macos-15 ARM64 Chromium/WebKit (Chromium uses verified ANGLE Metal). Local native macOS Firefox remains supported. Filtered results are explicitly subsets, never full qualification. Each invocation has a unique directory with commands, actual engine/platform versions, screenshots, traces and per-case results; later runs retain earlier evidence.

The source adapter defines module-local `__SNAKE_TEST_BUILD__` only in a temporary inline-module copy. Controller/state aliases and injected `advanceSimulation`, `simulationTime`, `arrangeNextMovement` are source-test compatibility, never production exports. Local imports resolve pinned Three.js vendor bytes. The production build compiles the flag false; ordinary dist is never adapted. The boot-ready boolean and read-only completed-frame/frozen-failure getters are diagnostics rather than gameplay controls.

The legacy browser wrapper owns contexts, records strict diagnostics, and uses native Chromium. Fixture cleanup uses exact registered ownership/hash after child closure; it never globally deletes another run's files. `finish` remains a strict title assertion. Positive completion consumers may explicitly use bounded `finishWithNativeResume`: healthy visible/focused game, no modal/failure/lost GL, exact visible enabled Resume, recorded native clicks, and no clock/gap bypass. Interruption/resume-count and manual-clock contracts remain strict.

`ACC-DOC-01` checks repository hygiene, public operational links and machine contract integrity without ignored/private files. See [qualification procedure](../docs/RELEASE_QUALIFICATION.md) and [rendering measurements](../docs/PERFORMANCE.md). SwiftShader and emulated viewports verify logic/resources/relative rendering; they are not physical-device or FPS certification. Runtime/security/resource assertions remain executable tests.

Release partitions use a default 1000×700 semantic viewport; explicit responsive/measurement viewports retain their own contracts. Per-case PNGs and DOM/action/network/source traces are retained, with continuous trace screencast screenshots disabled to avoid software-GPU timing interference. Hosted release stops at the first failed partition and preserves an incomplete, nonzero report. Each selected engine first renders and reads back a real WebGL2 probe, a nonblank candidate game buffer, and a native player run using the exact candidate bytes. Unsupported renderers fail before the full matrix; this is software/native-browser capability evidence, not a physical-device FPS claim.
