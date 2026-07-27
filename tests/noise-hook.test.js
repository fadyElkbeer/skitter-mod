// noise-hook.test.js
//
// Tests the BATCHING/DECAY LOGIC in scripts/noise-hook.js (Task 2.1b) by
// mocking Mindustry's globals (Events, EventType, Groups). This does NOT
// verify that Groups.build, build.tile.x/y, build.block.name, or
// build.efficiency are the real API - see the NOT YET CONFIRMED comment
// block at the top of noise-hook.js for that. It only proves that IF
// those assumptions are correct, the batching and decay logic built on
// top of them behaves as intended.
//
// Run with: NODE_PATH=./scripts node tests/noise-hook.test.js
// (NODE_PATH is required because noise-hook.js uses Rhino-style bare
// require("noise-tracker") rather than a relative path, matching
// Mindustry's actual module resolution.)

var assert = require("assert");

var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log("PASS - " + name);
    passed++;
  } catch (e) {
    console.log("FAIL - " + name);
    console.log("       " + e.message);
    failed++;
  }
}

// Sets up fresh mock globals and a fresh require of both modules, since
// noise-hook.js registers its Events.run callback at require-time and
// noise-tracker.js keeps module-level state that must reset between tests.
function freshHarness(mockBuildings) {
  var capturedCallback = null;

  global.Events = {
    run: function (event, cb) {
      capturedCallback = cb;
    }
  };
  global.EventType = {
    Trigger: { update: "update" }
  };
  global.Groups = {
    build: {
      size: mockBuildings.length,
      get: function (i) {
        return mockBuildings[i];
      }
    }
  };

  // Force fresh module instances so state doesn't leak between tests.
  var trackerPath = require.resolve("../scripts/noise-tracker.js");
  var hookPath = require.resolve("../scripts/noise-hook.js");
  delete require.cache[trackerPath];
  delete require.cache[hookPath];

  var hook = require("../scripts/noise-hook.js");
  var tracker = require("../scripts/noise-tracker.js");

  return {
    tick: function () {
      capturedCallback();
    },
    tracker: tracker,
    hook: hook
  };
}

function mockBuilding(name, x, y, efficiency) {
  return {
    block: { name: name },
    tile: { x: x, y: y },
    efficiency: efficiency
  };
}

test("no batch runs before 60 ticks accumulate", function () {
  var h = freshHarness([mockBuilding("mechanical-drill", 1, 1, 1)]);
  for (var i = 0; i < 59; i++) h.tick();
  assert.strictEqual(h.tracker.trackedTileCount(), 0);
});

test("a batch runs on the 60th tick and adds noise for active drills", function () {
  var h = freshHarness([mockBuilding("mechanical-drill", 1, 1, 1)]);
  for (var i = 0; i < 60; i++) h.tick();
  assert.strictEqual(h.tracker.trackedTileCount(), 1);
  assert.ok(h.tracker.getRawNoiseLevel(1, 1, 60) > 0);
});

test("buildings with efficiency 0 are treated as inactive and add no noise", function () {
  var h = freshHarness([mockBuilding("mechanical-drill", 2, 2, 0)]);
  for (var i = 0; i < 60; i++) h.tick();
  assert.strictEqual(h.tracker.trackedTileCount(), 0);
});

test("buildings with an untracked block name are ignored", function () {
  var h = freshHarness([mockBuilding("conveyor", 3, 3, 1)]);
  for (var i = 0; i < 60; i++) h.tick();
  assert.strictEqual(h.tracker.trackedTileCount(), 0);
});

test("water_extractor and oil_extractor block names map to the right tiers", function () {
  var h = freshHarness([
    mockBuilding("water-extractor", 4, 4, 1),
    mockBuilding("oil-extractor", 5, 5, 1)
  ]);
  for (var i = 0; i < 60; i++) h.tick();
  var water = h.tracker.getRawNoiseLevel(4, 4, 60);
  var oil = h.tracker.getRawNoiseLevel(5, 5, 60);
  assert.strictEqual(water, h.tracker.NOISE_OUTPUT_BY_TIER.water_extractor);
  assert.strictEqual(oil, h.tracker.NOISE_OUTPUT_BY_TIER.oil_extractor);
});

test("a tile that goes inactive in a later batch decays instead of staying flat", function () {
  var buildings = [mockBuilding("mechanical-drill", 6, 6, 1)];
  var h = freshHarness(buildings);

  for (var i = 0; i < 60; i++) h.tick(); // batch 1: active, noise added
  var levelAfterActive = h.tracker.getRawNoiseLevel(6, 6, 60);

  buildings[0].efficiency = 0; // simulate the drill going idle
  for (var j = 0; j < 60; j++) h.tick(); // batch 2: inactive, should decay
  var levelAfterIdle = h.tracker.getRawNoiseLevel(6, 6, 120);

  assert.ok(
    levelAfterIdle < levelAfterActive,
    "expected noise to decay after the drill went idle"
  );
});

test("getNoiseLevel(tile) returns 0 for a tile with no activity", function () {
  var h = freshHarness([]);
  for (var i = 0; i < 60; i++) h.tick();
  assert.strictEqual(h.hook.getNoiseLevel({ x: 20, y: 20 }), 0);
});

test("getNoiseLevel(tile) matches getRawNoiseLevel for an active source", function () {
  var h = freshHarness([mockBuilding("laser-drill", 7, 7, 1)]);
  for (var i = 0; i < 60; i++) h.tick();

  var viaHook = h.hook.getNoiseLevel({ x: 7, y: 7 });
  var viaTracker = h.tracker.getRawNoiseLevel(7, 7, h.hook._getTotalTicksForTests());
  assert.strictEqual(viaHook, viaTracker);
  assert.strictEqual(viaHook, h.tracker.NOISE_OUTPUT_BY_TIER.laser);
});

test("getNoiseLevel(tile) reflects decay when queried in a later batch without new activity", function () {
  var buildings = [mockBuilding("blast-drill", 8, 8, 1)];
  var h = freshHarness(buildings);

  for (var i = 0; i < 60; i++) h.tick();
  var levelActive = h.hook.getNoiseLevel({ x: 8, y: 8 });

  buildings[0].efficiency = 0;
  for (var j = 0; j < 60; j++) h.tick();
  var levelIdle = h.hook.getNoiseLevel({ x: 8, y: 8 });

  assert.ok(levelIdle < levelActive, "expected getNoiseLevel to reflect decay over time");
});

console.log("");
console.log(passed + " passed, " + failed + " failed");
if (failed > 0) {
  process.exit(1);
}
