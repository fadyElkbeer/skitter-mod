// spawn-hook.test.js
//
// Tests scripts/spawn-hook.js (Task 2.2) by mocking Mindustry globals,
// same approach as noise-hook.test.js. Proves the wiring between
// noise-tracker -> noise-hook -> spawn-trigger -> spawnPlaceholder fires
// correctly when noise crosses the threshold. Does NOT prove the real
// spawn location or unit creation, since neither exists yet - see the
// header comment in spawn-hook.js.
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

// Captures every Events.on registration (both noise-hook.js and
// spawn-hook.js register their own listener) and every Log.info call,
// since spawnPlaceholder() logs instead of spawning a real unit.
function freshHarness(mockBuildings, fixedRandomValue) {
  var callbacks = [];
  var logMessages = [];

  global.Events = {
    on: function (event, cb) {
      callbacks.push(cb);
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
  global.Log = {
    info: function (msg) {
      logMessages.push(msg);
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
    noiseTracker: noiseTracker,
    spawnTrigger: spawnTrigger,
    logMessages: logMessages
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
  assert.strictEqual(h.logMessages.length, 0);
});

test("a spawn is triggered once noise crosses the threshold with a favorable roll", function () {
  var h = freshHarness([mockBuilding("blast-drill", 2, 2, 1)], 0); // roll=0 guarantees a pass once chance > 0
  // Run enough batches for blast-tier noise to accumulate past SPAWN_THRESHOLD.
  // blast tier = 3.0 noise per batch, minus decay between batches - run generously.
  for (var i = 0; i < 60 * 5; i++) h.tick();
  assert.ok(h.logMessages.length > 0, "expected at least one spawn-triggered log message");
  assert.ok(h.logMessages[0].indexOf("(2,2)") !== -1, "expected the log to reference the source position");
});

test("an unfavorable roll suppresses the spawn even above threshold", function () {
  var h = freshHarness([mockBuilding("blast-drill", 3, 3, 1)], 0.999999); // near-certain roll fails vs a small chance
  for (var i = 0; i < 60 * 5; i++) h.tick();
  assert.strictEqual(h.logMessages.length, 0);
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

console.log("");
console.log(passed + " passed, " + failed + " failed");
if (failed > 0) {
  process.exit(1);
}
