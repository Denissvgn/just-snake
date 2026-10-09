# SPEC-G7: Seeded RNG & Challenge of the Day

> **E03 reconciliation — historical, non-authoritative design.** Current `G7` status: **accepted for the bounded rules-2 release scope** in [ENHANCEMENTS.md](ENHANCEMENTS.md), with executable assertion links and accepted-task provenance. Original detail below is preserved, not a fresh full-release or live-publication claim. [PUBLIC_RELEASE_BACKLOG.md](PUBLIC_RELEASE_BACKLOG.md) DEC02/04/06–10 override conflicting constants, lifecycle, performance and UI clauses.
>
> **Explicit supersession:** B06/B07 supersede one shared seed stream and immediate daily-arming mutations: JSON([2,mode,seed]), separate food/hazard streams, concrete UTC daily/mode identity, selection intent separate from frozen active descriptor, logical simulation-time replay.
>
> **Compatibility:** every mutable `window.*` hook described below is source-test-only behind `__SNAKE_TEST_BUILD__` or injected by the temporary source adapter. Normal source and dist expose no mutable game controls. Old ready/DONE labels, patch commands and historical benchmarks below are not implementation authority. See [recipe/adaptor audit](docs/HISTORICAL_RECIPES.md).


## Overview
Implements deterministic pseudo-random number generation (PRNG), URL seed parameterization for reproducible runs and debugging, and a dedicated **Challenge of the Day** (Daily Challenge) feature where all players share the exact same board, food spawns, prey archetype distribution, and hazard layout.

---

## 1. Core Architecture

### 1.1 Mulberry32 PRNG & FNV-1a String Hashing
All gameplay-affecting randomness is governed by an isolated, high-performance 32-bit PRNG rather than unseeded `Math.random()`.

```javascript
function hashSeed(seed) {
  if (typeof seed === 'number') return (seed >>> 0) || 1;
  const str = String(seed);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h || 1;
}

function mulberry32(initialSeed) {
  let s = hashSeed(initialSeed);
  return {
    get state() { return s; },
    set state(v) { s = v >>> 0; },
    next() {
      let t = (s += 0x6D2B79F5) >>> 0;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
  };
}
```

### 1.2 `RNG` Controller Object
A unified controller exposed on `window.RNG` with methods:
- `RNG.seed`: Active seed identifier (string or number).
- `RNG.isDaily`: Boolean flag indicating if current run is a Daily Challenge.
- `RNG.stepCount`: Number of `random()` invocations since last reset.
- `RNG.setSeed(seed, isDaily = false)`: Initializes Mulberry32 with the hashed seed, resets `stepCount` to 0.
- `RNG.reset()`: Resets Mulberry32 back to initial seed state without changing the seed.
- `RNG.random()`: Returns a pseudo-random float in `[0, 1)`.
- `RNG.randInt(min, max)`: Returns integer in `[min, max]` inclusive: `Math.floor(RNG.random() * (max - min + 1)) + min`.
- `RNG.randChoice(arr)`: Returns an element from `arr` using `RNG.randInt(0, arr.length - 1)`.

---

## 2. Gameplay Integration

### 2.1 Food Spawning & Archetype Determination
- **Coordinate selection**:
  - Golden prey center diamond search uses `RNG.randInt(6, 14)` for `cx` and `cz`.
  - Standard food fallback uses `RNG.randInt(0, GRID - 1)` for `x` and `z`.
- **Prey archetype selection** in `applyPreyType`:
  - `const r = RNG.random();`
  - $r < 0.15 \implies \text{'golden'}$
  - $r < 0.30 \implies \text{'jittery'}$
  - otherwise $\implies \text{'common'}$
- **Visual separation**:
  - Dust, speed streaks, eye blinks, tongue flicks, and camera shake continue using non-deterministic `Math.random()`.
  - Frame-rate differences or cosmetic tier settings never desynchronize gameplay simulation determinism.

### 2.2 Hazard Generation Integration
- `HAZARDS.generatePillars(seed)` receives `RNG.seed` (or numeric hash of `RNG.seed`).
- Under identical seeds, pillar obstacle layouts are 100% identical.

---

## 3. Challenge of the Day (Daily Challenge)

### 3.1 Daily Seed Specification
- Formula: `DAILY-YYYY-MM-DD` based on current UTC date (`new Date().toISOString().slice(0, 10)`).
- Example: `DAILY-2026-10-08`.
- Formatted daily display badge: `DAILY · OCT 8` (or UTC date string).

### 3.2 UI Elements
- **Daily Challenge Button** (`#dailyBtn`):
  - Placed adjacent to mode selector pills or overlay.
  - Toggles Daily Challenge mode.
  - When active: highlighted with accent gold/cyan styling and `aria-pressed="true"`.
- **Daily Challenge Badge** (`#dailyBadge`):
  - Displays `📅 DAILY · <DATE>` on start and pause/game over overlays.
- **Run Stats & Leaderboard Integration**:
  - `RUN_STATS.finalize()` includes `seed` and `isDaily`.
  - Game over overlay stat grid displays `Seed: DAILY-2026-10-08` (or custom seed).
  - Share text includes `[DAILY CHALLENGE · YYYY-MM-DD]` header.
  - LocalStorage leaderboard records `seed` and `isDaily` for each entry.

---

## 4. URL Parameter Support & APIs

### 4.1 URL Parameters
- `?seed=daily`: Automatically arms Daily Challenge mode on load.
- `?seed=<any_value>`: Initializes the game with the given custom seed.

### 4.2 Global Contracts (`window`)
- `window.RNG`: RNG controller object.
- `window.setSeed(seed)`: Sets active seed.
- `window.getSeed()`: Returns current seed.
- `window.startDailyChallenge()`: Enables daily mode with today's UTC seed.
- `window.getDailySeed()`: Returns `DAILY-YYYY-MM-DD`.
