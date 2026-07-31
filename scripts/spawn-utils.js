// spawn-utils.js
//
// Shared helpers for engine-wiring spawn hooks (spawn-hook.js,
// buzzer-hook.js). Extracted from spawn-hook.js during Task 3D.1 so
// Buzzer's swarm-spawn logic doesn't duplicate the same open-tile
// search - keep this as the one place that logic lives.
//
// CONFIRMED against Mindustry source (World.java): World.solid(x, y) is
// a real public method - "return tile == null || tile.solid();" - so
// checking !Vars.world.solid(x, y) correctly identifies open, walkable
// ground. Vars.world itself is confirmed accessible the same way
// Vars.state/Vars.content are (seen used directly in Mindustry's own
// BuildingComp.java as Vars.world.tile(...)).

// Searches outward from (centerX, centerY) in expanding square rings for
// the nearest tile that isn't solid AND isn't in the optional
// excludeSet (an object keyed "x,y" -> true). The excludeSet parameter
// exists specifically for swarm spawns (Buzzer, Task 3D.1): without it,
// every unit in a swarm would independently find the SAME nearest open
// tile, since spawning a unit doesn't make a tile "solid" to
// Vars.world.solid() - units aren't buildings. Callers spawning
// multiple units in one batch should add each chosen tile to the
// exclude set before searching for the next one. Returns {x, y} or null
// if nothing open was found within maxRadius.
function findNearestOpenTile(centerX, centerY, maxRadius, excludeSet) {
  for (var r = 0; r <= maxRadius; r++) {
    for (var dx = -r; dx <= r; dx++) {
      for (var dy = -r; dy <= r; dy++) {
        // Only check the ring boundary at exactly radius r - inner
        // tiles were already checked at smaller r values.
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;

        var tx = centerX + dx;
        var ty = centerY + dy;
        var key = tx + "," + ty;
        if (excludeSet && excludeSet[key]) continue;
        if (!Vars.world.solid(tx, ty)) {
          return { x: tx, y: ty };
        }
      }
    }
  }
  return null; // nothing open within maxRadius - caller must handle
}

module.exports = {
  findNearestOpenTile: findNearestOpenTile
};
