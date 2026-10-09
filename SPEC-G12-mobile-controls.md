# SPEC-G12 — Mobile Experience (Radial Pad, Touch-Action, Haptics & Fullscreen)

> **E03 reconciliation — historical, non-authoritative design.** Current `G12` status: **accepted for the bounded rules-2 release scope** in [ENHANCEMENTS.md](ENHANCEMENTS.md), with executable assertion links and accepted-task provenance. Original detail below is preserved, not a fresh full-release or live-publication claim. [PUBLIC_RELEASE_BACKLOG.md](PUBLIC_RELEASE_BACKLOG.md) DEC02/04/06–10 override conflicting constants, lifecycle, performance and UI clauses.
>
> **Explicit supersession:** B10/C02 supersede blanket mobile certification: one primary captured pointer, 20 CSS px, queue3 and reentrant-safe cleanup; optional APIs degrade safely, canvas-only suppression and native modal scrolling. Browser-input evidence is not physical-device certification.
>
> **Compatibility:** every mutable `window.*` hook described below is source-test-only behind `__SNAKE_TEST_BUILD__` or injected by the temporary source adapter. Normal source and dist expose no mutable game controls. Old ready/DONE labels, patch commands and historical benchmarks below are not implementation authority. See [recipe/adaptor audit](docs/HISTORICAL_RECIPES.md).


**Historical design status:** preserved original proposal; current bounded scope is reconciled above.
**Backlog:** `ENHANCEMENTS.md` → Gameplay ideas → *"G12 Mobile"*, effort S, impact ★★★  
**Depends on:** G9 (settings menu), G10 (accessibility), G11 (audio & user gestures), V12 (HUD design)  
**File:** `snake-three.html`  
**Harness:** `tests/check_g12_contracts.mjs`, `tests/test_mobile.mjs`

---

## 1. Problem and Intent

Currently in `snake-three.html`:
1. **Pull-to-Refresh & Pinch Gestures Hijacking Gameplay:** The canvas lacks `touch-action: none`. On mobile browsers (Safari on iOS, Chrome on Android), swiping down triggers pull-to-refresh, while rapid multi-touch triggers unintended viewport zooming and page scrolling.
2. **Invisible Swiping & Lack of Spatial Feedback:** The existing touch listener is an invisible line between pointerdown and pointerup. The player receives zero visual feedback about where their touch started, how far they've dragged, or which direction is currently selected.
3. **Delayed Direction Changes:** Directions only resolve on `pointerup` (lifting the finger). On mobile, responsive arcade play requires immediate continuous steering when the finger crosses the deflection threshold without lifting.
4. **Missing Tactile Feedback (Haptics):** Mobile devices feature vibration motors capable of crisp tactile reinforcement. Currently, deaths and food consumption have zero haptic engagement.
5. **Screen Real Estate on Mobile (iOS / Android):** Browser address bars and navigation bars consume substantial screen space. A dedicated fullscreen toggle is needed.

---

## 2. The Four Pillars of G12

### Pillar 1: Touch-Action & Viewport Guard
- Enforce strict CSS rules on canvas and root viewport:
  ```css
  canvas {
    display: block;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }
  ```
- Prevents pull-to-refresh, pinch zoom, text selection, and gesture conflict across all mobile browsers.

### Pillar 2: Dynamic Radial Pad (Virtual Thumbstick HUD)
- **Diegetic Radial Pad Element (`#radialPad`):**
  - Outer ring: 110px diameter with translucent glowing border (`rgba(56, 189, 248, 0.4)`), radial gradient backdrop, and backdrop blur.
  - Floating knob (`.radial-knob`): 32px diameter glowing cyan thumb indicator that smoothly tracks finger deflection up to a 36px radius limit.
  - Directional pips (`.radial-pip`): 4 directional indicators (▲, ▼, ◀, ▶) that illuminate brightly (`.active`) when the deflection vector points towards them.
- **Gesture Lifecycle:**
  - `pointerdown`: Fades in `#radialPad` anchored directly at touch coordinates $(x, y)$.
  - `pointermove`: Continuously deflects knob. When deflection exceeds $\ge 20\text{px}$, immediately queues the corresponding directional turn (`queueDir`) without waiting for release, activating haptic feedback and highlighting the pip.
  - `pointerup` / `pointercancel`: Fades out `#radialPad` with a 180ms ease transition.

### Pillar 3: Procedural Mobile Haptics
- Centralized haptic dispatcher via `navigator.vibrate`:
  - **Death Crash (`'death'`):** Heavy impact pattern `[60, 40, 100]`.
  - **Prey Eaten (`'eat'`):** Crisp tactile micro-pulse `18ms`.
  - **Direction Swipe (`'swipe'`):** Subtle tick `10ms`.
- Safe degradation: Wrapped in feature detection (`if (navigator.vibrate)`) with `try / catch` so unsupported devices or restricted frames never throw.
- Settings Integration: Respects `SETTINGS.haptics` with toggle pill in settings modal and persistence in `localStorage`.

### Pillar 4: Dedicated Fullscreen Action & Controller Contracts
- **Header Button (`#fullscreenBtn`):**
  - Placed in top-right header alongside `#settingsBtn`.
  - Toggles between fullscreen and windowed modes using `requestFullscreen()` and `exitFullscreen()`, with webkit fallbacks.
  - Automatically updates icon and label (`⛶ Fullscreen` / `🗗 Windowed`) responding to `fullscreenchange` events.
- **Centralized `MOBILE` Controller:**
  - Manages pad visibility, deflection tracking, haptics, and fullscreen status.
  - Exposes comprehensive debugging and test contracts on `window`.

---

## 3. Global Contracts Surface

The implementation must expose the following global properties on `window`:
1. `window.MOBILE` — Centralized mobile controller object.
2. `window.showRadialPad(x, y)` — Programmatically display radial pad at coordinates.
3. `window.hideRadialPad()` — Hide radial pad.
4. `window.triggerHaptic(type)` — Trigger tactile vibration (`'death'`, `'eat'`, `'swipe'`).
5. `window.toggleFullscreen()` — Toggle browser fullscreen mode.
6. `window.getMobileState()` — Return `{ active, x, y, dir, knobX, knobY, fullscreen, hapticsEnabled }`.

---

## 4. Acceptance Criteria

1. **Canvas Touch-Action:** `window.getComputedStyle(canvas).touchAction === 'none'`.
2. **Radial Pad Appearance:** `#radialPad` fades in at touch coordinates on pointerdown and fades out on pointerup.
3. **Continuous Steering:** Dragging beyond threshold deflects knob and queues snake direction immediately without waiting for finger lift.
4. **Haptic Dispatch:** `triggerHaptic` dispatches vibration pulses according to defined patterns when supported.
5. **Fullscreen Toggle:** `#fullscreenBtn` triggers fullscreen API and syncs button state.
6. **Non-Regression:** All existing visual, gameplay, accessibility, and audio suites (G1–G11, V1–V12, test_game) pass with 0 failures.
