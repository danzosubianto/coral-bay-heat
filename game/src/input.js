// input.js — keyboard and mouse state, polled by the game loop. Actions are
// named for what they do in game (throttle, interact, attack) so the player
// and vehicle code never touches raw key codes.

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set();   // edge-triggered, cleared by the loop each frame
    this.mouse = { x: 0, y: 0, down: false, clicked: false };
    addEventListener('keydown', (e) => {
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
    });
    canvas.addEventListener('mousedown', (e) => {
      this.mouse.down = true;
      this.mouse.clicked = true;
      this.mouse.x = e.offsetX; this.mouse.y = e.offsetY;
    });
    addEventListener('mouseup', () => { this.mouse.down = false; });
    addEventListener('blur', () => this.keys.clear());
  }

  down(...codes) { return codes.some((c) => this.keys.has(c)); }
  hit(...codes) { return codes.some((c) => this.pressed.has(c)); }

  get up() { return this.down('KeyW', 'ArrowUp'); }
  get dn() { return this.down('KeyS', 'ArrowDown'); }
  get lf() { return this.down('KeyA', 'ArrowLeft'); }
  get rt() { return this.down('KeyD', 'ArrowRight'); }
  get run() { return this.down('ShiftLeft', 'ShiftRight'); }
  get interact() { return this.hit('KeyE', 'KeyF'); }
  get attack() { return this.hit('Space') || this.mouse.clicked; }
  get pause() { return this.hit('Escape', 'KeyP'); }
  get restart() { return this.hit('KeyR'); }
  get save() { return this.hit('KeyK'); }

  endFrame() {
    this.pressed.clear();
    this.mouse.clicked = false;
  }
}
