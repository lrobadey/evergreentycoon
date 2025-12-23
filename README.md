# Christmas Tree Farm (Browser 2D Simulator)

A lightweight **2D browser game** about running a Christmas tree farm with a **season-first** gameplay loop, while keeping a real `Date` clock under the hood. The goal of this repo is to build a **small vertical slice** first (playable, understandable, extensible), then expand into deeper simulation.

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open the URL shown in your terminal (typically `http://localhost:5173`)

4. Play:
   - Click a tile to **select a patch**
   - Use the **Patch Details** panel to:
     - Plant **Douglas fir** or **Fraser fir** (25 trees per patch)
     - Build a **hot cocoa stand**
     - Upgrade **Christmas décor** (cheer)
     - Bulldoze a tile’s **base** (décor persists)
   - Use speed controls (1×/2×/5×/10×/20×) to adjust simulation speed
   - Pause/Play or Step +1 week to control time
   - Watch the **Last week** market line for visitors / sales / revenue

## Current vertical slice (must stay simple)

### Farm layout
- **Grid**: **4×4** tiles (patches).
- **Each tile has two layers**:
  - **Base**: Empty / Tree patch / Cocoa stand
  - **Overlay**: **Décor level 0–3** (adds cheer regardless of base)

### Time & ticks (core foundation)
- **Start date**: **Mar 1, 2025**.
- **Simulation tick**: **weekly**.
- **Each tick**: advance `Date` by **+7 days**, then apply growth + market.
- **Real-time speed**:
  - **1×**: **1 in-game week per 5 real seconds**
  - Supported speeds: **2×, 5×, 10×, 20×**
- The in-game calendar must follow **real months/days/years** (rollovers handled correctly).

### Seasons (meteorological)
We derive seasons from the real calendar:

- **Winter**: Dec–Feb (market season)
- **Spring**: Mar–May (planting / setup)
- **Summer**: Jun–Aug (growth / maintenance)
- **Fall**: Sep–Nov (prep for winter)

### Player actions (current slice)
- Click a tile to **select a patch**.
- Use the **Patch Details** panel to:
  - **Plant** a tree patch (choose species; plants **25 trees**)
  - **Build** a cocoa stand (if empty and affordable)
  - **Upgrade décor** (level 0→3) on any tile to increase cheer
  - **Bulldoze base** (refunds 25% of base cost; décor persists)

## Tree growth model (realistic baseline)

Tree patches represent a block of **25 trees planted together** (same age). Once the patch is mature, trees can be sold **one-by-one** during Winter.

- **Douglas fir**: maturity **312 weeks** (~6 years), **$70/tree** base
- **Fraser fir**: maturity **416 weeks** (~8 years), **$90/tree** base
- Track growth in **weeks**, because the sim advances weekly.

> Note: This is a baseline. Future iterations can add variability (soil, spacing, weather, pests), but the vertical slice should keep the growth rule straightforward and deterministic.

## Economy (vertical slice rules)

- The economy is driven by a **deterministic weekly visitor market** (aggregated agents).
- **Winter** is ~95% of revenue.
- **Trees sell only in Winter**, automatically on weekly ticks (no manual harvest selling).
- **Cocoa** is an add-on purchase, capped by stand capacity.

Economy should be deterministic and driven by game state + calendar time (no AI-driven randomness).

### Determinism & debugging (practical note)
By default, each new game starts with a random **seed**, so runs feel different.
For tuning/debugging, the seed is shown in the HUD Details and can be copied or set to replay the same run.

### Visitor market (high level)
- Weekly **visitor count** = baseline (season/week) × **cheer multiplier** × **mature-supply modifier**
- **Tree-first** behavior: visitors attempt to buy **1 tree** from a mature patch; after purchase they may buy cocoa.
- If **sold out** of mature trees, many visitors leave; some still buy cocoa.
- Off-season visitors exist at a small trickle; **no tree sales**; occasional cocoa.

### Cocoa stands
- Cocoa price: **$6/cup**
- Capacity: **10 cups/week/stand**
- Missed demand beyond capacity is lost (incentivizes more stands).

### Christmas décor (cheer)
- Décor is an **overlay** on any tile (even empty).
- Upgrades: **level 0→3**.
- Cheer increases Winter demand (and slightly affects cocoa conversion).

## Recommended technical approach

### Rendering
- **HTML Canvas 2D** for the primary visual interface.
- Keep visuals minimalist:
  - grid background
  - simple icons/shapes for tree vs stand
  - optional growth stage visuals (seedling → young → mature)

### Game loop shape (authoritative simulation)

The simulation should be **tick-driven** and independent from render FPS:

- **State**: single source of truth (`GameState`)
- **Tick**: advance date by +7 days; apply growth + market once per week
- **Render**: draw based on current state at any frame rate
- **Input**: convert click → tile coordinate → intent → state mutation

Speed multipliers should not “skip” logic incorrectly. Prefer an accumulator:
- Compute ms-per-week from speed (1× = 5000ms/week)
- Accumulate `dt` from `requestAnimationFrame`
- While accumulator ≥ ms-per-week: apply exactly **one** weekly tick and subtract

### Calendar handling (must be correct)
- Store the in-game date as a `Date` and advance by **7 days** per tick.
- Always advance date by day math (e.g., `setDate(getDate() + 7)`), not by assuming fixed months.

## Data model (suggested)

Keep tiles explicit and typed (examples in TypeScript terms):

- `GameState`
  - `date: Date`
  - `running: boolean`
  - `speed: 1 | 2 | 5 | 10 | 20`
  - `money: number`
  - `tiles: Tile[]` (length = width * height)
  - `selectedTileIdx: number | null`
  - `cheer: number`
  - `lastReport: WeeklyMarketReport | null`

- `Tile`
  - `{ base: TileBase, decorLevel: 0|1|2|3 }`

- `TileBase`
  - `{ kind: "empty" }`
  - `{ kind: "cocoa" }`
  - `{ kind: "tree", speciesId, ageWeeks, treesRemaining }`

## Agent notes / non-negotiables

If you are an agent (human or AI) extending this repo:

- **Preserve the vertical slice**: keep a playable 4×4 farm with weekly ticks and speed controls.
- **Time is authoritative**: all growth & income must be derived from weekly ticks + calendar date.
- **Seasons are player-facing**: UI and economy should be season-first even though the clock is a real `Date`.
- **Avoid premature complexity**:
  - No pathfinding, no inventory trees, no huge UI frameworks, no server.
  - Add features only if they clearly support the core loop.
- **Keep it deterministic**: given the same inputs and starting seed (if any), outcomes should match.
- **Make it debuggable**:
  - Show current season + date in the HUD.
  - Allow pause/play and step-week (optional but very helpful).

## Future expansion (after the slice feels good)

Good next steps once the foundation is solid:
- Visitor agents on-map (queues/capacity) after aggregated market is tuned
- More species (and more differentiated pricing/demand)
- Growth staging visuals + maturity indicator
- Saving/loading via `localStorage`
- Seasonal modifiers (growth rates, weather, operations)
- Larger maps (chunking) after performance is proven

