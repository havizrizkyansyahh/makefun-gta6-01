// Time of day over Solmara Bay: a gradient sky dome with a sun disc, the sun and sky lights, fog
// that matches the horizon, and a shadow camera that follows the player. Hour 0..24.
import * as THREE from '../vendor/three.module.min.js';
import { clamp, lerp } from './rng.js';

// Key colours through the day: [hour, zenith, horizon, sun colour, sun intensity, ambient]
const KEYS = [
  [0, '#0b1230', '#1d2a55', '#8090c0', 0.05, 0.28],
  [5, '#1a2350', '#c77a8a', '#ff9a6a', 0.25, 0.35],
  [7, '#4f8fd6', '#ffd2a1', '#ffd6a8', 1.6, 0.6],
  [12, '#3f86de', '#bfe2f7', '#fff6e8', 2.6, 0.8],
  [16.5, '#4a86d0', '#ffd9a6', '#ffd29a', 2.3, 0.72],
  [18.6, '#5a5fae', '#ff9b6b', '#ff8a4e', 1.6, 0.55],
  [19.8, '#28296a', '#e0607a', '#ff6a55', 0.5, 0.4],
  [21, '#0e1438', '#2b2f66', '#8090c0', 0.08, 0.3],
  [24, '#0b1230', '#1d2a55', '#8090c0', 0.05, 0.28],
];

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();

function sample(hour) {
  let k = 0;
  while (k < KEYS.length - 2 && KEYS[k + 1][0] <= hour) k += 1;
  const a = KEYS[k];
  const b = KEYS[k + 1];
  const t = clamp((hour - a[0]) / (b[0] - a[0]), 0, 1);
  const mix = (i) => tmpA.set(a[i]).clone().lerp(tmpB.set(b[i]), t);
  return { zenith: mix(1), horizon: mix(2), sun: mix(3), sunI: lerp(a[4], b[4], t), amb: lerp(a[5], b[5], t) };
}

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.uniforms = {
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color() },
      uTime: { value: 0 },
      uNight: { value: 0 },
      uCloud: { value: 0.35 },
    };
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1800, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        vertexShader: `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            vec4 p = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * p;
          }`,
        fragmentShader: `
          uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uSunColor;
          uniform float uTime; uniform float uNight; uniform float uCloud;
          varying vec3 vDir;
          float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float noise(vec2 p) {
            vec2 i = floor(p); vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
          }
          float fbm(vec2 p) {
            float v = 0.0; float a = 0.5;
            for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(17.0, 9.0); a *= 0.5; }
            return v;
          }
          void main() {
            vec3 d = normalize(vDir);
            float h = clamp(d.y, -0.2, 1.0);
            vec3 c = mix(uHorizon, uZenith, pow(max(h, 0.0), 0.55));
            float s = max(dot(d, uSunDir), 0.0);
            c += uSunColor * (pow(s, 900.0) * 3.0 + pow(s, 12.0) * 0.35 + pow(s, 3.0) * 0.12);
            // stars, only once the sun is down
            if (uNight > 0.01 && h > 0.0) {
              vec2 g = floor(d.xz / (d.y + 0.3) * 260.0);
              float st = step(0.997, hash(g)) * uNight * smoothstep(0.0, 0.25, h);
              c += vec3(st * 1.4);
            }
            // cumulus layer projected onto a plane overhead, drifting with the sea breeze
            if (h > 0.0) {
              vec2 uv = d.xz / (d.y + 0.12) * 1.6 + vec2(uTime * 0.006, uTime * 0.002);
              float n = fbm(uv);
              float cover = smoothstep(0.62 - uCloud * 0.2, 0.92 - uCloud * 0.15, n);
              float edge = fbm(uv * 2.7 + 3.0);
              float thick = smoothstep(0.45, 0.95, n + edge * 0.25);
              // lit side toward the sun, warm rims at golden hour, grey undersides
              vec3 lit = mix(vec3(1.0), uSunColor * 1.35, 0.55) + uSunColor * pow(s, 6.0) * 0.8;
              vec3 shade = mix(uHorizon, uZenith, 0.35) * 0.75;
              vec3 cloud = mix(lit, shade, thick * 0.65);
              cloud = mix(cloud, cloud * vec3(0.35, 0.38, 0.5), uNight * 0.85);
              float fade = smoothstep(0.0, 0.18, h);
              c = mix(c, cloud, cover * fade * 0.92);
            }
            gl_FragColor = vec4(c, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    );
    dome.renderOrder = -1;
    dome.frustumCulled = false;
    this.dome = dome;
    scene.add(dome);

    // a small copy of the sky over a sandy ground disc, captured into an environment map so
    // car paint, glass towers and wet-looking asphalt reflect the real sky of the hour
    this.envScene = new THREE.Scene();
    this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), dome.material));
    const ground = new THREE.Mesh(new THREE.CircleGeometry(48, 24), new THREE.MeshBasicMaterial({ color: '#6f6658' }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -3;
    this.envScene.add(ground);
    this.groundMat = ground.material;
    this.envHour = -99;
    this.envTarget = null;
    this.pmrem = null;

    this.sun = new THREE.DirectionalLight('#ffffff', 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 1; sc.far = 600;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight('#bfdcff', '#d9c7a0', 0.7);
    scene.add(this.hemi);
    scene.fog = new THREE.Fog('#ffd9a6', 220, 1300);
    this.night = 0;
    this.hour = 12;
  }

  /** Set the hour and move the lights around the focus point (the player). */
  update(hour, focus) {
    this.hour = hour;
    const k = sample(hour);
    // The sun rises in the east and sets out over the sea to the south-west.
    const t = (hour - 6) / 12 * Math.PI;
    const elev = Math.sin(t);
    const dir = new THREE.Vector3(Math.cos(t) * 0.8, Math.max(elev, -0.3), 0.45 + 0.25 * (1 - Math.abs(elev))).normalize();
    this.uniforms.uSunDir.value.copy(dir);
    this.uniforms.uZenith.value.copy(k.zenith);
    this.uniforms.uHorizon.value.copy(k.horizon);
    this.uniforms.uSunColor.value.copy(k.sun);
    // below the horizon the "sun" light becomes moonlight from above
    const lightDir = elev > 0.08 ? dir : new THREE.Vector3(-0.3, 1, 0.4).normalize();
    this.sun.color.copy(k.sun);
    this.sun.intensity = k.sunI;
    this.sun.position.set(focus.x + lightDir.x * 260, lightDir.y * 260, focus.z + lightDir.z * 260);
    this.sun.target.position.set(focus.x, 0, focus.z);
    this.hemi.intensity = k.amb;
    this.hemi.color.copy(k.zenith).lerp(new THREE.Color('#ffffff'), 0.55);
    this.scene.fog.color.copy(k.horizon);
    this.dome.position.set(focus.x, 0, focus.z);
    this.night = clamp(1 - (elev + 0.05) / 0.25, 0, 1);
    this.hemi.intensity = k.amb * 0.55;
    this.uniforms.uNight.value = this.night;
    this.uniforms.uTime.value = performance.now() / 1000;
  }

  /** Re-capture the sky into scene.environment when the hour has moved on. */
  updateEnvironment(renderer, force = false) {
    if (!force && Math.abs(this.hour - this.envHour) < 0.2) return;
    this.envHour = this.hour;
    if (!this.pmrem) this.pmrem = new THREE.PMREMGenerator(renderer);
    this.groundMat.color.copy(this.uniforms.uHorizon.value).multiplyScalar(0.35).lerp(new THREE.Color('#6f6658'), 0.5);
    const old = this.envTarget;
    this.envTarget = this.pmrem.fromScene(this.envScene, 0.02, 0.1, 200);
    this.scene.environment = this.envTarget.texture;
    if (old) old.dispose();
  }
}
