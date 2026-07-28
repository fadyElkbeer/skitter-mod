// spawn-hook.test.js
//
// Tests scripts/spawn-hook.js (Task 2.2 + first half of Task 3.2) by
// mocking Mindustry globals, same approach as noise-hook.test.js.
// Proves the wiring between noise-tracker -> noise-hook -> spawn-trigger
// -> spawnSkitter fires correctly, including the tile-to-world coordinate
// conversion, team lookup, and the nearest-open-tile search. Does NOT
// prove Vars.content.unit("skitter-mod-skitter") is exactly right, or
// that Vars.tilesize/Vars.world.solid behave identically in the real
// game - see the header comment in spawn-hook.js for what's confirmed
// vs. still an assumption.
//
// Run with: NODE_PATH=./scripts node tests/spawn-hook.test.js

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

// Captures every Events.run registration (both noise-hook.js and
// spawn-hook.js register their own listener), every Log.info call, and
// every mock unit-type spawn() call, so tests can assert on team/position.
function freshHarness(mockBuildings, fixedRandomValue, solidTileKeys) {
  var callbacks = [];
  var logMessages = [];
  var spawnCalls = [];
  var paused = false;

  var mockWaveTeam = "mockCruxTeam";
  var mockSkitterType = {
    spawn: function (team, x, y) {
      spawnCalls.push({ team: team, x: x, y: y });
    }
  };

  // By default, treat exactly the buildings' own tiles as solid (since
  // a building obviously occupies its own tile) and everything else as
  // open ground - matches reality closely enough for these tests. Pass
  // solidTileKeys explicitly to override for tests that need a bigger
  // solid footprint (simulating a multi-tile building).
  var solidSet = {};
  if (solidTileKeys) {
    for (var s = 0; s < solidTileKeys.length; s++) solidSet[solidTileKeys[s]] = true;
  } else {
    for (var b = 0; b < mockBuildings.length; b++) {
      solidSet[mockBuildings[b].tile.x + "," + mockBuildings[b].tile.y] = true;
    }
  }

  global.Events = {
    run: function (event, cb) {
      callbacks.push(cb);
    }
  };
  global.EventType = {
    Trigger: { update: "update" }
  };
  global.Groups = {
    build: {
      each: function (cb) {
        for (var i = 0; i < mockBuildings.length; i++) cb(mockBuildings[i]);
      }
    }
  };
  global.Log = {
    info: function (msg) {
      logMessages.push(msg);
    }
  };
  global.Vars = {
    state: {
      isPaused: function () {
        return paused;
      },
      rules: {
        waveTeam: mockWaveTeam
      }
    },
    tilesize: 8,
    content: {
      unit: function (name) {
        return name === "skitter-mod-skitter" ? mockSkitterType : null;
      }
    },
    world: {
      solid: function (x, y) {
        return solidSet[x + "," + y] === true;
      }
    }
  };

  if (fixedRandomValue !== undefined) {
    Math.random = function () {
      return fixedRandomValue;
    };
  }

  var modulePaths = [
    require.resolve("../scripts/noise-tracker.js"),
    require.resolve("../scripts/noise-hook.js"),
    require.resolve("../scripts/spawn-trigger.js"),
    require.resolve("../scripts/spawn-hook.js")
  ];
  modulePaths.forEach(function (p) {
    delete require.cache[p];
  });

  var noiseTracker = require("../scripts/noise-tracker.js");
  var spawnTrigger = require("../scripts/spawn-trigger.js");
  require("../scripts/noise-hook.js");
  require("../scripts/spawn-hook.js");

  return {
    tick: function () {
      for (var i = 0; i < callbacks.length; i++) callbacks[i]();
    },
    setPaused: function (value) {
      paused = value;
    },
    noiseTracker: noiseTracker,
    spawnTrigger: spawnTrigger,
    logMessages: logMessages,
    spawnCalls: spawnCalls,
    mockWaveTeam: mockWaveTeam
  };
}

function mockBuilding(name, x, y, efficiency) {
  return { block: { name: name }, tile: { x: x, y: y }, efficiency: efficiency };
}

test("no spawn is triggered while noise is below the spawn threshold", function () {
  // mechanical-drill's noise output is well under SPAWN_THRESHOLD, and a
  // single batch isn't enough accumulation to cross it regardless.
  var h = freshHarness([mockBuilding("mechanical-drill", 1, 1, 1)], 0); // roll=0 would pass any positive chance
  for (var i = 0; i < 60; i++) h.tick();
  assert.strictEqual(h.spawnCalls.length, 0);
});

test("a spawn is triggered once noise crosses the threshold with a favorable roll", function () {
  var h = freshHarness([mockBuilding("blast-drill", 2, 2, 1)], 0); // roll=0 guarantees a pass once chance > 0
  // Run enough batches for blast-tier noise to accumulate past SPAWN_THRESHOLD.
  // blast tier = 3.0 noise per batch, minus decay between batches - run generously.
  for (var i = 0; i < 60 * 5; i++) h.tick();
  assert.ok(h.spawnCalls.length > 0, "expected at least one real spawn call");
});

test("spawn converts tile coordinates to world coordinates using Vars.tilesize", function () {
  // Force every tile except (3,2) solid within search range, so the
  // open-tile search has exactly one deterministic answer to find.
  var solid = [];
  for (var dx = -6; dx <= 6; dx++) {
    for (var dy = -6; dy <= 6; dy++) {
      if (dx === 1 && dy === 0) continue; // leaves (3,2) open relative to source (2,2)
      solid.push((2 + dx) + "," + (2 + dy));
    }
  }
  var h = freshHarness([mockBuilding("blast-drill", 2, 2, 1)], 0, solid);
  for (var i = 0; i < 60 * 5; i++) h.tick();
  assert.ok(h.spawnCalls.length > 0, "expected at least one spawn call to check");
  var call = h.spawnCalls[0];
  assert.strictEqual(call.x, 3 * 8, "expected the only open tile (3,2) to convert to world x=24");
  assert.strictEqual(call.y, 2 * 8, "expected the only open tile (3,2) to convert to world y=16");
});

test("spawn does not land on the noise source's own (solid) tile", function () {
  // Default harness marks the building's own tile solid - this is
  // exactly the bug the screenshot showed (Skitters spawning on top of
  // turrets). Confirms the fix: the chosen spawn tile is never the
  // source tile itself.
  var h = freshHarness([mockBuilding("blast-drill", 10, 10, 1)], 0);
  for (var i = 0; i < 60 * 5; i++) h.tick();
  assert.ok(h.spawnCalls.length > 0, "expected at least one spawn call to check");
  var call = h.spawnCalls[0];
  var spawnedOnSourceTile = call.x === 10 * 8 && call.y === 10 * 8;
  assert.ok(!spawnedOnSourceTile, "expected spawn to avoid the solid source tile, but it spawned exactly there");
});

test("no spawn happens (logged, not crashed) when no open tile exists within search range", function () {
  // Make every tile within the search radius solid - simulates a fully
  // walled-in noise source.
  var solid = [];
  for (var dx = -6; dx <= 6; dx++) {
    for (var dy = -6; dy <= 6; dy++) {
      solid.push((7 + dx) + "," + (7 + dy));
    }
  }
  var h = freshHarness([mockBuilding("blast-drill", 7, 7, 1)], 0, solid);
  for (var i = 0; i < 60 * 5; i++) h.tick();
  assert.strictEqual(h.spawnCalls.length, 0, "expected no spawn call when completely walled in");
  var foundSkipLog = h.logMessages.some(function (msg) {
    return msg.indexOf("no open tile found") !== -1;
  });
  assert.ok(foundSkipLog, "expected a log explaining the spawn was skipped");
});

test("spawn uses Vars.state.rules.waveTeam rather than a hardcoded team", function () {
  var h = freshHarness([mockBuilding("blast-drill", 2, 2, 1)], 0);
  for (var i = 0; i < 60 * 5; i++) h.tick();
  assert.ok(h.spawnCalls.length > 0, "expected at least one spawn call to check");
  assert.strictEqual(h.spawnCalls[0].team, h.mockWaveTeam);
});

test("an unfavorable roll suppresses the spawn even above threshold", function () {
  var h = freshHarness([mockBuilding("blast-drill", 3, 3, 1)], 0.999999); // near-certain roll fails vs a small chance
  for (var i = 0; i < 60 * 5; i++) h.tick();
  assert.strictEqual(h.spawnCalls.length, 0);
});

test("the concurrency cap eventually stops further spawns even with a guaranteed-pass roll", function () {
  var h = freshHarness([mockBuilding("blast-drill", 4, 4, 1)], 0);
  // Run long enough to exceed cooldown many times over, so without a cap
  // this would trigger many spawns.
  for (var i = 0; i < 60 * 5 + h.spawnTrigger.COOLDOWN_TICKS * 5; i++) h.tick();
  var activeCount = h.spawnTrigger.getActiveCount(4, 4);
  assert.ok(
    activeCount <= h.spawnTrigger.MAX_CONCURRENT_PER_SOURCE,
    "expected active count to respect the concurrency cap, got " + activeCount
  );
});

test("no spawn check runs while the game is paused", function () {
  var h = freshHarness([mockBuilding("blast-drill", 5, 5, 1)], 0); // roll=0 would guarantee a spawn if unpaused
  h.setPaused(true);
  for (var i = 0; i < 60 * 5; i++) h.tick();
  assert.strictEqual(h.spawnCalls.length, 0, "expected no spawns while paused, even with noise well above threshold");
});

test("a missing unit-type lookup logs an error instead of crashing", function () {
  var h = freshHarness([mockBuilding("blast-drill", 6, 6, 1)], 0);
  // Sabotage the lookup after setup to simulate a wrong content name.
  Vars.content.unit = function () {
    return null;
  };
  for (var i = 0; i < 60 * 5; i++) h.tick();
  assert.strictEqual(h.spawnCalls.length, 0, "expected no spawn call when the unit type can't be found");
  var foundErrorLog = h.logMessages.some(function (msg) {
    return msg.indexOf("ERROR") !== -1;
  });
  assert.ok(foundErrorLog, "expected an error log when Vars.content.unit() returns null");
});

console.log("");
console.log(passed + " passed, " + failed + " failed");
if (failed > 0) {
  process.exit(1);
}
