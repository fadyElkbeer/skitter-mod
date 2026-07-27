// noise-hook.js
//
// Task 2.1b: wires noise-tracker.js (Task 2.1a) into the live Mindustry
// event loop. This is the highest-risk file in the mod since it's the
// only one touching real engine APIs instead of pure logic.
//
// CONFIRMED against official Mindustry wiki / EventType.java source /
// actual in-game testing:
//   - Trigger.update fires every game update tick. Trigger.update is
//     listed under "events that occur very often" in EventType.java,
//     which is exactly why we batch here rather than acting on every
//     call.
//   - Trigger-type events (bare signals with no event object) use
//     Events.run(Trigger.x, callback) - NOT Events.on(), which is for
//     typed events like UnitDestroyEvent. Found via an in-game
//     EvaluatorException: "Can't find method arc.Events.on(...Trigger,
//     Function)" - Events.on has no overload for Trigger.
//   - require()/module.exports pattern matches main.js's existing usage.
//   - require() paths must NOT include the .js extension - confirmed
//     the hard way via an in-game "Module not found" error. Official
//     wiki examples use require("blocks") for a file named blocks.js.
//
//   - Groups.build.each(Cons) is how you iterate live buildings - there
//     is NO indexed access (no .size property, no .get(i)). Confirmed
//     via live console: Groups.build.get(0) threw "Cannot find function
//     get in object mindustry.entities.EntityGroup". Groups.build.size
//     is a method (int size()), not a property - my original code used
//     it as a property, which combined with the missing get(i) meant
//     the batch loop silently never ran (zero spawns, zero errors, for
//     a full 5-minute in-game test - the kind of bug tests can't catch
//     without a real game to run against).
//   - build.tile.x / build.tile.y - confirmed via live console
//     (Groups.build.each(function(b){...b.tile.x...}) printed real
//     coordinates like "91,90").
//   - build.block.name - confirmed the same way (printed real names:
//     "core-shard", "water-extractor", "blast-drill", "salvo",
//     "item-source", "item-void" - all matching real Serpulo content).
//   - build.efficiency - confirmed via live console, printed as a plain
//     number (e.g. "eff=1") on active drills, no method-call needed.
//   - Trigger.update fires even while the game is paused. Confirmed via
//     live testing: spawn-triggered messages kept appearing while
//     paused, and Vars.state.isPaused() returned true at the console
//     during that time. Every tick-driven file must check this itself -
//     it is NOT handled automatically by the engine.

var noiseTracker = require("noise-tracker");

// Ticks between batches. 60 ticks = 1 second at Mindustry's 60 TPS cap.
// This is the single most important performance lever in the whole mod -
// raising it trades responsiveness for safety margin, lowering it does
// the opposite. Do not lower this without re-running Task 5.1's TPS test.
var BATCH_INTERVAL = 60;

// Maps a building's internal block name to the noise-tracker tier string.
// "water-extractor" and "blast-drill" confirmed via live console output
// (see header). The other three (mechanical-drill, pneumatic-drill,
// laser-drill, oil-extractor) weren't in this particular test session's
// buildings, so they're still inferred from the same wiki-slug naming
// pattern that turned out correct for the two we could check - high
// confidence, not yet independently confirmed for those specific names.
var BLOCK_NAME_TO_TIER = {
  "mechanical-drill": "mechanical",
  "pneumatic-drill": "pneumatic",
  "laser-drill": "laser",
  "blast-drill": "blast",
  "water-extractor": "water_extractor",
  "oil-extractor": "oil_extractor"
};

var tickCounter = 0; // triggers a batch every BATCH_INTERVAL ticks
var totalTicks = 0;  // monotonically increasing - passed to noise-tracker for decay math

Events.run(EventType.Trigger.update, function () {
  // Confirmed via live console (Vars.state.isPaused() returned true while
  // spawn-triggered messages kept appearing): Trigger.update fires even
  // while the game is paused. Without this check, noise would keep
  // accumulating and decaying "in the background" during pause, and the
  // instant you unpaused you'd see whatever built up during that time
  // resolve all at once. Bail out before touching tickCounter/totalTicks
  // at all, so paused time genuinely doesn't count.
  if (Vars.state.isPaused()) return;

  tickCounter++;
  totalTicks++;

  if (tickCounter < BATCH_INTERVAL) {
    return;
  }
  tickCounter = 0;

  runBatch();
});

function runBatch() {
  // Tracks which tile keys were seen as active this batch, so we know
  // which previously-tracked tiles to decay afterward.
  var seenThisBatch = {};

  Groups.build.each(function (build) {
    if (!build || !build.block) return;

    var tier = BLOCK_NAME_TO_TIER[build.block.name];
    if (tier === undefined) return; // not an extraction block we track

    // efficiency > 0 is our proxy for "actively extracting right now" -
    // confirmed via in-game console testing (see header note).
    if (build.efficiency <= 0) return;

    var x = build.tile.x;
    var y = build.tile.y;
    noiseTracker.addNoise(x, y, tier, totalTicks);
    seenThisBatch[x + "," + y] = true;
  });

  // Decay every tracked tile that wasn't actively adding noise this batch.
  var tracked = noiseTracker.getTrackedPositions();
  for (var j = 0; j < tracked.length; j++) {
    var pos = tracked[j];
    var key = pos.x + "," + pos.y;
    if (!seenThisBatch[key]) {
      noiseTracker.decayInactive(pos.x, pos.y, totalTicks);
    }
  }
}

// Task 2.1c: query API for spawn logic (Task 2.2).
//
// Lives here rather than in noise-tracker.js because getRawNoiseLevel()
// needs a "current tick" to compute decay-since-last-update, and
// noise-hook.js is the module that actually knows what tick it is.
// noise-tracker.js stays tick-agnostic/pure per Task 2.1a's design.
//
// Takes a Mindustry Tile (or any object with .x/.y - confirmed working,
// see the header note above).
function getNoiseLevel(tile) {
  return noiseTracker.getRawNoiseLevel(tile.x, tile.y, totalTicks);
}

// Test-only accessor so tests can assert on the tick clock without
// reaching into module-private state directly.
function _getTotalTicksForTests() {
  return totalTicks;
}

module.exports = {
  getNoiseLevel: getNoiseLevel,
  _getTotalTicksForTests: _getTotalTicksForTests
};
