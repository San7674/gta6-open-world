[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/San7674/gta6-open-world/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/San7674/gta6-open-world/reward.svg)](https://make.fun/bounty/gta6-01)

# Rustport — Open World Crime

An original 2D top-down open-world crime game, built for the
[make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01).

**Rustport** is a fictional rust-belt port city — dockyards on the harbor, a downtown of
glass towers, the Eastworks factories, quiet Northside suburbs and a Southside beach.
You are Cole "Rook" Vane, an ex-dockworker pulled into Mara Kessler's Harbor crew.
Drive the city, steal what runs, dodge the Rustport PD, and finish five jobs — or end
up busted, broke, or worse.

## What is in the game

- **A city to explore** — 3,840 × 3,840 px of streets, districts, parks, piers and beach,
  on foot and by car, with a camera that follows you.
- **Traffic and pedestrians** — cars drive the street grid, people walk the sidewalks,
  and both react to you.
- **Cars to steal and drive** — sedans, sports cars, vans, trucks and taxis. Walk up
  and take one; the cops will notice.
- **A wanted level** — 5 stars of heat. Police cars hunt you on the roads and foot cops
  run you down. Get boxed in or grabbed and you're busted; get hurt badly and you're wasted.
- **Missions and a story** — five jobs for the Harbor crew: a first delivery, a stolen
  Comet GT, a 60-second getaway, a night run with three drops against the clock, and a
  double-cross finale. Plus taxi fares and 20 hidden rust coins.
- **A HUD with a minimap** — health, money, wanted stars, mission objective with
  distance, an off-screen waypoint arrow, a clock and the district you're in.
- **Feel and polish** — day/night cycle with sunset and headlights, skid marks, synthesized
  WebAudio sound effects and music (no audio files), start screen, pause, and a save
  system (localStorage) with Continue.

## How to play

Serve the game and open it in desktop Chrome:

```sh
node serve.ts
# open http://localhost:8080
```

| Key | Action |
| --- | --- |
| W A S D | Move on foot / drive |
| Shift | Sprint |
| E | Enter / exit a car (steal it if it isn't yours) |
| Space | Handbrake |
| F | Punch |
| T | Pick up a taxi fare (near a green $ marker, while driving) |
| P / Esc | Pause |
| M | Sound on / off |

## Files

- `game/index.html` — the page
- `game/css/style.css` — menu and overlay styling
- `game/js/main.js` — game loop, state machine, camera, save/load, screenshot presets
- `game/js/world.js` — the city generator (districts, buildings, roads, water)
- `game/js/cars.js` — car factory and arcade driving physics
- `game/js/player.js` — on-foot movement, car theft, combat, health
- `game/js/traffic.js` — traffic cars and pedestrians
- `game/js/police.js` — wanted level, police pursuit, busts
- `game/js/missions.js` — the five-job story, taxi fares, rust coins
- `game/js/render.js` — world, entity and day/night lighting renderer
- `game/js/hud.js` — HUD, minimap, toasts, overlays
- `game/js/audio.js` — synthesized WebAudio effects and music
- `game/js/input.js` — keyboard and mouse input
- `game/js/util.js` — seeded randomness, math and collision helpers

Everything in the game is original — Rustport, its people and its streets are invented.
Nothing here is from any commercial game. The entry is handed in by `main.ts`, which
copies `game/` and `screenshots/` to `/output` and writes `dossier.json`.
