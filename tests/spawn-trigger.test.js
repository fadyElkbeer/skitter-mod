// spawn-trigger.test.js
//
// Standalone test harness for scripts/spawn-trigger.js (Task 2.2).
// Runs under plain Node since the module has no engine dependencies.
// Run with: node tests/spawn-trigger.test.js

var assert = require("assert");
var trigger = require("../scripts/spawn-trigger.js");

var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    trigger._resetForTests();
    fn();
    console.log("PASS - " + name);
    passed++;
  } catch (e) {
    console.log("FAIL - " + name);
    console.log("       " + e.message);
    failed++;
  }
}

function always(value) {
  return function () {
    return value;
  };
}

test("computeSpawnChance is 0 below the threshold", function () {
  assert.strictEqual(trigger.computeSpawnChance(trigger.SPAWN_THRESHOLD - 0.01), 0);
});

test("computeSpawnChance scales up from 0 at threshold toward the max", function () {
  var atThreshold = trigger.computeSpawnChance(trigger.SPAWN_THRESHOLD);
  var wellAbove = trigger.computeSpawnChance(trigger.SPAWN_THRESHOLD + trigger.CHANCE_SCALE_RANGE);
  assert.strictEqual(atThreshold, 0);
  assert.strictEqual(wellAbove, trigger.MAX_SPAWN_CHANCE);
});

test("computeSpawnChance never exceeds MAX_SPAWN_CHANCE even far above range", function () {
  var farAbove = trigger.computeSpawnChance(trigger.SPAWN_THRESHOLD + trigger.CHANCE_SCALE_RANGE * 100);
  assert.strictEqual(farAbove, trigger.MAX_SPAWN_CHANCE);
});

test("shouldSpawn is false below threshold regardless of roll", function () {
  var result = trigger.shouldSpawn(1, 1, 0, 0, always(0)); // roll of 0 would pass any positive chance
  assert.strictEqual(result, false);
});

test("shouldSpawn is true when noise is above threshold and roll beats the chance", function () {
  var noise = trigger.SPAWN_THRESHOLD + trigger.CHANCE_SCALE_RANGE; // chance = MAX_SPAWN_CHANCE
  var result = trigger.shouldSpawn(2, 2, noise, 0, always(0)); // roll 0 < any positive chance
  assert.strictEqual(result, true);
});

test("shouldSpawn is false when the roll doesn't beat the chance", function () {
  var noise = trigger.SPAWN_THRESHOLD + trigger.CHANCE_SCALE_RANGE; // chance = MAX_SPAWN_CHANCE
  var result = trigger.shouldSpawn(3, 3, noise, 0, always(0.999999)); // near-certain roll fails vs a small chance
  assert.strictEqual(result, false);
});

test("shouldSpawn respects the concurrency cap", function () {
  var noise = trigger.SPAWN_THRESHOLD + trigger.CHANCE_SCALE_RANGE;
  for (var i = 0; i < trigger.MAX_CONCURRENT_PER_SOURCE; i++) {
    trigger.recordSpawnStarted(4, 4, i * (trigger.COOLDOWN_TICKS + 1)); // space out spawns past cooldown
  }
  assert.strictEqual(trigger.getActiveCount(4, 4), trigger.MAX_CONCURRENT_PER_SOURCE);
  var result = trigger.shouldSpawn(4, 4, noise, 999999, always(0));
  assert.strictEqual(result, false, "expected cap to block further spawns even with a guaranteed-pass roll");
});

test("shouldSpawn respects the cooldown even under the concurrency cap", function () {
  var noise = trigger.SPAWN_THRESHOLD + trigger.CHANCE_SCALE_RANGE;
  trigger.recordSpawnStarted(5, 5, 100);
  var tooSoon = trigger.shouldSpawn(5, 5, noise, 100 + trigger.COOLDOWN_TICKS - 1, always(0));
  var afterCooldown = trigger.shouldSpawn(5, 5, noise, 100 + trigger.COOLDOWN_TICKS + 1, always(0));
  assert.strictEqual(tooSoon, false, "expected cooldown to still be active");
  assert.strictEqual(afterCooldown, true, "expected cooldown to have expired");
});

test("recordUnitRemoved decrements active count and never goes below 0", function () {
  trigger.recordSpawnStarted(6, 6, 0);
  trigger.recordSpawnStarted(6, 6, trigger.COOLDOWN_TICKS + 1);
  assert.strictEqual(trigger.getActiveCount(6, 6), 2);
  trigger.recordUnitRemoved(6, 6);
  assert.strictEqual(trigger.getActiveCount(6, 6), 1);
  trigger.recordUnitRemoved(6, 6);
  trigger.recordUnitRemoved(6, 6); // extra call shouldn't go negative
  assert.strictEqual(trigger.getActiveCount(6, 6), 0);
});

test("distinct sources are tracked independently", function () {
  trigger.recordSpawnStarted(7, 7, 0);
  assert.strictEqual(trigger.getActiveCount(7, 7), 1);
  assert.strictEqual(trigger.getActiveCount(8, 8), 0);
});

console.log("");
console.log(passed + " passed, " + failed + " failed");
if (failed > 0) {
  process.exit(1);
}
