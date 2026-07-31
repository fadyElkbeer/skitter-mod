// buzzer-hook.js
//
// Task 3D.1 (spawn side): wires Buzzer into the live game loop. Per
// mod-units.md, Buzzer spawns in swarms of 2-3, triggered by "any
// active mining noise" - same trigger tier as Skitter (see the
// Escalation Summary table), but as an independent possibility, not a
// shared roll. That independence is why spawn-trigger.js was refactored
// (see its header) to key cooldown/cap state by (x, y, unitType)
// instead of just (x, y) - otherwise Buzzer and Skitter spawning from
// the same source would have incorrectly shared one cooldown.
//
// Reuses every confirmed API/pattern from noise-hook.js and
// spawn-hook.js rather than re-deriving them:
//   - Events.run(Trigger.update, ...), not Events.on() - Trigger events
//     are bare signals, confirmed via a live EvaluatorException while
//     building noise-hook.js.
//   - Vars.state.isPaused() must be checked first, every tick - Trigger.
//     update fires even while paused, confirmed via live testing.
//   - require() paths omit ".js" - confirmed via a live "module not
//     found" error while building main.js.
//   - Mod content names are namespaced "<modname>-<contentname>" -
//     confirmed via Vars.content.units().each(...) printing
//     "skitter-mod-skitter" for Skitter; Buzzer's lookup name follows
//     the same pattern.
//   - UnitType.spawn(Team, x, y) takes WORLD coordinates, needs
//     * Vars.tilesize - confirmed the hard way while building
//     spawn-hook.js (units clustering near the map corner otherwise).
//   - Vars.world.solid(x, y) identifies occupied tiles - confirmed
//     against World.java source; reused here via spawn-utils.js rather
//     than duplicating the search logic.
//
// NOT YET CONFIRMED, specific to this file:
//   - Whether spawning a full swarm of 2-3 units back-to-back in the
//     same batch tick causes any TPS concern. noise-hook.js/spawn-hook.js
//     were only ever tested spawning one Skitter per trigger - this is
//     the first place in the mod that spawns multiple units per trigger.
//     Worth keeping an eye on during Task 5.1's eventual formal TPS test.
//   - Buzzer uses the SAME BUG_TEAM as Skitter (Vars.state.rules.
//     waveTeam / Team.crux) for now, per Task 3E.2's reversion - see
//     spawn-hook.js for the full story on why a dedicated bug team
//     isn't safe to use yet.

var noiseTracker = require("noise-tracker");
var noiseHook = require("noise-hook");
var spawnTrigger = require("spawn-trigger");
var spawnUtils = require("spawn-utils");

// Same team as Skitter for now - see header note above and
// spawn-hook.js's Task 3E.2 section for the full reasoning.
var BUG_TEAM = Vars.state.rules.waveTeam;

// Buzzer spawns in swarms of 2-3 per mod-units.md. Placeholder pending
// Task 5.2 balance passes, same as every other tuning constant.
var SWARM_MIN = 2;
var SWARM_MAX = 3;

// Reuses noise-hook.js's batch cadence - see spawn-hook.js's identical
// comment for why this isn't a performance concern (the expensive work,
// Groups.build iteration, stays isolated to noise-hook.js alone).
var BATCH_INTERVAL = 60;

var tickCounter = 0;
var totalTicks = 0;

Events.run(EventType.Trigger.update, function () {
  if (Vars.state.isPaused()) return;

  tickCounter++;
  totalTicks++;

  if (tickCounter < BATCH_INTERVAL) {
    return;
  }
  tickCounter = 0;

  runBuzzerSpawnCheck();
});

function runBuzzerSpawnCheck() {
  var tracked = noiseTracker.getTrackedPositions();
  for (var i = 0; i < tracked.length; i++) {
    var pos = tracked[i];
    var noiseLevel = noiseHook.getNoiseLevel(pos);

    if (spawnTrigger.shouldSpawn(pos.x, pos.y, noiseLevel, totalTicks, undefined, "buzzer")) {
      spawnTrigger.recordSpawnStarted(pos.x, pos.y, totalTicks, "buzzer");
      spawnBuzzerSwarm(pos.x, pos.y);
    }
  }
}

// Cached lazily, same reasoning as spawn-hook.js's getSkitterType(): by
// the time a spawn is actually triggered, mod content is unquestionably
// fully loaded, so there's no need to look it up at module load time.
var cachedBuzzerType = null;

function getBuzzerType() {
  if (!cachedBuzzerType) {
    cachedBuzzerType = Vars.content.unit("skitter-mod-buzzer");
  }
  return cachedBuzzerType;
}

// Spawns a swarm of 2-3 Buzzers near the noise source. Each unit in the
// swarm gets its own independent nearest-open-tile search - they are
// NOT forced to cluster on a single tile. Tracks tiles already claimed
// by earlier members of THIS swarm (usedTiles) and excludes them from
// later searches - without this, every member would independently find
// the same "nearest" tile, since spawning a unit doesn't make a tile
// solid (confirmed via a failing test that caught exactly this before
// the fix: multiple Buzzers landing on identical coordinates).
function spawnBuzzerSwarm(sourceTileX, sourceTileY) {
  var type = getBuzzerType();
  if (!type) {
    Log.info("[skitter-mod] ERROR: Vars.content.unit(\"skitter-mod-buzzer\") returned nothing - check in-game");
    return;
  }

  var swarmSize = SWARM_MIN + Math.floor(Math.random() * (SWARM_MAX - SWARM_MIN + 1));
  var spawnedCount = 0;
  var usedTiles = {};

  for (var i = 0; i < swarmSize; i++) {
    var openTile = spawnUtils.findNearestOpenTile(sourceTileX, sourceTileY, 6, usedTiles);
    if (!openTile) {
      // Stop trying for this swarm rather than looping forever - if one
      // slot in the swarm can't find open ground, later ones probably
      // can't either (same crowded area), so bail out of the loop.
      break;
    }
    usedTiles[openTile.x + "," + openTile.y] = true;

    var worldX = openTile.x * Vars.tilesize;
    var worldY = openTile.y * Vars.tilesize;
    type.spawn(BUG_TEAM, worldX, worldY);
    spawnedCount++;
  }

  if (spawnedCount > 0) {
    Log.info("[skitter-mod] spawned a swarm of " + spawnedCount + " Buzzer(s) near noise source (" + sourceTileX + "," + sourceTileY + ")");
  } else {
    Log.info("[skitter-mod] no open tile found for any Buzzer in the swarm near noise source (" + sourceTileX + "," + sourceTileY + ") - skipping this spawn");
  }

  // Deliberately silent otherwise (no toast) - single-drill-triggered
  // spawns stay silent by design, same as Skitter. See spawn-hook.js's
  // matching note.
}

module.exports = {
  runBuzzerSpawnCheck: runBuzzerSpawnCheck
};
