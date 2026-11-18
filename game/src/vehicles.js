// vehicles.js — every car in Coral Bay: arcade physics (throttle, brake,
// handbrake slides, grip), damage, and the traffic driver that follows the
// road graph from intersection to intersection on the right-hand lane.

import { CAR, PALETTE, WORLD } from './config.js';
import { angleDelta, clamp } from './rng.js';
import { collideCircle, nearestNode } from './city.js';

let nextId = 1;

export class Car {
  constructor(x, y, angle, color, kind = 'civilian') {
    this.id = nextId++;
    this.x = x; this.y = y;
    this.angle = angle;
    this.vx = 0; this.vy = 0;
    this.color = color;
    this.kind = kind;              // civilian | taxi | cop
    this.health = CAR.health;
    this.steerVis = 0;
    this.targetNode = -1;
    this.think = Math.random() * 0.4;
    this.occupied = false;         // a ped or the player is "driving" it socially
    this.dead = false;
    this.honkAt = 0;
  }

  get speed() { return Math.hypot(this.vx, this.vy); }
  get forwardSpeed() { return this.vx * Math.cos(this.angle) + this.vy * Math.sin(this.angle); }

  // control: {throttle -1..1, steer -1..1, brake bool}
  drive(dt, control) {
    const fwdX = Math.cos(this.angle), fwdY = Math.sin(this.angle);
    let fSpeed = this.vx * fwdX + this.vy * fwdY;
    const latX = this.vx - fwdX * fSpeed, latY = this.vy - fwdY * fSpeed;

    if (control.brake) {
      fSpeed -= Math.sign(fSpeed) * CAR.brake * dt;
      if (Math.abs(fSpeed) < 12) fSpeed = 0;
    } else if (control.throttle > 0) {
      fSpeed += CAR.accel * control.throttle * dt * (1 - Math.max(0, fSpeed) / 560);
    } else if (control.throttle < 0) {
      fSpeed += CAR.accel * 0.55 * control.throttle * dt * (1 + Math.min(0, fSpeed) / -240);
      fSpeed = Math.max(fSpeed, -CAR.reverse * 1.6);
    } else {
      fSpeed -= fSpeed * 0.7 * dt; // engine drag
    }
    fSpeed = clamp(fSpeed, -190, 430);

    // Steering bites harder the faster you go, up to a point.
    const steerAuthority = clamp(Math.abs(fSpeed) / 90, 0, 1) * Math.sign(fSpeed || 1);
    this.angle += control.steer * CAR.turnRate * steerAuthority * dt * (control.brake ? 1.25 : 1);
    this.steerVis = control.steer;

    const grip = Math.exp(-CAR.grip * dt * (control.brake ? 0.45 : 1));
    const nfx = Math.cos(this.angle), nfy = Math.sin(this.angle);
    this.vx = nfx * fSpeed + latX * grip;
    this.vy = nfy * fSpeed + latY * grip;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  collideWorld(city) {
    const p = { x: this.x, y: this.y };
    collideCircle(city, p, 17);
    if (p.x !== this.x || p.y !== this.y) {
      const impact = this.speed;
      this.x = p.x; this.y = p.y;
      this.vx *= -0.18; this.vy *= -0.18;
      return impact;
    }
    return 0;
  }

  damage(amount) {
    this.health -= amount;
    if (this.health <= 0 && !this.dead) { this.dead = true; this.health = 0; }
  }
}

// --- traffic ---------------------------------------------------------------

export function spawnTraffic(city, rng, count) {
  const cars = [];
  const spots = [...city.parkSpots];
  // A third of the fleet starts parked; the rest are already rolling.
  for (let i = 0; i < count; i++) {
    if (i % 3 === 0 && spots.length) {
      const s = spots.splice(rng.int(0, spots.length - 1), 1)[0];
      const kind = rng.chance(0.14) ? 'taxi' : 'civilian';
      cars.push(new Car(s.x, s.y, s.angle, kind === 'taxi' ? PALETTE.taxiBody : rng.pick(PALETTE.carColors), kind));
      continue;
    }
    const n = city.nodes[rng.int(0, city.nodes.length - 1)];
    const kind = rng.chance(0.14) ? 'taxi' : 'civilian';
    const car = new Car(n.x + rng.range(-8, 8), n.y + rng.range(-8, 8), rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]),
      kind === 'taxi' ? PALETTE.taxiBody : rng.pick(PALETTE.carColors), kind);
    car.targetNode = nearestNode(city, car.x, car.y);
    cars.push(car);
  }
  return cars;
}

// One traffic brain tick: aim at the next intersection, on the right lane,
// slowing for whatever is in front. Returns a control for Car.drive.
export function trafficControl(city, car, others, dt) {
  car.think -= dt;
  const node = city.nodes[car.targetNode];
  if (!node) { car.targetNode = nearestNode(city, car.x, car.y); return { throttle: 0.4, steer: 0, brake: false }; }
  const dx = node.x - car.x, dy = node.y - car.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 42) {
    // Pick the next leg: mostly straight on, never straight back if avoidable.
    const options = node.next.filter((k) => {
      const n2 = city.nodes[k];
      const back = Math.atan2(car.y - n2.y, car.x - n2.x);
      return Math.abs(angleDelta(car.angle, back)) > 0.6 || node.next.length === 1;
    });
    const pool = options.length ? options : node.next;
    car.targetNode = pool[Math.floor(Math.random() * pool.length)];
    return { throttle: 0.55, steer: 0, brake: false };
  }
  // Aim at the lane point: the node shifted right of the direction of travel.
  const dirx = dx / dist, diry = dy / dist;
  const aimX = node.x + diry * WORLD.lane * 0.9;
  const aimY = node.y - dirx * WORLD.lane * 0.9;
  const bearing = Math.atan2(aimY - car.y, aimX - car.x);
  const steer = clamp(angleDelta(car.angle, bearing) * 1.9, -1, 1);

  // Something ahead? Match its pace or stop.
  let throttle = 0.75, brake = false;
  const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
  for (const o of others) {
    if (o === car || o.dead) continue;
    const ox = o.x - car.x, oy = o.y - car.y;
    const ahead = ox * fx + oy * fy;
    const side = Math.abs(ox * -fy + oy * fx);
    if (ahead > 0 && ahead < 58 && side < 17) {
      if (ahead < 30) { throttle = 0; brake = car.forwardSpeed > 20; }
      else throttle = Math.min(throttle, 0.25);
      if (car.forwardSpeed > o.forwardSpeed + 26) brake = true;
    }
  }
  if (Math.abs(angleDelta(car.angle, bearing)) > 1.15) throttle = Math.min(throttle, 0.3);
  return { throttle, steer, brake };
}

// --- drawing ---------------------------------------------------------------

export function drawCar(ctx, car, time) {
  ctx.save();
  ctx.translate(car.x, car.y);
  // Ground shadow.
  ctx.fillStyle = 'rgba(20,26,18,0.30)';
  ctx.beginPath(); ctx.ellipse(3, 5, CAR.length * 0.55, CAR.width * 0.62, car.angle, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(car.angle);
  const L = CAR.length, W = CAR.width;
  // Tyres.
  ctx.fillStyle = '#15161a';
  const wy = W / 2 - 1, wx = L / 2 - 10;
  ctx.fillRect(-wx - 4, -wy - 2, 9, 4); ctx.fillRect(wx - 5, -wy - 2, 9, 4);
  ctx.fillRect(-wx - 4, wy - 2, 9, 4); ctx.fillRect(wx - 5, wy - 2, 9, 4);
  // Body.
  ctx.fillStyle = car.dead ? '#3a3a3f' : car.color;
  roundRect(ctx, -L / 2, -W / 2, L, W, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.20)';
  roundRect(ctx, -L / 2 + 2, -W / 2 + 2, L - 4, 4, 3); ctx.fill();
  // Cabin: windshield, roof, rear window.
  ctx.fillStyle = '#20303e';
  roundRect(ctx, -2, -W / 2 + 3.5, 9, W - 7, 2.5); ctx.fill();
  ctx.fillStyle = car.dead ? '#2c2c30' : shade(car.color, -18);
  roundRect(ctx, -13, -W / 2 + 3, 11, W - 6, 3); ctx.fill();
  ctx.fillStyle = '#1b2833';
  roundRect(ctx, -17.5, -W / 2 + 4, 4.5, W - 8, 2); ctx.fill();
  // Headlights.
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(L / 2 - 2.5, -W / 2 + 2.5, 2.5, 4);
  ctx.fillRect(L / 2 - 2.5, W / 2 - 6.5, 2.5, 4);
  if (car.kind === 'taxi') {
    ctx.fillStyle = '#111';
    ctx.fillRect(-8, -3, 9, 6);
    ctx.fillStyle = '#f7b731';
    ctx.font = 'bold 5px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('TAXI', -3.5, 2);
  }
  if (car.kind === 'cop') {
    ctx.fillStyle = PALETTE.copTrim;
    ctx.fillRect(-L / 2 + 6, -W / 2, 12, W);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 6px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('CBPD', 0, 2.2);
    const flash = Math.floor(time * 4) % 2 === 0;
    ctx.fillStyle = flash ? '#ff4040' : '#4060ff';
    ctx.beginPath(); ctx.arc(-7, 0, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = flash ? '#4060ff' : '#ff4040';
    ctx.beginPath(); ctx.arc(-11, 0, 3.2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  // Damage smoke.
  if (!car.dead && car.health < 42) {
    const puffs = 2 + Math.floor((42 - car.health) / 14);
    for (let i = 0; i < puffs; i++) {
      const ph = (time * 1.6 + i * 0.37 + car.id) % 1;
      ctx.fillStyle = `rgba(40,40,44,${0.30 * (1 - ph)})`;
      ctx.beginPath();
      ctx.arc(car.x + Math.cos(car.angle) * 16, car.y + Math.sin(car.angle) * 16 - ph * 16, 3 + ph * 8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (car.dead) {
    ctx.fillStyle = 'rgba(25,25,28,0.35)';
    ctx.beginPath(); ctx.arc(car.x, car.y, 20, 0, Math.PI * 2); ctx.fill();
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, v + amt));
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return `rgb(${r},${g},${b})`;
}
