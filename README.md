# Tiles in Hole

A black-hole puzzle for phones, in the style of *Tiles in Hole: Black Hole*.
Pick a way to play on the title screen:

- **Levels.** The campaign. Each level is a themed voxel world with a goal
  card and a clock: drag the hole under the right tiles, watch the stacks
  topple and pour in, and fill the card before time runs out.
- **Free Play.** Huge boards, no clock, no card. Pick a map, start small in
  the middle, eat outward, grow, and swallow everything down to the giant
  set pieces. The board is bare when the counter hits zero.

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

### Free Play

Free Play opens a map picker:

| Map | World | Giants |
| --- | --- | --- |
| Classic | a different one each run | none: the original 220×220 board |
| Megacity | City | skyscrapers (setback, round and twin towers up to ~65 high), a stadium, radio masts |
| Giant's Orchard | Fruit Garden | pineapples taller than houses, watermelon slices, strawberries, banana bunches, fruit bowls |
| Mega Park | Fun Park | a 45-high ferris wheel, roller coasters, big-top tents, fairy castles, drop towers |
| Food Colossus | Food Street | house-sized burgers, tiered cakes, donuts, soft-serve cones, soda cups |
| Water World | Water Park | slide towers, lighthouses, giant palms, pirate ships, rubber ducks |

The giant maps are 320×320 with about 8,000 tiles, ordinary props in the
middle and 10-17 giants ringing the outside, biggest furthest out. The hole
can grow to about 22 units across there. A giant is far wider than the hole,
so it is not swallowed whole: eat out its footprint and it comes down in
sections, the part over the pit dropping straight in.

Classic:

- A 220×220 board with about 6,000 tiles and up to ~90 voxel props from one
  world (the worlds take turns, one per run). Stacks are low in the middle
  and tall at the edges; props are laid out by their footprint, the
  landmarks (tower, Ferris wheel, burger...) furthest out. Every structure can
  lose blocks when the hole removes their support, even at the starting size.
  Supported sections remain standing; fallen blocks stay where they land.
- The hole can grow past the level cap, up to about 13 units across, so
  nothing on the board is out of reach.
- The pill at the top counts tiles eaten; under the level label is how many
  are still standing. Eating everything shows *Map cleared* with your time.
- Hole Boost and Magnet are free here but recharge after use (the badge
  shows the countdown). +30s is hidden.
- Leaving early still banks the run: 1 coin per 20 tiles. Your best count
  shows on the title screen, and each map's best on its picker button.

## Controls

| Input | Action |
| --- | --- |
| Touch / hold & drag | Thumbstick: push away from where you first touched |
| `WASD` / arrows | Steer with the keyboard |
| Scroll | Zoom |
| `P` / `Esc` | Pause |
| `R` | Restart the level |

Dev shortcuts: `?level=N` starts at level N, `?r=6` starts with a bigger hole;
for Free Play `?map=<id>` skips the picker (`classic`, `megacity`, `orchard`,
`megapark`, `feast`, `waterworld`), and `?size=`, `?tiles=`, `?props=` and
`?seed=` give a small or repeatable board (e.g.
`?mode=free&map=classic&size=60&tiles=300&props=0` for the auto-player in
`tools/`).

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
  world/    picture tiles (icon atlas, geometries, materials), voxel sculpting for props
            and the giant set pieces, themes/palettes, instanced voxel pools, the board ground
  levels/   the level generator (layout, growth curve, goal card, clock) and the free-play board
  game/     the hole, streamed block and tile physics + the pit (Rapier), hazards, debris, progress
  ui/       HUD and overlays
```

Tiles are `InstancedMesh` instances (one pool for cookies, one for dice) with a
per-instance icon index into a canvas-painted atlas. Every tile is a Rapier
rigid body while the hole is near it: Rapier charges for every body in the
world, asleep or not, so tiles far from the hole are dormant (a stored pose and
an instance, no body) and get a body only inside a ring around the hole, which
is what lets the free-play board hold thousands of tiles. The hole is a
heightfield patch punched into the ground collider that follows the hole and
grows with it, which is what makes a tile hanging over the rim tip in. Voxel
props have structural bonds that carry support from the lowest course to
overhangs and decorative details. Intact, supported sections stay fixed when
approached. Removing a foundation block or delivering a strong impact breaks
connections and releases unsupported sections into Rapier. Support has a
reach: a block falls once its shortest support path is more than a few blocks
longer than it was as built, so a designed overhang holds but a skyscraper
with a wide bite out of its base drops the columns over the gap. A collapse
of more than ~120 blocks drops the part that is over the pit without bodies
(plain free fall), so a giant coming down does not stall the solver. Intact
blocks only get a (fixed) body near the rim and below the hole's reach in
height. Detached sections
retain breakable fixed joints, gravity, friction, and collision contact; broken
bonds stay broken when debris streams out and back in. This is a game support
model rather than a material-stress simulation. Their original instanced voxel
artwork stays in place; only moving blocks update their transforms.
There is no whole-structure sinking, pulling, or automatic credit for blocks
that have not fallen into the pit.

All models and code are original.
