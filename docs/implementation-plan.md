# Mindustry Mod Implementation Plan: Noise-Attracted Enemy Units

*Revision 2 - updated after PM review, prior to build start*

## 1. Executive Summary & Objectives

**What we're building:** A Mindustry mod that introduces a new enemy unit type (working name: "Skitter" or "Gnawer") that is attracted to mining noise. Sustained mining operations generate accumulating noise that increases the probability of these units spawning near the noise source and attacking nearby infrastructure - creating early-game tension around drill placement and defense timing.

**Core goals:**
- Add a noise-tracking system tied to mining blocks (drills, miners)
- Spawn hostile units that path toward active noise sources rather than only toward the core
- Give players meaningful counterplay (defense, noise reduction, or timing strategy)
- Keep performance impact low enough to run on Android and desktop without server/TPS degradation
- Ship with a safe, low-risk rollback path if performance problems appear post-release

**Scope boundaries:**
- **In scope:** noise accumulation logic, custom unit type + AI targeting, spawn rules/caps, configurable difficulty settings, JS/Java hybrid implementation, kill-switch toggle
- **Out of scope (for v1):** iOS support (blocked by platform restrictions - see Section 4), full sound-propagation physics, multiplayer-balanced tuning (treat as single-player-first, harden for MP later), rewriting core pathfinding

**Validation status:** Confirmed via web search that no existing Mindustry mod implements this specific mechanic - the idea is original as of this conversation (July 2026). NoiseTech (existing difficulty mod, unrelated despite the name) needs a direct compatibility check before Phase 2 - see Task 1.3 below.

**Target game version:** *(to be filled in before Task 1.1 - record the exact Mindustry build/version this mod targets, and note the plan for a mid-development game update: pin to a version tag, or track main and accept possible breakage.)*

---

## 2. Context & Technical Specifications

**Modding stack decisions:**
- Scripting language: **JavaScript (Rhino runtime)** - Mindustry's built-in scripting system, entry point `main.js`, additional files via `require()`
- Content definition: **JSON/Hjson** for static content (unit stats, sprites), JS for dynamic behavior (noise tracking, spawn logic)
- Java extension classes accessible from JS via `extendContent` for deeper hooks where JS alone isn't sufficient

**Architecture outline:**
```
project/
├── mod.hjson
├── content/
│   ├── units/          # new enemy unit definition
│   └── blocks/          # optional: silencer/muffler counterplay block
├── scripts/
│   ├── main.js          # entry point, event hooks
│   └── noise-tracker.js # noise accumulation + decay logic
├── sprites/
└── sounds/
```

**Key technical references identified:**
- `EventType.java` (core source) - for listening to block update / mining ticks
- `Groups.unit` and `Vec2` distance utilities - for target-seeking logic, matching vanilla "seek nearest" AI patterns
- `WaveSpawner.java` / `Pathfinder.java` / `BlockIndexer.java` - existing vanilla systems to reference rather than reinvent

**Constraints established in conversation:**
- Mindustry's logic loop is hard-capped at 60 TPS; dropping below 59 causes visible desync (conveyors slow, units lag, logic desyncs)
- Enemy pathfinding (A*) is the most CPU-expensive operation in the engine - spawn frequency must be capped
- iOS cannot run any mod using JavaScript or Java (Apple App Store restriction) - Android/desktop only, confirmed platform limitation
- Rhino JS engine is dated (limited ES6+ support) - avoid assuming modern JS features work

---

## 3. Detailed Task Breakdown

*Each task below should get a rough size estimate (S / M / L) filled in during sprint planning before work starts - sizes are intentionally left blank here since this is solo/small-team work and estimates should come from whoever is actually building each piece.*

### Phase 1: Foundation & Setup

**Task 1.1 - Project scaffolding** *(size: __)*
- Create standard mod directory structure (`mod.hjson`, `content/`, `scripts/`, `sprites/`, `sounds/`)
- Set up GitHub repo for distribution (required for mod browser visibility)
- Reference `ExampleMod` repo structure as baseline
- Record target Mindustry version (see Section 1) in `mod.hjson` and README
- *Dependencies:* none - do this first

**Task 1.2 - Dev environment** *(size: __)*
- Confirm local Mindustry build supports mod hot-reloading for iteration speed
- Set up a low-end test device/VM alongside main dev machine (performance testing, see Phase 5)
- *Dependencies:* Task 1.1

**Task 1.3 - NoiseTech compatibility investigation (NEW)** *(size: __)*
- Determine whether v1 needs to coexist with or layer on top of the existing "NoiseTech" difficulty mod
- Check for hook/namespace collisions (event listeners, content IDs, settings keys) if both mods could be loaded simultaneously
- Output: a short go/no-go note - either "no interaction, proceed independently" or "requires compatibility shim, scope into Phase 2"
- *Dependencies:* Task 1.1
- *Why this moved up:* this affects architecture decisions in Phase 2 (event hook design), so it needs an answer before noise-tracking code is written, not as an afterthought in Section 5.

### Phase 2: Core Noise System

**Task 2.1a - Noise accumulator core logic (SPLIT from original 2.1)** *(size: __)*
- Implement a per-tile (or per-block-instance) noise value that increases while a mining block is actively drilling
- Apply decay per tick when mining stops or noise source is inactive
- Define noise output value per drill tier (mechanical < pneumatic < laser/blast drills)
- Store accumulator keyed by tile position in a lightweight map/object
- Write as pure/testable logic where possible, decoupled from engine event hooks, so it can be unit-tested standalone
- *Dependencies:* Phase 1 complete, Task 1.3 resolved

**Task 2.1b - Tick-batching integration hook (SPLIT from original 2.1)** *(size: __)*
- Wire the accumulator from 2.1a into the actual game tick/event system
- Batch this check to run every N ticks (e.g., every 30-60 ticks), **not every frame**, to protect TPS
- This is the highest-risk sub-task of Phase 2 since it touches live engine hooks - test in isolation before adding spawn logic on top
- *Dependencies:* Task 2.1a

**Task 2.1c - Noise query API (SPLIT from original 2.1)** *(size: __)*
- Expose a `getNoiseLevel(tile)` helper for spawn logic to query
- *Dependencies:* Task 2.1a

**Task 2.2 - Spawn trigger logic** *(size: __)*
- Hook into tick event to check accumulated noise against a configurable threshold
- On threshold breach, roll spawn chance (scales with noise magnitude)
- Spawn location: just outside player's explored/visible radius, nearest to the noise source
- Hard cap: max concurrent spawned units per noise source (recommend starting at 1-2)
- Cooldown timer per location before re-triggering
- *Dependencies:* Task 2.1b, Task 2.1c

### Phase 3: Enemy Unit & AI

**Task 3.1 - Define new unit type** *(size: __)*
- Create unit JSON/Hjson definition (stats, sprite, weapon/attack behavior)
- Keep initial stats weak-but-numerous per earlier design discussion (encourages turret defense over raw stat checks)
- *Dependencies:* none - can start in parallel with Phase 2

**Task 3.2 - Custom targeting AI** *(size: __)*
- Override default "seek core" behavior to instead seek nearest active noise source
- Use `Groups.unit` + `Vec2` distance calculations (matching vanilla pattern) to find nearest qualifying block
- Fallback behavior: if noise source destroyed/depleted before arrival, retarget to nearest infrastructure or core
- *Dependencies:* Task 2.2, Task 3.1

**Task 3.3 - Player warning/tell** *(size: __)*
- Add audio or visual cue (distant sound, screen ping) before unit arrives, so players aren't blindsided
- *Dependencies:* Task 3.1

### Phase 4: Counterplay & Balance

**Task 4.1 - Muffler/silencer block (optional but recommended)** *(size: __)*
- New block that reduces noise radius or accumulation rate near it
- Costs power or resource to operate - creates a strategic tradeoff rather than a free fix
- *Dependencies:* Phase 2 complete
- *Decision needed:* confirm in/out of v1 scope (see Section 5 open questions) before starting

**Task 4.2 - Configurable difficulty settings** *(size: __)*
- Expose mod settings for: noise threshold, spawn chance scaling, max concurrent units, cooldown duration
- *Dependencies:* Phase 2, Phase 3

**Task 4.3 - Kill-switch / spawn disable toggle (NEW)** *(size: __)*
- Add a mod setting that disables *spawning* entirely while leaving noise tracking inert/running
- Purpose: if Phase 5 or post-release testing reveals a TPS problem, this allows a fast, low-risk mitigation (toggle off) without a full mod rollback or emergency patch
- Should default to **on** (spawning enabled) but be trivially discoverable in settings
- *Dependencies:* Task 2.2, Task 4.2
- *Why this was added:* Section 4 already flags performance as the top implementation risk; there was no corresponding mitigation task for the "what if it's still a problem after ship" scenario.

### Phase 5: Testing & Performance Validation

**Task 5.1 - Performance/TPS testing** *(size: __)*
- **Defined test scenario (NEW - replaces vague original wording):**
  - Run 8 drills of the highest tier simultaneously for a 10-minute session
  - Log TPS every 5 seconds throughout
  - **Pass criteria:** TPS never dips below 59 for more than 2 consecutive seconds
  - **Fail criteria:** any sustained dip beyond that threshold - if failed, revisit batching interval (Task 2.1b) before proceeding to Phase 6
- Repeat scenario on low-end test device/VM from Task 1.2
- Stress-test spawn caps in multiplayer-like conditions if MP support is a goal
- *Dependencies:* Phase 2, Phase 3, Phase 4 complete

**Task 5.2 - Playtesting for balance** *(size: __)*
- **Test audience (NEW - replaces unspecified "feedback"):** *(decide before this task starts - solo dev running N full games, or a small external tester group? If external, this becomes dependent on having a shareable build and should be flagged as a soft blocker on Phase 6 timing.)*
- Minimum suggested baseline if solo: 3 full games played start-to-finish with noise mechanic active
- Validate noise thresholds don't trigger too early (punishing normal early mining) or too late (no tension)
- Iterate on spawn chance curve based on playtest feedback
- *Dependencies:* Task 5.1 passed

### Phase 6: Distribution

**Task 6.1 - Publish** *(size: __)*
- Push to GitHub, submit to in-game mod browser
- Write clear mod description noting **Android/desktop only** (iOS incompatibility)
- Document the kill-switch setting (Task 4.3) in the mod description/README so players and the dev know it exists if issues surface
- *Dependencies:* Phase 5 complete

---

## 4. Important Notes & Edge Cases

- **iOS incompatibility is a hard platform limitation**, not a bug to fix - Apple blocks JS/Java mods outright. Decide early whether to drop iOS from scope entirely (recommended) or attempt a JSON-only fallback (likely infeasible for this mechanic).
- **Performance is the top implementation risk.** Enemy pathfinding is already the most expensive operation in the engine - uncapped or overly-frequent spawns from a noise system could tank TPS, especially with multiple drills running simultaneously. This is why Task 4.3 (kill-switch) and Task 5.1 (defined test protocol) were added.
- **Rhino JS engine limitations** - don't assume full modern JavaScript syntax works; test early rather than discovering incompatibilities late.
- **Avoid per-frame noise checks** - batch every 30-60 ticks. This was flagged as the single most important performance safeguard, and is now isolated as its own task (2.1b) so it gets dedicated testing attention.
- **Multiplayer is a secondary concern** - design and test single-player first, then harden spawn caps/cooldowns before considering server deployment.
- **Original idea confirmed** - no prior mod, GitHub issue, or forum discussion found proposing this exact mechanic. NoiseTech is a same-space-adjacent but functionally unrelated mod; compatibility (not originality) is the open concern - see Task 1.3.
- **Game version drift** - mods can break on Mindustry updates mid-development. Pin a target version early (Section 1) and decide in advance how to handle an update landing before Phase 6.

---

## 5. Open Questions & Next Steps

**Open questions (need input before/during build):**
- Final naming for the enemy unit ("Skitter," "Gnawer," or other)?
- Should the muffler/counterplay block (Task 4.1) be in v1 scope, or added later as a follow-up update?
- Is multiplayer support a goal for v1, or single-player only initially?
- Who is the playtesting audience for Task 5.2 - solo dev only, or external testers? (Affects whether Phase 6 timing has a soft dependency on a public/shareable build.)
- NoiseTech interaction (Task 1.3): does it need investigation only, or active compatibility work?

**Immediate next steps:**
1. Fill in the target Mindustry version (Section 1) and task size estimates (Section 3) before writing any code
2. Set up project scaffolding (Task 1.1) and GitHub repo
3. Resolve NoiseTech compatibility question (Task 1.3) - this affects Phase 2 architecture
4. Prototype the noise accumulator (Task 2.1a) in isolation - test tick-budget performance before wiring in the event hook (2.1b) or spawn logic on top
5. Draft the enemy unit JSON definition (Task 3.1) in parallel, since it has no dependency on the noise system being finished
