# SPEC-G1 — Combo multiplier (Consecutive eat streaks · Shrinking decay window · Multipliers x1–x5 · Diegetic HUD integration)

> **E03 reconciliation — historical, non-authoritative design.** Current `G1` status: **accepted for the bounded rules-2 release scope** in [ENHANCEMENTS.md](ENHANCEMENTS.md), with executable assertion links and accepted-task provenance. Original detail below is preserved, not a fresh full-release or live-publication claim. [PUBLIC_RELEASE_BACKLOG.md](PUBLIC_RELEASE_BACKLOG.md) DEC02/04/06–10 override conflicting constants, lifecycle, performance and UI clauses.
>
> **Explicit supersession:** B07 supersedes frame-delta combo expiry: simulation deadlines 4500/3900/3300/2700/2400 ms, expiry before an equal-time eat; demo counters are isolated.
>
> **Compatibility:** every mutable `window.*` hook described below is source-test-only behind `__SNAKE_TEST_BUILD__` or injected by the temporary source adapter. Normal source and dist expose no mutable game controls. Old ready/DONE labels, patch commands and historical benchmarks below are not implementation authority. See [recipe/adaptor audit](docs/HISTORICAL_RECIPES.md).


**Historical design status:** preserved original proposal; current bounded scope is reconciled above.
**Backlog:** `ENHANCEMENTS.md` → Gameplay ideas → *"Combo multiplier — consecutive eats inside a shrinking window stack x2/x3/x5, with a visible decay bar. Rewards taking risk instead of just surviving"*, effort S, impact ★★★  
**Depends on:** V4 (eat juice) · V9 (distinct prey silhouettes) · V12 (HUD design)  
**File:** `snake-three.html`  
**Harness:** `tests/check_g1_contracts.mjs`, `tests/test_combo.mjs`  

---

## 1. Problem and Intent

Currently in `snake-three.html`:
1. **Passive / Defensive Play Dominance:** Each prey consumption awards fixed base points (`getPreyPoints()`). Surviving passively in corners or looping safely yields the exact same reward as aggressively navigating through tight coils to snatch food quickly. There is no gameplay tension incentivizing speed, risk-taking, or rapid route planning.
2. **Disconnected Progression Pacing:** Acceleration steps occur every 30 points, but the player has no in-the-moment burst objectives between steps.
3. **Unused HUD Combo Scaffolding:** Enhancement V12 introduced the diegetic `#comboWrapper`, `#comboTrack`, `#comboFill`, and `#comboBadge` along with `HUD_FX.setCombo(multiplier, progress)`. However, no gameplay producer currently feeds into this system.

The intent of **G1** is to introduce a thrilling, high-tempo combo streak loop:
- **Consecutive Eat Multiplier Ladder:** Rapidly consuming food builds a combo streak, elevating the score multiplier through discrete tiers: $\times 1 \to \times 2 \to \times 3 \to \times 4 \to \times 5$ (capped at $\times 5$).
- **Shrinking Decay Window:** Each multiplier level shortens the available window duration to increase urgency:
  - Streak 1 (priming): $4.5\text{ s}$
  - Streak 2 ($\times 2$): $3.9\text{ s}$
  - Streak 3 ($\times 3$): $3.3\text{ s}$
  - Streak 4 ($\times 4$): $2.7\text{ s}$
  - Streak 5+ ($\times 5$ MAX): $2.4\text{ s}$ (clamped floor)
- **Diegetic Real-Time HUD Feed:** Continuous frame updates drive `HUD_FX.setCombo(multiplier, progress)`, causing the glowing golden energy bar to deplete in real-time and display the active multiplier.
- **Sensory Escalation:** Scaled score popups, dynamic particle burst scaling, and intensified impact shake proportional to the combo tier.
- **Strict Isolation & Zero Allocation:** Demo AI attract mode is completely suppressed (no streaks, no HUD feed); combo cleanly freezes during pause; combo cleanly resets on death or restart; zero per-frame runtime allocations in `update(dt)`.

---

## 2. The Four Architectural Pillars

### Pillar 1: Combo Multiplier State & Ladder Mechanics (`COMBO_FX`)
1. **Mathematical Multiplier Ladder:**
   - Multipliers:
     $$\text{multiplier} = \min(5, \text{streak})$$
     - Streak 1: $\times 1$ (base, combo window primed)
     - Streak 2: $\times 2$
     - Streak 3: $\times 3$
     - Streak 4: $\times 4$
     - Streak 5+: $\times 5$ (maximum cap)
2. **Shrinking Window Duration:**
   - The allowed time window $T(\text{mult})$ decreases as the multiplier escalates:
     $$T(\text{mult}) = \max(2.4, 4.5 - (\text{mult} - 1) \times 0.6)\text{ seconds}$$
     - $\times 1$: $4.5\text{ s}$
     - $\times 2$: $3.9\text{ s}$
     - $\times 3$: $3.3\text{ s}$
     - $\times 4$: $2.7\text{ s}$
     - $\times 5$: $2.4\text{ s}$ (clamped floor, maintained for streaks $\ge 5$)
   - Upon consuming prey in `COMBO_FX.onEat()`:
     - If `this.ON === false` or `ATTRACT.active`: returns `1` immediately.
     - If timer is active ($timer > 0$): increments `streak`, computes new `multiplier = min(5, streak)`, and sets `timer = getWindow(multiplier)`.
     - If timer was expired ($timer \le 0$): sets `streak = 1`, `multiplier = 1`, and sets `timer = 4.5`.
     - Returns `multiplier`.
3. **Decay Dynamics in Animation Loop (`COMBO_FX.update(dt)`):**
   - In `animate(now)`:
     - If `this.ON === false` or `state !== 'playing'`: skips decay (freezes timer during pause/game-over).
     - Clamped delta time: $dt_{\text{safe}} = \min(dt, 0.1)$ to prevent tab-switch hitch wipes.
     - $timer \leftarrow \max(0.0, timer - dt_{\text{safe}})$.
     - Multiplier window duration: $W = getWindow(\text{multiplier})$.
     - $progress = \max(0.0, timer / W)$.
     - Calls `HUD_FX.setCombo(multiplier, progress)`.
     - When $timer \le 0$:
       - `streak = 0`.
       - `multiplier = 1`.
       - Dispatches `HUD_FX.setCombo(1, 0.0)` to fade out the HUD meter.

### Pillar 2: Scoring & Juice Escalation Integration
1. **Scoring Formulation in `step()`:**
   - When eating prey:
     $$\text{basePoints} = \text{getPreyPoints()}$$
     $$\text{mult} = (\text{typeof COMBO_FX} \ne 'undefined' \land \text{COMBO_FX.ON}) \ ? \ \text{COMBO_FX.onEat()} : 1$$
     $$\text{awardedPoints} = \text{basePoints} \times \text{mult}$$
     $$\text{score} += \text{awardedPoints}$$
2. **World-Space Score Pop Billboard:**
   - Passed to `popScore(foodMesh.position)`:
     Displays `+${awardedPoints}` (e.g. `+20` for $\times 2$ on common food, `+80` for $\times 2$ on golden food, up to `+200` for $\times 5$ on golden food!).
3. **Escalated Sensory Juice:**
   - Screen shake impulse: `shake = Math.min(shake + 0.22 * mult, 0.75)`.
   - Particle burst count: `burst(..., quality.tier === 'low' ? 12 : 18 + mult * 5)`.

### Pillar 3: Diegetic HUD Synchronization with V12
1. **HUD Feed:**
   - When $\text{multiplier} > 1$ and $timer > 0$:
     - Calls `HUD_FX.setCombo(mult, progress)`.
     - `#comboWrapper` displays `opacity: 1`.
     - `#comboBadge` renders `x2`, `x3`, `x4`, `x5`.
     - `#comboFill` scales smoothly via GPU composite transform `transform: scaleX(progress)`.
2. **Window Expiry:**
   - When $timer \le 0$:
     - Calls `HUD_FX.setCombo(1, 0.0)`.
     - `#comboWrapper` smoothly fades out (`opacity: 0`).

### Pillar 4: Controller Contract (`COMBO_FX`) & Hygiene
1. **Controller Configuration:**
   ```javascript
   const COMBO_FX = {
     ON: true,
     streak: 0,
     multiplier: 1,
     maxMultiplier: 5,
     timer: 0.0,
     duration: 4.5,
     bestStreak: 0,
     getWindow(mult) {
       return Math.max(2.4, 4.5 - (mult - 1) * 0.6);
     },
     onEat() { ... },       // returns current multiplier
     update(dt) { ... },    // ticks decay timer, feeds HUD
     reset() { ... }        // clears streak, timer, and HUD
   };
   window.COMBO_FX = COMBO_FX;
   ```
2. **Attract Mode & State Hygiene:**
   - When `typeof ATTRACT !== 'undefined' && ATTRACT.active`:
     - Demo snake does not increment streaks or feed the HUD.
   - Game over / reset:
     - `COMBO_FX.reset()` cleans active timers and restores multiplier 1.
   - Kill switch:
     - Setting `COMBO_FX.ON = false` disables combo multipliers entirely (returns multiplier 1, suppresses HUD).
   - Zero per-frame runtime allocations in `update(dt)`.

---

## 3. Mathematical & Algorithmic Formulation

### 3.1 Decay & Progress Step
For frame delta $dt$:
$$dt_{\text{safe}} = \min(dt, 0.1)$$
$$timer \leftarrow \max(0, timer - dt_{\text{safe}})$$
$$p = \begin{cases} timer / T(\text{mult}) & \text{if } timer > 0 \\ 0.0 & \text{otherwise} \end{cases}$$

### 3.2 Streak to Multiplier Transition
Upon eat at timestamp $t$:
$$\text{streak} \leftarrow \begin{cases} \text{streak} + 1 & \text{if } timer > 0 \\ 1 & \text{otherwise} \end{cases}$$
$$\text{multiplier} = \min(5, \text{streak})$$
$$T(\text{mult}) = \max(2.4, 4.5 - (\text{multiplier} - 1) \times 0.6)$$
$$timer \leftarrow T(\text{mult})$$

---

## 4. Acceptance Criteria & Test Plan

### 4.1 Static & AST Verification (`tests/check_g1_contracts.mjs`)
- `COMBO_FX` controller defined with `streak`, `multiplier`, `maxMultiplier`, `timer`, `duration`, `getWindow`, `onEat`, `update`, `reset`.
- `window.COMBO_FX` exposed on `window`.
- `step()` incorporates `COMBO_FX.onEat()` in scoring calculation.
- `animate()` invokes `COMBO_FX.update(dt)`.
- `HUD_FX.setCombo` is invoked by `COMBO_FX.update(dt)`.
- Existing contract strings `#score` (`Score: `) and `#best` (`Best: `) are preserved.

### 4.2 Dynamic Acceptance Verification (`tests/test_combo.mjs`)
- **Initial State:** `multiplier = 1`, `streak = 0`, `timer = 0.0`.
- **First Eat:** Consuming 1st prey starts streak 1, `multiplier = 1`, timer = 4.5s.
- **Second Rapid Eat:** Consuming 2nd prey before decay sets `streak = 2`, `multiplier = 2`, timer = 3.9s.
- **HUD Bar Activation:** Active combo reveals `#comboWrapper` with `x2` badge and positive progress.
- **Ladder Progression & Cap at x5:**
  - Streak 3 -> multiplier 3, timer = 3.3s.
  - Streak 4 -> multiplier 4, timer = 2.7s.
  - Streak 5 -> multiplier 5, timer = 2.4s.
  - Streak 6 -> multiplier 5 (capped), timer = 2.4s.
- **Score Multiplier Bonus:** At x2, eating 10-point food adds 20 points to score.
- **Pause Freeze:** Calling `update(dt)` while paused does not decay timer.
- **Timer Decay & Expiry:** Calling `update(dt)` past window duration resets `multiplier` to 1, `streak` to 0, and hides combo bar.
- **Attract Mode Isolation:** Demo AI eats in attract mode return multiplier 1 and do not activate combo bar.
- **Kill Switch:** `COMBO_FX.ON = false` returns multiplier 1 and disables combo updates.
- **Clean Reset:** `reset()` resets multiplier to 1, timer to 0, and clears HUD combo.
- **Full Non-Regression:** Zero failures across all existing test suites (V1–V12).
