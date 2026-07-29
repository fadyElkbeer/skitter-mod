# Mindustry Mod Implementation Plan: Noise-Attracted Enemy Units

*Revision 4 - adds Phase 3B: wave-based spawning and the extended unit roster (Gnawer, Howler, Broodmother, Buzzer, Shrieker, Screecher), per `mod-units.md`*

## 1. Executive Summary & Objectives

**What we're building:** A Mindustry mod that introduces a family of enemy units attracted to mining noise. Sustained mining operations generate accumulating noise that increases the probability of hostile units spawning near the noise source and attacking nearby infrastructure - creating early-game tension around drill placement and defense timing, with escalating threat tiers as noise stays high longer.

**Core goals:**
- Add a noise-tracking system tied to mining blocks (drills, miners)
- Spawn hostile units that path toward active noise sources rather than only toward the core
- Give players meaningful counterplay (defense, noise reduction, or timing strategy)
- Keep performance impact low enough to run on Android and desktop without server/TPS degradation
- Ship with a safe, low-risk rollback path if performance problems appear post-release
- **New (rev 4):** escalate threat over time via a wave-based spawn mechanism and a full unit roster (7 ground/flying units + an optional boss), not just a single repeating unit

**Scope boundaries:**
- **In scope:** noise accumulation logic, custom unit types + AI targeting, spawn rules/caps, configurable difficulty settings, JS/Java hybrid implementation, kill-switch toggle, **wave-based aggregate spawning, the extended unit roster, escalation tiers**
- **Out of scope (for v1):** iOS support (blocked by platform restrictions - see Section 4), full sound-propagation physics, multiplayer-balanced tuning (treat as single-player-first, harden for MP later), rewriting core pathfinding, **Broodmother (explicitly deferred per `mod-units.md` - "Not now")**

**Validation status:** Confirmed via web search that no existing Mindustry mod implements this specific mechanic - the idea is original as of this conversation (July 2026). NoiseTech (existing difficulty mod, unrelated despite the name) was checked for compatibility - see Task 1.3, resolved, no interaction found.

**Target game version:** **Mindustry 159.2**, confirmed via live in-game testing (`mod.hjson`'s `minGameVersion` is set to 159).

**Repository:** https://github.com/fadyElkbeer/skitter-mod (public)

---

## 2. Context & Technical Specifications

**Modding stack decisions:**
- Scripting language: **JavaScript (Rhino runtime)** - Mindustry's built-in scripting system, entry point `main.js`, additional files via `require()`
- Content definition: **JSON/Hjson** for static content (unit stats, sprites), JS for dynamic behavior (noise tracking, spawn logic)
- Java extension classes accessible from JS via `extendContent` for deeper hooks where JS alone isn't sufficient (not yet used - would be needed for Task 3.2, see Section 6)
- Confirmed this stack choice over the alternative (`Anuken/MindustryJavaModTemplate`, a full compiled-Java mod approach) after an explicit architecture discussion - JS/Hjson was kept because nothing in this mechanic's scope needs Java's performance ceiling, and the faster edit-test loop matters more for the tuning-heavy tasks (5.2) than for anything else in the plan.

**Architecture outline (as actually built, Skitter-only so far):**
```
skitter-mod/
├── mod.hjson
├── content/
│   ├── units/
│   │   └── skitter.hjson       # Skitter unit definition (Task 3.1, done)
│   └── blocks/                  # optional: silencer/muffler counterplay block (not started)
├── scripts/
│   ├── main.js                  # entry point, requires the hooks below
│   ├── noise-tracker.js         # pure per-tile noise accumulator + decay logic (Task 2.1a)
│   ├── noise-hook.js            # engine wiring: batches noise updates, Task 2.1b/2.1c
│   ├── spawn-trigger.js         # pure single-spawn decision logic (Task 2.2)
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
    ├── noisetech-compatibility.md
    └── mod-units.md              # design doc for the full roster + wave mechanism (project file)
```

**Planned additions for Phase 3B (not yet built):**
```
scripts/
├── faction-noise-tracker.js     # NEW: aggregates noise per-faction over a time window (Task 3B.1)
├── wave-spawn.js                 # NEW: wave timing, composition, and engine wiring (Tasks 3B.2-3B.5)
└── escalation.js                 # NEW: multi-tier trigger ladder with duration-tracking (Task 3E.1)
content/units/
├── gnawer.hjson                  # Task 3C.1
├── howler.hjson                  # Task 3C.2
├── buzzer.hjson                  # Task 3D.1
├── shrieker.hjson                # Task 3D.2
└── screecher.hjson                # Task 3D.3
```

**Key technical references identified:**
- `EventType.java` (core source) - for listening to block update / mining ticks
- `Groups.build` and `World.solid()` - for iterating live buildings and checking tile occupancy (confirmed working patterns, see Section 6)
- `UnitType.spawn()`, `Vars.content.unit()`, `Vars.state.rules.waveTeam` - for spawning real units (confirmed working, see Section 6)
- **New for Phase 3B:** Mindustry's `Team` system (for the "bugs are their own faction" requirement), status-effect/shield APIs (for Screecher's protective aura), and whatever hook governs "increase noise radius on attack" (for Howler's shriek) - none of these are researched yet, flagged per-task below.

**Constraints established in conversation:**
- Mindustry's logic loop is hard-capped at 60 TPS; dropping below 59 causes visible desync (conveyors slow, units lag, logic desyncs)
- Enemy pathfinding (A*) is the most CPU-expensive operation in the engine - spawn frequency must be capped
- iOS cannot run any mod using JavaScript or Java (Apple App Store restriction) - Android/desktop only, confirmed platform limitation
- Rhino JS engine's ES6+ support is better than initially assumed - the official wiki's own scripting examples use arrow functions and `const`. Not fully re-tested against our own code (which still uses `var`/`function` throughout for safety), but worth remembering this isn't as restrictive an engine as first thought.
- **New:** the wave mechanism (Phase 3B) will spawn *multiple* units at once, per wave, scaled with noise/duration - this multiplies the pathfinding-cost concern already flagged for single spawns. Formal Task 5.1 TPS testing becomes considerably more important once Phase 3B lands, not just "nice to do."

---

## 3. Detailed Task Breakdown

### Phase 1: Foundation & Setup - **COMPLETE**

**Task 1.1 - Project scaffolding** - DONE
**Task 1.2 - Dev environment** - DONE (via live testing throughout the build)
**Task 1.3 - NoiseTech compatibility investigation** - DONE, resolved. Full findings in `docs/noisetech-compatibility.md`.

### Phase 2: Core Noise System - **COMPLETE**

**Task 2.1a - Noise accumulator core logic** - DONE (`scripts/noise-tracker.js`, 11 tests)
**Task 2.1b - Tick-batching integration hook** - DONE (`scripts/noise-hook.js`)
**Task 2.1c - Noise query API** - DONE (`getNoiseLevel(tile)`, lives in `noise-hook.js`)
**Task 2.2 - Spawn trigger logic** - DONE (`scripts/spawn-trigger.js` + `spawn-hook.js`, real single-unit spawning works, spawn-on-building bug fixed)

*(See rev 3 for full detail on these - unchanged. Two real bugs were found and fixed during this phase; both documented in Section 6.)*

### Phase 3: Enemy Unit & AI (Skitter only) - **Task 3.1 done, Task 3.2 postponed, Task 3.3 implemented but dormant**

**Task 3.1 - Define Skitter** - DONE. `type: crawl` (walks over solid tiles/buildings freely) kept as an explicit, deliberate decision despite `mod-units.md` specifying `[legs]` for Skitter - confirmed via live testing that `crawl` and `legs` behave differently (crawl = full walk-over, legs = partial climbing up to 3-tile walls). **Revisit if this divergence from the design doc ever becomes a problem in practice.**

**Task 3.2 - Custom targeting AI** - **POSTPONED.** Requires extending `GroundAI`/`UnitController` via `extendContent`, a meaningfully bigger risk jump than anything else built so far (see rev 3 for full reasoning). Spawned Skitters currently use Mindustry's default AI, not noise-seeking behavior.

**Task 3.3 - Player warning/tell** - Implemented (`Vars.ui.hudfrag.showToast(...)`, confirmed working) but **not currently called by anything**. Per explicit design clarification: single-drill spawns are meant to be silent. The warning is reserved for the wave-spawn mechanism (Task 3B.6, below) - `warnPlayer()` already exists in `spawn-hook.js`, ready to be wired in once that mechanism exists.

### Phase 3B: Extended Roster & Wave-Based Spawning - **NEW (rev 4), not started**

*This phase is a substantial scope addition sourced from `mod-units.md`. Recommended sequencing: do this before Phase 4/5/6, since balance (4) and TPS testing (5) both need the fuller roster and the wave mechanism to be meaningful rather than premature.*

#### 3B-i: Wave-Spawn Mechanism

**Task 3B.1 - Faction noise aggregation**
- New module `scripts/faction-noise-tracker.js`: sums noise across *all* sources belonging to a faction/team over a rolling time window - distinct from `noise-tracker.js`, which is strictly per-tile
- Must support the settings toggle from `mod-units.md`: aggregate player noise only, or include AI-faction noise too (cross-reference Task 4.2 and Task 3E.3 below - same setting, don't build it twice)
- *Dependencies:* Task 2.1a/2.1b (per-tile tracker feeds this)

**Task 3B.2 - Wave timing/config**
- Wave interval, with the first wave explicitly longer than subsequent ones (per `mod-units.md`, "should have longer time for 1th wave", mirroring vanilla Mindustry's own wave pacing)
- All values placeholders pending Task 5.2 balance passes, same as every other tuning constant in this mod
- *Dependencies:* none additional

**Task 3B.3 - Wave composition logic**
- Given aggregated faction noise + elapsed game time, decide which units and how many spawn this wave (a *collection*, not a single unit)
- Needs Tier 1 units to always be includable (per doc: "including tier 1 units"), scaling up to higher tiers as noise/time increase
- *Dependencies:* Task 3B.1, Task 3B.2, and at least the Tier 2 units existing (Task 3C.1, 3D.2) for scaling to have anywhere to go beyond Tier 1

**Task 3B.4 - Wave spawn location**
- "Random empty area close to the faction's core that makes noise" - different from the single-spawn mechanism's "nearest open tile to the specific source" (Task 2.2's `findNearestOpenTile`)
- Needs to locate the faction's core first, then pick a random nearby open area - new logic, not a reuse of the existing single-spawn placement code
- *Dependencies:* Task 3B.3

**Task 3B.5 - Wave engine wiring**
- Ties 3B.1-3B.4 together in a tick-batched hook, following the established `noise-hook.js`/`spawn-hook.js` pattern (confirmed API conventions from Section 6 apply here too - `Events.run`, no `.js` in `require()`, pause-checking, etc.)
- *Dependencies:* Task 3B.1-3B.4

**Task 3B.6 - Wave player warning**
- Wires the already-built (dormant) `warnPlayer()` from Task 3.3 into the wave trigger
- Per design clarification: single-drill spawns stay silent; **wave spawns should warn the player**
- *Dependencies:* Task 3B.5, Task 3.3 (both satisfied/ready)

#### 3B-ii: New Ground Units

**Task 3C.1 - Gnawer (Tier 2)**
- `type: mech` (confirmed wall-blocked movement per Section 6 - matches Dagger/Nova)
- Weapon: Mandibles (larger/reinforced) - very short range, slower than Skitter, higher per-hit damage, brief lunge/chomp animation via weapon rotation
- Spawns via the wave mechanism (Task 3B), not single-drill spawns
- Sub-steps mirror Task 3.1's process: define `.hjson`, generate placeholder sprite(s), verify clean in-game load, fix any warnings/errors the same way `skitter.hjson`'s `range` field warning was fixed
- *Dependencies:* Phase 3B-i's wave mechanism existing (or at least stubbed) to have somewhere to spawn from

**Task 3C.2 - Howler (Tier 3)**
- `type: mech`
- Weapon: Mandibles (massive) + a secondary shriek effect - an area sound-radius pulse triggered on attack that **temporarily increases noise radius** (an intentional feedback loop)
- **New system hook required:** this needs `noise-tracker.js`/`noise-hook.js` to support a temporary, externally-triggered radius/magnitude boost - not something either file currently supports. This is genuinely new surface area, not just another unit definition - budget research/testing time similar to how Task 3.2 was budgeted, rather than assuming it's as quick as Task 3.1 was.
- Only spawns after noise stays above threshold for an **extended duration** - needs a sustained-threshold timer (time-above-threshold), which is different from the instantaneous magnitude check `spawn-trigger.js` currently does. Likely lives in the new `escalation.js` (Task 3E.1) rather than being duplicated here.
- Spawns via the wave mechanism
- *Dependencies:* Task 3B (wave mechanism), Task 3E.1 (sustained-threshold tracking)

**Task 3C.3 - Broodmother (Boss) - DEFERRED**
- Explicitly marked "Not now" in `mod-units.md`. Kept here as a placeholder entry only, so it isn't forgotten, not as active work.
- Stationary, massive, spawns smaller units continuously, appears only under critical sustained noise across a wide area
- *No sub-tasks assigned yet.*

#### 3B-iii: New Flying Units

**Task 3D.1 - Buzzer (Tier 1 flying)**
- `type: flying` (confirmed valid keyword, not yet used by any existing unit in this mod)
- Weapon: Acid Spit - short-range projectile, fast fire rate, low per-hit damage, optional lingering damage-over-time puddle on impact
- Spawns in swarms of 2-3, triggered by "any active mining noise" (same trigger tier as Skitter, per the Escalation Summary table) - likely reuses the single-drill spawn mechanism (Task 2.2) rather than the wave mechanism, but spawning *multiple* units per trigger instead of one is new behavior `spawn-hook.js` doesn't currently do
- *Dependencies:* Task 2.2 (extending it for multi-unit single-spawns), or a small parallel mechanism if extending turns out messier than expected

**Task 3D.2 - Shrieker (Tier 2 flying)**
- `type: flying`
- Weapon: Acid Spit (heavier) - mid-range arcing projectile, larger splash, slower fire rate, higher damage, explicitly outranges basic ground turrets (a balance-relevant detail worth keeping in mind for Task 5.2)
- **New system hook required:** a passive aura that amplifies nearby noise while Shrieker is alive/nearby - another noise-system extension, similar in spirit to Howler's shriek (Task 3C.2) but persistent/passive rather than attack-triggered. Worth designing these two hooks together rather than in isolation, since they're solving a similar problem (temporary or conditional noise amplification).
- Spawns via the wave mechanism (sustained higher noise trigger)
- *Dependencies:* Task 3B, and likely shares groundwork with Task 3C.2

**Task 3D.3 - Screecher (Tier 3 flying, rare)**
- `type: flying`
- Weapon: Acid Spit (heaviest) - largest splash, highest damage, slowest fire rate of the three acid-spit variants
- **New API research required:** a Protective Aura ability (shield/damage-reduction field for nearby units) instead of a direct attack - this needs Mindustry's status-effect or shield API, completely unresearched as of this revision. Treat this with the same caution as Task 3.2 (custom AI) - don't assume it's simple until a primary source is checked.
- Design intent: high-priority kill target during raids, since it makes nearby units harder to kill (a balance/AI-targeting-priority consideration, not necessarily a special code flag - worth checking whether Mindustry's default AI already deprioritizes/targets support units sensibly, or whether this needs explicit tuning)
- *Dependencies:* Task 3B, Task 3D.3's own aura research

#### 3B-iv: Escalation & Faction System

**Task 3E.1 - Escalation trigger ladder**
- Formalizes the full Escalation Summary table from `mod-units.md`:

  | Order | Unit | Type | Trigger |
  |---|---|---|---|
  | 1st | Buzzer | Flying | Any active mining noise |
  | 2nd | Skitter | Ground | Any active mining noise |
  | 3rd | Gnawer | Ground | Multiple drills / higher noise |
  | 4th | Shrieker | Flying | Sustained higher noise |
  | 5th | Howler | Ground | Sustained high noise, extended duration |
  | 6th (rare) | Screecher | Flying | Sustained high noise across wide area |
  | Boss (rare, deferred) | Broodmother | Ground (stationary) | Critical noise, wide area, long duration |

- Requires extending `spawn-trigger.js`'s current single-threshold model into a multi-tier ladder with **duration-tracking** (several tiers depend on noise being sustained, not just momentarily crossing a value) and **area-tracking** (Screecher/Broodmother trigger on wide-area noise, not a single source)
- This is a genuine architectural extension of Phase 2's spawn logic, not a drop-in addition - plan for it to touch `spawn-trigger.js` directly rather than living entirely in a new file
- *Dependencies:* Task 3B (wave mechanism), all six new unit definitions existing (3C.1-3C.2, 3D.1-3D.3) so the ladder has real units to select from

**Task 3E.2 - Independent bug faction**
- Per `mod-units.md`: "Our bugs are [a] faction on their own so they attack player and AI equally"
- **Research needed:** whether Mindustry's `Team` system already gives this for free (most default AI just targets "not my team," so a genuinely separate bug team might be hostile to everyone automatically without extra code) or whether explicit multi-team-hostile logic needs to be written. Confirm via a primary source or live test before assuming either way - matches this mod's established pattern of not asserting engine behavior without checking.
- *Dependencies:* none blocking - could be researched/started independently of the rest of Phase 3B

**Task 3E.3 - Settings: noise-aggregation scope toggle**
- "An option in mod settings [to] calculate noise for player only or [include] AI enemy also" - per `mod-units.md`
- **Same setting as Task 3B.1 and Task 4.2** - build once, reference from both, don't duplicate
- *Dependencies:* Task 3B.1, Task 4.2

### Phase 4: Counterplay & Balance - Not started

**Task 4.1 - Muffler/silencer block** - Not started
**Task 4.2 - Configurable difficulty settings** - Not started. **Now also owns the noise-aggregation-scope toggle** (see Task 3E.3) - don't build that setting twice.
**Task 4.3 - Kill-switch / spawn disable toggle** - Not started. **More important than before rev 4** - once Phase 3B's wave mechanism can spawn multiple units of multiple tiers at once, an easy off-switch matters more, not less.

### Phase 5: Testing & Performance Validation - Not formally started

Informal versions have already happened throughout Phase 2/3 (TPS glances staying ~60-61 with several drills running), but the **formal Task 5.1 protocol** (8 top-tier drills, 10 minutes, logged TPS) has not been run, and **should wait until at least Phase 3B-i (wave mechanism) exists** - multi-unit wave spawns are the real stress case this test is meant to catch, more so than single-unit spawns.

### Phase 6: Distribution - Not started

---

## 4. Important Notes & Edge Cases

- **iOS incompatibility is a hard platform limitation**, not a bug to fix.
- **Performance is the top implementation risk**, and **rev 4 raises the stakes**: wave spawning means multiple units (potentially multiple tiers) spawning together, multiplying pathfinding cost per trigger rather than one unit at a time. Formal Task 5.1 testing is more urgent post-Phase-3B than it was before.
- **Rhino JS engine** - better ES6+ support than assumed; see Section 2.
- **Avoid per-frame noise checks** - confirmed working as designed (60-tick batching). The same discipline must apply to the new wave/faction/escalation hooks.
- **Multiplayer is a secondary concern** - unchanged, still single-player-first. Worth noting Task 3E.2 (faction targeting) has real implications for how this mod would behave in MP, if that's ever revisited.
- **Original idea confirmed** - unchanged.
- **Game version drift** - target version pinned (159.2 / `minGameVersion: 159`).
- **New (rev 4): scope growth risk.** Phase 3B roughly doubles the mod's surface area (6 new units, 2 new noise-system hooks, a new spawn mechanism, an escalation ladder, a faction system). Worth periodically re-checking whether all of this is still v1 scope or whether some pieces (Broodmother is already deferred; Screecher's aura or Howler's shriek could be candidates too) should be pushed to a later update.

---

## 5. Open Questions & Next Steps

**Resolved from rev 2/3:**
- ~~Final naming~~ → **"Skitter."**
- ~~NoiseTech interaction~~ → investigation only, no compatibility work needed.

**Still open (carried forward):**
- Should the muffler/counterplay block (Task 4.1) be in v1 scope, or added later?
- Is multiplayer support a goal for v1, or single-player only initially?
- Who is the playtesting audience for Task 5.2?
- When resuming Task 3.2 (custom AI), is the full custom-controller approach still the goal, or is a simpler interim behavior acceptable?

**New in rev 4:**
- Should Howler's shriek (noise-radius boost) and Shrieker's passive aura (noise amplification) share a single underlying noise-system extension, or be built as two separate hooks? (Section 3B-iii flags these as likely-related.)
- Does Screecher's Protective Aura need genuinely new Mindustry API research (status effects/shields), or does an existing vanilla mechanic already cover this well enough to reuse?
- Does the "bugs are their own faction" requirement (Task 3E.2) need custom code at all, or does Mindustry's Team system already provide "hostile to everyone but my own team" behavior by default?
- Given the scope growth, is Broodmother's "Not now" deferral final for v1, or should it be revisited once the rest of Phase 3B is built?

**Immediate next steps:**
1. Phase 3B is large - recommend picking a concrete starting point rather than attempting it all at once. Reasonable first slices: **Task 3E.2** (faction research, independent of everything else) or **Task 3D.1/Buzzer** (simplest new unit, no new system hooks required, most similar to the already-proven Task 3.1 pattern)
2. Task 3B.1 (faction noise aggregation) is the true dependency root for most of the wave-mechanism tasks - worth tackling early if wave spawning is the priority over new unit variety
3. Task 5.1's formal TPS protocol should be scheduled once Phase 3B-i (wave mechanism) lands, given the raised performance stakes noted in Section 4

---

## 6. Confirmed API Findings (build log from live testing)

*(Unchanged from rev 3 - all findings below remain accurate and directly relevant to Phase 3B's new work, especially the `type` keyword findings for Gnawer/Howler (`mech`) and Buzzer/Shrieker/Screecher (`flying`).)*

- **`require()` paths must omit the `.js` extension.** `require("noise-hook")`, not `require("noise-hook.js")`. Confirmed via an in-game "Module not found" error.
- **`Events.run(Trigger.x, callback)`, not `Events.on(...)`, for Trigger-type (bare signal) events.** `Events.on` is for typed events like `UnitDestroyEvent`. Confirmed via an in-game `EvaluatorException`.
- **`Groups.build` has no indexed access** - no `.size` property, no `.get(i)`. Only `.each(Cons)`. `Groups.build.size` is a method (`int size()`), not a property. This was a genuinely silent bug: using `.size` as a property meant the batch loop never ran, with zero errors, for a full 5-minute live test. Confirmed via direct console probing.
- **`build.tile.x` / `build.tile.y` / `build.block.name` / `build.efficiency`** all work exactly as expected, confirmed via live console printing real values.
- **`Trigger.update` fires even while the game is paused.** `Vars.state.isPaused()` must be checked explicitly in every tick-driven hook - confirmed via live testing.
- **Mod content names are namespaced as `<modname>-<contentname>`**, not the plain filename stem. Confirmed by running `Vars.content.units().each(function(u){ Log.info(u.name) })` live.
- **Sprite files themselves keep the plain (unprefixed) name** - the engine prefixes internally. Confirmed against `Mods.java` source.
- **Unit `type` (Hjson) must be one of exactly:** `flying/mech/legs/naval/payload/missile/tether/crawl`. Confirmed via an in-game `IllegalArgument` error listing the full valid set.
  - **`mech`**: normal wall-blocked ground movement (Dagger, Nova, vanilla Crawler all confirmed `mech` via `UnitTypes.java` source). **Gnawer and Howler should use this.**
  - **`legs`**: partial obstacle climbing (up to 3-tile-wide walls).
  - **`crawl`** (Skitter): walks over solid tiles/buildings freely - confirmed different from vanilla Crawler despite the name similarity.
  - **`flying`**: confirmed valid keyword, not yet used by any unit in this mod until Phase 3B. **Buzzer, Shrieker, and Screecher should use this.**
- **`Weapon` has no `range` field.** Effective attack range comes from the bullet's `speed * lifetime`. Confirmed via a non-fatal in-game warning.
- **`UnitType.spawn(Team, x, y)` takes world (pixel) coordinates, not tile coordinates.** Needs `* Vars.tilesize` conversion.
- **`Vars.world.solid(x, y)`** correctly identifies occupied/blocked tiles, confirmed against `World.java` source.
- **`Vars.ui.hudfrag.showToast("message")`** is a confirmed, working on-screen toast notification - pulled verbatim from the official wiki's own scripting example.
- **`Sounds.spawn` does NOT exist.** Confirmed via a live `InternalError`: "Java class mindustry.gen.Sounds has no public instance field or method named 'spawn'." A guessed field name from a wiki page that mixed sound and visual-effect (Fx) names without distinguishing them - removed rather than guessed again. **Any future sound work (e.g. for wave warnings, Task 3B.6) needs the correct field name confirmed before use, not another guess from that same list.**
