# coral-bay-heat

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/danzosubianto/coral-bay-heat/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/danzosubianto/coral-bay-heat/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Coral Bay Heat** is a top-down open-world crime sandbox that runs entirely
from its own files — no build step, no dependencies, no network. You are Mari
Solano, back in the sun-soaked port city of Coral Bay with empty pockets and a
fixer named Marlin Doss who always has work.

Explore a 3,360 × 2,520 city of named hotels, cafés and banks, palm-lined
parks, parking lots and a working beach. Steal any car you can reach — the
driver may bail and run — and keep it, wreck it, or deliver it. A living
traffic system drives the road graph in the correct lanes and brakes for
trouble; 40+ pedestrians stroll the pavements, hail cabs, flee from gunfire
and remember nothing good about you.

The Coral Bay PD keeps score. Crimes witnessed by pedestrians or officers
raise your heat through five stars: cruisers intercept your predicted path,
ram and box you in, and at four stars they park roadblocks across the street
ahead. Get stopped and surrounded and the bust meter fills — Precinct 9 takes
12% of your cash. Die instead and Coral Bay General bills you 10%.

Work Marlin's five-job story chain — **First Wheels** (steal and deliver a
car), **Hot Package** (a timed cooler run that ends with Marlin's pistol in
your hand), **Bay Run** (a six-gate street race), **Cab Work** (paid fares
with destinations across town) and **Dockside Rampage** (wreck five rival
rides against the clock) — then keep earning from an endless freeroam board of
courier runs, races, fares and rampages. Mug pedestrians, shoot out tyres,
outrun the heat until it cools, and press **K** to save your run in the
browser.

Everything is drawn and sounded in code: the fake-3D rooftops, the animated
bay, the day cycle from golden afternoon to blue night, and a WebAudio
soundtrack of engine notes, two-tone sirens, crashes and cash registers.
Fixed-step 60 Hz simulation, one ES module per system (`city`, `vehicles`,
`peds`, `police`, `player`, `missions`, `hud`, `audio`…).

**Controls** — WASD / arrows: walk & drive · Shift: sprint · E: get in / out
of cars · Space (or click): punch, and fire the pistol once you earn it
(mouse aims) · P / Esc: pause · K: save · R / Enter: respawn prompts.

## Run it

```sh
node serve.ts        # then open http://localhost:8080
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=qy81p54j&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
