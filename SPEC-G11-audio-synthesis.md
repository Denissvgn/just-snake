# SPEC-G11 — Audio with Zero Assets (WebAudio Procedural Synthesis)

> **E03 reconciliation — historical, non-authoritative design.** Current `G11` status: **accepted for the bounded rules-2 release scope** in [ENHANCEMENTS.md](ENHANCEMENTS.md), with executable assertion links and accepted-task provenance. Original detail below is preserved, not a fresh full-release or live-publication claim. [PUBLIC_RELEASE_BACKLOG.md](PUBLIC_RELEASE_BACKLOG.md) DEC02/04/06–10 override conflicting constants, lifecycle, performance and UI clauses.
>
> **Explicit supersession:** B05/B09/B10 supersede demo feedback and unguarded unlock/resume: only activated player feedback, suspended audio on interruption, generation-owned trusted Resume; no demo audio/haptics.
>
> **Compatibility:** every mutable `window.*` hook described below is source-test-only behind `__SNAKE_TEST_BUILD__` or injected by the temporary source adapter. Normal source and dist expose no mutable game controls. Old ready/DONE labels, patch commands and historical benchmarks below are not implementation authority. See [recipe/adaptor audit](docs/HISTORICAL_RECIPES.md).


**Historical design status:** preserved original proposal; current bounded scope is reconciled above.
**Backlog:** `ENHANCEMENTS.md` → Gameplay ideas → *"G11 Audio with zero assets"*, effort S–M, impact ★★★  
**Depends on:** G1 (combo multiplier), G2 (prey archetypes), G3 (arena hazards), G6 (difficulty modes), G9 (settings menu), V12 (HUD design)  
**File:** `snake-three.html`  
**Harness:** `tests/check_g11_contracts.mjs`, `tests/test_audio.mjs`

---

## 1. Problem and Intent

Currently in `snake-three.html`:
1. **Total Silence:** Despite rich 3D graphics, PBR lighting, and post-processing effects, the game is completely silent.
2. **Missing Audio Feedback:** Critical gameplay moments—eating prey, chaining combos, flicking the tongue, colliding with walls or pillars, and accelerating at top speed—lack acoustic reinforcement.
3. **No External Asset Footprint:** To maintain instant zero-latency loading and zero asset dependencies, audio must not download external sound files (`.mp3`, `.wav`, `.ogg`). All sounds must be synthesized in real-time via the browser's native WebAudio API.
4. **Browser Autoplay Compliance:** Modern browsers block audio until the player provides a user gesture. The audio subsystem must unlock cleanly on the first click, keypress, or tap without throwing unhandled exceptions.
5. **Settings & Accessibility Integration:** The audio system must integrate with the existing `SETTINGS.sound` toggle, settings modal (`#soundToggleBtn`), and provide instant, click-free muting via master gain exponential ramping.

---

## 2. The Four Pillars of G11

### Pillar 1: Zero-Asset WebAudio Synthesis Engine & Safe Unlock
- **Centralized Controller:** Implement `const AUDIO = { ... }` in `snake-three.html`.
- **Zero Asset Dependencies:** No network requests for sound files. All sound events are generated procedurally using `OscillatorNode`, `AudioBufferSourceNode`, `BiquadFilterNode`, and `GainNode`.
- **Autoplay Handling & Unlock:**
  - Initialize the `AudioContext` (or `webkitAudioContext`) lazily.
  - Automatically listen for user gesture events (`pointerdown`, `keydown`, `touchstart`).
  - On the first gesture, call `ctx.resume()` and mark `AUDIO.unlocked = true`.
- **Master Gain & Muting:**
  - Route all synthesizers through `masterGain`.
  - When `SETTINGS.sound === false`, smoothly ramp `masterGain.gain` to `0.0` over 30ms to prevent acoustic pops/clicks.
  - When enabled, ramp back to nominal level (`0.30`).
- **Attract Mode Silence:** While the game is running in autonomous attract mode (`state === 'attract'`), gameplay SFX and the speed drone remain silent so the demo does not disturb the player.

### Pillar 2: Eat Blip with Harmonic Combo Multiplier Ladder
- **Dynamic Eat Blip:** When snake consumes prey, synthesize an energetic, crisp blip using an oscillator and rapid exponential decay envelope.
- **Pitch Ascension Ladder:**
  - Base frequency: $f_0 \approx 440\text{ Hz}$ (A4).
  - Frequency ascends with combo multiplier ($k \in [1, 5]$):
    - $\times 1$: $440\text{ Hz}$ (A4)
    - $\times 2$: $554.37\text{ Hz}$ (C#5)
    - $\times 3$: $659.25\text{ Hz}$ (E5)
    - $\times 4$: $880.00\text{ Hz}$ (A5)
    - $\times 5$: $1108.73\text{ Hz}$ (C#6)
- **Archetype Timbre Variations:**
  - **Common Prey:** Pure sine / triangle ping with fast 80ms decay.
  - **Golden Prey:** Dual-oscillator harmonic chime with sparkle decay (fundamental + octave with subtle detune) for 160ms.
  - **Jittery Prey:** Pitch-ramped FM chirp with rapid downward pitch slide ($800 \to 400\text{ Hz}$) for 70ms.

### Pillar 3: Procedural Impact Thud & Tongue Hiss
- **Wall / Self Impact Thud:**
  - Low-frequency punch oscillator: rapidly dropping frequency ($120\text{ Hz} \to 30\text{ Hz}$) over 200ms.
  - Procedural noise burst: pre-allocated or generated 100ms white noise buffer fed through a low-pass filter ($f_c \approx 180\text{ Hz}$).
- **Pillar Collision:**
  - Metallic resonance: resonant bandpass filter ($Q = 8, f_0 = 420\text{ Hz}$) added to the noise transient, distinctly differentiating pillar crashes from perimeter wall hits.
- **Tongue Hiss:**
  - Hooked directly into `animateFace(dt)` when `nextFlick <= 0`.
  - Synthesized using a high-pass filtered noise burst ($f_c \approx 4500\text{ Hz}$) with subtle volume ($0.08$) and a double-flick amplitude flutter simulating snake tongue motion.

### Pillar 4: Speed Drone & Lifecycle State Machine
- **Continuous Ambient Engine:**
  - Dual low-frequency oscillators ($f_1 = 55\text{ Hz}$, $f_2 = 110\text{ Hz}$) feeding into a low-pass filter.
  - Modulated live in `animate()`:
    - Pitch ascends from $55\text{ Hz}$ up to $115\text{ Hz}$ proportional to `SPEED_FX.speedFactor`.
    - Low-pass filter cutoff opens from $160\text{ Hz}$ to $400\text{ Hz}$ as snake accelerates.
- **Lifecycle Management:**
  - **Playing:** Drone volume at nominal $0.06$.
  - **Paused:** Drone volume exponentially ramps to $0.0$ in 60ms.
  - **Game Over / Ready:** Drone silenced immediately.
  - **Kill switch / Sound off:** Master gain clamped to $0.0$.

---

## 3. Global Contracts Surface

The implementation must expose the following global properties on `window`:
1. `window.AUDIO` — The centralized audio controller object.
2. `window.playEatSound(comboMult, preyType)` — Trigger procedural eat blip.
3. `window.playThudSound(reason)` — Trigger procedural impact thud (`'wall'`, `'self'`, `'pillar'`).
4. `window.playTongueHiss()` — Trigger procedural tongue hiss.
5. `window.setAudioEnabled(bool)` — Enable or mute master audio output.
6. `window.getAudioState()` — Return `{ enabled, unlocked, ctxState, droneActive, currentFreq }`.

---

## 4. Acceptance Criteria

1. **Zero Asset Footprint:** No external `.mp3`, `.wav`, `.ogg`, `.m4a`, or sound file requests during game execution.
2. **Deterministic WebAudio Node Graph:** All nodes correctly connected and cleaned up on stop/decay.
3. **Autoplay Compliance:** No AudioContext errors thrown on initial headless boot or before user gesture.
4. **Combo Pitch Elevation:** Eat sound pitch monotonically rises as combo multiplier increases from $\times 1$ to $\times 5$.
5. **State Synchronization:** Toggling sound off via `#soundToggleBtn` or `SETTINGS.set('sound', false)` immediately mutes master output and persists to `localStorage`.
6. **Non-Regression:** All existing visual, gameplay, and accessibility suites (G1–G10, V1–V12, test_game) continue to pass with 0 failures.
