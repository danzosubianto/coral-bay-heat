// hud.js — everything drawn over the world: cash and heat, the job panel,
// announcements, the minimap, objective markers, and the full-screen states
// (title, pause, busted, wasted). All text is final game copy, no lorem.

import { WORLD } from './config.js';
import { clamp } from './rng.js';
import { roadXs, roadYs } from './city.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

// World-space objective marker: a pillar of light you can see across town.
export function drawMarkers(ctx, game, time) {
  const obj = game.missions.objective;
  const hub = !obj ? game.missions.hubPoint() : null;
  const target = obj ?? (game.missions.cooldown <= 0 ? hub : null);
  if (!target) return;
  const pulse = 0.72 + Math.sin(time * 4) * 0.28;
  const grad = ctx.createLinearGradient(0, target.y - 190, 0, target.y);
  grad.addColorStop(0, 'rgba(255, 196, 0, 0)');
  grad.addColorStop(1, `rgba(255, 196, 0, ${0.5 * pulse})`);
  ctx.fillStyle = grad;
  ctx.fillRect(target.x - 13, target.y - 190, 26, 190);
  ctx.fillStyle = `rgba(255, 196, 0, ${0.85 * pulse})`;
  ctx.beginPath(); ctx.ellipse(target.x, target.y, 30, 13, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1c1a12';
  ctx.font = 'bold 15px ' + FONT;
  ctx.textAlign = 'center';
  ctx.fillText(obj ? '!' : '$', target.x, target.y + 5);
}

export class Hud {
  constructor() {
    this.notes = [];   // announcements: {text, until}
  }

  announce(text, game) {
    this.notes.push({ text, until: game.time + 3.6 });
    if (this.notes.length > 3) this.notes.shift();
  }

  draw(ctx, game, w, h) {
    const { player, wanted } = game;
    this.notes = this.notes.filter((n) => game.time < n.until);

    // Top-right stack: cash, respect, wanted stars.
    ctx.textAlign = 'right';
    ctx.font = '700 26px ' + FONT;
    ctx.fillStyle = '#0e2a16';
    ctx.fillText(`$${game.cash}`, w - 22, 40);
    ctx.fillStyle = '#7ee787';
    ctx.fillText(`$${game.cash}`, w - 24, 38);
    ctx.font = '600 13px ' + FONT;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText(`REP ${game.respect}  ·  JOBS ${game.missions.completed}`, w - 24, 60);

    // Wanted stars.
    const stars = wanted.stars;
    ctx.font = '24px ' + FONT;
    for (let i = 0; i < 5; i++) {
      const x = w - 24 - (5 - i) * 26;
      ctx.fillStyle = i < stars ? '#ffc400' : 'rgba(255,255,255,0.25)';
      const flash = wanted.bust > 0 && Math.floor(game.time * 6) % 2 === 0;
      ctx.fillText(i < stars && flash ? '✦' : '★', x, 88);
    }
    // Bust meter.
    if (wanted.bust > 0.02) {
      bar(ctx, w - 154, 98, 130, 9, wanted.bust, '#ff5252');
      ctx.font = '700 11px ' + FONT;
      ctx.fillStyle = '#ff8a80';
      ctx.textAlign = 'right';
      ctx.fillText('BUSTED…', w - 24, 96);
    }

    // Health + (when driving) hull and speed, bottom-right.
    const bx = w - 224, by = h - 58;
    label(ctx, 'HEALTH', bx, by - 6);
    bar(ctx, bx, by, 200, 10, player.health / 100, player.health > 30 ? '#69f0ae' : '#ff5252');
    if (player.car) {
      label(ctx, 'HULL', bx, by + 16);
      bar(ctx, bx, by + 20, 200, 8, player.car.health / 100, '#ffd740');
      ctx.font = '700 22px ' + FONT;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.round(Math.abs(player.car.forwardSpeed) * 0.24)} km/h`, w - 24, by + 52);
    }

    this.drawJobPanel(ctx, game, w, h);
    this.drawMinimap(ctx, game, 18, h - 218, 200);
    this.drawNotes(ctx, game, w, h);
    if (game.missions.banner) this.drawBanner(ctx, game, w, h);

    // Controls hint, fading after the first minute of play.
    if (game.time < 50 && game.state === 'play') {
      ctx.font = '500 12.5px ' + FONT;
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText('WASD drive / walk · E enter car · Space punch / shoot · Shift sprint · P pause · K save', 232, h - 24);
    }
  }

  drawJobPanel(ctx, game, w, h) {
    const m = game.missions.current;
    ctx.textAlign = 'left';
    if (!m) {
      if (game.missions.cooldown <= 0) {
        ctx.font = '600 14px ' + FONT;
        ctx.fillStyle = 'rgba(255, 214, 90, 0.95)';
        ctx.fillText('▸ New work at Marlin’s garage — follow the gold pillar', 18, 34);
      }
      return;
    }
    panel(ctx, 14, 14, 336, m.timeLeft !== null ? 86 : 70);
    ctx.fillStyle = '#ffc400';
    ctx.font = '700 15px ' + FONT;
    ctx.fillText(m.title, 28, 40);
    ctx.fillStyle = '#fff';
    ctx.font = '500 13.5px ' + FONT;
    wrapText(ctx, game.missions.progressText(), 28, 62, 310, 17);
    if (m.timeLeft !== null) {
      const t = Math.max(0, m.timeLeft);
      ctx.font = '700 15px ' + FONT;
      ctx.fillStyle = t < 15 ? '#ff5252' : '#ffd740';
      ctx.fillText(`⏱ ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`, 28, 92);
      const obj = game.missions.objective;
      if (obj) {
        const p = game.playerPos();
        const d = Math.round(Math.hypot(obj.x - p.x, obj.y - p.y));
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText(`${d} m`, 92, 92);
      }
    }
  }

  drawNotes(ctx, game, w, h) {
    ctx.textAlign = 'center';
    this.notes.forEach((n, i) => {
      const y = 118 + i * 30;
      const a = clamp((n.until - game.time) / 0.5, 0, 1);
      ctx.font = '700 17px ' + FONT;
      ctx.fillStyle = `rgba(10, 14, 10, ${0.55 * a})`;
      const tw = ctx.measureText(n.text).width + 30;
      ctx.fillRect(w / 2 - tw / 2, y - 19, tw, 27);
      ctx.fillStyle = `rgba(255, 224, 130, ${a})`;
      ctx.fillText(n.text, w / 2, y);
    });
  }

  drawBanner(ctx, game, w, h) {
    const b = game.missions.banner;
    const bw = Math.min(620, w - 80);
    panel(ctx, w / 2 - bw / 2, h - 190, bw, 108);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffc400';
    ctx.font = '800 21px ' + FONT;
    ctx.fillText(b.title, w / 2, h - 152);
    ctx.fillStyle = '#fff';
    ctx.font = 'italic 500 14.5px ' + FONT;
    b.lines.forEach((line, i) => ctx.fillText(line, w / 2, h - 124 + i * 21));
  }

  drawMinimap(ctx, game, x, y, size) {
    const s = size / WORLD.width;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, size, size * (WORLD.height / WORLD.width));
    ctx.clip();
    ctx.fillStyle = '#2e6b34';
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = '#1d7f96';
    ctx.fillRect(x, y + 2330 * s, size, size); // the bay
    ctx.strokeStyle = 'rgba(230,230,220,0.75)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (const rx of roadXs) { ctx.moveTo(x + rx * s, y); ctx.lineTo(x + rx * s, y + WORLD.height * s); }
    for (const ry of roadYs) { ctx.moveTo(x, y + ry * s); ctx.lineTo(x + size, y + ry * s); }
    ctx.stroke();
    // Objective.
    const obj = game.missions.objective ?? (game.missions.cooldown <= 0 ? game.missions.hubPoint() : null);
    if (obj) {
      const pulse = 3.4 + Math.sin(game.time * 5) * 1.2;
      ctx.fillStyle = '#ffc400';
      ctx.beginPath(); ctx.arc(x + obj.x * s, y + obj.y * s, pulse, 0, Math.PI * 2); ctx.fill();
    }
    // Police blips.
    for (const cop of game.police.allCars()) {
      ctx.fillStyle = Math.floor(game.time * 3) % 2 ? '#ff5252' : '#448aff';
      ctx.fillRect(x + cop.x * s - 2, y + cop.y * s - 2, 4, 4);
    }
    // Player arrow.
    const p = game.playerPos();
    const a = game.player.car ? game.player.car.angle : game.player.angle;
    ctx.translate(x + p.x * s, y + p.y * s);
    ctx.rotate(a);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(6, 0); ctx.lineTo(-4.4, -3.6); ctx.lineTo(-4.4, 3.6); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, size, size * (WORLD.height / WORLD.width));
  }

  // --- full-screen states ---------------------------------------------------

  drawTitle(ctx, game, w, h) {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(16, 24, 44, 0.10)');
    grad.addColorStop(0.62, 'rgba(16, 24, 44, 0.34)');
    grad.addColorStop(1, 'rgba(10, 12, 22, 0.80)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd9a0';
    ctx.font = '800 21px ' + FONT;
    ctx.fillText('M A R I   S O L A N O   R E T U R N S   T O', w / 2, h * 0.30);
    ctx.fillStyle = '#ff5964';
    ctx.font = '900 84px ' + FONT;
    ctx.fillText('CORAL BAY', w / 2, h * 0.30 + 82);
    ctx.fillStyle = '#ffd740';
    ctx.fillText('HEAT', w / 2, h * 0.30 + 158);
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.font = '500 16.5px ' + FONT;
    ctx.fillText('An open-world crime sandbox. Steal cars, run Marlin’s jobs, work the fares,', w / 2, h * 0.30 + 200);
    ctx.fillText('wreck the rivals — and whatever you do, don’t get busted.', w / 2, h * 0.30 + 224);
    ctx.font = '600 15px ' + FONT;
    ctx.fillStyle = '#7ee787';
    const save = game.saveInfo();
    ctx.fillText(save ? `Continue — $${save.cash} · REP ${save.respect} · ${save.completed} jobs done (Enter)` : 'Press ENTER or click to start', w / 2, h * 0.30 + 268);
    ctx.fillStyle = 'rgba(255,255,255,0.66)';
    ctx.font = '500 13px ' + FONT;
    ctx.fillText('WASD move · E get in / out of cars · Space punch & shoot · Shift sprint · mouse aims the pistol · P pause · K save', w / 2, h - 42);
  }

  drawPause(ctx, game, w, h) {
    ctx.fillStyle = 'rgba(8, 10, 18, 0.62)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = '800 44px ' + FONT;
    ctx.fillText('PAUSED', w / 2, h / 2 - 30);
    ctx.font = '500 16px ' + FONT;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(`Cash $${game.cash} · REP ${game.respect} · Jobs done ${game.missions.completed} · Wrecks ${game.wrecks}`, w / 2, h / 2 + 8);
    ctx.fillText('P or Esc to resume · K saves your run to this browser', w / 2, h / 2 + 38);
  }

  drawEndCard(ctx, game, w, h, kind) {
    ctx.fillStyle = kind === 'busted' ? 'rgba(18, 24, 66, 0.55)' : 'rgba(66, 12, 12, 0.55)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = kind === 'busted' ? '#82b1ff' : '#ff8a80';
    ctx.font = '900 76px ' + FONT;
    ctx.fillText(kind === 'busted' ? 'BUSTED' : 'WASTED', w / 2, h / 2 - 12);
    ctx.fillStyle = '#fff';
    ctx.font = '500 17px ' + FONT;
    ctx.fillText(kind === 'busted'
      ? `Precinct 9 keeps $${game.lastFine} of your cash. You walk out at dawn.`
      : `Coral Bay General patches you up for $${game.lastFine}. Try to stay out of the ICU.`, w / 2, h / 2 + 30);
    ctx.font = '600 15px ' + FONT;
    ctx.fillStyle = '#7ee787';
    ctx.fillText('Press ENTER to get back to work', w / 2, h / 2 + 66);
  }
}

// --- small helpers ------------------------------------------------------------

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(10, 14, 20, 0.62)';
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function bar(ctx, x, y, w, h, frac, color) {
  ctx.fillStyle = 'rgba(10,14,20,0.6)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * clamp(frac, 0, 1), h);
}

function label(ctx, text, x, y) {
  ctx.font = '700 10px ' + FONT;
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.textAlign = 'left';
  ctx.fillText(text, x, y);
}

function wrapText(ctx, text, x, y, maxW, lh) {
  const words = text.split(' ');
  let line = '', yy = y;
  for (const word of words) {
    const trial = line ? line + ' ' + word : word;
    if (ctx.measureText(trial).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = word; yy += lh;
    } else line = trial;
  }
  if (line) ctx.fillText(line, x, yy);
}
