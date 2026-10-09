# SPEC-G10: Accessibility (A11y)

> **E03 reconciliation — historical, non-authoritative design.** Current `G10` status: **accepted for the bounded rules-2 release scope** in [ENHANCEMENTS.md](ENHANCEMENTS.md), with executable assertion links and accepted-task provenance. Original detail below is preserved, not a fresh full-release or live-publication claim. [PUBLIC_RELEASE_BACKLOG.md](PUBLIC_RELEASE_BACKLOG.md) DEC02/04/06–10 override conflicting constants, lifecycle, performance and UI clauses.
>
> **Explicit supersession:** B03 supersedes partial setter-only motion claims: actual fitted camera and effects stay steady, explicit preferences override live OS inheritance without unsolicited writes. Menu accessibility is tested; screen-reader-complete gameplay is not claimed.
>
> **Compatibility:** every mutable `window.*` hook described below is source-test-only behind `__SNAKE_TEST_BUILD__` or injected by the temporary source adapter. Normal source and dist expose no mutable game controls. Old ready/DONE labels, patch commands and historical benchmarks below are not implementation authority. See [recipe/adaptor audit](docs/HISTORICAL_RECIPES.md).


## Overview
Implements a comprehensive accessibility suite across four core pillars:
1. **Reduced Motion Engine**: Kills screen shake, post-processing chromatic aberration, film grain, Dutch roll camera tilts, and FOV kicks, with auto-detection of `prefers-reduced-motion`.
2. **Colour-Blind-Safe Palette**: Provides a high-contrast, universally distinct Okabe-Ito palette (Cyan / Amber-Gold / Magenta) for prey gems, snake accents, and arena hazards.
3. **High-Contrast Mode**: Enhances visual legibility with solid high-contrast backgrounds, crisp glowing arena borders, bold typography, and accessible keyboard focus indicators (`prefers-contrast: more`).
4. **Key Remapping**: Supports flexible directional control layouts (`WASD + Arrows`, `WASD`, `Arrows`, `IJKL`, `HJKL` Vim style).

---

## 1. Core Architecture

### 1.1 `A11Y` Controller
An accessibility controller integrated within `SETTINGS` and exposed as `window.A11Y`:

```javascript
const A11Y = {
  reducedMotion: false,    // boolean
  colorblind: 'default',   // 'default' | 'colorblind'
  highContrast: false,     // boolean
  keymap: 'wasd_arrows',   // 'wasd_arrows' | 'wasd' | 'arrows' | 'ijkl' | 'hjkl'

  init() { /* check system media queries, load preferences, apply */ },
  setReducedMotion(enabled) { /* toggle motion state, update uniforms/camera */ },
  setColorblind(mode) { /* update prey & hazard materials */ },
  setHighContrast(enabled) { /* toggle body class .high-contrast */ },
  setKeymap(keymap) { /* update active key mapping */ },
  getState() { /* return snapshot of all a11y properties */ }
};
```

---

## 2. The Four Pillars

### 2.1 Pillar 1: Reduced Motion
- **Auto-detection**: Checks `window.matchMedia('(prefers-reduced-motion: reduce)').matches` on first boot.
- **Camera Shake**: Sets `jx = 0`, `jy = 0`, `s = 0` in `animate()`.
- **Post-Processing Uniforms**:
  - `compMat.uniforms.ca.value = 0.0` (zero chromatic aberration).
  - `compMat.uniforms.grain.value = 0.0` (zero film grain).
- **Camera Life**: Suppresses Dutch roll rotation (`camera.rotation.z = 0.0`) and FOV kicks (`SPEED_FX.fovKick = 0.0`).

### 2.2 Pillar 2: Colour-Blind-Safe Palette
- When `A11Y.colorblind === 'colorblind'`:
  - **Common Prey**: Electric Cyan (`color: 0x06b6d4`, `emissive: 0x0284c7`).
  - **Golden Prey**: Amber Gold (`color: 0xfbbf24`, `emissive: 0xd97706`).
  - **Jittery Prey**: Vivid Magenta (`color: 0xec4899`, `emissive: 0xbe185d`).
- When `A11Y.colorblind === 'default'`:
  - Restores baseline palette (`0xff5a1f` common, `0xffd700` golden, `0x10b981` jittery).
- Preserves unique 3D geometries (Icosahedron, Octahedron with ring, Capsule).

### 2.3 Pillar 3: High-Contrast Mode
- When enabled, applies class `high-contrast` to `document.body`:
  - HUD cards, overlay panels, and pills transition to opaque solid black `#000000` with 2px solid `#38bdf8` borders.
  - Keyboard focus indicators enforce `outline: 3px solid #38bdf8; outline-offset: 3px`.
  - Arena wall trim and ground perimeter gain crisp, high-visibility contrast lines.

### 2.4 Pillar 4: Keyboard Remapping
- Direction resolution in `onKeyDown()` maps keys dynamically based on `A11Y.keymap`:
  - `wasd_arrows`: WASD and Arrow keys.
  - `wasd`: W, A, S, D only.
  - `arrows`: Up, Down, Left, Right arrows only.
  - `ijkl`: I (Up), K (Down), J (Left), L (Right).
  - `hjkl`: K (Up), J (Down), H (Left), L (Right) (Vim standard).

---

## 3. UI & Settings Integration
- Accessible controls added inside `#settingsModal`:
  - Reduced Motion toggle: `[Motion: Full / Reduced]`
  - High Contrast toggle: `[Contrast: Normal / High]`
  - Color Palette selector: `[Default] [Colorblind Safe]`
  - Control layout selector: `[WASD + Arrows] [WASD] [Arrows] [IJKL] [HJKL]`
- Preferences persisted to `localStorage['threejs-snake-settings']`.

---

## 4. Global Test Contracts (`window`)
- `window.A11Y`: Controller object.
- `window.setReducedMotion(bool)`: Toggles reduced motion.
- `window.setHighContrast(bool)`: Toggles high contrast mode.
- `window.setColorblindMode(mode)`: Sets palette mode (`'default'` or `'colorblind'`).
- `window.setKeymap(keymap)`: Sets active keymap.
- `window.getA11yState()`: Returns current accessibility state dictionary.
