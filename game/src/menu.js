// Menus: the title screen over a slow flight across the bay (Continue with the save's summary,
// New Game, Controls, Settings, Credits), the pause menu (Resume, Map, Save, Stats, Controls,
// Settings, Quit), the settings that are kept between sessions, and keyboard navigation.
import { SETTINGS_KEY } from './config.js';
import { MISSIONS } from './story.js';

export const DEFAULT_SETTINGS = { sensitivity: 1, invertY: false, master: 0.8, music: 0.55, density: 1, difficulty: 1 };

export function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* storage blocked */ }
}

const CONTROLS = [
  ['W A S D', 'Walk / drive'],
  ['Mouse', 'Look and steer the camera'],
  ['Shift', 'Sprint'],
  ['Space', 'Jump / handbrake'],
  ['F', 'Enter, steal or leave a vehicle'],
  ['Left mouse', 'Shoot / punch'],
  ['Right mouse', 'Aim down the sights'],
  ['Q / wheel / 1-4', 'Switch weapon'],
  ['R', 'Reload / next radio station'],
  ['E', 'Interact (save, shops, jobs)'],
  ['H', 'Horn'],
  ['M', 'City map'],
  ['Backspace', 'Skip a line of dialogue'],
  ['Esc', 'Pause'],
];

export class Menu {
  constructor(root, audio) {
    this.root = root;
    this.audio = audio;
    this.settings = loadSettings();
    this.stack = [];
    this.handlers = {};
    this.index = 0;
    window.addEventListener('keydown', (e) => this.key(e));
  }

  on(name, fn) { this.handlers[name] = fn; }
  emit(name, ...args) { if (this.handlers[name]) this.handlers[name](...args); }

  get open() { return this.stack.length > 0; }

  hide() {
    this.stack = [];
    this.root.innerHTML = '';
    this.root.className = '';
  }

  /** Show a page: { kind, title, items: [{ label, action, note }], body } */
  push(page) {
    this.stack.push(page);
    this.index = 0;
    this.render();
  }

  back() {
    if (this.stack.length <= 1) {
      const top = this.stack[0];
      if (top && top.kind === 'pause') this.emit('resume');
      return;
    }
    this.stack.pop();
    this.index = 0;
    this.render();
    this.audio.ui('move');
  }

  render() {
    const page = this.stack[this.stack.length - 1];
    if (!page) return;
    this.root.className = `menu ${page.kind}`;
    const items = page.items || [];
    const logo = page.kind === 'title'
      ? `<div class="logo"><div class="logo-sun"></div><h1>SOLMARA<span>BAY</span></h1><p>sun &middot; salt &middot; second chances</p></div>`
      : `<h2>${page.title || ''}</h2>`;
    this.root.innerHTML = `
      <div class="panel">
        ${logo}
        ${page.body || ''}
        <div class="items">${items.map((it, i) => `<button data-i="${i}" class="${i === this.index ? 'sel' : ''}${it.disabled ? ' off' : ''}">${it.label}${it.note ? `<small>${it.note}</small>` : ''}</button>`).join('')}</div>
        ${page.kind === 'title' ? '<div class="foot">An original open-world crime story &middot; keyboard and mouse &middot; WebAudio soundtrack</div>' : ''}
      </div>`;
    this.root.querySelectorAll('button').forEach((b) => {
      b.addEventListener('mouseenter', () => { this.index = Number(b.dataset.i); this.highlight(); });
      b.addEventListener('click', () => this.activate(Number(b.dataset.i)));
    });
    this.root.querySelectorAll('input[type=range]').forEach((r) => r.addEventListener('input', () => this.setting(r.name, Number(r.value))));
    this.root.querySelectorAll('input[type=checkbox]').forEach((r) => r.addEventListener('change', () => this.setting(r.name, r.checked)));
    if (page.after) page.after(this.root);
  }

  highlight() {
    this.root.querySelectorAll('.items button').forEach((b, i) => b.classList.toggle('sel', i === this.index));
  }

  activate(i) {
    const page = this.stack[this.stack.length - 1];
    const it = page && page.items && page.items[i];
    if (!it || it.disabled) return;
    this.audio.unlock();
    this.audio.ui('select');
    it.action();
  }

  key(e) {
    if (!this.open) return;
    const page = this.stack[this.stack.length - 1];
    const n = (page.items || []).length;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') { this.index = (this.index + 1) % Math.max(1, n); this.highlight(); this.audio.ui('move'); }
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') { this.index = (this.index - 1 + n) % Math.max(1, n); this.highlight(); this.audio.ui('move'); }
    else if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); this.activate(this.index); }
    else if (e.code === 'Escape' || e.code === 'Backspace') { this.back(); }
  }

  setting(name, value) {
    this.settings[name] = value;
    saveSettings(this.settings);
    this.emit('settings', this.settings);
  }

  // ------------------------------------------------------------ pages
  title(save) {
    this.hide();
    const items = [];
    if (save) {
      const done = (save.missions && save.missions.completed ? save.missions.completed.length : 0);
      const when = new Date(save.savedAt || Date.now());
      items.push({ label: 'Continue', note: `Story ${done}/${MISSIONS.length} &middot; $${(save.money || 0).toLocaleString('en-US')} &middot; saved ${when.toLocaleDateString()} ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, action: () => this.emit('continue', save) });
    }
    items.push({ label: 'New Game', note: save ? 'Starts over; your save is replaced when you next save' : 'Kai Moreno comes home', action: () => this.emit('new') });
    items.push({ label: 'Controls', action: () => this.controls() });
    items.push({ label: 'Settings', action: () => this.settingsPage() });
    items.push({ label: 'Credits', action: () => this.credits() });
    this.push({ kind: 'title', items });
  }

  pause(world) {
    this.hide();
    this.push({
      kind: 'pause',
      title: 'PAUSED',
      items: [
        { label: 'Resume', action: () => this.emit('resume') },
        { label: 'Map', action: () => this.map(world) },
        { label: 'Save Game', note: 'Saves here and now', action: () => { const ok = world.save(); this.toast(ok ? 'Game saved' : 'Saving is blocked in this browser'); } },
        { label: 'Stats', action: () => this.stats(world) },
        { label: 'Controls', action: () => this.controls() },
        { label: 'Settings', action: () => this.settingsPage() },
        { label: 'Quit to Title', action: () => this.emit('quit') },
      ],
    });
  }

  toast(text) {
    const t = document.createElement('div');
    t.className = 'menu-toast';
    t.textContent = text;
    this.root.appendChild(t);
    setTimeout(() => t.remove(), 1600);
  }

  map(world) {
    this.push({
      kind: 'map',
      title: 'SOLMARA BAY',
      body: '<canvas class="bigmap" width="760" height="760"></canvas><div class="legend"><span style="--c:#ffb000">N Nadia</span><span style="--c:#ff5fa2">P Pearl</span><span style="--c:#52d273">H Save</span><span style="--c:#ff7043">G Guns</span><span style="--c:#4fc3f7">C Courier</span><span style="--c:#ffd23f">Objective</span></div>',
      items: [{ label: 'Back', action: () => this.back() }],
      after: (root) => world.hud.drawBigMap(root.querySelector('.bigmap')),
    });
  }

  stats(world) {
    const s = world.stats;
    const mins = Math.floor(s.played / 60);
    const rows = [
      ['Story missions', `${world.missions.completed.size} / ${MISSIONS.length}`],
      ['Sun Shells', `${world.missions.shellsFound.size} / 12`],
      ['Cash', `$${Math.floor(world.money).toLocaleString('en-US')}`],
      ['Vehicles taken', s.stolen],
      ['Courier parcels', s.deliveries],
      ['Takedowns', s.kills],
      ['Officers down', s.cops],
      ['Crashes', s.crashes],
      ['Time played', `${mins} min`],
    ];
    this.push({
      kind: 'info',
      title: 'STATS',
      body: `<table class="kv">${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>`,
      items: [{ label: 'Back', action: () => this.back() }],
    });
  }

  controls() {
    this.push({
      kind: 'info',
      title: 'CONTROLS',
      body: `<table class="kv">${CONTROLS.map(([k, v]) => `<tr><td><kbd>${k}</kbd></td><td>${v}</td></tr>`).join('')}</table>`,
      items: [{ label: 'Back', action: () => this.back() }],
    });
  }

  settingsPage() {
    const s = this.settings;
    this.push({
      kind: 'info',
      title: 'SETTINGS',
      body: `<div class="settings">
        <label>Mouse sensitivity <input type="range" name="sensitivity" min="0.3" max="2.5" step="0.05" value="${s.sensitivity}"></label>
        <label>Invert mouse Y <input type="checkbox" name="invertY" ${s.invertY ? 'checked' : ''}></label>
        <label>Master volume <input type="range" name="master" min="0" max="1" step="0.05" value="${s.master}"></label>
        <label>Music volume <input type="range" name="music" min="0" max="1" step="0.05" value="${s.music}"></label>
        <label>Traffic density <input type="range" name="density" min="0.4" max="1.4" step="0.1" value="${s.density}"></label>
        <label>Difficulty <input type="range" name="difficulty" min="0.6" max="1.5" step="0.1" value="${s.difficulty}"></label>
      </div>`,
      items: [{ label: 'Back', action: () => this.back() }],
    });
  }

  credits() {
    this.push({
      kind: 'info',
      title: 'CREDITS',
      body: `<div class="credits">
        <p><b>Solmara Bay</b> is an original game: its city, people, cars, story and music were all made for it.</p>
        <p>Kai Moreno &middot; Nadia Moreno &middot; Auntie Pearl &middot; Dex Rourke &middot; Halo Calder &middot; the Glass Saints &middot; the Solmara Bay PD</p>
        <p>Radio: WAVE 88.1, BAYSIDE 94.7 and LOW TIDE FM, composed live by the game's own sequencer.</p>
        <p>Rendering by three.js (MIT). Everything else is the game's own code.</p>
      </div>`,
      items: [{ label: 'Back', action: () => this.back() }],
    });
  }
}
