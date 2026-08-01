// buzzer-hook.test.js
//
// Tests scripts/buzzer-hook.js (Task 3D.1, spawn side) by mocking
// Mindustry globals, same approach as spawn-hook.test.js. Proves the
// wiring between noise-tracker -> noise-hook -> spawn-trigger ->
// spawnBuzzerSwarm fires correctly, including swarm size (2-3),
// independent cooldown/cap from Skitter at the same source, and
// graceful degradation when open tiles run out mid-swarm. Does NOT
// prove Vars.content.unit("skitter-mod-buzzer") is exactly right
// against the real game - that name follows the same
// <modname>-<contentname> pattern confirmed for Skitter, but hasn't
// been independently re-confirmed for Buzzer specifically.
//
// Run with: NODE_PATH=./scripts node tests/buzzer-hook.test.js

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

function freshHarness(mockBuildings, fixedRandomValue, solidTileKeys) {
  var callbacks = [];
  var logMessages = [];
  var spawnCalls = [];
  var paused = false;

  var mockWaveTeam = "mockCruxTeam";
  var mockBuzzerType = {
    spawn: function (team, x, y) {
      spawnCalls.push({ team: team, x: x, y: y });
    }
  };

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
        return name === "skitter-mod-buzzer" ? mockBuzzerType : null;
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
    require.resolve("../scripts/spawn-utils.js"),
    require.resolve("../scripts/buzzer-hook.js")
  ];
  modulePaths.forEach(function (p) {
    delete require.cache[p];
  });

  var noiseTracker = require("../scripts/noise-tracker.js");
  var spawnTrigger = require("../scripts/spawn-trigger.js");
  require("../scripts/noise-hook.js");
  require("../scripts/buzzer-hook.js");

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
  var h = freshHarness([mockBuilding("mechanical-drill", 1, 1, 1)], 0);
  for (var i = 0; i < 60; i++) h.tick();
  assert.strictEqual(h.spawnCalls.length, 0);
});

test("a swarm of 2-3 Buzzers spawns once noise crosses the threshold with a favorable roll", function () {
  var h = freshHarness([mockBuilding("blast-drill", 2, 2, 1)], 0);
  for (var i = 0; i < 60 * 5; i++) h.tick();
  assert.ok(h.spawnCalls.length >= 2 && h.spawnCalls.length <= 3, "expected a swarm of 2-3, got " + h.spawnCalls.length);
});

test("swarm members are spawned at distinct tiles, not stacked on one spot", function () {
  var h = freshHarness([mockBuilding("blast-drill", 20, 20, 1)], 0);
  for (var i = 0; i < 60 * 5; i++) h.tick();
  assert.ok(h.spawnCalls.length >= 2, "expected at least 2 spawns to compare");
  var seen = {};
  var allDistinct = true;
  for (var j = 0; j < h.spawnCalls.length; j++) {
    var key = h.spawnCalls[j].x + "," + h.spawnCalls[j].y;
    if (seen[key]) allDistinct = false;
    seen[key] = true;
  }
  assert.ok(allDistinct, "expected every swarm member to land on a distinct tile");
});

test("an unfavorable roll suppresses the whole swarm", function () {
  var h = freshHarness([mockBuilding("blast-drill", 3, 3, 1)], 0.999999);
  for (var i = 0; i < 60 * 5; i++) h.tick();
  assert.strictEqual(h.spawnCalls.length, 0);
});

test("Buzzer's cooldown/cap at a source is independent of Skitter's (spawn-trigger.js refactor)", function () {
  var h = freshHarness([mockBuilding("blast-drill", 4, 4, 1)], 0);
  // Simulate Skitter already having used up its cooldown/cap at this
  // exact source - Buzzer should be completely unaffected.
  h.spawnTrigger.recordSpawnStarted(4, 4, 0, "skitter");
  h.spawnTrigger.recordSpawnStarted(4, 4, 1, "skitter");
  for (var i = 0; i < 60 * 5; i++) h.tick();
  assert.ok(h.spawnCalls.length >= 2, "expected Buzzer's swarm to spawn normally despite Skitter being maxed out at the same source");
});

test("no spawn check runs while the game is paused", function () {
  var h = freshHarness([mockBuilding("blast-drill", 5, 5, 1)], 0);
  h.setPaused(true);
  for (var i = 0; i < 60 * 5; i++) h.tick();
  assert.strictEqual(h.spawnCalls.length, 0);
});

test("a missing unit-type lookup logs an error instead of crashing", function () {
  var h = freshHarness([mockBuilding("blast-drill", 6, 6, 1)], 0);
  Vars.content.unit = function () {
    return null;
  };
  for (var i = 0; i < 60 * 5; i++) h.tick();
  assert.strictEqual(h.spawnCalls.length, 0);
  var foundErrorLog = h.logMessages.some(function (msg) {
    return msg.indexOf("ERROR") !== -1;
  });
  assert.ok(foundErrorLog, "expected an error log when Vars.content.unit() returns null");
});

test("running out of open tiles mid-swarm spawns what it can and logs the rest gracefully", function () {
  // Only ONE open tile exists near the source - swarm should spawn
  // exactly 1 unit there rather than crash trying to find a 2nd/3rd spot.
  var solid = [];
  for (var dx = -6; dx <= 6; dx++) {
    for (var dy = -6; dy <= 6; dy++) {
      if (dx === 1 && dy === 0) continue; // leaves (8,7) open relative to source (7,7)
      solid.push((7 + dx) + "," + (7 + dy));
    }
  }
  var h = freshHarness([mockBuilding("blast-drill", 7, 7, 1)], 0, solid);
  for (var i = 0; i < 60 * 5; i++) h.tick();
  assert.strictEqual(h.spawnCalls.length, 1, "expected exactly 1 spawn when only 1 tile is open");
});

console.log("");
console.log(passed + " passed, " + failed + " failed");
if (failed > 0) {
  process.exit(1);
}
