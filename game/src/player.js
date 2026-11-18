// player.js — Mari Solano, the player's character: on-foot movement and
// sprint, slipping into any unlocked car, fists, and the pistol she earns
// during the story. The driving itself lives in vehicles.js; this file is
// the person.

import { PLAYER, PALETTE } from './config.js';
import { clamp, dist2 } from './rng.js';
import { collideCircle } from './city.js';

export class Player {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.angle = -Math.PI / 2;
    this.health = PLAYER.health;
    this.car = null;
    this.hasGun = false;
    this.swing = 0;          // seconds since the last punch started
    this.fireCd = 0;
    this.stepPhase = 0;
    this.moving = false;
    this.dead = false;
  }

  get pos() { return this.car ? { x: this.car.x, y: this.car.y } : { x: this.x, y: this.y }; }
  get speed() {
    return this.car ? this.car.speed : (this.moving ? PLAYER.walkSpeed : 0);
  }
  get velocity() {
    return this.car ? { x: this.car.vx, y: this.car.vy } : { x: 0, y: 0 };
  }

  enterCar(car) {
    this.car = car;
    car.occupied = true;
  }

  exitCar(city) {
    if (!this.car) return;
    const side = this.car.angle + Math.PI / 2;
    this.x = this.car.x + Math.cos(side) * 26;
    this.y = this.car.y + Math.sin(side) * 26;
    const p = { x: this.x, y: this.y };
    collideCircle(city, p, PLAYER.radius);
    this.x = p.x; this.y = p.y;
    this.car.occupied = false;
    this.car = null;
  }

  update(dt, game) {
    this.swing += dt;
    this.fireCd -= dt;
    if (this.car) {
      this.x = this.car.x; this.y = this.car.y;
      this.angle = this.car.angle;
      return;
    }
    const input = game.input;
    let mx = (input.rt ? 1 : 0) - (input.lf ? 1 : 0);
    let my = (input.dn ? 1 : 0) - (input.up ? 1 : 0);
    this.moving = mx !== 0 || my !== 0;
    if (this.moving) {
      const len = Math.hypot(mx, my);
      const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
      this.x += (mx / len) * speed * dt;
      this.y += (my / len) * speed * dt;
      this.angle = Math.atan2(my, mx);
      this.stepPhase += dt * (input.run ? 13 : 9);
    }
    // With the pistol out, Mari faces the mouse instead of her stride.
    if (this.hasGun) {
      const mw = game.mouseWorld();
      this.angle = Math.atan2(mw.y - this.y, mw.x - this.x);
    }
    const p = { x: this.x, y: this.y };
    collideCircle(game.city, p, PLAYER.radius);
    this.x = p.x; this.y = p.y;

    if (input.attack) this.attack(game);
  }

  attack(game) {
    if (this.hasGun && this.fireCd <= 0) {
      this.fireCd = 0.24;
      game.shoot(this);
      return;
    }
    if (this.swing < 0.32) return;
    this.swing = 0;
    game.punch(this);
  }

  hurt(amount) {
    this.health = clamp(this.health - amount, 0, PLAYER.health);
    if (this.health <= 0) this.dead = true;
  }

  heal(amount) {
    this.health = clamp(this.health + amount, 0, PLAYER.health);
  }

  draw(ctx, time) {
    if (this.car) return;
    const bobY = this.moving ? Math.sin(this.stepPhase) * 1.3 : 0;
    ctx.fillStyle = 'rgba(20,26,18,0.30)';
    ctx.beginPath(); ctx.ellipse(this.x + 2, this.y + 5, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
    // Legs scissor when moving.
    if (this.moving) {
      ctx.fillStyle = PALETTE.playerPants;
      const s = Math.sin(this.stepPhase) * 5;
      const px = Math.cos(this.angle + Math.PI / 2), py = Math.sin(this.angle + Math.PI / 2);
      ctx.beginPath(); ctx.arc(this.x + px * 4 + Math.cos(this.angle) * s * 0.4, this.y + py * 4 + Math.sin(this.angle) * s * 0.4, 3.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(this.x - px * 4 - Math.cos(this.angle) * s * 0.4, this.y - py * 4 - Math.sin(this.angle) * s * 0.4, 3.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = PALETTE.playerShirt;
    ctx.beginPath(); ctx.arc(this.x, this.y + bobY, 8.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8a5a2b';
    ctx.beginPath(); ctx.arc(this.x, this.y + bobY, 4.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2c79b';
    ctx.beginPath(); ctx.arc(this.x + Math.cos(this.angle) * 2.2, this.y + bobY + Math.sin(this.angle) * 2.2, 3.4, 0, Math.PI * 2); ctx.fill();
    if (this.hasGun) {
      ctx.strokeStyle = '#22242a';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(this.x + Math.cos(this.angle) * 6, this.y + bobY + Math.sin(this.angle) * 6);
      ctx.lineTo(this.x + Math.cos(this.angle) * 14, this.y + bobY + Math.sin(this.angle) * 14);
      ctx.stroke();
    }
    // A fresh punch arcs in front of her.
    if (this.swing < 0.16) {
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, PLAYER.punchRange * 0.8, this.angle - 0.7, this.angle + 0.7);
      ctx.stroke();
    }
  }
}

export function nearestCar(game, x, y, maxDist) {
  let best = null, bd = maxDist * maxDist;
  for (const car of game.allCars()) {
    if (car.dead) continue;
    const d = dist2(x, y, car.x, car.y);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}
