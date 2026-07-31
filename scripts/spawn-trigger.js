// spawn-trigger.js
//
// Task 2.2 (+ extended for Task 3D.1): spawn trigger logic. Decides
// WHETHER a noise source should spawn a unit this batch - threshold
// check, chance roll scaled by noise magnitude, per-source concurrency
// cap, and per-source cooldown.
//
// Deliberately has NO dependency on Mindustry engine globals, same
// reasoning as noise-tracker.js (Task 2.1a): keeps the highest-risk
// engine-wiring code isolated in spawn-hook.js instead.
//
// Does NOT decide WHERE to spawn (needs vision/fog-of-war API, out of
// scope here - see spawn-hook.js) or actually create a unit (needs
// Task 3.1's unit type to exist first). This module only answers
// "should a spawn happen for this source right now?" and tracks the
// bookkeeping (cooldown, concurrent count) that answer depends on.
//
// REFACTORED for Task 3D.1 (Buzzer): state is now keyed by
// (x, y, unitType) instead of just (x, y). Before this, Skitter and
// Buzzer spawning from the same noise source would have incorrectly
// shared one cooldown/cap - a Skitter spawn would reset Buzzer's
// cooldown and vice versa, even though they're meant to be independent
// per the design doc (both trigger on "any active mining noise" as
// separate possibilities, not a shared roll). unitType defaults to
// "default" if omitted, so any external caller that predates this
// change keeps working, but spawn-hook.js has been updated to pass
// "skitter" explicitly rather than rely on that default.

// --- Config ---
// All placeholders pending Task 4.2 (expose as mod settings) and
// Task 5.2 (balance passes) - not final numbers.

// Noise level must be at or above this before any spawn chance applies.
var SPAWN_THRESHOLD = 5.0;

// Spawn chance reaches MAX_SPAWN_CHANCE once noise reaches
// SPAWN_THRESHOLD + CHANCE_SCALE_RANGE. Between threshold and that point,
// chance scales linearly with noise magnitude, per the plan's "roll spawn
// chance (scales with noise magnitude)" requirement.
var MAX_SPAWN_CHANCE = 0.15;
var CHANCE_SCALE_RANGE = 10.0;

// Hard cap on concurrently-alive spawned units per noise source, PER
// unit type (see the keying note above - Skitter and Buzzer each get
// their own independent cap at the same source).
// Plan recommends starting at 1-2.
var MAX_CONCURRENT_PER_SOURCE = 2;

// Ticks a source must wait after a spawn before it can spawn again,
// independent of the concurrency cap (a source could be under-cap but
// still on cooldown right after spawning). Also per unit type.
var COOLDOWN_TICKS = 300; // 5 seconds at 60 TPS

// Per-(source, unitType) state, keyed by "x,y,unitType". Each entry:
// { lastSpawnTick: number, activeCount: number }
var sourceState = {};

function sourceKey(x, y, unitType) {
  return x + "," + y + "," + (unitType || "default");
}

function getState(x, y, unitType) {
  var key = sourceKey(x, y, unitType);
  var state = sourceState[key];
  if (!state) {
    state = { lastSpawnTick: -Infinity, activeCount: 0 };
    sourceState[key] = state;
  }
  return state;
}

// Computes spawn chance for a given noise level. 0 below threshold,
// scales linearly up to MAX_SPAWN_CHANCE across CHANCE_SCALE_RANGE above
// threshold, capped at MAX_SPAWN_CHANCE beyond that.
function computeSpawnChance(noiseLevel) {
  if (noiseLevel < SPAWN_THRESHOLD) return 0;
  var over = noiseLevel - SPAWN_THRESHOLD;
  var fraction = over / CHANCE_SCALE_RANGE;
  if (fraction > 1) fraction = 1;
  return fraction * MAX_SPAWN_CHANCE;
}

// Decides whether a spawn should happen for source (x, y) right now, for
// the given unitType (defaults to "default" if omitted). rollFn is
// injectable for deterministic testing - defaults to Math.random,
// matching how it would run for real (call with no rollFn argument in
// production code).
function shouldSpawn(x, y, noiseLevel, currentTick, rollFn, unitType) {
  var roll = rollFn || Math.random;
  var state = getState(x, y, unitType);

  if (state.activeCount >= MAX_CONCURRENT_PER_SOURCE) return false;
  if (currentTick - state.lastSpawnTick < COOLDOWN_TICKS) return false;

  var chance = computeSpawnChance(noiseLevel);
  if (chance <= 0) return false;

  return roll() < chance;
}

// Call when a spawn actually happens for source (x, y) + unitType, so
// cooldown and concurrency bookkeeping stay accurate. Caller
// (spawn-hook.js) is responsible for calling this only after
// shouldSpawn() returned true AND the unit was actually created.
function recordSpawnStarted(x, y, currentTick, unitType) {
  var state = getState(x, y, unitType);
  state.lastSpawnTick = currentTick;
  state.activeCount++;
}

// Call when a previously-spawned unit for source (x, y) + unitType dies
// or is otherwise removed, so the concurrency cap doesn't stay
// permanently inflated. Intended to be wired to UnitDestroyEvent once
// spawned units have a way to remember which source they came from -
// not yet connected to anything.
function recordUnitRemoved(x, y, unitType) {
  var state = getState(x, y, unitType);
  state.activeCount--;
  if (state.activeCount < 0) state.activeCount = 0;
}

function getActiveCount(x, y, unitType) {
  return getState(x, y, unitType).activeCount;
}

// Test-only: clears all state between test cases.
function _resetForTests() {
  sourceState = {};
}

module.exports = {
  shouldSpawn: shouldSpawn,
  computeSpawnChance: computeSpawnChance,
  recordSpawnStarted: recordSpawnStarted,
  recordUnitRemoved: recordUnitRemoved,
  getActiveCount: getActiveCount,
  SPAWN_THRESHOLD: SPAWN_THRESHOLD,
  MAX_SPAWN_CHANCE: MAX_SPAWN_CHANCE,
  CHANCE_SCALE_RANGE: CHANCE_SCALE_RANGE,
  MAX_CONCURRENT_PER_SOURCE: MAX_CONCURRENT_PER_SOURCE,
  COOLDOWN_TICKS: COOLDOWN_TICKS,
  _resetForTests: _resetForTests
};
