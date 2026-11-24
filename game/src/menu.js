// Menus: the title screen over a slow flight across the bay (Continue with the save's summary,
// New Game, Controls, Settings, Credits), the pause menu (Resume, Map, Activities, Save, Stats,
// Controls, Settings, Quit), the settings that are kept between sessions, and keyboard
// navigation.
import { SETTINGS_KEY, RANGE, BUOY_RUN } from './config.js';
import { MISSIONS } from './story.js';
import { MapView } from './mapview.js';
import { MODELS } from './vehicles.js';
import { formatTime, dollars } from './rng.js';

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
  ['Q / wheel / 1-5', 'Switch weapon'],
  ['Tab (hold)', 'Weapon wheel, time slows'],
  ['R', 'Reload / next radio station'],
  ['E', 'Doors, counters, the garage bay, jobs and races'],
  ['W S / A D, Enter', 'Shop and garage screens: choose, change, buy'],
  ['1-6 (at the counter)', 'Buy at Coastline Arms'],
  ['H', 'Horn'],
  ['C (driving)', 'Look behind'],
  ['T (in a Marlin Cab)', 'Start / stop taxi fares'],
  ['M', 'City map'],
  ['P', 'Photo mode (F cycles filters)'],
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
        { label: 'Activities', note: 'Side jobs, records and medals', action: () => this.activities(world) },
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
    const obj = world.missions.objective();
    const hud = world.hud;
    const done = world.missions.completed.size;
    const next = world.missions.next();
    const order = (id) => MISSIONS.findIndex((m) => m.id === id);
    const reached = (id) => !next || MISSIONS.indexOf(next) >= order(id);
    const finale = reached('glass-houses');
    const haloDone = world.missions.completed.has('glass-houses');
    const hollisKnown = reached('hot-plates');
    const hollisDone = world.missions.completed.has('low-tide');
    const people = [
      ['kai', 'Kai Moreno', 'You. Back from six years on the northern boats.', `$${Math.floor(world.money).toLocaleString('en-US')} · health ${Math.round(world.player.health)}`],
      ['nadia', 'Nadia Moreno', "Kai's sister. Runs the Sol y Sal food truck on Palmline Beach.", next && next.giver === 'nadia' ? `Has work for you: ${next.title}` : 'On the beach'],
      ['pearl', 'Auntie Pearl', 'Spin City Laundry. Launders more than shirts.', next && next.giver === 'pearl' ? `Has work for you: ${next.title}` : 'At the laundry'],
      ['ines', 'Ines Okafor', 'Torque & Tide Customs. Fixes anything, asks nothing.', 'Repo jobs on offer'],
      hollisKnown
        ? ['hollis', 'Captain Hollis', 'SBPD. The name on every page of the ledger.', hollisDone ? 'In custody' : 'Wanted: by you']
        : ['halo', finale ? 'Halo Calder' : '???', finale ? 'Boss of the Glass Saints, up in Corvel Heights.' : 'Whoever runs the Glass Saints.', haloDone ? 'Dead' : finale ? 'Wanted: by you' : 'Unknown'],
    ];
    const legend = [['house', "Kai's apartment"], ['gun', 'Coastline Arms'], ['laundry', 'Spin City Laundry'], ['shirt', 'Threadline Outfitters'], ['wrench', 'Torque & Tide'], ['box', 'Bayline Couriers'], ['flag', 'Bayside Run'], ['buoy', 'Buoy Run'], ['hospital', 'St. Amara Medical'], ['police', 'Solmara Bay PD'], ['note', 'The Undertow'], ['car', 'Brightwater Motors'], ['crown', 'Your turf'], ['turf', 'Gang corner'], ['alert', 'Street event'], ['objective', 'Objective'], ['waypoint', 'Waypoint']];
    this.push({
      kind: 'map',
      body: `<div class="mapwrap">
        <div class="mapbox">
          <canvas class="bigmap" width="1000" height="1000"></canvas>
          <div class="mapcard"></div>
          <div class="maptools"><button data-act="in">+</button><button data-act="out">&minus;</button><button data-act="kai">Kai</button><button data-act="clear">Clear waypoint</button></div>
          <div class="maphint">Scroll to zoom · drag to pan · hover for details · click to set a waypoint · right-click to clear</div>
        </div>
        <div class="mapside">
          <h2>SOLMARA BAY</h2>
          ${obj ? `<div class="mapobj"><b>${obj.title}</b><span>${obj.text}</span></div>` : ''}
          <div class="people">${people.map(([icon, name, role, status]) => `<div class="person"><img class="${name === '???' ? 'unknown' : ''}" src="${hud.iconURL(icon)}"><div><b>${name}</b><span>${role}</span><em>${status}</em></div></div>`).join('')}</div>
          <div class="maplegend">${legend.map(([icon, t]) => `<div><img src="${hud.iconURL(icon)}">${t}</div>`).join('')}</div>
          <div class="mapstats"><span>Story <b>${done}/${MISSIONS.length}</b></span><span>Sun Shells <b>${world.missions.shellsFound.size}/12</b></span><span>Turf <b>${world.turf.ownedCount()}/6</b></span></div>
        </div></div>`,
      items: [{ label: 'Back', action: () => this.back() }],
      after: (root) => {
        const view = new MapView(world, root.querySelector('.bigmap'), root.querySelector('.mapcard'));
        this.mapView = view;
        root.querySelectorAll('.maptools button').forEach((b) => b.addEventListener('click', (e) => {
          e.stopPropagation();
          const act = b.dataset.act;
          const S = view.canvas.width;
          if (act === 'in') view.zoomAt(S / 2, S / 2, 1.4);
          else if (act === 'out') view.zoomAt(S / 2, S / 2, 1 / 1.4);
          else if (act === 'kai') { const at = world.mapPos(); view.focus(at.x, at.z, Math.max(view.zoom, 2.5)); }
          else world.clearWaypoint();
          this.audio.ui('move');
        }));
      },
    });
  }



  /** Side jobs and the records kept for each. */
  activities(world) {
    const a = world.activities;
    const g = world.garage;
    const medal = (m) => (m ? `<span class="medal ${m.toLowerCase()}">${m}</span>` : '');
    const rows = [
      ['Bayside Run', 'Street race in Little Marisco and Midtown. Drive into the chequered marker, press E.', world.missions.race.best ? `best ${formatTime(world.missions.race.best)}` : 'not won yet'],
      ['Buoy Run', 'Boat trial round nine buoys in the bay. Start at the beam off the pier.', `${Number.isFinite(a.buoys.best) ? `best ${formatTime(a.buoys.best)}` : 'no time yet'} ${medal(a.buoys.medal)}`, `gold ${formatTime(BUOY_RUN.medals[0].time)}`],
      ['Coastline Arms range', 'Booth 4 behind the gun shop. Forty seconds, six lanes.', `${a.range.best ? `best ${a.range.best}` : 'no score yet'} ${medal(a.range.medal)}`, `gold ${RANGE.medals[0].score}`],
      ['Repo jobs', 'From Ines at Torque & Tide, on foot.', `${g.repos} done`],
      ['Courier runs', 'Bayline Couriers, three parcels against the clock.', `${world.stats.deliveries} parcels`],
      ['Sol y Sal deliveries', "Walk up to Nadia's truck and press E: three taco orders on the bike, served hot.", a.tacos.best ? `best shift ${dollars(a.tacos.best)}` : 'no shift yet'],
      ['Taxi fares', 'Press T in any Marlin Cab.', ''],
      ['Threadline Outfitters', 'Tops, jackets, trousers, shoes, hats, shades and gold.', `${world.outfits.count()} / ${world.outfits.total()} pieces`],
      ['Your car', 'Keep a car at Torque & Tide and it waits outside the apartment.', g.personal ? MODELS[g.personal.model].name : 'none yet'],
      ['Sun Shells', 'Twelve hidden around the city.', `${world.missions.shellsFound.size} / 12`],
      ['Turf wars', 'Kill a gang member on their own corner to go to war for the district.', `${world.turf.ownedCount()} / 6 districts`, `${dollars(world.turf.dailyTake())} a morning`],
      ['The Undertow', 'Nightclub in Little Marisco: the bar, a DJ set on the decks, a share from Mara.', world.club.best ? `best set ${world.club.best}` : 'no set yet', world.club.owned ? 'part-owner' : ''],
      ['Brightwater Motors', 'Dealership in Harbor Flats. Buy a car or take one for a test drive.', `${world.dealer.sold} bought`],
      ['Street events', 'Bag snatches, car fires, lost dogs and buskers, between missions.', `${world.streetEvents.helped} helped`],
    ];
    this.push({
      kind: 'info',
      title: 'ACTIVITIES',
      body: `<table class="kv acts">${rows.map(([k, d, v, x]) => `<tr><td><b>${k}</b><small>${d}</small></td><td>${v}${x ? `<small>${x}</small>` : ''}</td></tr>`).join('')}</table>`,
      items: [{ label: 'Back', action: () => this.back() }],
    });
  }

  stats(world) {
    const s = world.stats;
    const mins = Math.floor(s.played / 60);
    const rows = [
      ['Story missions', `${world.missions.completed.size} / ${MISSIONS.length}`],
      ['Sun Shells', `${world.missions.shellsFound.size} / 12`],
      ['Cash', dollars(world.money)],
      ['Vehicles taken', s.stolen],
      ['Courier parcels and fares', s.deliveries],
      ['Repo jobs', s.repos || 0],
      ['Garage work done', s.mods || 0],
      ['Clothes bought', s.clothes || 0],
      ['Doors walked through', s.visits || 0],
      ['Districts taken', world.turf.taken],
      ['Turf defended / lost', `${world.turf.defended} / ${world.turf.lost}`],
      ['DJ sets played', world.club.sets],
      ['Drinks at The Undertow', world.club.drinks],
      ['Cars bought', world.dealer.sold],
      ['Good deeds', world.streetEvents.helped],
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
        <p>Kai Moreno &middot; Nadia Moreno &middot; Auntie Pearl &middot; Dex Rourke &middot; Halo Calder &middot; Captain Hollis &middot; Sergeant Vey &middot; Ines Okafor &middot; the Glass Saints &middot; the harbour board &middot; the Solmara Bay PD &middot; Channel 6 Bay News</p>
        <p>Spin City Laundry, Coastline Arms, Threadline Outfitters, Torque &amp; Tide Customs and Bayline Couriers are the city's own businesses.</p>
        <p>Radio: WAVE 88.1, BAYSIDE 94.7, LOW TIDE FM and SEAGLASS 101.3, composed live by the game's own sequencer.</p>
        <p>Rendering by three.js (MIT). Everything else is the game's own code.</p>
      </div>`,
      items: [{ label: 'Back', action: () => this.back() }],
    });
  }
}
