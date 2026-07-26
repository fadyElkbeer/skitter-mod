# Skitter

A Mindustry mod: sustained mining generates noise, and noise attracts a
hostile unit ("Skitter") that targets the noise source rather than the
core. Meant to add early-game tension around drill placement and defense
timing.

## Platform support

**Android and desktop only.** This mod is not compatible with iOS - Apple
blocks JavaScript/Java-based mods at the OS level. This is a hard platform
limitation, not a bug.

## Status

Early scaffolding (Phase 1). Noise tracking, spawn logic, and the unit
itself are not yet implemented - see `docs/implementation-plan.md` for the
full task breakdown and current phase.

## Structure

```
skitter-mod/
├── mod.hjson
├── content/
│   ├── units/     # Skitter unit definition (Phase 3, not yet added)
│   └── blocks/    # optional muffler/silencer counterplay block (Phase 4)
├── scripts/
│   ├── main.js           # entry point, event wiring
│   └── noise-tracker.js  # noise accumulation/decay (Phase 2, stubbed)
├── sprites/
└── sounds/
```

## Known risks (see implementation plan for detail)

- **Performance:** noise checks must be tick-batched (every 30-60 ticks),
  never per-frame. Enemy pathfinding is already the most expensive
  operation in the engine.
- **Rhino JS engine:** dated, limited ES6+ support - test syntax early.
- A settings-based kill switch (disable spawning without disabling noise
  tracking) is planned for Phase 4 as a low-risk mitigation if TPS issues
  surface after release.
