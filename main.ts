// Coral Bay Heat — entrypoint for the make.fun "Make GTA 6" bounty (program/v1).
//
// The game itself is plain static files under game/ (game/index.html plus its ES
// modules, no build step, no network). This program hands the entry in: it
// validates the payload, copies game/ and screenshots/ into the output
// directory, and writes dossier.json there with the vendored make.fun library,
// exactly as the gate expects.
//
// Local check:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Play it:      node serve.ts   then open http://localhost:8080

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const SCREENSHOT_MAX_BYTES = 262144; // 256 KiB, the gate's per-image cap
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

// --- pre-flight: fail here, loudly, instead of at the gate --------------------

function fail(message) {
  console.error(`coral-bay-heat: ${message}`);
  process.exit(1);
}

if (!existsSync(join(here, 'game', 'index.html'))) {
  fail('game/index.html is missing — the entry has no game to hand in');
}

const shotsDir = join(here, 'screenshots');
const shots = existsSync(shotsDir)
  ? readdirSync(shotsDir).filter((name) => IMAGE_EXT.test(name)).sort()
  : [];
if (shots.length < 3 || shots.length > 4) {
  fail(`screenshots/ must hold 3–4 images, found ${shots.length}`);
}
for (const name of shots) {
  const size = statSync(join(shotsDir, name)).size;
  if (size > SCREENSHOT_MAX_BYTES) {
    fail(`screenshots/${name} is ${size} bytes — over the 256 KiB cap`);
  }
}

// --- copy the payload -----------------------------------------------------------

// Keep stray desktop files out of the entry; everything else ships as-is.
const skipStray = (src) => !/(^|\/)\.(DS_Store|gitkeep)$/.test(src);

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true, filter: skipStray });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(shotsDir, join(out, 'screenshots'), { recursive: true, filter: skipStray });

// --- dossier ----------------------------------------------------------------------

// The gate's own caps: the dossier text is capped, screenshots are at most 4 files
// of 256 KiB, and game/ stays within its file-count and byte budgets.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

// A one-line receipt so a local run shows what was handed in.
function tally(dir) {
  let files = 0, bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = tally(path);
      files += sub.files; bytes += sub.bytes;
    } else {
      files++; bytes += statSync(path).size;
    }
  }
  return { files, bytes };
}
const game = tally(join(out, 'game'));
console.log(
  `coral-bay-heat: handed in game/ (${game.files} files, ${game.bytes} bytes) ` +
  `+ ${shots.length} screenshots; dossier.json written to ${out}`,
);
