// police.js — the Coral Bay PD. A heat model (crimes raise it, staying out of
// sight cools it) and cruisers that genuinely hunt: they intercept the
// player's predicted position, ram, box in, and build a bust when the player
// is stopped and surrounded. At high heat they throw up roadblocks.

import { WANTED, PALETTE } from './config.js';
import { angleDelta, clamp, dist2 } from './rng.js';
import { nearestNode } from './city.js';
import { Car, drawCar } from './vehicles.js';

export class Wanted {
  constructor() {
    this.heat = 0;          // 0..5, fractional; stars are ceil(heat)
    this.seenTimer = 0;     // seconds since a cop last had eyes on the player
    this.bust = 0;          // 0..1 bust progress
  }

  get stars() { return this.heat <= 0.02 ? 0 : Math.ceil(this.heat); }

  addCrime(points, game, x, y) {
    // A crime only counts fully if someone could have seen it: a cop or a
    // pedestrian nearby, or any cop radio range for the loud stuff.
    const witnessed = game.anyWitness(x, y, points >= 1 ? 420 : 210);
    this.heat = clamp(this.heat + (witnessed ? points : points * 0.35), 0, WANTED.maxStars);
    if (witnessed) this.seenTimer = 0;
  }

  update(dt, seen) {
    if (seen) this.seenTimer = 0; else this.seenTimer += dt;
    if (this.seenTimer > WANTED.decaySeconds && this.heat > 0) {
      this.heat = Math.max(0, this.heat - dt * 0.055);
      if (this.heat < 0.02) this.heat = 0;
    }
  }
}

export class Police {
  constructor() {
    this.cruisers = [];
    this.roadblocks = [];
    this.spawnCooldown = 0;
    this.blockCooldown = 8;
  }

  desiredCount(stars) {
    if (stars <= 0) return 0;
    return 1 + stars; // 2 cruisers at one star, up to 6 at five
  }

  update(dt, game) {
    const { city, wanted } = game;
    const target = game.playerPos();
    this.spawnCooldown -= dt;
    this.blockCooldown -= dt;

    // Spawn at intersections a few blocks away, never in plain sight.
    const want = this.desiredCount(wanted.stars);
    if (this.cruisers.length < want && this.spawnCooldown <= 0) {
      this.spawnCooldown = 1.6;
      const node = pickSpawnNode(city, target, game.rng);
      if (node) {
        const cop = new Car(node.x, node.y, Math.atan2(target.y - node.y, target.x - node.x), PALETTE.copBody, 'cop');
        cop.stuckTime = 0;
        this.cruisers.push(cop);
      }
    }
    // Cull cruisers that lost the trail completely.
    this.cruisers = this.cruisers.filter((c) => {
      if (c.dead) return false;
      return !(wanted.stars === 0 && dist2(c.x, c.y, target.x, target.y) > 700 * 700);
    });

    let anySeen = false;
    let surrounding = 0;
    for (const cop of this.cruisers) {
      const control = pursuitControl(cop, game, dt);
      cop.drive(dt, control);
      const impact = cop.collideWorld(city);
      if (impact > 190) game.onCopCrash(cop, impact);
      const d = Math.hypot(cop.x - target.x, cop.y - target.y);
      if (d < 430 && game.lineOfSight(cop.x, cop.y, target.x, target.y)) anySeen = true;
      if (d < 120) surrounding++;
    }

    // Roadblocks at four stars and up: two cruisers parked across a street
    // a couple of intersections ahead of the player's heading.
    if (wanted.stars >= 4 && this.blockCooldown <= 0 && this.roadblocks.length < 2) {
      this.blockCooldown = 16;
      const ahead = game.playerAhead(420);
      const node = city.nodes[nearestNode(city, ahead.x, ahead.y)];
      const across = new Car(node.x, node.y, 0, PALETTE.copBody, 'cop');
      across.roadblock = true;
      across.angle = Math.atan2(target.y - node.y, target.x - node.x) + Math.PI / 2;
      this.roadblocks.push(across);
    }
    this.roadblocks = this.roadblocks.filter((c) => wanted.stars >= 3 && dist2(c.x, c.y, target.x, target.y) < 900 * 900);
    for (const c of this.roadblocks) c.collideWorld(city);

    // The bust: stopped (or on foot) with two cruisers close for long enough.
    const playerSpeed = game.playerSpeed();
    if (surrounding >= 2 && playerSpeed < 42 && wanted.stars > 0) {
      wanted.bust = Math.min(1, wanted.bust + dt / WANTED.bustSeconds);
    } else if (surrounding >= 1 && playerSpeed < 16 && wanted.stars > 0 && !game.playerInCar()) {
      wanted.bust = Math.min(1, wanted.bust + dt / (WANTED.bustSeconds * 1.5));
    } else {
      wanted.bust = Math.max(0, wanted.bust - dt * 0.7);
    }
    return anySeen;
  }

  draw(ctx, time) {
    for (const c of this.roadblocks) drawCar(ctx, c, time);
  }

  allCars() { return [...this.cruisers, ...this.roadblocks]; }
}

function pickSpawnNode(city, target, rng) {
  const near = nearestNode(city, target.x, target.y);
  const cands = [];
  city.nodes.forEach((n, idx) => {
    const d = Math.hypot(n.x - target.x, n.y - target.y);
    if (d > 520 && d < 980) cands.push(idx);
  });
  if (!cands.length) return null;
  const idx = cands[rng.int(0, cands.length - 1)];
  return city.nodes[idx ?? near];
}

// The pursuit brain: aim ahead of the player, full throttle, brake only for
// a building-shadow turn or when about to overshoot a stopped player.
function pursuitControl(cop, game, dt) {
  const target = game.playerPos();
  const pv = game.playerVelocity();
  const lead = clamp(Math.hypot(target.x - cop.x, target.y - cop.y) / 300, 0.1, 0.75);
  const aimX = target.x + pv.x * lead;
  const aimY = target.y + pv.y * lead;
  const bearing = Math.atan2(aimY - cop.y, aimX - cop.x);
  const delta = angleDelta(cop.angle, bearing);
  const steer = clamp(delta * 2.1, -1, 1);
  const d = Math.hypot(target.x - cop.x, target.y - cop.y);

  // Stuck detection: full intent, no motion — back out and try again.
  if (cop.forwardSpeed < 14 && d > 90) cop.stuckTime += dt; else cop.stuckTime = 0;
  if (cop.stuckTime > 0.85) {
    if (cop.stuckTime < 1.7) return { throttle: -1, steer: -steer, brake: false };
    cop.stuckTime = 0;
  }

  let throttle = 1;
  let brake = false;
  if (d < 64 && game.playerSpeed() < 30) { throttle = 0.25; brake = cop.forwardSpeed > 60; }
  else if (Math.abs(delta) > 1.25) throttle = 0.55;
  // Slow a touch for very sharp turns so cruisers stay on the road.
  if (Math.abs(delta) > 0.85 && cop.forwardSpeed > 300) brake = true;
  return { throttle, steer, brake };
}
