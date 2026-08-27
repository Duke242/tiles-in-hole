# Voxel City Hole

A black hole opens under a voxel city and eats it. Steer it with your finger,
grow as you swallow, and work up from pedestrians to the giant statues in the
parks.

**Play:** https://duke242.github.io/tiles-in-hole/

## Controls

| Input | Action |
| --- | --- |
| Hold & drag | Steer the hole (it follows your finger with capped speed) |
| `WASD` / arrows | Steer with the keyboard |
| Scroll | Zoom |
| `R` | Restart |

## How it plays

The hole starts at size 3.2 and grows with everything it eats
(`r' = sqrt(r² + 0.3·value)`). Each object has a size gate, so the city opens
up in tiers: people and street clutter, then trees, cars, buses and houses,
shops, skyscrapers, and finally the giant statues. Small things slide down the
crater wall and spiral in; buildings sink straight down in a cloud of rubble;
the giants are eaten voxel by voxel from the base up and stream into the pit.

There is no timer and no fail state — it is one big sandbox map. Clearing
everything shows a stats screen.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # → dist/
```

Dev shortcuts for testing the late game: `?r=27` starts the hole at that
radius, `?g=1` drops you next to the first giant.

## Layout

```
src/
  core/    engine (renderer, sky, lights, clouds), input, procedural audio
  world/   city generator, ground shader, voxel models, giant sculptor,
           instanced-mesh pool
  game/    hole physics, debris vortex, eating state machine, progression
  ui/      HUD, minimap, toasts
```

The city surface is one procedural shader evaluated from world position, so the
flat ground and the crater funnel share a single definition of roads,
crosswalks, kerbs and district colours. Everything else is drawn from a handful
of `InstancedMesh` pools, so the whole city is only a few draw calls.

All models and code are original.
