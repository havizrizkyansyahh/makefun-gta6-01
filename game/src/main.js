// Entry point: sets up the renderer, sound, HUD, menus, input and the world, then runs the frame
// loop through three states: the title screen (a slow camera flight over the live city), play,
// and pause. ?shot=<name> stages one of the screenshot scenes instead (see shots.js).
import * as THREE from '../vendor/three.module.min.js';
import { World } from './world.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { Hud } from './hud.js';
import { Menu } from './menu.js';
import { CAMERA } from './config.js';

const canvas = document.getElementById('game');
const params = new URLSearchParams(location.search);
const shot = params.get('shot');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: !!shot });
renderer.setPixelRatio(Math.min(devicePixelRatio, shot ? 1 : 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const audio = new Sound();
const hud = new Hud(document.getElementById('hud'));
const menu = new Menu(document.getElementById('menu'), audio);
const input = new Input(canvas);
const world = new World(renderer, audio, hud, Number(params.get('seed')) || 7);
window.solmara = world; // handy from the devtools console

let state = 'title';
let titleT = 0;

function applySettings(s) {
  world.rig.sensitivity = CAMERA.sensitivity * s.sensitivity;
  world.rig.invertY = s.invertY;
  audio.volume.master = s.master;
  audio.volume.music = s.music;
  audio.applyVolume();
  world.density = s.density;
  world.difficulty = s.difficulty;
}
applySettings(menu.settings);
menu.on('settings', applySettings);

function play() {
  menu.hide();
  state = 'play';
  hud.show(true);
  input.enabled = true;
  input.requestLock();
  audio.unlock();
  if (!world.player.vehicle) audio.tune(-1);
}

menu.on('new', () => {
  world.player.human.root.visible = true;
  play();
  world.hud.bigText('SOLMARA BAY', 'Six years away. One sister, one debt, one city.', 4.5, '#ffd27a');
  setTimeout(() => world.hud.notify('Follow the N on the minimap to meet Nadia.'), 2500);
});
menu.on('continue', (save) => {
  world.load(save);
  world.player.human.root.visible = true;
  play();
  world.hud.notify('Welcome back to Solmara Bay.');
});
menu.on('resume', () => play());
menu.on('quit', () => {
  world.save();
  location.reload();
});

input.onLockChange = (locked) => {
  if (!locked && state === 'play') pause();
};
canvas.addEventListener('click', () => { if (state === 'play') input.requestLock(); });

function pause(page) {
  state = 'pause';
  input.enabled = false;
  audio.engine(false, 0, 0);
  audio.siren(0);
  audio.skid(0);
  menu.pause(world);
  if (page === 'map') menu.map(world);
}

function title() {
  state = 'title';
  hud.show(false);
  input.enabled = false;
  world.newGame();
  world.player.human.root.visible = false;
  menu.title(World.readSave());
  // title music starts with the first click anywhere
  const start = () => { audio.unlock(); if (state === 'title') audio.tune(0); window.removeEventListener('pointerdown', start); };
  window.addEventListener('pointerdown', start);
}

/** The title camera drifts along the beach boulevard looking back at the skyline. */
function titleCamera(dt) {
  titleT += dt;
  const a = titleT * 0.035;
  const c = world.city.places.nadia;
  const cam = world.camera;
  cam.position.set(c.x + Math.sin(a) * 120, 38 + Math.sin(titleT * 0.1) * 6, c.z + 60 + Math.cos(a) * 25);
  cam.lookAt(c.x - Math.sin(a) * 60, 18, c.z - 220);
  if (cam.fov !== 55) { cam.fov = 55; cam.updateProjectionMatrix(); }
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  world.camera.aspect = innerWidth / innerHeight;
  world.camera.updateProjectionMatrix();
});

addEventListener('keydown', (e) => {
  if (state === 'play' && e.code === 'KeyM') pause('map');
  if (state === 'play' && e.code === 'Escape') pause();
});

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (state === 'play') {
    world.step(dt, input);
  } else if (state === 'title') {
    world.step(dt, input);
    titleCamera(dt);
  }
  world.render();
  input.endFrame();
  requestAnimationFrame(frame);
}

document.getElementById('loading').remove();
if (shot) {
  import('./shots.js').then((m) => m.stageShot(shot, world, { menu, hud, input, renderer }));
} else {
  title();
  requestAnimationFrame(frame);
}
