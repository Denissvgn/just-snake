# SPEC-V12 — HUD design (Diegetic speed progress meter · Personal best marker · Combo bar · Clean control bar · HUD_FX contracts)

> **E03 reconciliation — historical, non-authoritative design.** Current `V12` status: **accepted for the bounded rules-2 release scope** in [ENHANCEMENTS.md](ENHANCEMENTS.md), with executable assertion links and accepted-task provenance. Original detail below is preserved, not a fresh full-release or live-publication claim. [PUBLIC_RELEASE_BACKLOG.md](PUBLIC_RELEASE_BACKLOG.md) DEC02/04/06–10 override conflicting constants, lifecycle, performance and UI clauses.
>
> **Explicit supersession:** C04 supersedes fixed15-level/score-only speed and mutable previous-best comparisons: active profile maxima15/16/13, captured scoped priorBest, eligible first-positive record, changed-value DOM writes.
>
> **Compatibility:** every mutable `window.*` hook described below is source-test-only behind `__SNAKE_TEST_BUILD__` or injected by the temporary source adapter. Normal source and dist expose no mutable game controls. Old ready/DONE labels, patch commands and historical benchmarks below are not implementation authority. See [recipe/adaptor audit](docs/HISTORICAL_RECIPES.md).


**Historical design status:** preserved original proposal; current bounded scope is reconciled above.
**Backlog:** `ENHANCEMENTS.md` → Ideas, visual → *"HUD design — replace the technical hint line with diegetic readouts: score meter filling toward the next speed step, combo bar, best-score tick mark"*, effort S, impact ★★☆  
**Depends on:** V1 (smooth body tube) · V2 (selective bloom layer mask) · V3 (death as an event) · V4 (eat juice) · V5 (reactive arena) · V6 (sell the speed) · V7 (camera life) · V8 (skin liveliness) · V9 (distinct prey silhouettes) · V10 (attract mode) · V11 (high-tier extras)  
**File:** `snake-three.html`  
**Harness:** `tests/check_v12_contracts.mjs`, `tests/test_hud.mjs`  

---

## 1. Problem and Intent

Currently in `snake-three.html`:
1. **Technical Debug Clutter in Player View:** The bottom-right corner displays `#hint` with the string: `"Bloom + SMAA · Q cycles quality · B toggles bloom · M selective / luminance"`. This is developer diagnostics rather than a clean, immersive player experience.
2. **Invisible Gameplay Acceleration:** The snake game's core tension stems from speed increases (`stepMs = max(62, 115 - floor(score / 30) * 4)`). Every 30 points, `stepMs` drops by 4 ms across 15 distinct speed steps until the minimum 62 ms floor is reached at score 420 (Speed Level 15). Currently, players have no visual feedback on how close they are to the next acceleration milestone until the sudden shift occurs.
3. **Static Best Score & Missing Combo Readiness:** Personal best (`#best`) is displayed as a simple static text line without context, missing the tension of seeing the player's current run approaching or surpassing their record on a visual gauge. Furthermore, the HUD lacks visual readiness for combo streaks and speed milestones.

The intent of **V12** is to implement a modern, diegetic cyberpunk HUD:
- **Diegetic Speed Progression Gauge (`#speedMeter`):** A sleek neon energy meter utilizing GPU-accelerated `transform: scaleX()` that fills from 0% to 100% across each 30-point acceleration bracket (`(score % 30) / 30`), displaying the authoritative speed tier (Levels 1 to 15 MAX) and flashing on level-up.
- **Personal Best Marker & Record State (`#bestMarker`):** Visual indication on the meter when approaching personal best, triggering a radiant "RECORD" state with golden glow once the record is surpassed relative to `previousBest`.
- **Diegetic Combo Bar (`#comboBar`):** Visual container and decaying meter for consecutive eats / combo multipliers (`x2`, `x3`, `x5`), laying the UI framework for gameplay combos.
- **Player-Facing Minimalist Controls Bar (`#hint`):** Replaces the raw developer string with elegant keyboard badges (`[Q] Quality`, `[Space] Pause`, `[B] Bloom`, `[R] Restart`), fading subtly during active motion to keep the playfield distraction-free.
- **Strict Backward Compatibility:** Maintains existing DOM element IDs (`#score`, `#best`, `#tier`, `#hint`) and text formats so all existing test suites (`test_game.mjs`, `test_bloom.mjs`, etc.) continue to pass seamlessly.
- **Zero WebGL Overhead & Reflow Free:** Pure CSS / DOM implementation utilizing hardware-accelerated transforms (`transform: scaleX()`, `opacity`), DOM change-gating to eliminate layout thrashing, and zero Three.js draw calls.

---

## 2. The Four Architectural Pillars

### Pillar 1: Diegetic Speed Progression Meter (`HUD_FX.speedMeter`)
1. **Mathematical Progression Model (15-Speed Ladder):**
   - Base speed: `BASE_STEP_MS = 115`
   - Top speed: `MIN_STEP_MS = 62`
   - Bracket size: `POINTS_PER_LEVEL = 30`
   - Ladder configuration:
     - Speed step index: $\text{stepIndex} = \lfloor \text{score} / 30 \rfloor$
     - Current Level: $L = \min(15, \text{stepIndex} + 1)$
     - Max Speed Condition: $\text{isMaxSpeed} = (L \ge 15 \lor \text{stepMs} \le 62)$
     - Progress fraction towards next level:
       $$p = \begin{cases} 1.0 & \text{if } \text{isMaxSpeed} \\ (\text{score} \pmod{30}) / 30.0 & \text{otherwise} \end{cases}$$
   - Badge text:
     - If $\text{isMaxSpeed}$: `"SPD LVL 15 (MAX)"`
     - Otherwise: `\`SPD LVL ${L}\``
2. **DOM & Styling Architecture (Reflow-Free):**
   - Encapsulated within `#ui`:
     - `#scoreContainer`: Contains `#score` ("Score: 0") and `#best` ("Best: 0").
     - `#meterWrapper`: Houses the progress track `#speedTrack` and fill bar `#speedFill`.
     - `#speedFill`: Styled with `transform: scaleX(var(--speed-prog, 0)); transform-origin: left; will-change: transform;`.
     - `#levelBadge`: Displays current speed level.
   - Accessibility: `#speedTrack` carries `role="progressbar"`, `aria-label="Speed progression"`, `aria-valuemin="0"`, `aria-valuemax="100"`.
   - Reduced motion: `@media (prefers-reduced-motion: reduce)` disables animations and pulse transitions.

### Pillar 2: Personal Best Marker & Milestone Feedback (`HUD_FX.bestMarker`)
1. **Run Snapshot & Record Trigger:**
   - At run start (`startGame()`), snapshot `previousBest = best`.
   - During play:
     - If `previousBest > 0 && score > previousBest` (or `previousBest === 0 && score >= 30`):
       - Sets `HUD_FX.isRecord = true`.
       - Adds `.new-record` class to `#score` and `#best`.
       - Applies golden bioluminescence (`color: #fef08a`, `text-shadow: 0 0 12px rgba(254, 240, 138, 0.7)`).
2. **Milestone Level-Up Pop:**
   - When $L > \text{lastLevel}$, `#levelBadge` triggers `.level-up` animation:
     - Scale pop $1.0 \to 1.32 \to 1.0$.
     - Automatically removes class on `animationend`.

### Pillar 3: Diegetic Combo Bar (`HUD_FX.comboBar`)
1. **Visual Architecture:**
   - Positioned beneath or adjacent to `#meterWrapper`:
     - `#comboWrapper`: Container with `opacity: 0` when inactive.
     - `#comboTrack`: Track housing `#comboFill`.
     - `#comboBadge`: Displays current multiplier, e.g. `"x2"`, `"x3"`, `"x5"`.
     - `#comboFill`: Scaled via `transform: scaleX(var(--combo-prog, 0))`.
2. **Controller API:**
   - `HUD_FX.setCombo(multiplier, progress)`:
     - When `multiplier > 1` and `progress > 0`: reveals `#comboWrapper` (`opacity: 1`), updates `--combo-prog`, and updates badge text.
     - When combo expires (`progress <= 0`): smoothly fades out `#comboWrapper` (`opacity: 0`).

### Pillar 4: Player Controls Bar & HUD Controller Contracts (`HUD_FX`)
1. **Clean Minimalist Control Badges (`#hint`):**
   - Retains `#hint` element ID, replacing developer string with styled keycaps:
     - `<span class="key">Q</span> Quality`
     - `<span class="key">Space</span> Pause`
     - `<span class="key">B</span> Bloom`
     - `<span class="key">R</span> Restart`
   - Dynamic motion dimming: when snake is moving, `#hint` dims to `opacity: 0.35`; restores to `0.95` on hover, pause, or game start/end.
2. **Controller Contract (`HUD_FX`):**
   ```javascript
   const HUD_FX = {
     ON: true,
     speedMeter: true,
     bestMarker: true,
     comboBar: true,
     speedLevel: 1,
     speedProgress: 0.0,
     isRecord: false,
     comboMultiplier: 1,
     comboProgress: 0.0,
     comboActive: false,
     lastScore: -1,
     lastBest: -1,
     lastLevel: 1,
     update(score, best, stepMs) { ... },
     setCombo(multiplier, progress) { ... },
     reset() { ... }
   };
   window.HUD_FX = HUD_FX;
   ```
3. **Change-Gating & Zero DOM Thrashing:**
   - `HUD_FX.update(score, best, stepMs)` compares against `lastScore`, `lastBest`, and `lastLevel`.
   - Skips DOM mutations when inputs are unchanged.
   - Updates CSS variables directly on parent node (`--speed-prog`, `--combo-prog`).

---

## 3. Mathematical & Algorithmic Formulation

### 3.1 Authoritative Speed Level & Progress
Given `score` $\ge 0$ and `stepMs`:
$$\text{stepIndex} = \lfloor \text{score} / 30 \rfloor$$
$$L = \min(15, \text{stepIndex} + 1)$$
$$\text{isMax} = (L \ge 15 \lor \text{stepMs} \le 62)$$
$$p = \begin{cases} 1.0 & \text{if } \text{isMax} \\ (\text{score} - \text{stepIndex} \times 30) / 30.0 & \text{otherwise} \end{cases}$$

---

## 4. Acceptance Criteria & Test Plan

### 4.1 Static & AST Verification (`tests/check_v12_contracts.mjs`)
- `HUD_FX` controller defined with `speedMeter`, `bestMarker`, `comboBar`, `update`, `setCombo`, and `reset`.
- `window.HUD_FX` exposed on `window`.
- HTML elements exist: `#speedFill`, `#speedTrack`, `#levelBadge`, `#comboWrapper`, `#comboFill`, `#hint`.
- `updateScore()` invokes `HUD_FX.update(score, best, stepMs)`.
- Existing contract strings `#score` (`Score: `), `#best` (`Best: `), `#tier` are preserved.

### 4.2 Dynamic Acceptance Verification (`tests/test_hud.mjs`)
- **Initial State:** `score = 0`, `speedLevel = 1`, `speedProgress = 0.0`, `--speed-prog` is 0.
- **Progress Within Bracket:** At `score = 15`, `speedLevel = 1`, `speedProgress = 0.5` (50% fill).
- **Speed Level Up:** At `score = 30`, `speedLevel = 2`, `speedProgress = 0.0`.
- **Level 15 Max Speed:** At `score = 420`, `speedLevel = 15`, `speedProgress = 1.0` and badge displays `"SPD LVL 15 (MAX)"`.
- **Personal Best Record:** When `score > previousBest`, `HUD_FX.isRecord === true` and `.new-record` class is present.
- **Combo Bar API:** Invoking `HUD_FX.setCombo(2, 0.75)` activates `#comboWrapper`, displays `"x2"`, and sets `--combo-prog: 0.75`.
- **Controls Bar Styling:** `#hint` contains `<span class="key">` elements and dims during motion.
- **Clean Reset:** `reset()` resets level to 1, progress to 0, and clears record state.
- **Full Non-Regression:** V1–V11 test suites continue to pass with 0 failures.
