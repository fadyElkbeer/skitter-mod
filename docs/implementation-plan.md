# Mindustry Mod Implementation Plan: Noise-Attracted Enemy Units

*Revision 3 - updated after Phase 1, Phase 2, and Task 3.1 complete; Task 3.2 postponed*

## 1. Executive Summary & Objectives

**What we're building:** A Mindustry mod that introduces a new enemy unit type, named **"Skitter,"** that is attracted to mining noise. Sustained mining operations generate accumulating noise that increases the probability of these units spawning near the noise source and attacking nearby infrastructure - creating early-game tension around drill placement and defense timing.

**Core goals:**
- Add a noise-tracking system tied to mining blocks (drills, miners)
- Spawn hostile units that path toward active noise sources rather than only toward the core
- Give players meaningful counterplay (defense, noise reduction, or timing strategy)
- Keep performance impact low enough to run on Android and desktop without server/TPS degradation
- Ship with a safe, low-risk rollback path if performance problems appear post-release

**Scope boundaries:**
- **In scope:** noise accumulation logic, custom unit type + AI targeting, spawn rules/caps, configurable difficulty settings, JS/Java hybrid implementation, kill-switch toggle
- **Out of scope (for v1):** iOS support (blocked by platform restrictions - see Section 4), full sound-propagation physics, multiplayer-balanced tuning (treat as single-player-first, harden for MP later), rewriting core pathfinding

**Validation status:** Confirmed via web search that no existing Mindustry mod implements this specific mechanic - the idea is original as of this conversation (July 2026). NoiseTech (existing difficulty mod, unrelated despite the name) was checked for compatibility - see Task 1.3, resolved, no interaction found.

**Target game version:** **Mindustry 159.2**, confirmed via live in-game testing (was a placeholder before Task 1.1; `mod.hjson`'s `minGameVersion` is set to 159).

**Repository:** https://github.com/fadyElkbeer/skitter-mod (public)

---

## 2. Context & Technical Specifications

**Modding stack decisions:**
- Scripting language: **JavaScript (Rhino runtime)** - Mindustry's built-in scripting system, entry point `main.js`, additional files via `require()`
- Content definition: **JSON/Hjson** for static content (unit stats, sprites), JS for dynamic behavior (noise tracking, spawn logic)
- Java extension classes accessible from JS via `extendContent` for deeper hooks where JS alone isn't sufficient (not yet used - would be needed for Task 3.2, see Section 6)
- Confirmed this stack choice over the alternative (`Anuken/MindustryJavaModTemplate`, a full compiled-Java mod approach) after an explicit architecture discussion - JS/Hjson was kept because nothing in this mechanic's scope needs Java's performance ceiling, and the faster edit-test loop matters more for the tuning-heavy tasks (5.2) than for anything else in the plan.

**Architecture outline (as actually built):**
```
skitter-mod/
├── mod.hjson
├── content/
│   ├── units/
│   │   └── skitter.hjson       # Skitter unit definition (Task 3.1, done)
│   └── blocks/                  # optional: silencer/muffler counterplay block (not started)
├── scripts/
│   ├── main.js                  # entry point, requires the hooks below
│   ├── noise-tracker.js         # pure noise accumulator + decay logic (Task 2.1a)
│   ├── noise-hook.js            # engine wiring: batches noise updates, Task 2.1b/2.1c
│   ├── spawn-trigger.js         # pure spawn-decision logic (Task 2.2)
│   └── spawn-hook.js            # engine wiring: batches spawn checks, real unit spawning
├── tests/
│   ├── noise-tracker.test.js
│   ├── noise-hook.test.js
│   ├── spawn-trigger.test.js
│   └── spawn-hook.test.js
├── sprites/units/
│   ├── skitter.png              # placeholder body sprite
│   └── skitter-cell.png         # placeholder team-color overlay
└── docs/
    ├── implementation-plan.md   # this file
    ├── dev-environment-setup.md
    └── noisetech-compatibility.md
```

**Key technical references identified:**
- `EventType.java` (core source) - for listening to block update / mining ticks
- `Groups.build` and `World.solid()` - for iterating live buildings and checking tile occupancy (confirmed working patterns, see Section 6)
- `UnitType.spawn()`, `Vars.content.unit()`, `Vars.state.rules.waveTeam` - for spawning real units (confirmed working, see Section 6)

**Constraints established in conversation:**
- Mindustry's logic loop is hard-capped at 60 TPS; dropping below 59 causes visible desync (conveyors slow, units lag, logic desyncs)
- Enemy pathfinding (A*) is the most CPU-expensive operation in the engine - spawn frequency must be capped
- iOS cannot run any mod using JavaScript or Java (Apple App Store restriction) - Android/desktop only, confirmed platform limitation
- Rhino JS engine's ES6+ support is better than initially assumed - the official wiki's own scripting examples use arrow functions and `const`. Not fully re-tested against our own code (which still uses `var`/`function` throughout for safety), but worth remembering this isn't as restrictive an engine as first thought.

---

## 3. Detailed Task Breakdown

### Phase 1: Foundation & Setup - **COMPLETE**

**Task 1.1 - Project scaffolding** - DONE
- Repo created and scaffolded: mod.hjson, content/, scripts/, sprites/, sounds/, tests/
- GitHub repo live and public

**Task 1.2 - Dev environment** - DONE (via live testing throughout the build)
- Local Mindustry install confirmed working with the mod symlinked into the mods folder
- Extensive live console access used throughout Phase 2/3 for verification (see Section 6) - this ended up being the primary dev/debug loop rather than hot-reload specifically

**Task 1.3 - NoiseTech compatibility investigation** - DONE, resolved
- `Xt0ff/NoiseTech` is a resource/production expansion mod (new ores, blocks, generators) with zero runtime/event-hook footprint - confirmed via reading its actual source (`scripts/main.js` only requires content-definition files, no `Events` listeners)
- Its internal mod name (`xzimur.noisetech`) is a separate namespace from ours - no content ID collision risk
- **No compatibility shim needed.** Full findings in `docs/noisetech-compatibility.md`.

### Phase 2: Core Noise System - **COMPLETE**

**Task 2.1a - Noise accumulator core logic** - DONE
- `scripts/noise-tracker.js`: pure, engine-independent accumulator with per-tile noise levels, tier-based output (mechanical/pneumatic/laser/blast drills, plus water/oil extractors), and tick-proportional decay
- 11 passing unit tests, run with plain `node`
- **Real bug found and fixed:** the original implementation applied decay on every `addNoise()` call, including for continuously-active sources. Since decay-per-batch (15) vastly exceeded any single tier's output (max 3.0), noise could never accumulate past a single tier's value - the spawn threshold was structurally unreachable. Fixed: `addNoise()` no longer decays; only `decayInactive()`/reads do. This bug was caught by Task 2.2's own tests, not by manual review.

**Task 2.1b - Tick-batching integration hook** - DONE
- `scripts/noise-hook.js`: batches noise updates every 60 ticks via `Groups.build.each(...)`, confirmed live in-game
- Confirmed via live testing that noise checks correctly skip while the game is paused (`Vars.state.isPaused()`) - `Trigger.update` fires even during pause, which would otherwise let noise silently accumulate/decay in the background

**Task 2.1c - Noise query API** - DONE
- `getNoiseLevel(tile)` lives in `noise-hook.js` (not `noise-tracker.js`), since it needs the current tick to compute decay correctly, and `noise-hook.js` is what tracks that

**Task 2.2 - Spawn trigger logic** - DONE (spawn location refinement partially done, see Task 3.2 notes)
- `scripts/spawn-trigger.js`: pure threshold/chance/cooldown/concurrency-cap logic, 10 passing tests
- `scripts/spawn-hook.js`: wires it to the live game loop, now spawns **real Skitter units** (not just log messages)
- **Real bug found and fixed (post Task 3.1):** Skitters were originally spawning directly on the noise source's own tile, i.e. inside/on top of the drill itself (confirmed via a screenshot showing Skitters spawned on top of turrets). Fixed with `findNearestOpenTile()`, which searches outward in expanding rings for the nearest non-solid tile using `Vars.world.solid(x, y)`.
- This is **not** yet the plan's original "just outside the player's explored/visible radius" spec - it only avoids spawning inside solid geometry. Vision-aware placement is still unimplemented (folded into the Task 3.2 postponement, see Section 5).

### Phase 3: Enemy Unit & AI - **Task 3.1 done, Task 3.2 postponed, Task 3.3 not started**

**Task 3.1 - Define new unit type** - DONE
- `content/units/skitter.hjson`: 35 health, slow speed, small melee-range weapon, "weak-but-numerous" per the original design intent
- Named the unit **"Skitter"** (open question from rev 2 resolved)
- Uses `type: crawl` movement - chosen initially as a low-risk guess, later confirmed (via live observation) to walk over solid tiles/buildings freely rather than being blocked by them. **This is being kept intentionally** (explicit decision, not a bug) - see Section 6 for the confirmed distinction between `crawl`, `mech`, and `legs` movement types.
- Loads cleanly in-game with zero warnings or errors as of the final fix (an invalid `range` field on `Weapon` was removed after a live warning flagged it)

**Task 3.2 - Custom targeting AI** - **POSTPONED**
- Original spec: override default "seek core" behavior to instead seek the nearest active noise source, with fallback to nearest infrastructure/core if the source is destroyed first
- **Why postponed:** this requires replacing the unit's `UnitController` (via `unit.controller(...)`) with a custom AI that overrides Mindustry's default per-tick target selection - not a one-off command. `AIController.moveTo(...)` is called internally by the controller's own update loop, which re-evaluates its target every tick based on default priority logic; calling it once externally wouldn't persist against that. The correct approach is extending `GroundAI` (or similar) via `extendContent`, which is a meaningfully bigger jump in complexity/risk than anything built so far - every previous task had a confirmable primary-source API (event names, method signatures, field names); this would be extending a Java *behavior* class from JS, which is harder to de-risk through research alone and would likely need multiple live-test-and-fix rounds, similar to Phase 2's pattern rather than Task 3.1's quick two-round fix.
- **Current behavior in the meantime:** spawned Skitters use whatever Mindustry's default AI does for a `crawl`-type unit (untested/unobserved in detail) - they do NOT yet specifically seek out noise sources.
- *Dependencies unchanged:* Task 2.2, Task 3.1 (both satisfied) - purely deferred by choice, not blocked.

**Task 3.3 - Player warning/tell** - Not started
- *Dependencies:* Task 3.1 (satisfied, could start any time)

### Phase 4: Counterplay & Balance - Not started

**Task 4.1 - Muffler/silencer block** - Not started
**Task 4.2 - Configurable difficulty settings** - Not started
**Task 4.3 - Kill-switch / spawn disable toggle** - Not started (still recommended given Task 3.2's postponement adds another reason to have an easy off-switch once real AI behavior lands)

### Phase 5: Testing & Performance Validation - Not formally started

Informal versions of this have already happened throughout Phase 2/3 (multi-minute live sessions, pause behavior checks, TPS glances staying around 60-61 with several drills running) but the **formal Task 5.1 protocol** (8 top-tier drills, 10 minutes, logged TPS) has not been run.

### Phase 6: Distribution - Not started

---

## 4. Important Notes & Edge Cases

*(Unchanged from rev 2 except where noted)*

- **iOS incompatibility is a hard platform limitation**, not a bug to fix.
- **Performance is the top implementation risk.** Still true; formal Task 5.1 testing still pending.
- **Rhino JS engine** - turned out to have better ES6+ support than assumed; see Section 2.
- **Avoid per-frame noise checks** - confirmed working as designed (60-tick batching).
- **Multiplayer is a secondary concern** - unchanged, still single-player-first.
- **Original idea confirmed** - unchanged.
- **Game version drift** - target version now pinned (159.2 / `minGameVersion: 159`).

---

## 5. Open Questions & Next Steps

**Resolved from rev 2:**
- ~~Final naming~~ → **"Skitter."**
- ~~NoiseTech interaction~~ → investigation only, no compatibility work needed.

**Still open:**
- Should the muffler/counterplay block (Task 4.1) be in v1 scope, or added later?
- Is multiplayer support a goal for v1, or single-player only initially?
- Who is the playtesting audience for Task 5.2?
- **New:** when resuming Task 3.2, is the full custom-AI-controller approach still the goal, or would a simpler interim behavior (e.g., periodically re-issuing a move/attack command toward the noise source, accepting that it may get overridden by default AI between checks) be an acceptable lower-risk stopgap?

**Immediate next steps (updated):**
1. Task 3.3 (player warning/tell) or Phase 4 items could reasonably be picked up next, since neither depends on Task 3.2
2. When ready to resume Task 3.2: budget for multiple live-test-and-fix rounds, and expect to research `extendContent` + `GroundAI`/`AIController` override patterns more deeply before writing a first attempt
3. Task 5.1's formal TPS protocol is worth running once Task 3.2 lands (real AI behavior + real pathfinding load is the actual stress case this test is meant to catch, more so than the current default-AI placeholder behavior)

---

## 6. Confirmed API Findings (NEW - build log from live testing)

This section is a running record of Mindustry API facts confirmed through actual in-game testing during this build, since several turned out to differ from reasonable-sounding guesses or general modding knowledge. Kept here so future work (this mod or others) doesn't need to re-discover them the hard way.

- **`require()` paths must omit the `.js` extension.** `require("noise-hook")`, not `require("noise-hook.js")`. Confirmed via an in-game "Module not found" error.
- **`Events.run(Trigger.x, callback)`, not `Events.on(...)`, for Trigger-type (bare signal) events.** `Events.on` is for typed events like `UnitDestroyEvent`. Confirmed via an in-game `EvaluatorException`.
- **`Groups.build` has no indexed access** - no `.size` property, no `.get(i)`. Only `.each(Cons)`. `Groups.build.size` is a method (`int size()`), not a property. This was a genuinely silent bug: using `.size` as a property meant the batch loop never ran, with zero errors, for a full 5-minute live test. Confirmed via direct console probing (`Groups.build.get(0)` threw a clear "no such function" error).
- **`build.tile.x` / `build.tile.y` / `build.block.name` / `build.efficiency`** all work exactly as expected, confirmed via live console printing real values.
- **`Trigger.update` fires even while the game is paused.** `Vars.state.isPaused()` must be checked explicitly in every tick-driven hook - confirmed via live testing (spawn messages kept appearing while paused).
- **Mod content names are namespaced as `<modname>-<contentname>`**, not the plain filename stem. Our "skitter" unit is actually `"skitter-mod-skitter"` when looked up via `Vars.content.unit(...)`. Confirmed by running `Vars.content.units().each(function(u){ Log.info(u.name) })` live and reading the output.
- **Sprite files themselves keep the plain (unprefixed) name** (`skitter.png`, not `skitter-mod-skitter.png`) - the engine prefixes internally. Confirmed against `Mods.java` source, not just inferred from the content-name finding above (these two turned out to work differently, which is worth remembering).
- **Unit `type` (Hjson) must be one of exactly:** `flying/mech/legs/naval/payload/missile/tether/crawl`. It is NOT a raw Java class name like `"UnitType"` - confirmed via an in-game `IllegalArgument` error that listed the full valid set.
  - **`mech`**: normal wall-blocked ground movement. Confirmed via source (`UnitTypes.java`): `dagger`, `nova`, `mace`, `fortress`, and even vanilla `crawler` are all `mech`-type.
  - **`legs`**: partial obstacle climbing (documented as able to climb over walls up to 3 tiles wide).
  - **`crawl`** (what Skitter uses): walks over solid tiles/buildings freely, confirmed via live observation. Notably, this is a *different* movement class from vanilla Crawler, despite the similar name - vanilla Crawler is actually `mech`-type.
- **`Weapon` has no `range` field.** Effective attack range comes from the bullet's `speed * lifetime`, not a separate weapon-level property. Confirmed via a non-fatal in-game warning (`Unknown Field 'range' for class 'Weapon'`).
- **`UnitType.spawn(Team, x, y)` takes world (pixel) coordinates, not tile coordinates.** Tile coordinates need `* Vars.tilesize` (assumed 8, referenced as a named constant rather than hardcoded) before spawning, or units cluster near the map origin.
- **`Vars.world.solid(x, y)`** correctly identifies occupied/blocked tiles, confirmed against `World.java` source. Used to find the nearest open spawn tile instead of spawning directly on top of a building.
