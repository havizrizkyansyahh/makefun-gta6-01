// Post-processing written for Solmara Bay: the scene renders into a multisampled HDR target,
// bright parts are blurred at half and quarter size for bloom (sun glints, headlights, sirens,
// neon windows), then one composite shader tone-maps with an ACES curve, grades the image
// warm in the highlights and teal in the shadows for the sun-soaked look, warms the image under
// interior lamps, drains it to grey when Kai goes down, adds a vignette and a little film grain,
// and writes sRGB to the screen.
import * as THREE from '../vendor/three.module.min.js';

const VERT = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const BRIGHT = `
  uniform sampler2D tSrc; uniform float uThreshold;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tSrc, vUv).rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float k = smoothstep(uThreshold, uThreshold * 1.8, l);
    gl_FragColor = vec4(c * k, 1.0);
  }`;

const BLUR = `
  uniform sampler2D tSrc; uniform vec2 uDir;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270270;
    c += texture2D(tSrc, vUv + uDir * 1.3846153846).rgb * 0.3162162162;
    c += texture2D(tSrc, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
    c += texture2D(tSrc, vUv + uDir * 3.2307692308).rgb * 0.0702702703;
    c += texture2D(tSrc, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
    gl_FragColor = vec4(c, 1.0);
  }`;

const COMPOSITE = `
  uniform sampler2D tScene; uniform sampler2D tBloomA; uniform sampler2D tBloomB;
  uniform float uExposure; uniform float uBloom; uniform float uVignette; uniform float uTime;
  uniform float uSaturation; uniform vec3 uLift; uniform vec3 uGain; uniform float uFlash;
  uniform float uDesat; uniform float uWarm;
  varying vec2 vUv;
  vec3 aces(vec3 x) {
    // ACES filmic fit (Narkowicz)
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  }
  vec3 toSRGB(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    vec3 c = texture2D(tScene, vUv).rgb;
    vec3 bloom = texture2D(tBloomA, vUv).rgb * 0.7 + texture2D(tBloomB, vUv).rgb * 0.9;
    c += bloom * uBloom;
    c *= uExposure;
    c = aces(c);
    // split toning: teal in the shadows, warm gold in the highlights
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(c + uLift * (1.0 - l), c * uGain, smoothstep(0.35, 1.0, l));
    c = mix(vec3(l), c, uSaturation);
    // indoors: tungsten warmth; wasted or busted: the colour drains out of the world
    c *= mix(vec3(1.0), vec3(1.07, 1.0, 0.9), uWarm);
    c = mix(c, vec3(l) * vec3(1.02, 0.98, 0.96), uDesat);
    // gentle S-curve contrast
    c = c * c * (3.0 - 2.0 * c) * 0.35 + c * 0.65;
    vec2 d = vUv - 0.5;
    c *= 1.0 - dot(d, d) * uVignette;
    c += uFlash;
    c = toSRGB(clamp(c, 0.0, 1.0));
    c += (hash(vUv * 1000.0 + uTime) - 0.5) * 0.018;
    gl_FragColor = vec4(c, 1.0);
  }`;

export class PostFX {
  constructor(renderer) {
    this.renderer = renderer;
    const opts = { type: THREE.HalfFloatType, depthBuffer: false };
    this.scene = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    this.half = [new THREE.WebGLRenderTarget(4, 4, opts), new THREE.WebGLRenderTarget(4, 4, opts)];
    this.quarter = [new THREE.WebGLRenderTarget(4, 4, opts), new THREE.WebGLRenderTarget(4, 4, opts)];
    const mat = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    this.bright = mat(BRIGHT, { tSrc: { value: null }, uThreshold: { value: 0.9 } });
    this.blur = mat(BLUR, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.composite = mat(COMPOSITE, {
      tScene: { value: null }, tBloomA: { value: null }, tBloomB: { value: null },
      uExposure: { value: 0.9 }, uBloom: { value: 0.55 }, uVignette: { value: 0.9 }, uTime: { value: 0 },
      uSaturation: { value: 1.18 }, uLift: { value: new THREE.Vector3(-0.006, 0.006, 0.014) }, uGain: { value: new THREE.Vector3(1.05, 1.0, 0.93) },
      uFlash: { value: 0 }, uDesat: { value: 0 }, uWarm: { value: 0 },
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.composite);
    this.quad.frustumCulled = false;
    this.fsScene = new THREE.Scene();
    this.fsScene.add(this.quad);
    this.fsCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.enabled = true;
  }

  setSize(w, h, ratio) {
    const W = Math.max(4, Math.floor(w * ratio));
    const H = Math.max(4, Math.floor(h * ratio));
    this.scene.setSize(W, H);
    for (const t of this.half) t.setSize(W >> 1, H >> 1);
    for (const t of this.quarter) t.setSize(W >> 2, H >> 2);
  }

  /** Ease the grade toward the moment: desat 0..1 (down and out), warm 0..1 (indoors). */
  grade(dt, desat, warm) {
    const u = this.composite.uniforms;
    const k = 1 - Math.exp(-dt * 2.5);
    u.uDesat.value += (desat - u.uDesat.value) * k;
    u.uWarm.value += (warm - u.uWarm.value) * k;
  }

  pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.fsScene, this.fsCamera);
  }

  blurInto(src, pair) {
    const [a, b] = pair;
    this.blur.uniforms.tSrc.value = src.texture;
    this.blur.uniforms.uDir.value.set(1.4 / a.width, 0);
    this.pass(this.blur, b);
    this.blur.uniforms.tSrc.value = b.texture;
    this.blur.uniforms.uDir.value.set(0, 1.4 / a.height);
    this.pass(this.blur, a);
    return a;
  }

  render(scene, camera, time = 0) {
    const r = this.renderer;
    if (!this.enabled) {
      r.setRenderTarget(null);
      r.render(scene, camera);
      return;
    }
    r.setRenderTarget(this.scene);
    r.render(scene, camera);
    // bloom: threshold at half size, blur, then blur again at quarter size
    this.bright.uniforms.tSrc.value = this.scene.texture;
    this.pass(this.bright, this.half[0]);
    const a = this.blurInto(this.half[0], this.half);
    this.blur.uniforms.tSrc.value = a.texture;
    this.blur.uniforms.uDir.value.set(0, 0);
    this.pass(this.blur, this.quarter[0]);
    const b = this.blurInto(this.quarter[0], this.quarter);
    const u = this.composite.uniforms;
    u.tScene.value = this.scene.texture;
    u.tBloomA.value = a.texture;
    u.tBloomB.value = b.texture;
    u.uTime.value = time % 100;
    this.pass(this.composite, null);
  }
}
