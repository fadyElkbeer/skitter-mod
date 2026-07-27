// spawn-hook.js
//
// Task 2.2: wires spawn-trigger.js into the live game loop, batched on
// the same interval as noise-hook.js (Task 2.1b).
//
// CONFIRMED: same Events.on(EventType.Trigger.update, ...) pattern as
// noise-hook.js - see that file's header for the source citation.
//
// NOT YET CONFIRMED / NOT YET IMPLEMENTED:
//   - Actually spawning a unit. Task 3.1 hasn't defined the "Skitter"
//     unit type yet, so spawnPlaceholder() below only logs. Task 3.2
//     ("Custom targeting AI", which the plan lists as depending on both
//     this task AND Task 3.1) is where the real spawn call belongs.
//   - Picking a spawn location "just outside the player's explored/
//     visible radius" per the plan's Task 2.2 spec. That needs a
//     fog-of-war/vision API this file doesn't touch yet - spawnPlaceholder
//     receives the noise SOURCE position only, not a computed spawn
//     point. Treat this as a known gap, not an oversight.
//   - recordUnitRemoved() (spawn-trigger.js) is never called from
//     anywhere yet, since there's no real unit to attach an
//     UnitDestroyEvent listener to. Until Task 3.2 wires that up, the
//     concurrency cap will only ever count placeholder "spawns" that
//     never actually die - acceptable for now since spawnPlaceholder
//     doesn't create anything persistent, but flagging so this isn't
//     mistaken for finished behavior.

var noiseTracker = require("noise-tracker.js");
var noiseHook = require("noise-hook.js");
var spawnTrigger = require("spawn-trigger.js");

// Reuses noise-hook.js's batch cadence rather than introducing a second
// magic number - if Task 5.1 TPS testing says the interval needs to
// change, it should change in exactly one place today (noise-hook.js),
// with this file following in a later pass once both are proven stable
// together.
var BATCH_INTERVAL = 60;

// Note: this registers its own Events.on(Trigger.update, ...) listener
// rather than piggybacking on noise-hook.js's. Two listeners doing
// cheap counter increments is not the performance concern here - the
// expensive work (Groups.build iteration) stays isolated to noise-hook.js
// alone. If Task 5.1's TPS testing later shows listener count itself
// matters, merging these is a safe follow-up refactor, not a redesign.
var tickCounter = 0;
var totalTicks = 0;

Events.on(EventType.Trigger.update, function () {
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
      spawnPlaceholder(pos.x, pos.y);
    }
  }
}

// TODO (Task 3.1/3.2): replace with a real unit spawn once the Skitter
// unit type exists, and with an actual computed spawn point once vision/
// fog-of-war lookup is implemented. For now this just proves the trigger
// logic is actually firing when noise crosses the threshold.
function spawnPlaceholder(sourceX, sourceY) {
  Log.info("[skitter-mod] spawn triggered near noise source (" + sourceX + "," + sourceY + ") - no unit type defined yet (Task 3.1 pending)");
}

module.exports = {
  runSpawnCheck: runSpawnCheck
};
