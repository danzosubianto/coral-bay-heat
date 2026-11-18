// main.js — Coral Bay Heat's game object: owns the world and every system,
// steps them at a fixed 60 Hz, resolves the interactions between them
// (theft, collisions, gunfire, the bust, the hospital), and draws the frame.

import { DAY, WORLD } from './config.js';
import { makeRng, clamp, dist2, angleDelta } from './rng.js';
import { buildCity, drawCity, nearestNode, roadXs } from './city.js';import { Input } from './input.js';
import { SoundBank } from './audio.js';
import { Car, spawnTraffic, trafficControl, drawCar } from './vehicles.js';
import { Ped, spawnPeds } from './peds.js';
import { Wanted, Police } from './police.js';
import { Player, nearestCar } from './player.js';
import { Missions } from './missions.js';
import { Hud, drawMarkers } from './hud.js';
import { setupShot } from './shots.js';

const SAVE_KEY = 'coral-bay-heat-save-v1';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    const params = new URLSearchParams(location.search);
    this.seed = Number(params.get('seed') ?? 20261118);
    this.rng = makeRng(this.seed);
    this.input = new Input(canvas);
    this.sound = new SoundBank();
    this.city = buildCity(makeRng(this.seed ^ 0xC17A));
    this.resetWorld();
    this.hud = new Hud();
    this.missions = new Missions(this);
    this.state = 'title';
    this.time = 0;
    this.dayPhase = DAY.startPhase;
    this.camera = { x: this.player.x, y: this.player.y };
    this.particles = [];
    this.skids = [];
    this.noise = { x: 0, y: 0, at: -99 };
    this.shotName = params.get('shot');
    if (this.shotName) {
      this.state = 'play';
      setupShot(this, this.shotName);
    }
    this.applySave(this.readSave(), true);
  }

  resetWorld() {
    const trafficRng = makeRng(this.seed ^ 0x7EAFF1C);
    this.cars = spawnTraffic(this.city, trafficRng, 26);
    this.peds = spawnPeds(this.city, makeRng(this.seed ^ 0x9ED5), 44);
    const hub = this.city.landmarks.garage;
    this.player = new Player(hub.x + hub.w / 2, hub.y + hub.h + 58);
    this.wanted = new Wanted();
    this.police = new Police();
    this.cash = 120;
    this.respect = 0;
    this.wrecks = 0;
    this.lastFine = 0;
  }

  // --- small queries other systems use --------------------------------------

  playerPos() { return this.player.pos; }
  playerVelocity() { return this.player.velocity; }
  playerSpeed() { return this.player.speed; }
  playerInCar() { return !!this.player.car; }
  playerAhead(d) {
    const p = this.playerPos();
    const v = this.playerVelocity();
    const s = Math.hypot(v.x, v.y) || 1;
    return { x: p.x + (v.x / s) * d, y: p.y + (v.y / s) * d };
  }
  allCars() { return [...this.cars, ...this.police.allCars()]; }
  nearestNodeIndex(x, y) { return nearestNode(this.city, x, y); }
  mouseWorld() {
    return {
      x: this.camera.x + this.input.mouse.x - this.canvas.clientWidth / 2,
      y: this.camera.y + this.input.mouse.y - this.canvas.clientHeight / 2,
    };
  }
  earn(n) { this.cash += n; }
  announce(text) { this.hud.announce(text, this); }

  anyWitness(x, y, r) {
    const r2 = r * r;
    for (const ped of this.peds) if (ped.state !== 'down' && dist2(x, y, ped.x, ped.y) < r2) return true;
    for (const cop of this.police.cruisers) if (dist2(x, y, cop.x, cop.y) < r2) return true;
    return false;
  }

  threatNear(x, y, r) {
    if (this.time - this.noise.at < 1.6 && dist2(x, y, this.noise.x, this.noise.y) < r * r) {
      return { x: this.noise.x, y: this.noise.y };
    }
    const p = this.playerPos();
    if (this.player.car && this.player.car.speed > 205 && dist2(x, y, p.x, p.y) < r * r) return p;
    return null;
  }

  lineOfSight(x1, y1, x2, y2) {
    const d = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.ceil(d / 26);
    for (let i = 1; i < steps; i++) {
      const x = x1 + ((x2 - x1) * i) / steps;
      const y = y1 + ((y2 - y1) * i) / steps;
      for (const b of this.city.buildings) {
        if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return false;
      }
    }
    return true;
  }

  // --- combat -----------------------------------------------------------------

  punch(player) {
    this.sound.punch();
    const fx = player.x + Math.cos(player.angle) * 22;
    const fy = player.y + Math.sin(player.angle) * 22;
    for (const ped of this.peds) {
      if (ped.state !== 'down' && dist2(fx, fy, ped.x, ped.y) < 26 * 26) {
        ped.knockDown(player.x, player.y);
        this.wanted.addCrime(0.55, this, ped.x, ped.y);
        if (this.rng.chance(0.5)) {
          const loot = this.rng.int(4, 22);
          this.earn(loot);
          this.announce(`Mugged +$${loot}`);
          this.sound.cash();
        }
        return;
      }
    }
    for (const car of this.allCars()) {
      if (dist2(fx, fy, car.x, car.y) < 30 * 30) {
        car.damage(9);
        this.burst(car.x, car.y, 5, '#ffd740');
        this.wanted.addCrime(0.4, this, car.x, car.y);
        return;
      }
    }
  }

  shoot(player) {
    this.sound.shot();
    const mw = this.mouseWorld();
    const ang = Math.atan2(mw.y - player.y, mw.x - player.x);
    this.noise = { x: player.x, y: player.y, at: this.time };
    this.burst(player.x + Math.cos(ang) * 16, player.y + Math.sin(ang) * 16, 3, '#ffe9a8');
    // Hitscan: nearest circle along the ray, up to 320 px.
    let best = null, bestT = 320;
    const test = (x, y, r, obj) => {
      const dx = x - player.x, dy = y - player.y;
      const t = dx * Math.cos(ang) + dy * Math.sin(ang);
      if (t < 8 || t > bestT) return;
      const perp = Math.abs(-dx * Math.sin(ang) + dy * Math.cos(ang));
      if (perp < r) { bestT = t; best = obj; }
    };
    for (const ped of this.peds) if (ped.state !== 'down') test(ped.x, ped.y, 10, { ped });
    for (const car of this.allCars()) if (!car.dead) test(car.x, car.y, 24, { car });
    if (best?.ped) {
      best.ped.knockDown(player.x, player.y);
      this.wanted.addCrime(1.1, this, best.ped.x, best.ped.y);
    } else if (best?.car) {
      best.car.damage(16);
      this.burst(best.car.x, best.car.y, 6, '#ffb74d');
      this.wanted.addCrime(0.9, this, best.car.x, best.car.y);
    } else {
      this.wanted.addCrime(0.5, this, player.x, player.y);
    }
  }

  onCopCrash(cop, impact) {
    if (this.player.car && dist2(cop.x, cop.y, this.player.car.x, this.player.car.y) < 50 * 50) {
      this.sound.crash(0.8);
    }
  }

  burst(x, y, n, color) {
    for (let i = 0; i < n; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const s = this.rng.range(30, 150);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: this.rng.range(0.2, 0.5), max: 0.5, color, size: this.rng.range(1.5, 3.2) });
    }
  }

  // --- save -------------------------------------------------------------------

  readSave() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return null; }
  }
  saveInfo() { return this.readSave(); }
  applySave(save, silent = false) {
    if (!save) return;
    this.cash = save.cash ?? this.cash;
    this.respect = save.respect ?? 0;
    this.missions.completed = save.completed ?? 0;
    this.missions.storyIndex = save.storyIndex ?? 0;
    if (save.hasGun) this.player.hasGun = true;
    if (!silent) this.announce('Run saved to this browser');
  }
  writeSave() {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: this.cash, respect: this.respect,
      completed: this.missions.completed, storyIndex: this.missions.storyIndex,
      hasGun: this.player.hasGun,
    }));
  }

  // --- flow ---------------------------------------------------------------------

  start() {
    const canvas = this.canvas;
    const resize = () => {
      canvas.width = canvas.clientWidth * devicePixelRatio;
      canvas.height = canvas.clientHeight * devicePixelRatio;
    };
    addEventListener('resize', resize);
    resize();
    let last = performance.now();
    let acc = 0;
    const frame = (now) => {
      acc += Math.min(0.1, (now - last) / 1000);
      last = now;
      while (acc > 1 / 60) { this.step(1 / 60); acc -= 1 / 60; }
      this.render();
      this.input.endFrame();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    canvas.addEventListener('pointerdown', () => {
      this.sound.unlock();
      if (this.state === 'title') this.beginPlay();
    });
    addEventListener('keydown', (e) => {
      this.sound.unlock();
      if (e.code === 'Enter') {
        if (this.state === 'title') this.beginPlay();
        else if (this.state === 'busted' || this.state === 'wasted') this.respawn();
      }
    });
  }

  beginPlay() {
    if (this.state === 'title') this.state = 'play';
  }

  respawn() {
    const at = this.state === 'busted' ? this.city.landmarks.police : this.city.landmarks.hospital;
    this.player.x = at.x + at.w / 2;
    this.player.y = at.y + at.h + 40;
    if (this.player.car) { this.player.car.occupied = false; this.player.car = null; }
    this.player.health = 100;
    this.player.dead = false;
    this.wanted.heat = 0;
    this.wanted.bust = 0;
    this.police.cruisers = [];
    this.police.roadblocks = [];
    this.state = 'play';
  }

  endRun(kind) {
    this.state = kind;
    this.lastFine = Math.round(this.cash * (kind === 'busted' ? 0.12 : 0.1));
    this.cash -= this.lastFine;
    if (kind === 'busted') this.sound.busted(); else this.sound.jobFail();
    if (this.missions.current) this.missions.fail(kind === 'busted' ? 'The CBPD got you.' : 'You woke up in hospital.');
    this.sound.setEngine(false, 0);
    this.sound.setSiren(false);
  }

  // --- simulation ---------------------------------------------------------------

  step(dt) {
    if (this.state === 'title') {
      this.time += dt;
      this.dayPhase = (DAY.startPhase + this.time / DAY.cycleSeconds * 0.04) % 1;
      this.camera.x = WORLD.width / 2 + Math.cos(this.time * 0.05) * 700;
      this.camera.y = 1250 + Math.sin(this.time * 0.037) * 480;
      for (const car of this.cars) if (!car.dead) { car.drive(dt, trafficControl(this.city, car, this.cars, dt)); car.collideWorld(this.city); }
      return;
    }
    if (this.state !== 'play') {
      if (this.state === 'pause' && this.input.pause) {
        this.input.pressed.delete('Escape'); this.input.pressed.delete('KeyP');
        this.state = 'play';
      }
      return;
    }
    this.time += dt;
    this.dayPhase = (DAY.startPhase + this.time / DAY.cycleSeconds) % 1;

    const input = this.input;
    if (input.pause) {
      input.pressed.delete('Escape'); input.pressed.delete('KeyP');
      this.state = 'pause';
      return;
    }
    if (input.save) this.writeSave();

    this.player.update(dt, this);
    this.updateDriving(dt);
    this.updateTraffic(dt);
    for (const ped of this.peds) ped.update(dt, this);
    const seen = this.police.update(dt, this);
    this.wanted.update(dt, seen);
    this.missions.update(dt);
    this.updateEffects(dt);

    this.sound.setEngine(!!this.player.car, this.player.car ? Math.abs(this.player.car.forwardSpeed) / 430 : 0);
    this.sound.setSiren(this.wanted.stars > 0 && this.police.cruisers.length > 0);

    if (this.wanted.bust >= 1) this.endRun('busted');
    else if (this.player.dead || this.player.health <= 0) this.endRun('wasted');

    const target = this.playerPos();
    const lead = this.player.car ? 0.32 : 0.12;
    const vel = this.playerVelocity();
    this.camera.x += (target.x + vel.x * lead - this.camera.x) * Math.min(1, dt * 5);
    this.camera.y += (target.y + vel.y * lead - this.camera.y) * Math.min(1, dt * 5);
  }

  updateDriving(dt) {
    const car = this.player.car;
    const input = this.input;
    if (input.interact) {
      if (car) {
        if (car.speed < 130) { this.player.exitCar(this.city); this.sound.blip(); }
        else this.announce('Too fast to bail out!');
        return;
      }
      const near = nearestCar(this, this.player.x, this.player.y, 48);
      if (near) {
        // The previous driver bails and runs.
        if (near.speed > 12) {
          const ped = new Ped(near.x, near.y, this.rng);
          ped.state = 'flee'; ped.fleeFrom = { x: this.player.x, y: this.player.y };
          this.peds.push(ped);
          near.vx *= 0.3; near.vy *= 0.3;
        }
        const wasParked = near.speed <= 12;
        this.player.enterCar(near);
        this.sound.pickup();
        if (wasParked || near.occupied === false) this.wanted.addCrime(0.85, this, near.x, near.y);
        this.announce(near.kind === 'taxi' ? 'Cab taken. Fares pay better in this.' : 'Car taken');
      }
      return;
    }
    if (!car) return;
    const control = { throttle: 0, steer: 0, brake: false };
    if (this.autoDrive) {
      // Staged scenes only: keep the car rolling. An {angle} autoDrive holds
      // a heading (a clean avenue cruise); a plain true steers at the job.
      control.throttle = 1;
      const target = typeof this.autoDrive === 'object'
        ? this.autoDrive.angle
        : (this.missions.objective
          ? Math.atan2(this.missions.objective.y - car.y, this.missions.objective.x - car.x)
          : car.angle);
      control.steer = clamp(angleDelta(car.angle, target) * 1.6, -1, 1);
    }
    if (input.up) control.throttle = 1;
    if (input.dn) {
      if (car.forwardSpeed > 26) control.brake = true;
      else control.throttle = -1;
    }
    if (input.lf) control.steer = -1;
    if (input.rt) control.steer = 1;
    if (input.down('Space')) control.brake = true;
    const before = car.speed;
    car.drive(dt, control);
    const impact = car.collideWorld(this.city);
    if (impact > 150) {
      car.damage((impact - 150) * 0.05);
      this.player.hurt((impact - 150) * 0.03);
      this.sound.crash(clamp((impact - 150) / 200, 0.3, 1.2));
      this.burst(car.x, car.y, 8, '#cfd8dc');
    }
    // Skid marks when sliding hard.
    if (car.speed > 130 && (control.brake || Math.abs(car.steerVis) > 0.7)) {
      this.skids.push({ x: car.x, y: car.y, a: car.angle, life: 5 });
      if (this.skids.length > 420) this.skids.splice(0, this.skids.length - 420);
    }
    if (before > 60 && car.speed < before - 90) this.sound.crash(0.5);
  }

  updateTraffic(dt) {
    const all = this.allCars();
    for (const car of this.cars) {
      if (car.dead || car === this.player.car) continue;
      car.drive(dt, trafficControl(this.city, car, all, dt));
      const impact = car.collideWorld(this.city);
      if (impact > 210) car.damage((impact - 210) * 0.06);
    }
    // Car-to-car bumps across the whole fleet.
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i], b = all[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > 38 * 38 || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = (38 - d) / 2;
        const nx = dx / d, ny = dy / d;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
        const rel = Math.abs(a.vx - b.vx) + Math.abs(a.vy - b.vy);
        if (rel > 130) {
          const dmg = (rel - 130) * 0.055;
          a.damage(dmg); b.damage(dmg);
          this.burst((a.x + b.x) / 2, (a.y + b.y) / 2, 7, '#ffb74d');
          if (a === this.player.car || b === this.player.car) {
            this.sound.crash(clamp(rel / 300, 0.3, 1));
            this.player.hurt((rel - 130) * 0.02);
            this.wanted.addCrime(0.35, this, this.player.x, this.player.y);
          }
        }
        const swap = 0.35;
        const avx = a.vx, avy = a.vy;
        a.vx += (b.vx - a.vx) * swap; a.vy += (b.vy - a.vy) * swap;
        b.vx += (avx - b.vx) * swap; b.vy += (avy - b.vy) * swap;
      }
    }
    // Cars versus pedestrians.
    for (const car of all) {
      if (car.speed < 55) continue;
      for (const ped of this.peds) {
        if (ped.state === 'down') continue;
        if (dist2(car.x, car.y, ped.x, ped.y) < 21 * 21) {
          ped.knockDown(car.x - car.vx * 0.1, car.y - car.vy * 0.1);
          car.vx *= 0.86; car.vy *= 0.86;
          if (car === this.player.car) {
            this.wanted.addCrime(1.25, this, ped.x, ped.y);
            this.sound.crash(0.5);
            this.announce('You hit a pedestrian!');
          }
        }
      }
    }
    // Count fresh wrecks for rampage jobs.
    for (const car of all) {
      if (car.dead && !car._counted) { car._counted = true; this.wrecks++; }
    }
  }

  updateEffects(dt) {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.9; p.vy *= 0.9;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const s of this.skids) s.life -= dt;
    this.skids = this.skids.filter((s) => s.life > 0);
  }

  // --- rendering ------------------------------------------------------------------

  render() {
    const { ctx, canvas } = this;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    const camX = clamp(this.camera.x, w / 2, WORLD.width - w / 2);
    const camY = clamp(this.camera.y, h / 2, WORLD.height - h / 2);
    const view = { x0: camX - w / 2 - 90, y0: camY - h / 2 - 90, x1: camX + w / 2 + 90, y1: camY + h / 2 + 90 };
    ctx.save();
    ctx.translate(w / 2 - camX, h / 2 - camY);
    drawCity(ctx, this.city, view, this.time);
    // Skid marks under the cars.
    ctx.fillStyle = 'rgba(24,24,28,0.5)';
    for (const s of this.skids) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.a);
      ctx.globalAlpha = clamp(s.life / 5, 0, 0.5);
      ctx.fillRect(-14, -9, 7, 4); ctx.fillRect(-14, 5, 7, 4);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    drawMarkers(ctx, this, this.time);
    for (const car of this.cars) if (car !== this.player.car) drawCar(ctx, car, this.time);
    this.police.draw(ctx, this.time);
    for (const cop of this.police.cruisers) drawCar(ctx, cop, this.time);
    if (this.player.car) drawCar(ctx, this.player.car, this.time);
    for (const ped of this.peds) ped.draw(ctx);
    this.player.draw(ctx, this.time);
    for (const p of this.particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    this.drawDayTint(w, h);
    if (this.state === 'play' || this.state === 'pause') this.hud.draw(ctx, this, w, h);
    if (this.state === 'title') this.hud.drawTitle(ctx, this, w, h);
    if (this.state === 'pause') this.hud.drawPause(ctx, this, w, h);
    if (this.state === 'busted' || this.state === 'wasted') this.hud.drawEndCard(ctx, this, w, h, this.state);
  }

  drawDayTint(w, h) {
    // Golden afternoon at the start phase, a bright noon, an orange dusk and
    // a blue night that never hides the game.
    const p = this.dayPhase;
    const keyframes = [
      [0.0, 'rgba(30, 30, 80, 0.34)'],
      [0.22, 'rgba(70, 40, 90, 0.10)'],
      [0.32, 'rgba(255, 166, 66, 0.10)'],
      [0.45, 'rgba(255, 220, 150, 0.03)'],
      [0.62, 'rgba(255, 190, 90, 0.08)'],
      [0.74, 'rgba(255, 110, 60, 0.16)'],
      [0.84, 'rgba(24, 28, 78, 0.36)'],
      [1.0, 'rgba(30, 30, 80, 0.34)'],
    ];
    let color = keyframes[0][1];
    for (let i = 0; i < keyframes.length - 1; i++) {
      if (p >= keyframes[i][0] && p <= keyframes[i + 1][0]) { color = keyframes[i + 1][1]; break; }
    }
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, w, h);
  }
}

// Boot.
const canvas = document.getElementById('game');
const game = new Game(canvas);
game.start();
window.__cbh = game; // dev handle: the screenshot/smoke tooling drives it
