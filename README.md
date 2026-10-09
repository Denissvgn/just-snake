# just-snake

A glowing 3D snake game with three difficulty modes, daily challenges, and scores saved on your device.

Eat prey, avoid your tail, and reach length 60. Classic has walls and pillars; Calm wraps around walls; Frenzy is faster and has two prey. Common prey gives 10 points, golden prey gives 40 points for six seconds before becoming common, and jittery prey gives 20 points and one escape hop. Quick consecutive eats build combos up to ×5.

Move with Arrow keys or WASD; settings also offers IJKL. Pause with Space and open settings with Esc. On touch screens, drag anywhere on the arena to steer and lift to move your thumb. Settings includes sound, feedback, accessibility options and collapsed Advanced graphics. Reduced motion keeps essential snake movement while suppressing camera and presentation effects.

Scores and settings stay on this device and browser. Rankings separate modes and casual/custom/daily challenges; earlier-rules scores are archived separately. There are no accounts or global rankings. If storage is unavailable, scores remain usable for the current session. Sharing copies a completed challenge card with its concrete seed, mode and rules; a readonly text field is available when clipboard access fails.

Use native ARM64 Node 24 and the committed lockfiles:

```sh
npm ci
npm ci --prefix tests
npm run test:install-browsers
npm run serve
```

Open the local URL printed by the server. `snake-three.html` is the canonical source; the source server resolves its Three.js imports from installed packages. Production bundles all runtime dependencies locally:

```sh
npm run build
npm run check:dist
SERVE_ROOT="$PWD/dist" SERVE_PREFIX=/just-snake/ npm run serve
```

Publish only the checked `dist/` directory. Its `index.html` and `snake-three.html` alias preserve challenge queries. Tests, reports, local tools and dependency directories are excluded.

```sh
npm run test:static
npm run test:legacy
npm run test:release
node tests/helpers/social-preview.mjs
node tests/helpers/performance-benchmark.mjs --phase before --engine chromium
```

The social helper regenerates `assets/social-preview.png` from fixed local gameplay and system typography; rebuild afterward. See [test infrastructure](tests/README.md), [rendering measurements](docs/PERFORMANCE.md) and [publishing procedure](PUBLISHING.md). Browser evidence uses native ARM64 Chromium/Firefox/WebKit; Chromium SwiftShader measurements are software rendering evidence. Emulated viewports and browser touch input are not physical iOS/Android certification. WebGL is required; optional audio, vibration, fullscreen and clipboard capabilities degrade without preventing play.

No reuse license has been granted for the original game code; no source license file is currently present. Exact bundled dependency licenses are in [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt). A repository/deployment target has not yet been verified, so no invented canonical, issue-tracker or live-game URL is provided.

Release tooling: `npm run qualify -- --phase prepare --output .artifacts/candidate` builds a frozen candidate; prepare/test/assemble never grant independent acceptance. See [qualification procedure](docs/RELEASE_QUALIFICATION.md). `npm run publish:discover` reads existing GitHub configuration, and `npm run verify:live -- <verified-site-directory-url> <candidate.json>` verifies served bytes and player flow. Neither publishes code. For CI or fresh native installs, use `PUPPETEER_SKIP_DOWNLOAD=true npm ci --prefix tests`; legacy tests resolve installed Playwright Chromium.
