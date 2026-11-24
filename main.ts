// Solmara Bay, an original open-world crime game for make.fun's gta6-01 bounty (Node 22,
// standard library only). The game is this directory's game/ folder: plain static files a desktop
// browser loads offline (game/index.html, its ES modules under game/src/ and three.js vendored as
// game/vendor/three.module.min.js), with no build step and no network request. This program hands
// it in: it copies game/ and the four screenshots named in shots.json from beside this file to
// /output and writes /output/dossier.json, the summary the judge reads, with the vendored make.fun
// library. The screenshots are real renders of the game's own ?shot= scenes, taken by
// tools/capture.mjs; a missing one is reported rather than silently skipped. The second one is now
// The Undertow nightclub's dance floor (?shot=club), and the map shows the gang turf of each district.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });

// copy the screenshots in the order shots.json lists them (cover first), and say which are missing
const shots: { name: string }[] = JSON.parse(readFileSync(join(here, 'shots.json'), 'utf8'));
for (const { name } of shots) {
  const src = join(here, 'screenshots', name);
  if (existsSync(src)) cpSync(src, join(out, 'screenshots', name));
  else console.warn(`screenshot missing: screenshots/${name} (run node tools/capture.mjs with the server up)`);
}

/** Files and bytes under a folder, for the hand-in summary. */
function tally(dir: string): { files: number; bytes: number } {
  let files = 0;
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      const t = tally(p);
      files += t.files;
      bytes += t.bytes;
    } else {
      files += 1;
      bytes += statSync(p).size;
    }
  }
  return { files, bytes };
}

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
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

const game = tally(join(out, 'game'));
const pics = tally(join(out, 'screenshots'));
console.log(`Solmara Bay handed in to ${out}: game/ ${game.files} files (${(game.bytes / 1048576).toFixed(2)} MiB), ${pics.files} screenshots, dossier.json written.`);
