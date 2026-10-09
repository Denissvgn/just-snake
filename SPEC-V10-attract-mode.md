# SPEC-V10 — Attract mode (Autonomous demo snake · Greed/safety pathfinder · Seamless player takeover)

> **E03 reconciliation — historical, non-authoritative design.** Current `V10` status: **accepted for the bounded rules-2 release scope** in [ENHANCEMENTS.md](ENHANCEMENTS.md), with executable assertion links and accepted-task provenance. Original detail below is preserved, not a fresh full-release or live-publication claim. [PUBLIC_RELEASE_BACKLOG.md](PUBLIC_RELEASE_BACKLOG.md) DEC02/04/06–10 override conflicting constants, lifecycle, performance and UI clauses.
>
> **Explicit supersession:** B05/B07 supersede any player RNG/HUD/clock sharing and arbitrary-key takeover: isolated demo streams/context/metrics/feedback, bounded terminal reset, mapped legal first direction and fresh player tuple.
>
> **Compatibility:** every mutable `window.*` hook described below is source-test-only behind `__SNAKE_TEST_BUILD__` or injected by the temporary source adapter. Normal source and dist expose no mutable game controls. Old ready/DONE labels, patch commands and historical benchmarks below are not implementation authority. See [recipe/adaptor audit](docs/HISTORICAL_RECIPES.md).


**Historical design status:** preserved original proposal; current bounded scope is reconciled above.
**Backlog:** `ENHANCEMENTS.md` → Ideas, visual → *"Attract mode — a greedy-AI demo snake playing behind the blurred title panel (~30 lines of AI); first impression doubles as a tutorial"*, effort M, impact ★★☆  
**Depends on:** V1 (smooth body tube) · V2 (selective bloom layer mask) · V3 (death as an event) · V4 (eat juice) · V5 (reactive arena) · V6 (sell the speed) · V7 (camera life) · V8 (skin liveliness) · V9 (distinct prey silhouettes)  
**File:** `snake-three.html`  
**Harness:** `tests/check_v10_contracts.mjs`, `tests/test_attract.mjs`  

---

## 1. Problem and Intent

Currently in `snake-three.html`:
1. **Static First Impression:** On initial page load (and after returning to the title screen), the snake sits completely frozen as 3 static segments on a dark board. The player cannot witness any of the visual features (continuous Catmull-Rom tube body, grazing-angle thin-film iridescence, slither muscle roll, floor wake, velocity camera parallax, or distinct prey silhouettes) until they manually start a run.
2. **Missing Arcade Attract Loop:** Classic arcade titles feature an autonomous "attract mode" where a demo game plays in the background behind the title logo, doubling as an immediate visual tutorial showing how the snake maneuvers and consumes prey.
3. **No Dynamic Waiting State:** If left unattended on the title screen, the canvas renders an unchanging scene with zero kinetic life.

The intent of **V10** is to introduce a dedicated, lightweight autonomous attract mode:
- On initial boot (and idle waiting periods), an autonomous AI demo snake slithers and navigates the board behind the translucent, blurred title overlay.
- Uses a deterministic, allocation-free greedy pathfinding algorithm with safety flood checks to seek prey while avoiding walls and self-collisions.
- Instantly yields to player controls upon any keypress, click, or touch event, transitioning into active gameplay without latency or state corruption.
- Operates under strict score isolation (attract score never dirties `best` or writes to `localStorage['threejs-snake-best']`).

---

## 2. The Three Architectural Pillars

### Pillar 1: Autonomous Greed & Safety Pathfinder (`attractStep()`)
The demo snake computes its next directional vector in `attractStep()` prior to calling the game `step()`:
1. **Candidate Move Evaluation:**
   Given current head coordinate $(x_h, z_h)$, evaluates 4 orthogonal neighbor directions:
   $$\vec{d} \in \{ (1, 0), (-1, 0), (0, 1), (0, -1) \}$$
   Discards reversals ($\vec{d} = -\vec{dir}$).
2. **Collision Pruning & Tail Clearance:**
   Let $(x_c, z_c) = (x_h + d_x, z_h + d_z)$ be a candidate step cell.
   - Out of bounds check: $x_c < 0 \lor x_c \ge \text{GRID} \lor z_c < 0 \lor z_c \ge \text{GRID}$.
   - Self-collision check with eating awareness:
     - If $(x_c, z_c) == (\text{food}.x, \text{food}.z)$, food will be consumed and the snake expands; thus, the current tail cell $\text{segs}[\text{len}-1]$ remains occupied. Candidate cannot enter any segment in $\text{segs}_{0..\text{len}-1}$.
     - If $(x_c, z_c) \ne (\text{food}.x, \text{food}.z)$, the tail cell will be vacated upon movement. Candidate cannot enter any segment in $\text{segs}_{0..\text{len}-2}$, but may enter $\text{segs}[\text{len}-1]$.
3. **Target Attraction with Safety Flood Checks:**
   - **Greedy heuristic:** Computes Manhattan distance to target prey:
     $$h(x_c, z_c) = |x_c - \text{food}.x| + |z_c - \text{food}.z|$$
   - **Connected component flood fill:** To avoid trapping itself in self-coiled pockets, each candidate cell undergoes a bounded flood fill (using a pre-allocated 441-element `Uint8Array` stamped per step, traversing up to $\text{len} + 2$ reachable cells). Candidates with reachable area $\ge \text{len}$ are marked safe.
   - **Selection policy:**
     - Selects the safe candidate with the minimum distance $h$.
     - If no safe candidate leads toward food, selects the candidate maximizing open space (longest survival path).
     - If completely trapped (no legal moves), triggers an autonomous attract restart (`resetAttract()`) smoothly repositioning the snake at center board.
4. **Relaxed Cadence & Length Cap:**
   - Attract mode steps at a comfortable, observable tempo ($\text{stepMs} = 135\text{ ms}$, $\approx 7.4\text{ cells/s}$), showcasing the snake's biological motion.
   - To prevent unbounded body length or buffer drift during prolonged idle display, attract mode automatically resets when $\text{len} \ge 24$ or after 15 successful prey eats.

### Pillar 2: Seamless Player Takeover & Zero-Latency Transition
1. **Interactive Event Interception:**
   Any player input event:
   - Keydown: Arrow keys, WASD, Space, or Enter
   - Pointer: Click on "Start game" button or canvas tap/swipe
   immediately triggers `stopAttract()` followed by `startGame()`.
2. **Clean Game Reset:**
   - Resets board coordinates, segment history, camera targets, and prey to default starting positions.
   - Clears input buffers.
   - Hides overlay.
   - First player step executes exactly on player command with zero carryover from attract mode.
3. **Score & Storage Isolation:**
   - Scores accumulated during attract mode do not invoke `saveBest()` or modify `localStorage['threejs-snake-best']`.
   - The HUD preserves the true player `Best` record.

### Pillar 3: Visual Presentation & Idle Re-Engagement
1. **Translucent Backdrop Synergy:**
   The existing `#overlay` styling (`background: rgba(2, 6, 23, 0.58); backdrop-filter: blur(4px);`) naturally reveals the illuminated 3D arena behind the panel.
2. **Full Kinetic System Activation:**
   In attract mode, all kinetic rendering systems are active:
   - `motionFactor = 1.0` drives Catmull-Rom tube deformation and scale normal map UV scrolling.
   - Grazing-angle iridescence highlights glancing body curvature.
   - Slither muscle roll provides biological banking.
   - Camera parallax lead subtly frames the heading.
   - Floor trail quads illuminate path wakes.
   - Prey idle bobs, shimmers, twitches, and executes escape hops.
   - Prey consumption triggers V4 shockwaves and squash-pops.
3. **Attract Idle Timer:**
   If the player remains on the Game Over screen or ready screen for $> 15.0\text{ s}$ of wall-clock time without interaction, attract mode automatically reactivates.

---

## 3. Data Structures and Controller Interface

```javascript
const ATTRACT = {
  ON: true,
  active: false,
  stepMs: 135,
  eats: 0,
  idleTimer: 0.0,
  IDLE_TIMEOUT: 15.0,
  lastInteraction: performance.now(),
  dirs: [
    { x: 1, z: 0 },
    { x: -1, z: 0 },
    { x: 0, z: 1 },
    { x: 0, z: -1 }
  ],
  gridVisited: new Uint8Array(441)
};
```

### Lifecycle Functions
- `buildAttract()`: Initializes the attract controller, allocates flood-fill buffers, and registers test hooks.
- `startAttract()`: Activates attract mode behind the title overlay, initializes demo snake and food.
- `stopAttract()`: Stops attract mode, resets state flags.
- `attractStep()`: Evaluates board state, picks the safest directional move towards prey, and executes `step()`.
- `updateAttract(dt)`: Advances attract step timer when active, or checks wall-clock idle timeout when inactive.
- `resetAttract()`: Re-initializes attract board state if trapped or length cap reached.

---

## 4. Headless & Test Contracts

The following hooks must be exposed on `window`:
- `window.ATTRACT`: The attract mode controller.
- `window.startAttract()`: Manually triggers attract mode.
- `window.stopAttract()`: Manually halts attract mode.
- `window.attractStep()`: Executes a single autonomous AI step.
- `window.getAttractState()`: Returns `{ active, eats, dir, head, food, safeMoves, candidateSafety }`.
- `window.resetAttract()`: Resets attract mode state.

---

## 5. Measured Acceptance Criteria

| # | Criterion | Verification Contract | Target / Tolerance | Performance Budget |
|---|---|---|---|---|
| 1 | **Autonomous Navigation** | Invoking `attractStep()` steps the snake toward food without wall collisions. | Distance to food non-increasing over 4-step window | 0 GC allocations / step |
| 2 | **Prey Seeking Efficiency** | When prey is placed 6 cells away on a clear board, demo snake consumes it within 10 steps. | `eats >= 1` in $\le 10$ steps | < 0.5 ms / step |
| 3 | **Self-Collision Avoidance** | Demo snake with length $\ge 8$ avoids self-collision into body segments and respects eating-aware tail occupancy. | 0 self-collisions over 30 steps | 0 GC allocations |
| 4 | **Immediate Player Takeover** | Calling `startGame()` or clicking `#actionBtn` halts attract mode, starts player game with clean length 3. | `ATTRACT.active === false`, `state === 'playing'`, `len === 3` | 0 frame hitch |
| 5 | **Score Isolation** | Score gained in attract mode never calls `saveBest()` or modifies `localStorage['threejs-snake-best']`. | `localStorage['threejs-snake-best']` untouched | 0 disk writes |
| 6 | **Clean Reset on Trap / Cap** | Trapped state or $\text{len} \ge 24$ gracefully re-spawns snake without triggering Game Over modal or halting loop. | Continuous motion, 0 overlay state change | 0 persistent draw call growth |
| 7 | **Zero Memory Allocation** | Neighbor evaluation and flood arrays use pre-allocated typed arrays; `attractStep()` creates zero temporary heap objects. | 0 bytes GC / step | 0 new shader programs |
