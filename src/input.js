// Touch-Steuerung (Joystick, Wischen, Knöpfe) plus Tastatur und Maus für den PC.

export class Input {
  constructor() {
    this.move = { x: 0, y: 0 };          // Joystick, -1..1 (y = vorwärts)
    this.look = { x: 0, y: 0 };          // gesammelte Wischbewegung in Pixeln
    this.held = { gas: false, brake: false, jump: false, enter: false };
    this.pressed = { jump: false, enter: false };
    this.keys = new Set();
    this.lastLookTime = 0;

    this._setupStick();
    this._setupLook();
    this._setupButtons();
    this._setupKeyboard();
  }

  // ---------- Joystick links ----------
  _setupStick() {
    const zone = document.getElementById('stick-zone');
    this.stickBase = document.getElementById('stick-base');
    this.stickKnob = document.getElementById('stick-knob');
    const R = 55;
    let id = null, ox = 0, oy = 0;

    const reset = () => {
      id = null;
      this.stickMove = { x: 0, y: 0 };
      this.stickKnob.style.transform = '';
      this.stickBase.classList.remove('active');
      this.stickBase.style.left = ''; this.stickBase.style.top = ''; this.stickBase.style.bottom = '';
    };
    reset();

    zone.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      id = e.pointerId;
      zone.setPointerCapture(id);
      ox = e.clientX; oy = e.clientY;
      this.stickBase.style.left = ox + 'px';
      this.stickBase.style.top = oy + 'px';
      this.stickBase.style.bottom = 'auto';
      this.stickBase.classList.add('active');
      e.preventDefault();
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - ox, dy = e.clientY - oy;
      const len = Math.hypot(dx, dy);
      if (len > R) { dx *= R / len; dy *= R / len; }
      this.stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      let x = dx / R, y = -dy / R;
      const m = Math.hypot(x, y);
      const dead = 0.12;
      if (m < dead) { x = 0; y = 0; } else { const k = (m - dead) / (1 - dead) / m; x *= k; y *= k; }
      this.stickMove = { x, y };
    });
    const end = (e) => { if (e.pointerId === id) reset(); };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  // ---------- Wischen rechts für die Kamera ----------
  _setupLook() {
    const zone = document.getElementById('look-zone');
    let id = null, lx = 0, ly = 0;
    zone.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      id = e.pointerId;
      zone.setPointerCapture(id);
      lx = e.clientX; ly = e.clientY;
      e.preventDefault();
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      this.look.x += e.clientX - lx;
      this.look.y += e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      this.lastLookTime = performance.now();
    });
    const end = (e) => { if (e.pointerId === id) id = null; };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  // ---------- Knöpfe ----------
  _setupButtons() {
    this.buttons = {};
    for (const el of document.querySelectorAll('.btn')) {
      const key = el.dataset.key;
      this.buttons[key] = el;
      const ids = new Set();
      el.addEventListener('pointerdown', (e) => {
        ids.add(e.pointerId);
        el.setPointerCapture(e.pointerId);
        this.held[key] = true;
        if (key in this.pressed) this.pressed[key] = true;
        el.classList.add('pressed');
        if (navigator.vibrate) try { navigator.vibrate(12); } catch (_) {}
        e.preventDefault();
      });
      const up = (e) => {
        ids.delete(e.pointerId);
        if (ids.size === 0) { this.held[key] = false; el.classList.remove('pressed'); }
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  // ---------- Tastatur (PC) ----------
  _setupKeyboard() {
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space') this.pressed.jump = true;
      if (e.code === 'KeyE' || e.code === 'KeyF') this.pressed.enter = true;
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  /** Einmal pro Bild aufrufen: kombiniert Touch und Tastatur. */
  update() {
    const k = this.keys;
    const kx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const ky = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    if (kx || ky) {
      const l = Math.hypot(kx, ky);
      const walk = k.has('ShiftLeft') ? 0.5 : 1;
      this.move = { x: kx / l * walk, y: ky / l * walk };
    } else {
      this.move = { ...this.stickMove };
    }
    this.gas = this.held.gas || k.has('KeyW') || k.has('ArrowUp');
    this.brake = this.held.brake || k.has('KeyS') || k.has('ArrowDown');
  }

  consume(name) {
    const v = this.pressed[name];
    this.pressed[name] = false;
    return v;
  }

  consumeLook() {
    const l = { ...this.look };
    this.look.x = 0; this.look.y = 0;
    return l;
  }

  /** Zeigt die richtigen Knöpfe zu Fuss oder im Auto. */
  setDriving(driving) {
    this.buttons.gas.classList.toggle('hidden', !driving);
    this.buttons.brake.classList.toggle('hidden', !driving);
    this.buttons.jump.classList.toggle('hidden', driving);
    this.buttons.enter.textContent = driving ? 'Aussteigen' : 'Einsteigen';
  }

  setEnterAvailable(ok) {
    this.buttons.enter.classList.toggle('dim', !ok);
  }
}
