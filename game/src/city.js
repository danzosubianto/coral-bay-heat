// city.js — Coral Bay itself: a sun-bleached grid of avenues above a beach.
// Generates the road network, parcels (named buildings, parks, parking lots,
// landmarks), props and collision data, and draws the static world.

import { WORLD, PALETTE } from './config.js';
import { clamp } from './rng.js';

const P = WORLD.block;        // 280 pitch
const RH = WORLD.road / 2;    // road half width

export const roadXs = [];     // vertical avenue centre lines
export const roadYs = [];     // horizontal street centre lines
for (let x = P / 2; x < WORLD.width; x += P) roadXs.push(x);
for (let y = P / 2; y < WORLD.height; y += P) roadYs.push(y);

const BUILDING_NAMES = [
  'Hotel Brisa', 'Banco Coral', 'Café Ola', 'Torre Palma', 'Marina Suites',
  'Radio Sol FM', 'Farmacia Luz', 'Hotel Delfín', 'Oficinas Brisa', 'Cine Coral',
  'Gimnasio Ola', 'Hotel Caracola', 'Banco del Muelle', 'Torre Miramar', 'Café Brisa',
  'Edificio Perla', 'Hotel Sirena', 'Clínica Palma', 'Mercado Sol', 'Torre Faro',
];

export function buildCity(rng) {
  const buildings = [];
  const props = [];        // palms, lamps, benches: {x, y, kind}
  const parkSpots = [];    // where parked cars sit: {x, y, angle}
  const landmarks = {};
  const namePool = [...BUILDING_NAMES];

  const parcelW = P - WORLD.road;
  for (let i = 0; i < roadXs.length - 1; i++) {
    for (let j = 0; j < roadYs.length - 1; j++) {
      const x = roadXs[i] + RH;
      const y = roadYs[j] + RH;
      const key = `${i},${j}`;

      // Fixed landmarks give the city its story addresses.
      if (key === '5,7') { landmarks.garage = makeLandmark(x, y, parcelW, 'MARLIN’S GARAGE', '#546e7a'); buildings.push(landmarks.garage); continue; }
      if (key === '2,1') { landmarks.police = makeLandmark(x, y, parcelW, 'CBPD — PRECINCT 9', '#37507a'); buildings.push(landmarks.police); continue; }
      if (key === '8,1') { landmarks.hospital = makeLandmark(x, y, parcelW, 'CORAL BAY GENERAL', '#e8e4da'); buildings.push(landmarks.hospital); continue; }
      if (key === '7,5') { landmarks.diner = makeLandmark(x, y, parcelW, 'DINER LA OLA', '#c94f6d'); buildings.push(landmarks.diner); continue; }

      const roll = rng.next();
      if (j === 7 || roll < 0.10) {
        // Beach-side and scattered parks: sand/grass, palms, no building.
        for (let k = 0; k < 5; k++) {
          props.push({ x: x + rng.range(18, parcelW - 18), y: y + rng.range(18, parcelW - 18), kind: 'palm' });
        }
        continue;
      }
      if (roll < 0.22) {
        // Parking lot: striped bays along both long edges.
        for (let s = 0; s < 4; s++) {
          parkSpots.push({ x: x + 30 + s * 44, y: y + 26, angle: Math.PI / 2 });
          parkSpots.push({ x: x + 30 + s * 44, y: y + parcelW - 26, angle: -Math.PI / 2 });
        }
        props.push({ x: x + parcelW - 16, y: y + 16, kind: 'lamp' });
        continue;
      }
      // One or two buildings per parcel.
      const split = rng.chance(0.35);
      const mk = (bx, by, bw, bh) => {
        const name = namePool.length && rng.chance(0.55) ? namePool.splice(rng.int(0, namePool.length - 1), 1)[0] : null;
        buildings.push({
          x: bx, y: by, w: bw, h: bh,
          height: rng.int(14, 64),
          color: rng.pick([PALETTE.roofA, PALETTE.roofB, PALETTE.roofC, PALETTE.roofD, PALETTE.roofE]),
          name,
          seed: rng.int(1, 1e9),
        });
      };
      if (split) {
        const w2 = (parcelW - 36) / 2;
        mk(x + 12, y + 12, w2, parcelW - 24);
        mk(x + 24 + w2, y + 12, w2, parcelW - 24);
      } else {
        mk(x + 14, y + 14, parcelW - 28, parcelW - 28);
      }
      if (rng.chance(0.6)) props.push({ x: x + 8, y: y + 8, kind: 'lamp' });
    }
  }

  // Palms along the beach band and the promenade corners.
  for (let x = 60; x < WORLD.width - 40; x += 130) {
    props.push({ x: x + rng.range(-16, 16), y: 2408 + rng.range(-8, 8), kind: 'palm' });
  }

  // Road graph: one node per intersection, edges to orthogonal neighbours.
  const nodes = [];
  const nodeAt = new Map();
  roadYs.forEach((y, j) => roadXs.forEach((x, i) => {
    nodeAt.set(`${i},${j}`, nodes.length);
    nodes.push({ x, y, i, j, next: [] });
  }));
  nodes.forEach((n) => {
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([di, dj]) => {
      const k = nodeAt.get(`${n.i + di},${n.j + dj}`);
      if (k !== undefined) n.next.push(k);
    });
  });

  return { buildings, props, parkSpots, landmarks, nodes };
}

function makeLandmark(x, y, size, name, color) {
  return { x: x + 10, y: y + 10, w: size - 20, h: size - 20, height: 22, color, name, seed: 7, landmark: true };
}

// --- queries ---------------------------------------------------------------

export function isOnRoad(x, y) {
  const nearV = roadXs.some((rx) => Math.abs(x - rx) <= RH);
  const nearH = roadYs.some((ry) => Math.abs(y - ry) <= RH);
  return nearV || nearH;
}

export function nearestNode(city, x, y) {
  let best = 0, bd = Infinity;
  city.nodes.forEach((n, idx) => {
    const d = (n.x - x) ** 2 + (n.y - y) ** 2;
    if (d < bd) { bd = d; best = idx; }
  });
  return best;
}

// Push a circle out of every building and back inside the world. Mutates pos.
export function collideCircle(city, pos, r) {
  pos.x = clamp(pos.x, r, WORLD.width - r);
  pos.y = clamp(pos.y, r, WORLD.height - r);
  for (const b of city.buildings) {
    const nx = clamp(pos.x, b.x, b.x + b.w);
    const ny = clamp(pos.y, b.y, b.y + b.h);
    const dx = pos.x - nx, dy = pos.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * r;
        pos.y = ny + (dy / d) * r;
      } else {
        // Centre inside the rect: leave by the shallowest side.
        const left = pos.x - b.x, right = b.x + b.w - pos.x;
        const top = pos.y - b.y, bot = b.y + b.h - pos.y;
        const m = Math.min(left, right, top, bot);
        if (m === left) pos.x = b.x - r;
        else if (m === right) pos.x = b.x + b.w + r;
        else if (m === top) pos.y = b.y - r;
        else pos.y = b.y + b.h + r;
      }
    }
  }
}

// --- drawing ---------------------------------------------------------------

export function drawCity(ctx, city, view, time) {
  const { x0, y0, x1, y1 } = view;
  // Ground: grass, then the beach band and water at the south edge.
  ctx.fillStyle = PALETTE.grass;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(x0, Math.max(y0, 2330), x1 - x0, Math.max(0, y1 - Math.max(y0, 2330)));
  const wy = 2452;
  if (y1 > wy) {
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(x0, Math.max(y0, wy), x1 - x0, y1 - Math.max(y0, wy));
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = Math.floor(x0 / 46) * 46; x < x1; x += 46) {
      const yy = wy + 14 + Math.sin(time * 1.4 + x * 0.05) * 4;
      ctx.moveTo(x, yy); ctx.lineTo(x + 24, yy);
    }
    ctx.stroke();
  }

  // Parcels: sidewalk slabs.
  ctx.fillStyle = PALETTE.sidewalk;
  for (let i = 0; i < roadXs.length - 1; i++) {
    for (let j = 0; j < roadYs.length - 1; j++) {
      const x = roadXs[i] + RH, y = roadYs[j] + RH;
      if (x > x1 || y > y1 || x + P - WORLD.road < x0 || y + P - WORLD.road < y0) continue;
      ctx.fillRect(x, y, P - WORLD.road, P - WORLD.road);
    }
  }

  drawRoads(ctx, view);
  drawProps(ctx, city, view, false);
  drawBuildings(ctx, city, view);
  drawProps(ctx, city, view, true);
}

function drawRoads(ctx, view) {
  const { x0, y0, x1, y1 } = view;
  ctx.fillStyle = PALETTE.asphalt;
  for (const x of roadXs) ctx.fillRect(x - RH, Math.max(y0, 0), WORLD.road, Math.min(y1, WORLD.height));
  for (const y of roadYs) ctx.fillRect(Math.max(x0, 0), y - RH, Math.min(x1, WORLD.width), WORLD.road);
  // Centre dashes.
  ctx.fillStyle = PALETTE.laneMark;
  for (const x of roadXs) {
    for (let y = Math.floor(y0 / 56) * 56; y < y1; y += 56) {
      if (roadYs.some((ry) => Math.abs(y - ry) < RH + 8)) continue;
      ctx.fillRect(x - 2, y, 4, 30);
    }
  }
  for (const y of roadYs) {
    for (let x = Math.floor(x0 / 56) * 56; x < x1; x += 56) {
      if (roadXs.some((rx) => Math.abs(x - rx) < RH + 8)) continue;
      ctx.fillRect(x, y - 2, 30, 4);
    }
  }
  // Crosswalks at intersections.
  ctx.fillStyle = PALETTE.crosswalk;
  for (const x of roadXs) for (const y of roadYs) {
    if (x < x0 - 60 || y < y0 - 60 || x > x1 + 60 || y > y1 + 60) continue;
    for (let s = -30; s <= 30; s += 15) {
      ctx.fillRect(x - RH - 7, y + s - 4, 6, 8);
      ctx.fillRect(x + RH + 1, y + s - 4, 6, 8);
      ctx.fillRect(x + s - 4, y - RH - 7, 8, 6);
      ctx.fillRect(x + s - 4, y + RH + 1, 8, 6);
    }
  }
}

function drawBuildings(ctx, city, view) {
  const { x0, y0, x1, y1 } = view;
  for (const b of city.buildings) {
    if (b.x + b.w < x0 || b.y + b.h < y0 || b.x > x1 || b.y > y1) continue;
    const lift = b.height * 0.42;
    // Shadow, then the sunlit south/east faces, then the roof.
    ctx.fillStyle = 'rgba(30, 40, 20, 0.25)';
    ctx.fillRect(b.x + 7, b.y + 9, b.w, b.h);
    ctx.fillStyle = PALETTE.wallShade;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y + b.h);
    ctx.lineTo(b.x - lift * 0.4, b.y + b.h - lift);
    ctx.lineTo(b.x + b.w - lift * 0.4, b.y + b.h - lift);
    ctx.lineTo(b.x + b.w, b.y + b.h);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x - lift * 0.4, b.y - lift, b.w, b.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x - lift * 0.4, b.y - lift, b.w, b.h);
    // Rooftop clutter: AC boxes and a water tank on the taller roofs.
    const rx = b.x - lift * 0.4, ry = b.y - lift;
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(rx + b.w * 0.14, ry + b.h * 0.16, b.w * 0.2, b.h * 0.16);
    if (b.height > 34) ctx.fillRect(rx + b.w * 0.62, ry + b.h * 0.55, b.w * 0.22, b.h * 0.2);
    if (b.name) {
      ctx.fillStyle = 'rgba(20, 24, 30, 0.72)';
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.name, rx + b.w / 2, ry + b.h / 2 + 4);
    }
  }
}

function drawProps(ctx, city, view, tops) {
  const { x0, y0, x1, y1 } = view;
  for (const p of city.props) {
    if (p.x < x0 - 30 || p.y < y0 - 30 || p.x > x1 + 30 || p.y > y1 + 30) continue;
    if (p.kind === 'palm') {
      if (!tops) {
        ctx.fillStyle = 'rgba(30,40,20,0.25)';
        ctx.beginPath(); ctx.ellipse(p.x + 6, p.y + 7, 13, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = PALETTE.palmTrunk;
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(p.x + 3, p.y - 7, p.x + 6, p.y - 12); ctx.stroke();
      } else {
        ctx.strokeStyle = PALETTE.palmLeaf;
        ctx.lineWidth = 3;
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + 0.5;
          ctx.beginPath();
          ctx.moveTo(p.x + 6, p.y - 12);
          ctx.quadraticCurveTo(p.x + 6 + Math.cos(a) * 10, p.y - 12 + Math.sin(a) * 6 - 4, p.x + 6 + Math.cos(a) * 17, p.y - 12 + Math.sin(a) * 10 + 3);
          ctx.stroke();
        }
      }
    } else if (p.kind === 'lamp' && !tops) {
      ctx.fillStyle = '#5d6068';
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
  }
}
