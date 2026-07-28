// spawn-hook.js
//
// Task 2.2 + first half of Task 3.2: wires spawn-trigger.js into the
// live game loop, and now actually spawns a real Skitter unit (not just
// a log message) once Task 3.1 defined the unit type.
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
//   - Vars.state.rules.waveTeam is the correct dynamic "enemy team" to
//     spawn as - confirmed via Rules.java source: "public Team waveTeam
//     = Team.crux;". Using this instead of hardcoding Team.crux so this
//     still works correctly under rulesets that change it.
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
// STILL A KNOWN GAP (unchanged from before):
//   - Spawn location is still just the noise source's own tile, not
//     "just outside the player's explored/visible radius" per the
//     original plan spec - that needs a fog-of-war/vision API this file
//     doesn't touch yet.
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

// Spawns a real Skitter unit at the noise source's tile position.
// See the header for what's confirmed vs. still a guess/gap here.
function spawnSkitter(sourceTileX, sourceTileY) {
  var type = getSkitterType();
  if (!type) {
    Log.info("[skitter-mod] ERROR: Vars.content.unit(\"skitter-mod-skitter\") returned nothing - check in-game");
    return;
  }

  var worldX = sourceTileX * Vars.tilesize;
  var worldY = sourceTileY * Vars.tilesize;
  var team = Vars.state.rules.waveTeam;

  type.spawn(team, worldX, worldY);
  Log.info("[skitter-mod] spawned Skitter near noise source tile (" + sourceTileX + "," + sourceTileY + ")");
}

module.exports = {
  runSpawnCheck: runSpawnCheck
};
