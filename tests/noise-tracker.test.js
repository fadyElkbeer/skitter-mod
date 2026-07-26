// noise-tracker.test.js
//
// Standalone test harness for scripts/noise-tracker.js (Task 2.1a).
// Runs under plain Node (not Rhino/Mindustry) since the module has no
// engine dependencies. Run with: node tests/noise-tracker.test.js
//
// Not a substitute for in-game testing (Task 1.2's checklist / Task 5.1
// TPS testing) - this only validates the accumulator math in isolation.

var assert = require("assert");
var tracker = require("../scripts/noise-tracker.js");

var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    tracker._resetForTests();
    fn();
    console.log("PASS - " + name);
    passed++;
  } catch (e) {
    console.log("FAIL - " + name);
    console.log("       " + e.message);
    failed++;
  }
}

test("noise level is 0 for a tile with no activity", function () {
  assert.strictEqual(tracker.getRawNoiseLevel(5, 5, 100), 0);
});

test("addNoise increases the level by the tier's output", function () {
  tracker.addNoise(1, 1, "mechanical", 0);
  var level = tracker.getRawNoiseLevel(1, 1, 0);
  assert.strictEqual(level, tracker.NOISE_OUTPUT_BY_TIER.mechanical);
});

test("higher tiers produce more noise than lower tiers", function () {
  tracker.addNoise(1, 1, "mechanical", 0);
  tracker.addNoise(2, 2, "blast", 0);
  var mech = tracker.getRawNoiseLevel(1, 1, 0);
  var blast = tracker.getRawNoiseLevel(2, 2, 0);
  assert.ok(blast > mech, "expected blast tier noise > mechanical tier noise");
});

test("water_extractor and oil_extractor are recognized as valid extraction types", function () {
  tracker.addNoise(9, 9, "water_extractor", 0);
  tracker.addNoise(10, 10, "oil_extractor", 0);
  var water = tracker.getRawNoiseLevel(9, 9, 0);
  var oil = tracker.getRawNoiseLevel(10, 10, 0);
  assert.strictEqual(water, tracker.NOISE_OUTPUT_BY_TIER.water_extractor);
  assert.strictEqual(oil, tracker.NOISE_OUTPUT_BY_TIER.oil_extractor);
  assert.ok(oil > water, "expected oil_extractor noise > water_extractor noise");
});

test("unknown tier falls back to mechanical output rather than throwing", function () {
  tracker.addNoise(3, 3, "some_unknown_tier", 0);
  var level = tracker.getRawNoiseLevel(3, 3, 0);
  assert.strictEqual(level, tracker.NOISE_OUTPUT_BY_TIER.mechanical);
});

test("noise decays proportionally to elapsed ticks", function () {
  tracker.addNoise(4, 4, "blast", 0);
  var levelAt0 = tracker.getRawNoiseLevel(4, 4, 0);
  var levelAt10 = tracker.getRawNoiseLevel(4, 4, 10);
  var expected = levelAt0 - tracker.DECAY_PER_TICK * 10;
  if (expected < 0) expected = 0;
  assert.strictEqual(levelAt10, expected);
});

test("noise never decays below zero", function () {
  tracker.addNoise(5, 6, "mechanical", 0);
  var level = tracker.getRawNoiseLevel(5, 6, 100000); // way more ticks than needed to decay fully
  assert.strictEqual(level, 0);
});

test("repeated addNoise calls accumulate correctly with decay between them", function () {
  tracker.addNoise(7, 7, "pneumatic", 0);
  tracker.addNoise(7, 7, "pneumatic", 5); // 5 ticks of decay happen first, then +pneumatic
  var afterDecay = tracker.NOISE_OUTPUT_BY_TIER.pneumatic - tracker.DECAY_PER_TICK * 5;
  if (afterDecay < 0) afterDecay = 0; // matches the implementation's clamp-at-zero behavior
  var expected = afterDecay + tracker.NOISE_OUTPUT_BY_TIER.pneumatic;
  var level = tracker.getRawNoiseLevel(7, 7, 5);
  assert.strictEqual(level, expected);
});

test("decayInactive removes fully-decayed entries from tracking", function () {
  tracker.addNoise(8, 8, "mechanical", 0);
  assert.strictEqual(tracker.trackedTileCount(), 1);
  tracker.decayInactive(8, 8, 100000); // far enough to fully decay
  assert.strictEqual(tracker.trackedTileCount(), 0);
});

test("distinct tile positions are tracked independently", function () {
  tracker.addNoise(1, 1, "mechanical", 0);
  tracker.addNoise(2, 2, "mechanical", 0);
  assert.strictEqual(tracker.trackedTileCount(), 2);
});

console.log("");
console.log(passed + " passed, " + failed + " failed");
if (failed > 0) {
  process.exit(1);
}
