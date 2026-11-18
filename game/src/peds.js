// peds.js — the people of Coral Bay. They stroll the sidewalks between
// corners, chat in pairs, run from gunfire and reckless driving, and fall
// down when clipped. A few wait at curbs as fares for taxi work.

import { PALETTE, WORLD } from './config.js';
import { angleDelta, clamp, dist2 } from './rng.js';
import { collideCircle } from './city.js';

const SKIN = ['#f2c79b', '#d9a066', '#a9713f', '#7a4a21', '#ffe0bd'];

export class Ped {
  constructor(x, y, rng) {
    this.x = x; this.y = y;
    this.angle = rng.range(0, Math.PI * 2);
    this.speed = 0;
    this.shirt = rng.pick(PALETTE.pedShirts);
    this.skin = rng.pick(SKIN);
    this.state = 'walk';        // walk | flee | down | wait
    this.target = null;
    this.think = rng.range(0, 0.5);
    this.fleeFrom = null;
    this.stateTime = 0;
    this.health = 30;
    this.bob = rng.range(0, 6);
    this.isFare = false;        // waiting for a taxi pickup
    this.dead = false;
  }

  get pos() { return { x: this.x, y: this.y }; }

  update(dt, game) {
    this.stateTime += dt;
    this.think -= dt;
    const { city } = game;

    if (this.state === 'down') {
      this.speed = 0;
      if (this.stateTime > 5) { this.state = 'flee'; this.stateTime = 0; this.health = 30; }
      return;
    }

    // Notice danger: a fast car close by, a shot, a swinging fist.
    if (this.think <= 0) {
      this.think = 0.18;
      const threat = game.threatNear(this.x, this.y, 92);
      if (threat && this.state !== 'flee') {
        this.state = 'flee';
        this.fleeFrom = threat;
        this.stateTime = 0;
        if (game.sound && Math.random() < 0.3) game.sound.tone(1200 + Math.random() * 500, 0.09, 'sine', 0.05);
      }
    }

    if (this.state === 'flee') {
      const from = this.fleeFrom ?? game.playerPos();
      const away = Math.atan2(this.y - from.y, this.x - from.x);
      this.steer(dt, away, 215);
      if (this.stateTime > 2.6) { this.state = 'walk'; this.target = null; }
    } else if (this.state === 'wait') {
      this.speed = 0; // a fare stands at the curb and watches the street
    } else {
      if (!this.target || dist2(this.x, this.y, this.target.x, this.target.y) < 18 * 18) {
        if (this.think <= 0.02) {
          this.target = sidewalkPointNear(game.rng, this.x, this.y);
          this.think = 0.4;
        }
      }
      if (this.target) {
        const bearing = Math.atan2(this.target.y - this.y, this.target.x - this.x);
        this.steer(dt, bearing, 74);
      } else this.speed = 0;
    }

    const p = { x: this.x, y: this.y };
    collideCircle(city, p, 9);
    this.x = p.x; this.y = p.y;
    this.bob += dt * (4 + this.speed * 0.05);
  }

  steer(dt, bearing, topSpeed) {
    this.angle += clamp(angleDelta(this.angle, bearing), -6 * dt, 6 * dt);
    this.speed += (topSpeed - this.speed) * Math.min(1, dt * 5);
    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;
  }

  knockDown(fromX, fromY) {
    this.state = 'down';
    this.stateTime = 0;
    const a = Math.atan2(this.y - fromY, this.x - fromX);
    this.x += Math.cos(a) * 14;
    this.y += Math.sin(a) * 14;
  }

  draw(ctx) {
    ctx.fillStyle = 'rgba(20,26,18,0.28)';
    ctx.beginPath(); ctx.ellipse(this.x + 2, this.y + 4, 8, 4.5, 0, 0, Math.PI * 2); ctx.fill();
    if (this.state === 'down') {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);
      ctx.fillStyle = this.shirt;
      ctx.beginPath(); ctx.ellipse(0, 0, 11, 5.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = this.skin;
      ctx.beginPath(); ctx.arc(12, 0, 4.4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }
    const bobY = Math.sin(this.bob * 2.2) * 1.1;
    ctx.fillStyle = this.shirt;
    ctx.beginPath(); ctx.arc(this.x, this.y + bobY, 7.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = this.skin;
    ctx.beginPath(); ctx.arc(this.x + Math.cos(this.angle) * 2.4, this.y + bobY + Math.sin(this.angle) * 2.4, 4.3, 0, Math.PI * 2); ctx.fill();
    if (this.isFare) {
      // A raised hand: this person wants a cab.
      ctx.strokeStyle = '#22242a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.x + 5, this.y - 4);
      ctx.lineTo(this.x + 10, this.y - 11 + Math.sin(this.bob * 3) * 1.6);
      ctx.stroke();
    }
  }
}

// Sidewalk points hug the parcel corners, just off the road edge.
export function sidewalkPointNear(rng, x, y) {
  const RH = WORLD.road / 2 + 10;
  const gx = Math.round((x - WORLD.block / 2) / WORLD.block) * WORLD.block + WORLD.block / 2;
  const gy = Math.round((y - WORLD.block / 2) / WORLD.block) * WORLD.block + WORLD.block / 2;
  const cx = gx + rng.pick([-1, 1]) * RH * rng.range(0.4, 1);
  const cy = gy + rng.pick([-1, 1]) * RH * rng.range(0.4, 1);
  return { x: clamp(cx, 20, WORLD.width - 20), y: clamp(cy, 20, WORLD.height - 20) };
}

export function spawnPeds(city, rng, count) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const node = city.nodes[rng.int(0, city.nodes.length - 1)];
    const p = sidewalkPointNear(rng, node.x + rng.range(-90, 90), node.y + rng.range(-90, 90));
    peds.push(new Ped(p.x, p.y, rng));
  }
  return peds;
}
