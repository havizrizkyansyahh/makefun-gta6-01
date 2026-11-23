// Keyboard and mouse: held keys, keys pressed this frame, mouse movement under pointer lock,
// buttons and the wheel. Systems read it, and may consume a press they handled so nothing else
// acts on it; main.js clears the per-frame parts after each frame.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.held = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.buttons = 0;
    this.clicked = 0;
    this.wheel = 0;
    this.locked = false;
    this.enabled = true;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!this.held.has(e.code)) this.pressed.add(e.code);
      this.held.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => { this.held.clear(); this.buttons = 0; });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    canvas.addEventListener('mousedown', (e) => {
      this.buttons |= 1 << e.button;
      this.clicked |= 1 << e.button;
    });
    window.addEventListener('mouseup', (e) => { this.buttons &= ~(1 << e.button); });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }

  requestLock() {
    if (!this.locked && this.canvas.requestPointerLock) {
      try {
        const r = this.canvas.requestPointerLock();
        if (r && r.catch) r.catch(() => { /* not allowed yet (no user gesture) */ });
      } catch { /* not allowed yet */ }
    }
  }

  releaseLock() {
    if (this.locked) document.exitPointerLock();
  }

  down(code) { return this.enabled && this.held.has(code); }
  hit(code) { return this.enabled && this.pressed.has(code); }
  mouse(button) { return this.enabled && (this.buttons & (1 << button)) !== 0; }
  mouseHit(button) { return this.enabled && (this.clicked & (1 << button)) !== 0; }

  /** -1..1 on an axis from two keys (or their arrow twins). */
  axis(neg, pos, negAlt, posAlt) {
    let v = 0;
    if (this.down(neg) || (negAlt && this.down(negAlt))) v -= 1;
    if (this.down(pos) || (posAlt && this.down(posAlt))) v += 1;
    return v;
  }

  /**
   * Swallow a key press so that a later system in the same frame does not act on it too (one E
   * press opens a door, not the door and the shop behind it).
   */
  consume(code) { this.pressed.delete(code); }

  /** Was any of these keys pressed this frame? */
  hitAny(...codes) { return codes.some((c) => this.hit(c)); }

  endFrame() {
    this.pressed.clear();
    this.clicked = 0;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }
}
