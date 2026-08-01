// main.js — Skitter mod entry point
//
// This file is intentionally minimal (Task 1.1: project scaffolding).
// It should stay the thin "wiring" layer — event registration and
// settings lookup — while actual logic lives in require()'d modules.
//
// Rhino JS reminder: avoid arrow functions, let/const-in-block edge cases,
// template literals, and other ES6+ features until confirmed to work in
// Mindustry's Rhino runtime. Stick to plain `function` and `var` for now.
// (Note: the official Mindustry wiki's own scripting examples use arrow
// functions and const, so ES6 support may be less limited than initially
// assumed - still worth testing your own syntax choices early per the
// Task 1.2 checklist rather than trusting this either way.)

require("noise-hook"); // Task 2.1b — noise accumulator wired to the live game loop
require("spawn-hook"); // Task 2.2 — spawn trigger logic, spawns real Skitters
require("buzzer-hook"); // Task 3D.1 — spawns Buzzer swarms (2-3 units) on the same noise trigger

Events.on(EventType.ClientLoadEvent, function(e) {
  Log.info("[skitter-mod] loaded — Skitter + Buzzer spawning active. Custom AI (Task 3.2), wave-spawn mechanism (Phase 3B), and the rest of the roster are still pending.");
});
