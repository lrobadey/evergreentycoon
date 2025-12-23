# Agent Instructions (Codex / AI / Contributors)

This repo is a small, deterministic **vertical slice** of a 2D browser sim about running a Christmas tree farm.

## Product goals
- Keep the game **playable and understandable** at all times.
- Prefer **small, high-leverage** improvements over new systems.
- Avoid “big rewrites” unless explicitly requested.

## Non-negotiables
- **Weekly tick is authoritative**: simulation advances in discrete weeks; rendering can be any FPS.
- **Real calendar time**: the in-game clock is a real `Date` and must advance via day math (`setDate(getDate()+7)`), not “fixed month” assumptions.
- **Season-first gameplay**: seasonal state should be derived from the calendar and surfaced to the player.
- **Determinism**:
  - No `Math.random()` in the simulation.
  - Any randomness must come from `src/sim/rng.ts` and be reproducible from the run seed.
  - Weekly randomness should be derived from `(runSeed, weekIndex)` (see `seedForWeek`).
- **Tree sales window**: tree selling is only active in the Nov 1 → Dec 25 holiday period (see `isTreeSeasonActive` / holiday tuning).
- **Vertical slice constraints**: preserve the 4×4 farm, the base/overlay tile model, speed controls, pause + step-week.

## Code organization rules
- **UI/Rendering**: keep DOM/canvas/UI code in `src/main.ts` (and CSS in `src/style.css`).
- **Simulation**: keep sim state + logic under `src/sim/*`.
  - State types: `src/sim/types.ts`
  - Tuning knobs: `src/sim/constants.ts` (prefer adding parameters here instead of scattering magic numbers)
  - Player actions/mutations: `src/sim/actions.ts`
  - Time helpers: `src/sim/time.ts`
  - Systems (pure-ish): `src/sim/systems/*` (growth/pricing/market)
- UI should not mutate sim state directly except via functions in `src/sim/actions.ts` and `tickWeek()` in `src/sim/tick.ts`.

## Time/DST guidance
- Keep sim dates pinned to **local midnight** where possible.
- Be careful with week indexing derived from millisecond differences; DST can introduce subtle off-by-one issues if times drift off midnight.

## Dev hygiene
- Do not add or commit OS/editor junk (e.g. `.DS_Store`).
- Avoid shipping “localhost telemetry” or debug network calls by default; gate debug logging behind an explicit flag.

## How to validate changes (quick sanity)
- Run: `npm run dev`
- Manual checks:
  - Start screen → Start → sim runs
  - Pause/Play + Step +1 week work
  - Speed changes don’t skip logic incorrectly
  - Rent triggers once per month rollover
  - Seed replay produces identical weekly outcomes

