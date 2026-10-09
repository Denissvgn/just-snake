# SPEC-G9: Settings & Pause Menu

> **E03 reconciliation — historical, non-authoritative design.** Current `G9` status: **accepted for the bounded rules-2 release scope** in [ENHANCEMENTS.md](ENHANCEMENTS.md), with executable assertion links and accepted-task provenance. Original detail below is preserved, not a fresh full-release or live-publication claim. [PUBLIC_RELEASE_BACKLOG.md](PUBLIC_RELEASE_BACKLOG.md) DEC02/04/06–10 override conflicting constants, lifecycle, performance and UI clauses.
>
> **Explicit supersession:** B01/B02 supersede every mutable wrap control and mutation of MODES: walls follow frozen difficulty. Schema2 requested preferences restore without init saves; effective safety/AA fallback never erases requests. Closing settings never auto-resumes.
>
> **Compatibility:** every mutable `window.*` hook described below is source-test-only behind `__SNAKE_TEST_BUILD__` or injected by the temporary source adapter. Normal source and dist expose no mutable game controls. Old ready/DONE labels, patch commands and historical benchmarks below are not implementation authority. See [recipe/adaptor audit](docs/HISTORICAL_RECIPES.md).


## Overview
Exposes and unifies all existing runtime graphics, gameplay, and system configurations (Quality Tier, Emissive Bloom, Anti-Aliasing, Continuous Tube Body, Wall Wrap, and Audio Toggle) into an accessible, interactive **Settings & Pause Menu**. Replaces undiscoverable keyboard shortcuts (`Q`, `B`, `M`, `T`) with intuitive, touch-friendly UI controls, persistent preferences in `localStorage`, and an in-run pause modal.

---

## 1. Core Architecture

### 1.1 `SETTINGS` Module
An isolated configuration controller managing runtime properties, engine hooks, and persistence.

```javascript
const SETTINGS = {
  tier: 'high',         // 'high' | 'balanced' | 'low'
  bloomOn: true,        // boolean
  bloomMask: true,      // boolean: true for emissive-only mask, false for luma
  aa: 'smaa',           // 'smaa' | 'fxaa' | 'none'
  bodyMode: 'tube',     // 'tube' | 'segments'
  wrap: false,          // boolean: wall wrap
  sound: true,          // boolean: sound FX enabled
  isOpen: false,        // boolean: settings menu modal state

  init() { /* load from localStorage, sync initial engine state */ },
  save() { /* persist to localStorage['threejs-snake-settings'] */ },
  get(key) { return this[key]; },
  set(key, val) { /* update property, trigger engine hook, save */ },
  toggle(key) { this.set(key, !this[key]); },
  applyAll() { /* sync quality, post-fx, tube, wrap to engine */ }
};
```

### 1.2 Storage Key
- `localStorage['threejs-snake-settings']`: JSON object storing user preferences across sessions.
- Gracefully falls back to hardware-detected defaults if storage is empty or unavailable.

---

## 2. Settings & Pause Menu UI

### 2.1 UI Elements & Structure
1. **Header Settings Button (`#settingsBtn`)**:
   - Gear icon button `⚙️ Settings` located in the top bar / controls bar.
   - Accessible via click/tap on mobile and desktop: `aria-label="Settings and Pause Menu"`.
   - Clicking opens the Settings / Pause modal.

2. **Settings Panel / Modal (`#settingsModal` or embedded in `#overlay`)**:
   - **Quality Preset**: Segmented pills `[High]` · `[Balanced]` · `[Low]` mapped to `applyQuality(tier)`.
   - **Bloom FX**: Toggle button `[Bloom: ON / OFF]` mapped to `POST.bloomOn` and Mode `[Mask / Luma]` mapped to `POST.mask`.
   - **Anti-Aliasing**: Segmented pills `[SMAA]` · `[FXAA]` · `[Off]` mapped to `POST.aa`.
   - **Snake Body**: Segmented pills `[Tube]` · `[Segments]` mapped to `setBodyMode()`.
   - **Wall Collision**: Segmented pills `[Lethal Walls]` · `[Wrap Around]` mapped to active wrap mode.
   - **Sound FX**: Toggle button `[Sound: ON / Muted]` for audio preference.
   - **Keyboard Legend**: Clean keycaps grid showing `[Space]`, `[Esc]`, `[WASD]`, `[R]`, `[Q]`, `[B]`, `[M]`, `[T]`.

3. **Pause Actions**:
   - When paused during gameplay:
     - Displays "Game Paused" with current run telemetry (Score, Length, Time Alive).
     - `#resumeBtn` / Action Button: Resumes gameplay seamlessly.
     - `#restartBtn`: Restarts run cleanly.

### 2.2 Keybindings & Discovery
- `Escape` / `P`: Toggles Pause / Settings menu.
- Start overlay hint text updated from cryptic `Q: quality` to `⚙️ Settings · Esc: pause · Space: play`.

---

## 3. Real-time Live Synchronization
- Changing a setting immediately updates the active WebGL rendering pipeline:
  - Quality change invokes `applyQuality(tier, true)`.
  - Bloom toggle toggles `POST.bloomOn` and updates HUD readout.
  - Body mode toggles `setBodyMode(mode)`.
  - Wall wrap updates `MODES[currentMode].wrap` and tube seam handling.
- Zero allocations during settings adjustments; all existing buffers and targets are reused.

---

## 4. Global Test Contracts (`window`)
- `window.SETTINGS`: Settings controller instance.
- `window.openSettings()`: Opens the settings modal.
- `window.closeSettings()`: Closes the settings modal.
- `window.getSettings()`: Returns current settings dictionary.
- `window.applySetting(key, val)`: Sets a configuration property and applies it.
