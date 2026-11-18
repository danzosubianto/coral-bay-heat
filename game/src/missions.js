// missions.js — work in Coral Bay. A five-job story chain for Marlin Doss,
// the garage fixer who takes Mari in, then an endless board of freeroam jobs
// (deliveries, checkpoint races, cab fares, rampages) once the story is done.
// Every job is a small state machine: stages with a target, an optional
// timer, and hooks for the special rules of its type.

import { ECONOMY } from './config.js';
import { dist2 } from './rng.js';
import { Ped } from './peds.js';

export class Missions {
  constructor(game) {
    this.game = game;
    this.current = null;
    this.storyIndex = 0;
    this.completed = 0;
    this.failed = 0;
    this.cooldown = 0;
    this.banner = null;      // {title, lines, until}
  }

  get objective() {
    const m = this.current;
    if (!m) return null;
    return m.stages[m.stage] ?? null;
  }

  hubPoint() {
    const g = this.game.city.landmarks.garage;
    return { x: g.x + g.w / 2, y: g.y + g.h + 34 };
  }

  update(dt) {
    const game = this.game;
    this.cooldown -= dt;
    if (this.banner && game.time > this.banner.until) this.banner = null;
    const m = this.current;
    if (!m) {
      // Offer the next job at Marlin's garage door.
      if (this.cooldown <= 0) {
        const hub = this.hubPoint();
        const p = game.playerPos();
        if (dist2(p.x, p.y, hub.x, hub.y) < 52 * 52) this.startNext();
      }
      return;
    }
    if (m.timeLeft !== null) {
      m.timeLeft -= dt;
      if (m.timeLeft <= 0) return this.fail('Out of time.');
    }
    if (m.tick) m.tick(game, dt);
    const stage = this.objective;
    if (stage) {
      const p = game.playerPos();
      const needCar = stage.needCar && !game.playerInCar();
      if (!needCar && dist2(p.x, p.y, stage.x, stage.y) < stage.r * stage.r) {
        const stagesBefore = m.stages;
        if (stage.onArrive) stage.onArrive(game, m);
        // A hook may swap in a fresh stage list (the taxi pickup does):
        // it has already set the stage index, so only advance when the
        // list is the one we arrived on.
        if (m.stages === stagesBefore) {
          m.stage++;
          if (m.stage >= m.stages.length) this.complete();
        }
      }
    }
  }

  startNext() {
    const game = this.game;
    const makers = [storyFirstWheels, storyHotPackage, storyBayRun, storyCabWork, storyRampage];
    const m = this.storyIndex < makers.length
      ? makers[this.storyIndex](game)
      : freeroamJob(game);
    m.stage = 0;
    m.timeLeft = m.timeLimit ?? null;
    if (m.setup) m.setup(game, m);
    this.current = m;
    this.banner = { title: m.title, lines: m.intro, until: game.time + 6.5 };
    game.sound.pickup();
    game.announce(`NEW JOB — ${m.title}`);
  }

  complete() {
    const game = this.game;
    const m = this.current;
    game.earn(m.reward);
    game.respect++;
    this.completed++;
    if (this.storyIndex < 5) this.storyIndex++;
    if (m.onComplete) m.onComplete(game, m);
    game.sound.jobDone();
    game.announce(`JOB DONE — +$${m.reward}`);
    this.current = null;
    this.cooldown = 2.5;
  }

  fail(reason) {
    const game = this.game;
    if (this.current && this.current.cleanup) this.current.cleanup(game, this.current);
    this.failed++;
    game.sound.jobFail();
    game.announce(`JOB FAILED — ${reason}`);
    this.current = null;
    this.cooldown = 4;
  }

  progressText() {
    const m = this.current;
    if (!m) return '';
    if (m.progress) return m.progress(this.game, m);
    const s = this.objective;
    return s ? s.text : '';
  }
}

// --- helpers ----------------------------------------------------------------

function landmarkFront(game, key) {
  const b = game.city.landmarks[key];
  return { x: b.x + b.w / 2, y: b.y + b.h + 30 };
}

// --- the story chain ----------------------------------------------------------

function storyFirstWheels(game) {
  const hub = landmarkFront(game, 'garage');
  return {
    title: 'FIRST WHEELS',
    intro: ['Marlin: “You walk everywhere, Mari? This is Coral Bay.”', '“Bring me a car — any car — to the garage. Yours now.”'],
    reward: 150,
    stages: [{
      x: hub.x, y: hub.y, r: 58, needCar: true,
      text: 'Steal any car and deliver it to Marlin’s garage',
    }],
  };
}

function storyHotPackage(game) {
  const diner = landmarkFront(game, 'diner');
  const hub = landmarkFront(game, 'garage');
  return {
    title: 'HOT PACKAGE',
    intro: ['Marlin: “A cooler at Diner La Ola. Don’t open it.”', '“The bay bridge crew is watching — move fast, expect heat.”'],
    reward: 260,
    timeLimit: 115,
    stages: [
      {
        x: diner.x, y: diner.y, r: 46, text: 'Pick up the cooler at Diner La Ola',
        onArrive: (g) => { g.wanted.addCrime(1.2, g, diner.x, diner.y); g.announce('The crew spotted you — GO!'); },
      },
      { x: hub.x, y: hub.y, r: 58, text: 'Drop the cooler at Marlin’s garage' },
    ],
    onComplete: (g) => {
      g.player.hasGun = true;
      g.announce('Marlin leaves you his pistol. Mouse aims, click or Space fires.');
    },
  };
}

function storyBayRun(game) {
  const gates = [[2, 2], [6, 1], [10, 3], [8, 6], [4, 7], [1, 4]];
  const stages = gates.map(([i, j], k) => {
    const n = game.city.nodes[j * 12 + i];
    return {
      x: n.x, y: n.y, r: 52, needCar: true,
      text: `Hit checkpoint ${k + 1} of ${gates.length}`,
      onArrive: (g, m) => { m.timeLeft = Math.min(m.timeLeft + 22, 99); g.sound.cash(); },
    };
  });
  const hub = landmarkFront(game, 'garage');
  stages.push({ x: hub.x, y: hub.y, r: 58, needCar: true, text: 'Finish at Marlin’s garage' });
  return {
    title: 'BAY RUN',
    intro: ['Marlin: “The street league runs the bay at golden hour.”', '“Six gates, one loop. Beat the clock and you’re family.”'],
    reward: 300,
    timeLimit: 46,
    stages,
  };
}

function storyCabWork(game) {
  return {
    title: 'CAB WORK',
    intro: ['Marlin: “Half this town owes me cab fare.”', '“Pick up my fares, drop them clean, keep the change.”'],
    reward: 190,
    stages: [],
    setup: (g, m) => setupFare(g, m, 2),
    progress: (g, m) => m.faresDone > 0 ? `Fares done: ${m.faresDone}/2` : 'Pick up the fare',
  };
}

function storyRampage(game) {
  return {
    title: 'DOCKSIDE RAMPAGE',
    intro: ['Marlin: “The Marlin Syndicate’s rivals park by the docks.”', '“Five of their rides, wrecked. Send a message.”'],
    reward: 420,
    timeLimit: 95,
    stages: [],
    setup: (g, m) => { m.baseWrecks = g.wrecks; },
    tick: (g, m) => { if (g.wrecks - m.baseWrecks >= 5) g.missions.complete(); },
    progress: (g, m) => `Wrecked: ${Math.min(5, g.wrecks - m.baseWrecks)}/5 rival cars`,
  };
}

// --- taxi machinery (shared by story + freeroam) ------------------------------

function setupFare(game, m, faresTotal) {
  m.faresDone = 0;
  m.faresTotal = faresTotal;
  spawnFare(game, m);
}

function spawnFare(game, m) {
  const spots = ['diner', 'hospital', 'garage', 'police'];
  const fromKey = spots[game.rng.int(0, spots.length - 1)];
  let toKey = spots[game.rng.int(0, spots.length - 1)];
  if (toKey === fromKey) toKey = 'hospital';
  const from = landmarkFront(game, fromKey);
  const ped = new Ped(from.x, from.y, game.rng);
  ped.state = 'wait';
  ped.isFare = true;
  game.peds.push(ped);
  m.farePed = ped;
  m.fareDest = landmarkFront(game, toKey);
  m.stages = [{
    x: from.x, y: from.y, r: 40, needCar: true, text: 'Stop by the fare and let them in',
    onArrive: (g, mm) => {
      g.peds.splice(g.peds.indexOf(mm.farePed), 1);
      mm.farePed = null;
      g.sound.pickup();
      g.announce('Fare aboard — drive smooth, tip grows.');
      mm.stages = [{
        x: mm.fareDest.x, y: mm.fareDest.y, r: 52, needCar: true, text: 'Drop the fare at the destination',
        onArrive: (g2, m2) => {
          m2.faresDone++;
          const fare = 60 + Math.round(dist2(from.x, from.y, m2.fareDest.x, m2.fareDest.y) ** 0.5 * ECONOMY.farePerMeter * 10);
          g2.earn(fare);
          g2.announce(`Fare paid $${fare}`);
          if (m2.faresDone < m2.faresTotal) spawnFare(g2, m2);
          else g2.missions.complete();
        },
      }];
      mm.stage = 0;
    },
  }];
  m.cleanup = (g, mm) => {
    if (mm.farePed) g.peds.splice(g.peds.indexOf(mm.farePed), 1);
  };
}

// --- freeroam board -----------------------------------------------------------

function freeroamJob(game) {
  const kind = game.rng.pick(['delivery', 'race', 'taxi', 'rampage']);
  const hub = landmarkFront(game, 'garage');
  if (kind === 'delivery') {
    const keys = ['diner', 'hospital', 'police', 'garage'];
    const a = landmarkFront(game, game.rng.pick(keys));
    const b = landmarkFront(game, game.rng.pick(keys));
    return {
      title: 'COURIER RUN', intro: ['Marlin: “Another cooler, another favour.”'], reward: 170 + game.rng.int(0, 90),
      timeLimit: 105,
      stages: [
        { x: a.x, y: a.y, r: 46, text: 'Pick up the package' },
        { x: b.x, y: b.y, r: 56, text: 'Deliver the package' },
      ],
    };
  }
  if (kind === 'race') {
    const m = storyBayRun(game);
    m.title = 'STREET LEAGUE';
    m.intro = ['Marlin: “League’s running again. Six gates.”'];
    m.reward = 240 + game.rng.int(0, 120);
    return m;
  }
  if (kind === 'taxi') {
    return {
      title: 'CAB WORK', intro: ['Marlin: “Fares are waiting.”'], reward: 60,
      stages: [], setup: (g, mm) => setupFare(g, mm, 1),
      progress: () => 'Work the fare',
    };
  }
  return {
    title: 'RAMPAGE', intro: ['Marlin: “Rivals are parked up again. Four wrecks.”'], reward: 320,
    timeLimit: 90, stages: [],
    setup: (g, mm) => { mm.baseWrecks = g.wrecks; },
    tick: (g, mm) => { if (g.wrecks - mm.baseWrecks >= 4) g.missions.complete(); },
    progress: (g, mm) => `Wrecked: ${Math.min(4, g.wrecks - mm.baseWrecks)}/4 rival cars`,
  };
}
