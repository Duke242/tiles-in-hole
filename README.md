# Tiles in Hole

A level-based black-hole puzzle for phones, in the style of *Tiles in Hole:
Black Hole*. Each level is a themed voxel world. Read the goal card, drag the
hole under the right tiles, watch the stacks topple and pour in, and fill the
card before the clock runs out.

**Play:** https://duke242.github.io/tiles-in-hole/

## How it plays

- **Tiles.** The board is stacks of picture tiles: thick round cookies and
  rounded dice with a food icon on the face, laid out in blocks, lines, rings,
  spirals, triangles and arcs. From level 3 there are also tall "cakes" that
  count as one item each.
- **Goal card.** The cards on the left show which tile types you need and how
  many are still missing. Fill every card to clear the level; filler tiles of
  other types are just in the way.
- **Real physics.** Every tile is a rigid body and the hole is a real pit in
  the ground. A stack standing over the hole drops in as one column, tiles
  hanging over the rim tip in, and loose tiles left on the board are eaten
  later when the hole passes over them. Each tile that goes in pops a "+1"
  and flies to its goal card.
- **Clock.** Every level has a time limit. Run out and it's *Time's up* (one
  free "keep going +30s" per level).
- **Growth.** Everything you swallow makes the hole bigger. The *Size* pill
  under the hole tracks it.
- **Boosters.** Hole Boost (bigger hole for 10 s), Magnet (pulls nearby tiles
  in for a few seconds) and +30s. You start with three of each and earn more
  as you go.
- **Worlds.** City, Fruit Garden, Fun Park, Food Street and Water Park rotate
  every three levels and colour the board. From level 15 a few voxel props
  (trees, cups, lamps...) appear as bonus food that grows the hole. Levels are
  generated from their number, so level 27 is the same puzzle on every device.

## Controls

| Input | Action |
| --- | --- |
| Touch / hold & drag | Thumbstick: push away from where you first touched |
| `WASD` / arrows | Steer with the keyboard |
| Scroll | Zoom |
| `P` / `Esc` | Pause |
| `R` | Restart the level |

Dev shortcuts: `?level=N` starts at level N, `?r=12` starts with a bigger hole.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # → dist/
```

## Layout

```
src/
  core/     renderer + sky + lights, thumbstick input, procedural audio, save, seeded RNG
  world/    picture tiles (icon atlas, geometries, materials), voxel sculpting for props,
            themes/palettes, instanced voxel pools, the board ground
  levels/   the level generator: layout, growth curve, goal card, clock
  game/     the hole, rigid bodies + the pit (Rapier), prop eating (sink / topple / peel), debris, progress
  ui/       HUD and overlays
```

Tiles are `InstancedMesh` instances (one pool for cookies, one for dice) with a
per-instance icon index into a canvas-painted atlas, and every tile is a Rapier
rigid body that starts asleep. The hole is a heightfield patch punched into the
ground collider that follows the hole and grows with it, which is what makes a
tile hanging over the rim tip in. Voxel props use a second path: they sink and
topple while their voxels peel off the bottom into the shaft.

All models and code are original.
