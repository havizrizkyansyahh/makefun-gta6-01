// Takes the entry's screenshots: starts headless Chrome, opens each scene listed in shots.json
// (game/index.html?shot=<scene>) from the local server, waits until the game sets
// window.__shotReady, and saves a 1280x720 JPEG of the page into screenshots/.
// Usage: node serve.ts &  then  node tools/capture.mjs [--only <name>]
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const shots = JSON.parse(readFileSync(join(root, 'shots.json'), 'utf8'));
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const BASE = process.env.GAME_URL || 'http://localhost:8080/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--window-size=1280,720', '--hide-scrollbars',
  '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${join(tmpdir(), 'solmara-capture-profile')}`, 'about:blank',
], { stdio: 'ignore' });

async function target() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' });
      return await res.json();
    } catch { await sleep(200); }
  }
  throw new Error('Chrome did not start');
}

function connect(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); }
  };
  const send = (method, params = {}) => new Promise((resolve) => {
    id += 1;
    waiting.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
  return new Promise((resolve) => { ws.onopen = () => resolve({ send, close: () => ws.close() }); });
}

try {
  const t = await target();
  const cdp = await connect(t.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  mkdirSync(join(root, 'screenshots'), { recursive: true });
  for (const shot of shots) {
    if (only && !shot.name.includes(only)) continue;
    await cdp.send('Page.navigate', { url: `${BASE}${shot.query}` });
    let ready = false;
    for (let i = 0; i < 240 && !ready; i += 1) {
      await sleep(500);
      const r = await cdp.send('Runtime.evaluate', { expression: 'window.__shotReady === true' });
      ready = r.result && r.result.result && r.result.result.value === true;
    }
    if (!ready) { console.log(`${shot.name}: scene never became ready`); continue; }
    await sleep(1200); // let the HUD's fades settle
    let quality = 86;
    let bytes;
    do {
      const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality });
      bytes = Buffer.from(r.result.data, 'base64');
      quality -= 6;
    } while (bytes.length > 250 * 1024 && quality > 40);
    writeFileSync(join(root, 'screenshots', shot.name), bytes);
    console.log(`${shot.name}: ${(bytes.length / 1024).toFixed(0)} KiB at quality ${quality + 6}`);
  }
  cdp.close();
} finally {
  chrome.kill();
}
