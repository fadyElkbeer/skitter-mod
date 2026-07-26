// main.js - Skitter mod entry point
//
// This file is intentionally minimal at this stage (Task 1.1: project
// scaffolding). It should stay the thin "wiring" layer - event
// registration and settings lookup - while actual logic lives in
// require()'d modules (starting with noise-tracker.js in Phase 2).
//
// Rhino JS reminder: avoid arrow functions, let/const-in-block edge cases,
// template literals, and other ES6+ features until confirmed to work in
// Mindustry's Rhino runtime. Stick to plain `function` and `var` for now.

// var noiseTracker = require("scripts/noise-tracker.js");

Events.on(EventType.ClientLoadEvent, function(e) {
  Log.info("[skitter-mod] loaded - noise tracking not yet active (Phase 2 pending)");
});

// Phase 2 (Task 2.1b) will add a tick-batched hook here, e.g.:
//
// var tickCounter = 0;
// var BATCH_INTERVAL = 60; // ticks - DO NOT lower without re-running Task 5.1 TPS test
//
// Events.on(EventType.Trigger, function(e) {
//   tickCounter++;
//   if (tickCounter >= BATCH_INTERVAL) {
//     tickCounter = 0;
//     // noiseTracker.tickUpdate();
//   }
// });
