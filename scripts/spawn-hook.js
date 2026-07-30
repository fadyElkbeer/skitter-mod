// spawn-hook.js
//
// Task 2.2 + spawning half of Task 3.2 + Task 3.3 (reserved): wires
// spawn-trigger.js into the live game loop and spawns a real Skitter
// unit. Single-drill spawns are silent by design (per mod-units.md) -
// warnPlayer() exists but isn't called yet, reserved for the future
// wave-based spawn mechanism, which should warn the player.
//
// CONFIRMED: same Events.run(EventType.Trigger.update, ...) pattern as
// noise-hook.js (Trigger-type events use .run, not .on) - see that
// file's header for the source citation.
//
// CONFIRMED: Trigger.update fires even while paused - Vars.state.isPaused()
// must be checked explicitly, same as noise-hook.js. See that file's
// header for how this was found.
//
// CONFIRMED against official Mindustry API docs / source (not guessed):
//   - UnitType.spawn(Team team, float x, float y) is a real public
//     method (mindustry.type.UnitType, official docs page).
//   - Vars.state.rules.waveTeam (Team.crux) is the correct, stable team
//     to spawn on - confirmed via Rules.java source AND by live testing
//     (see BUG_TEAM below for the full story: an attempt to switch to a
//     dedicated Team.green faction caused spawned units to be destroyed
//     immediately at full health, for reasons not yet understood -
//     reverted back to waveTeam, which has never shown this problem).
//   - Vars.content.unit(name) IS the right lookup method - confirmed via
//     live console. The content NAME needed a fix though: mod content is
//     namespaced as "<modname>-<contentname>", not the plain filename
//     stem. Confirmed by running
//     Vars.content.units().each(function(u){ Log.info(u.name) }) in-game,
//     which printed "skitter-mod-skitter". My original guess of plain
//     "skitter" returned nothing (logged as an ERROR by the defensive
//     check below, rather than crashing - worth keeping that check
//     around even now that this specific name is fixed).
//
// NOT YET CONFIRMED - needs an in-game check:
//   - Vars.tilesize as the tile-to-world-pixel conversion factor
//     (commonly 8 in Mindustry, but referenced here as a named constant
//     rather than hardcoded specifically so a wrong assumption fails
//     loudly instead of silently misplacing every spawn).
//
// STILL A KNOWN GAP:
//   - FIXED (was: spawning directly on the noise source's own tile, i.e.
//     inside the building - confirmed as a real visible bug via a
//     screenshot showing Skitters spawned on top of turrets). Now
//     searches outward for the nearest non-solid tile instead - see
//     findNearestOpenTile below. This is NOT the same as the plan's
//     original "just outside the player's explored/visible radius"
//     spec - it just finds open ground near the source, with no
//     awareness of what the player can currently see. Vision-based
//     placement is still a separate, unimplemented feature.
//   - recordUnitRemoved() (spawn-trigger.js) still isn't wired to
//     anything - there's no UnitDestroyEvent listener yet tying a real
//     unit's death back to the source that spawned it, so the
//     concurrency cap only ever counts up, never down. This is now a
//     real problem (not just a placeholder limitation) since real units
//     now exist and can die - worth addressing soon, but treating as a
//     separate follow-up rather than blocking this spawn wiring.

var noiseTracker = require("noise-tracker");
var noiseHook = require("noise-hook");
var spawnTrigger = require("spawn-trigger");

// Task 3E.2 - REOPENED, reverted.
//
// Attempted: a dedicated bug faction (Team.green) instead of Team.crux
// (waveTeam), so bugs would be a genuinely separate faction per
// mod-units.md. Confirmed via live testing that distinct teams ARE
// hostile to each other by default (no relationship code needed) - see
// the eachEnemyCore() finding below - but this ran into a real,
// unresolved problem:
//
// PROBLEM: Skitters spawned on Team.green were destroyed IMMEDIATELY
// (same tick) at full health (health=35, maxHealth=35 - confirmed via
// a live UnitDestroyEvent listener, so this is not combat damage).
// Team.crux never showed this behavior.
//
// RULED OUT: unit cap. Vars.state.teams.get(Team.green).unitCap and
// the same for Team.crux both returned 0 - if a zero cap caused
// instant destruction, crux's Skitters would have died too, and they
// never did. This was a real, useful negative result, not just an
// inconclusive one.
//
// STILL UNKNOWN: the actual mechanism. Best remaining guess is some
// form of "coreless team cleanup" that exempts crux (since vanilla wave
// enemies never have a core either) but not arbitrary color teams like
// green - but this is genuinely unconfirmed, not verified against a
// primary source or a passing live test the way everything else in
// this file is. Rather than keep guessing at obscure engine internals
// live, reverted to the known-working configuration and left this as
// an open question (see Section 5 of the implementation plan) instead
// of a resolved fact.
//
// CONFIRMED (kept, still true): Vars.state.teams.eachEnemyCore(
// Team.derelict, cb) found the player's (sharded) core as an enemy of
// derelict, an otherwise-unused team, with zero relationship-setup
// code. Distinct teams being hostile by default is real - the open
// problem is specifically about a spawned unit surviving on such a
// team, not about hostility.
var BUG_TEAM = Vars.state.rules.waveTeam;

// Reuses noise-hook.js's batch cadence rather than introducing a second
// magic number - if Task 5.1 TPS testing says the interval needs to
// change, it should change in exactly one place today (noise-hook.js),
// with this file following in a later pass once both are proven stable
// together.
var BATCH_INTERVAL = 60;

// Note: this registers its own Events.run(Trigger.update, ...) listener
// rather than piggybacking on noise-hook.js's. Two listeners doing
// cheap counter increments is not the performance concern here - the
// expensive work (Groups.build iteration) stays isolated to noise-hook.js
// alone. If Task 5.1's TPS testing later shows listener count itself
// matters, merging these is a safe follow-up refactor, not a redesign.
var tickCounter = 0;
var totalTicks = 0;

Events.run(EventType.Trigger.update, function () {
  // See noise-hook.js's header - Trigger.update fires even while paused,
  // confirmed via live testing. Must bail out before touching any
  // counters, or paused time silently counts toward cooldowns/spawns.
  if (Vars.state.isPaused()) return;

  tickCounter++;
  totalTicks++;

  if (tickCounter < BATCH_INTERVAL) {
    return;
  }
  tickCounter = 0;

  runSpawnCheck();
});

function runSpawnCheck() {
  var tracked = noiseTracker.getTrackedPositions();
  for (var i = 0; i < tracked.length; i++) {
    var pos = tracked[i];
    var noiseLevel = noiseHook.getNoiseLevel(pos);

    if (spawnTrigger.shouldSpawn(pos.x, pos.y, noiseLevel, totalTicks)) {
      spawnTrigger.recordSpawnStarted(pos.x, pos.y, totalTicks);
      spawnSkitter(pos.x, pos.y);
    }
  }
}

// Cached lazily (on first real spawn attempt, not at module load time)
// to sidestep any content-load-order uncertainty - by the time a spawn
// is actually triggered, mod content is unquestionably fully loaded.
//
// CONFIRMED via live console: mod content names are namespaced as
// "<modname>-<contentname>", not the plain filename stem. Ran
// Vars.content.units().each(function(u){ Log.info(u.name) }) in-game
// and it printed "skitter-mod-skitter" (mod name "skitter-mod" +
// content name "skitter"). My original guess of plain "skitter" was
// wrong - that's why Vars.content.unit("skitter") returned nothing.
var cachedSkitterType = null;

function getSkitterType() {
  if (!cachedSkitterType) {
    cachedSkitterType = Vars.content.unit("skitter-mod-skitter");
  }
  return cachedSkitterType;
}

// Real bug found via live testing: spawning directly at the noise
// source's own tile puts the unit ON TOP OF the drill/extractor itself,
// since that tile IS the building. Fixed by searching outward in
// expanding square rings for the nearest tile that isn't solid.
//
// CONFIRMED against Mindustry source (World.java): World.solid(x, y) is
// a real public method - "return tile == null || tile.solid();" - so
// checking !Vars.world.solid(x, y) correctly identifies open, walkable
// ground. Vars.world itself is confirmed accessible the same way
// Vars.state/Vars.content are (seen used directly in Mindustry's own
// BuildingComp.java as Vars.world.tile(...)).
//
// This does NOT yet implement the plan's original "just outside the
// player's explored/visible radius" spec - that's a separate, bigger
// feature needing a fog-of-war/vision API this function doesn't touch.
// This only fixes the concrete visible bug (unit spawning inside a
// building) with the simplest correct fix: nearest open ground, full
// stop. Revisit vision-based placement as its own follow-up.
var MAX_SPAWN_SEARCH_RADIUS = 6;

function findNearestOpenTile(centerX, centerY, maxRadius) {
  for (var r = 0; r <= maxRadius; r++) {
    for (var dx = -r; dx <= r; dx++) {
      for (var dy = -r; dy <= r; dy++) {
        // Only check the ring boundary at exactly radius r - inner
        // tiles were already checked at smaller r values.
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;

        var tx = centerX + dx;
        var ty = centerY + dy;
        if (!Vars.world.solid(tx, ty)) {
          return { x: tx, y: ty };
        }
      }
    }
  }
  return null; // nothing open within maxRadius - caller must handle
}

// Spawns a real Skitter unit near the noise source, at the nearest open
// (non-solid) tile rather than directly on top of the source building.
// See the header for what's confirmed vs. still a guess/gap here.
//
// Design decision (per mod-units.md clarification): single-drill spawns
// are meant to be SILENT - no toast, no sound. The player warning is
// reserved for the wave-based spawn mechanism (aggregates all faction
// noise over time, spawns a scaled mix of units, not yet implemented -
// see mod-units.md's "wave that should calculate all noise..." note).
// warnPlayer() below is kept intact and ready for that mechanism to call
// once it exists, rather than deleted and rewritten later.
function spawnSkitter(sourceTileX, sourceTileY) {
  var type = getSkitterType();
  if (!type) {
    Log.info("[skitter-mod] ERROR: Vars.content.unit(\"skitter-mod-skitter\") returned nothing - check in-game");
    return;
  }

  var openTile = findNearestOpenTile(sourceTileX, sourceTileY, MAX_SPAWN_SEARCH_RADIUS);
  if (!openTile) {
    Log.info("[skitter-mod] no open tile found within " + MAX_SPAWN_SEARCH_RADIUS + " tiles of noise source (" + sourceTileX + "," + sourceTileY + ") - skipping this spawn");
    return;
  }

  var worldX = openTile.x * Vars.tilesize;
  var worldY = openTile.y * Vars.tilesize;
  var team = BUG_TEAM;

  type.spawn(team, worldX, worldY);
  Log.info("[skitter-mod] spawned Skitter at open tile (" + openTile.x + "," + openTile.y + ") near noise source (" + sourceTileX + "," + sourceTileY + ")");

  // Deliberately NOT calling warnPlayer() here - single-drill spawns are
  // silent by design. See the comment above.
}

// Task 3.3: player warning/tell. NOT currently called by anything -
// reserved for the future wave-based spawn mechanism (see mod-units.md),
// which per the design should warn the player, unlike single-drill
// spawns which are silent.
//
// CONFIRMED (official wiki example, verbatim pattern):
//   Vars.ui.hudfrag.showToast("message") - on-screen toast notification.
//
// CONFIRMED (live in-game error) that "spawn" is NOT a real field on
// Sounds: "InternalError: Java class mindustry.gen.Sounds has no public
// instance field or method named 'spawn'." That guess (from a name dump
// on the wiki's SoundEffect page that mixed sound and Fx names without
// distinguishing them) was wrong. Removed rather than guessed again -
// the toast alone satisfies the plan's "audio OR visual cue"
// requirement. A real sound can be added later once the correct field
// name (or a custom .ogg/.mp3 asset) is confirmed.
function warnPlayer(worldX, worldY) {
  Vars.ui.hudfrag.showToast("Skitter incoming!");
}

module.exports = {
  runSpawnCheck: runSpawnCheck
};
