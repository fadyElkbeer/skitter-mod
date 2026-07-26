// noise-tracker.js
//
// Task 2.1a: noise accumulator core logic.
// Task 2.1b (separate tick-batching hook, not yet written) wires this
// into the live Mindustry event loop.
// Task 2.1c (getNoiseLevel query API for spawn logic) is a thin wrapper
// around getRawNoiseLevel below.
//
// Deliberately has NO dependency on Mindustry engine globals (Events,
// EventType, Tile, etc.) so it can be exercised with a plain test
// harness before it ever touches the live game loop. This keeps the
// highest-risk part (2.1b's engine wiring) isolated from this file.
//
// Rhino JS reminder: var + function only, no ES6 syntax (no let/const,
// no arrow functions, no template literals, no Map/Set).

// --- Config ---
// Noise output per extraction block type, in "noise units per
// addNoise() call". Originally scoped to drill tiers only (mechanical <
// pneumatic < laser < blast); expanded to include Water Extractor and
// Oil Extractor, since both are vanilla Serpulo blocks that continuously
// draw power to actively extract a resource - the same "sustained
// extraction activity" pattern drills have, just without a drill tier.
// Placed by rough power draw: Water Extractor is a fairly low, steady
// draw (comparable to a mechanical/pneumatic drill); Oil Extractor draws
// more (sand + water + power), placed above pneumatic.
// These are placeholder values pending Task 5.2 balance passes - not
// final numbers.
var NOISE_OUTPUT_BY_TIER = {
  mechanical: 0.5,
  water_extractor: 0.75,
  pneumatic: 1.0,
  oil_extractor: 1.5,
  laser: 2.0,
  blast: 3.0
};

// Noise units lost per tick when a source is inactive/decaying.
// Also a placeholder pending balance passes.
var DECAY_PER_TICK = 0.25;

// Internal accumulator state, keyed by "x,y" tile-position string.
// Each entry: { level: number, lastUpdateTick: number }
var noiseState = {};

function tileKey(x, y) {
  return x + "," + y;
}

// Adds noise for an active extraction source at (x, y) - a drill of the
// given tier, or a water_extractor / oil_extractor. Intended to be
// called once per batch interval (Task 2.1b) while the source is
// actively extracting - NOT per frame.
function addNoise(x, y, tier, currentTick) {
  var key = tileKey(x, y);
  var output = NOISE_OUTPUT_BY_TIER[tier];
  if (output === undefined) {
    output = NOISE_OUTPUT_BY_TIER.mechanical; // safe fallback for unknown tier
  }

  var entry = noiseState[key];
  if (!entry) {
    entry = { level: 0, lastUpdateTick: currentTick };
    noiseState[key] = entry;
  }

  applyDecay(entry, currentTick);
  entry.level += output;
  entry.lastUpdateTick = currentTick;
}

// Applies decay to a single entry based on ticks elapsed since its last
// update. Decay is proportional to elapsed ticks (not a flat per-call
// amount) so that changing the batching interval in Task 2.1b doesn't
// silently change the effective decay rate.
function applyDecay(entry, currentTick) {
  var elapsed = currentTick - entry.lastUpdateTick;
  if (elapsed <= 0) return;

  entry.level -= DECAY_PER_TICK * elapsed;
  if (entry.level < 0) entry.level = 0;
  entry.lastUpdateTick = currentTick;
}

// Call this for tiles that are NOT actively mining this batch cycle, so
// their noise still decays even without a new addNoise() call. Task
// 2.1b's tick hook is expected to call this for all currently-tracked
// tiles every batch cycle.
function decayInactive(x, y, currentTick) {
  var key = tileKey(x, y);
  var entry = noiseState[key];
  if (!entry) return;
  applyDecay(entry, currentTick);

  // Clean up fully-decayed entries so the map doesn't grow unbounded
  // over a long play session.
  if (entry.level <= 0) {
    delete noiseState[key];
  }
}

// Returns the current noise level at (x, y), applying decay first so the
// value reflects "as of now" rather than "as of the last addNoise call".
function getRawNoiseLevel(x, y, currentTick) {
  var key = tileKey(x, y);
  var entry = noiseState[key];
  if (!entry) return 0;
  applyDecay(entry, currentTick);
  return entry.level;
}

// Number of tiles currently holding any tracked noise. Useful for
// sanity-checking the map isn't growing unbounded during testing.
function trackedTileCount() {
  var count = 0;
  for (var k in noiseState) {
    if (noiseState.hasOwnProperty(k)) count++;
  }
  return count;
}

// Test-only: clears all state between test cases. Not for use by
// Task 2.1b engine wiring.
function _resetForTests() {
  noiseState = {};
}

module.exports = {
  addNoise: addNoise,
  decayInactive: decayInactive,
  getRawNoiseLevel: getRawNoiseLevel,
  trackedTileCount: trackedTileCount,
  NOISE_OUTPUT_BY_TIER: NOISE_OUTPUT_BY_TIER,
  DECAY_PER_TICK: DECAY_PER_TICK,
  _resetForTests: _resetForTests
};
