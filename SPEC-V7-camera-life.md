# SPEC-V7 — Camera life (velocity parallax · growth zoom · cinematic death framing)

> **E03 reconciliation — historical, non-authoritative design.** Current `V7` status: **accepted for the bounded rules-2 release scope** in [ENHANCEMENTS.md](ENHANCEMENTS.md), with executable assertion links and accepted-task provenance. Original detail below is preserved, not a fresh full-release or live-publication claim. [PUBLIC_RELEASE_BACKLOG.md](PUBLIC_RELEASE_BACKLOG.md) DEC02/04/06–10 override conflicting constants, lifecycle, performance and UI clauses.
>
> **Explicit supersession:** B03 and its D01-discovered follow-up supersede incomplete motion gating/fixed portrait fog: stable fitted rendered camera and continuous fit-relative fog, desktop30/66 preserved.
>
> **Compatibility:** every mutable `window.*` hook described below is source-test-only behind `__SNAKE_TEST_BUILD__` or injected by the temporary source adapter. Normal source and dist expose no mutable game controls. Old ready/DONE labels, patch commands and historical benchmarks below are not implementation authority. See [recipe/adaptor audit](docs/HISTORICAL_RECIPES.md).


**Historical design status:** preserved original proposal; current bounded scope is reconciled above.
**Backlog:** `ENHANCEMENTS.md` → Ideas, visual → *"Camera life"*, effort S, impact ★★☆  
**Depends on:** V1 (smooth body tube) · V2 (selective bloom layer mask) · V3 (death as an event) · V4 (eat juice) · V5 (reactive arena) · V6 (sell the speed)  
**File:** `snake-three.html`  
**Harness:** `tests/check_v7_contracts.mjs`, `tests/test_camera.mjs`  

---

## 1. Problem and Intent

Currently in `snake-three.html`, the camera behavior is largely static:
1. **No Anticipation / Velocity Lead:** `camOffset` only lazily follows `head.rp` position. When the snake turns or drives toward a wall at 16 cells/s, the camera does not look ahead into the direction of travel, making the scene feel like a detached overhead camera rather than an engaged director.
2. **Cramped Late-Game Framing:** As the snake grows from 3 to 50+ segments, the camera distance and altitude remain completely fixed at `camBase`. As a result, long snakes fill the entire screen, making it difficult for the player to read open corridors and tail paths.
3. **Static Death Perspective:** On collision death, debris scatters with realistic physics, the arena pulses, and the screen dilates with slow-motion, but the camera viewpoint stays static and disengaged. It does not push into the collision site or tilt with impact momentum.

---

## 2. The Three Visual Pillars

### Pillar 1: Velocity Parallax & Directional Look-Ahead
- **Heading Lead:** The camera smoothly anticipates the snake's travel direction $\mathbf{v}_{\text{dir}} = (dir.x, dir.z)$.
- **Lead Offset:**
  $$\mathbf{lead}_{\text{target}} = (dir.x \cdot 0.85, dir.z \cdot 0.75)$$
  Smoothed per frame in `drawCamera(dt)`:
  $$\mathbf{lead} \leftarrow \mathbf{lead} + (\mathbf{lead}_{\text{target}} - \mathbf{lead}) \cdot (1 - \text{pow}(0.01, dt))$$
- **Look-At Lead:** The camera look-at target incorporates the lead offset:
  $$\mathbf{lookGoal} = (camOffset.x \cdot 1.1 + \mathbf{lead}.x, 0.0, camOffset.z \cdot 1.1 + \mathbf{lead}.z)$$
- **Subtle Camera Body Drift:** The physical camera position also shifts subtly into the motion:
  $$\Delta x_{\text{lead}} = \mathbf{lead}.x \cdot 0.28, \quad \Delta z_{\text{lead}} = \mathbf{lead}.z \cdot 0.22$$

### Pillar 2: Dynamic Growth Zoom-Out
- **Snake Length Scaling:** Let $L = \text{segs.length}$. As the snake lengthens from $L_{\text{min}} = 3$ to $L_{\text{max}} = 50$:
  $$k_{\text{growth}} = \text{clamp}\left(\frac{L - 3}{47}, 0.0, 1.0\right)$$
- **Smooth Easing:** Growth offset transitions smoothly without sudden pops when food is eaten:
  $$g_{\text{smooth}} \leftarrow g_{\text{smooth}} + (k_{\text{growth}} - g_{\text{smooth}}) \cdot (1 - \text{pow}(0.02, dt))$$
- **Offsets:**
  $$\Delta y_{\text{growth}} = +2.8 \cdot g_{\text{smooth}}$$
  $$\Delta z_{\text{growth}} = +2.2 \cdot g_{\text{smooth}}$$
- This maintains comfortable view margins around the entire snake body at late-game lengths.

### Pillar 3: Cinematic Death Push-In & Dutch Roll
- **Impact Tracking & Push-In:** When `DEATH.active` is true or `state === 'over'`:
  - Normalized death animation progress: $\tau_{\text{death}} = \text{clamp}(\text{DEATH.t} / 1000.0, 0.0, 1.0)$.
  - Ease-out factor: $e_{\text{death}} = 1.0 - (1.0 - \tau_{\text{death}})^3$.
  - Push-in altitude and distance deltas:
    $$\Delta y_{\text{death}} = -2.2 \cdot e_{\text{death}}$$
    $$\Delta z_{\text{death}} = -2.6 \cdot e_{\text{death}}$$
  - Look-at target gently shifts toward the recorded impact world coordinates `DEATH.impact` ($x, z$).
- **Dutch Roll Tilt (`camera.rotation.z`):**
  - Upon impact, a directional roll impulse is triggered based on impact normal / parity:
    $$\text{rollSign} = (dir.x \ne 0) ? (dir.x > 0 ? 1 : -1) : (dir.z > 0 ? -1 : 1)$$
    $$\text{targetRoll} = \text{rollSign} \cdot 0.055 \quad (\approx \pm 3.15^\circ)$$
  - Decaying sine wave envelope:
    $$\text{envelope}(\tau) = \sin(\pi \cdot \tau) \cdot e^{-1.2 \cdot \tau}$$
    The envelope peaks at $\tau \approx 0.383$ with amplitude $0.590$, yielding a peak roll tilt of $\approx \pm 0.0325\text{ rad}$ ($1.86^\circ$).
  - **CRITICAL ORDERING CONTRACT:** In Three.js, calling `camera.lookAt(...)` internally recalculates the camera rotation quaternion and zeros out `camera.rotation.z`. Therefore, `camera.rotation.z = CAMERA_LIFE.deathRoll` **MUST be executed strictly AFTER `camera.lookAt(lookAt)`**.

---

## 3. Architecture & Data Structures

All camera visual dynamics state is encapsulated in `CAMERA_LIFE`:

```javascript
const CAMERA_LIFE = {
  ON: true,
  lead: { x: 0, z: 0 },
  targetLead: { x: 0, z: 0 },
  growthFactor: 0.0,
  currentGrowth: 0.0,
  deathProgress: 0.0,
  deathRoll: 0.0,
  rollSign: 1,
  // Offsets computed per frame
  offset: { x: 0, y: 0, z: 0 },
  lookLead: { x: 0, z: 0 }
};
```

### Composition Order in `drawCamera(dt)`:
```javascript
// 1. Evaluate V6 Dynamic FOV and Dolly Kick
SPEED_FX.speedFactor = getSpeedFactor();
const targetFov = SPEED_FX.baseFov + 7.0 * SPEED_FX.speedFactor;
const fovSmooth = 1 - Math.pow(0.002, dt);
SPEED_FX.currentFov += (targetFov - SPEED_FX.currentFov) * fovSmooth;
const activeKick = (state !== 'over') ? SPEED_FX.fovKick : 0;
const newFov = SPEED_FX.currentFov + activeKick;
if (Math.abs(camera.fov - newFov) > 0.01) {
  camera.fov = newFov;
  camera.updateProjectionMatrix();
}

// 2. Evaluate V7 Camera Life Offsets
updateCameraLife(dt);

// 3. Compose Final Position
const speedY = -0.45 * SPEED_FX.speedFactor;
camera.position.set(
  camBase.x + camOffset.x + jx + CAMERA_LIFE.offset.x,
  camBase.y + jy + speedY + CAMERA_LIFE.offset.y,
  camBase.z + camOffset.z * 0.6 + jx * 0.4 + CAMERA_LIFE.offset.z
);

// 4. Update Look Target with Velocity Parallax
lookGoal.set(
  camOffset.x * 1.1 + CAMERA_LIFE.lookLead.x,
  0,
  camOffset.z * 1.1 + CAMERA_LIFE.lookLead.z
);
lookAt.lerp(lookGoal, smooth);
camera.lookAt(lookAt);

// 5. Apply Dutch Roll Tilt (STRICTLY AFTER lookAt)
if (CAMERA_LIFE.deathRoll !== 0) {
  camera.rotation.z = CAMERA_LIFE.deathRoll;
}
```

---

## 4. Headless & Test Contracts

The following hooks must be exposed on `window`:
- `window.CAMERA_LIFE`: The controller object.
- `window.resetCameraLife()`: Resets all camera life offsets and rotation.
- `window.setTestSnakeLength(len)`: Helper to test growth zoom without eating 40 food items in tests.
- `window.triggerCameraDeath(pos, dir)`: Helper to manually trigger cinematic death framing.
- `window.getCameraState()`: Returns current camera position, fov, rotation, and calculated offsets.

---

## 5. Measured Acceptance Criteria

| # | Criterion | Verification Contract | Target / Tolerance | Performance Budget |
|---|---|---|---|---|
| 1 | **Velocity Parallax Lead** | Heading in direction $(1, 0)$ produces positive x look lead; heading in $(0, -1)$ produces negative z look lead. | $\|\mathbf{lead}\| > 0.35$ within 0.3s | 0 draw calls |
| 2 | **Dynamic Growth Zoom-Out** | Scaling snake length from 3 to 48 increases camera altitude ($+2.0$ to $+2.8$ units) and distance ($+1.5$ to $+2.2$ units). | $\Delta y \ge 1.8$, $\Delta z \ge 1.4$ | 0 draw calls |
| 3 | **Cinematic Death Push-In** | On death, camera pushes in toward impact: altitude drops $\ge 1.0$ units and distance pulls in $\ge 1.2$ units. | $\Delta y_{\text{death}} \le -1.0$, $\Delta z \le -1.2$ | 0 draw calls |
| 4 | **Dutch Roll Impulse** | On death impact, `camera.rotation.z` tilts to $|\text{roll}| \in [0.015, 0.055]$ rad (approx $0.9^\circ - 3.15^\circ$), returning to zero. | Peak $|\text{roll}| \ge 0.015\text{ rad}$ | 0 draw calls |
| 5 | **Clean Reset** | Calling `resetCameraLife()` or starting new game restores `camera.rotation.z === 0`, zero lead, and base framing. | `rotation.z === 0`, $\|\text{offset}\| < 0.001$ | 0 draw calls |
| 6 | **Decoupled Viewport Resizing** | `fitCamera()` recalculations do not trigger feedback loops or jitter in growth/lead offsets. | Max-min variance $< 10^{-4}$ | 0 draw calls |
| 7 | **Zero Memory Allocation** | Zero runtime object allocations inside `drawCamera()` or `updateCameraLife()`. Pre-allocated scratch vectors. | 0 bytes GC / frame | 0 programs |\n