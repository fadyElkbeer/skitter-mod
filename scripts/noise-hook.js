// noise-hook.js
//
// Task 2.1b: wires noise-tracker.js (Task 2.1a) into the live Mindustry
// event loop. This is the highest-risk file in the mod since it's the
// only one touching real engine APIs instead of pure logic.
//
// CONFIRMED against official Mindustry wiki / EventType.java source:
//   - Events.on(EventType.Trigger.update, callback) fires every game
//     update tick. Trigger.update is listed under "events that occur
//     very often" in EventType.java, which is exactly why we batch here
//     rather than acting on every call.
//   - require()/module.exports pattern matches main.js's existing usage.
//   - require() paths must NOT include the .js extension - confirmed
//     the hard way via an in-game "Module not found" error. Official
//     wiki examples use require("blocks") for a file named blocks.js.
//
// NOT YET CONFIRMED - verify these against the actual running game
// during Task 1.2's checklist, before trusting this file in Phase 5:
//   - Groups.build as the way to iterate all live buildings
//   - build.tile.x / build.tile.y for tile position
//   - build.block.name for the block's internal name
//   - build.efficiency as the "is this actively extracting right now"
//     signal (a drill/extractor at 0 efficiency is idle - unpowered,
//     blocked output, no ore under it, etc.)
// If any of these don't match what the console shows (F8 in-game),
// this file needs a follow-up fix before Phase 3 depends on it.

var noiseTracker = require("noise-tracker");

// Ticks between batches. 60 ticks = 1 second at Mindustry's 60 TPS cap.
// This is the single most important performance lever in the whole mod -
// raising it trades responsiveness for safety margin, lowering it does
// the opposite. Do not lower this without re-running Task 5.1's TPS test.
var BATCH_INTERVAL = 60;

// Maps a building's internal block name to the noise-tracker tier string.
// Names are inferred from Mindustry wiki URL slugs, NOT confirmed against
// Block.java source - flagged above as needing in-game verification.
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

Events.on(EventType.Trigger.update, function () {
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

  var buildings = Groups.build;
  for (var i = 0; i < buildings.size; i++) {
    var build = buildings.get(i);
    if (!build || !build.block) continue;

    var tier = BLOCK_NAME_TO_TIER[build.block.name];
    if (tier === undefined) continue; // not an extraction block we track

    // efficiency > 0 is our proxy for "actively extracting right now" -
    // see the NOT YET CONFIRMED note at the top of this file.
    if (build.efficiency <= 0) continue;

    var x = build.tile.x;
    var y = build.tile.y;
    noiseTracker.addNoise(x, y, tier, totalTicks);
    seenThisBatch[x + "," + y] = true;
  }

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
// Takes a Mindustry Tile (or any object with .x/.y - see the
// NOT YET CONFIRMED note at the top of this file re: tile.x/tile.y).
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
