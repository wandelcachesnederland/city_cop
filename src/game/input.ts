// Unified keyboard + touch/mouse input
const KEYMAP: Record<string, string> = {
  Digit1: 'act_arrest',
  Numpad1: 'act_arrest',
  KeyZ: 'act_arrest',
  Digit2: 'act_help',
  Numpad2: 'act_help',
  KeyX: 'act_help',
  Digit3: 'act_ticket',
  Numpad3: 'act_ticket',
  KeyC: 'act_ticket',
  Digit4: 'act_shoot',
  Numpad4: 'act_shoot',
  KeyV: 'act_shoot',
  KeyE: 'use',
  Enter: 'use',
  Space: 'shoot',
  KeyF: 'shoot',
  KeyP: 'pause',
  Escape: 'pause',
  KeyH: 'siren',
  KeyM: 'mute',
};

export interface Btn {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export class Input {
  keys = new Set<string>();
  pressed = new Set<string>();
  isTouch = false;
  joy = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  buttons: Btn[] = [];
  heldBtn = new Map<number, string>();
  private el: HTMLElement | null = null;
  enabled = true;

  private onKeyDown = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) && this.enabled) e.preventDefault();
    if (!e.repeat) {
      this.keys.add(e.code);
      const a = KEYMAP[e.code];
      if (a) this.pressed.add(a);
    }
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  private onBlur = () => {
    this.keys.clear();
    this.joy.active = false;
    this.heldBtn.clear();
  };

  private local(e: PointerEvent) {
    const r = this.el!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onDown = (e: PointerEvent) => {
    if (!this.el) return;
    if (e.pointerType === 'touch') this.isTouch = true;
    const { x, y } = this.local(e);
    for (let i = this.buttons.length - 1; i >= 0; i--) {
      const b = this.buttons[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        this.pressed.add(b.id);
        this.heldBtn.set(e.pointerId, b.id);
        e.preventDefault();
        return;
      }
    }
    if (e.pointerType !== 'mouse' && !this.joy.active && x < this.el.clientWidth * 0.6) {
      this.joy = { active: true, id: e.pointerId, ox: x, oy: y, x, y };
      try {
        this.el.setPointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
    }
    e.preventDefault();
  };
  private onMove = (e: PointerEvent) => {
    if (this.joy.active && e.pointerId === this.joy.id) {
      const { x, y } = this.local(e);
      this.joy.x = x;
      this.joy.y = y;
      // drag the base along if pulled far
      const dx = x - this.joy.ox;
      const dy = y - this.joy.oy;
      const d = Math.hypot(dx, dy);
      const max = 70;
      if (d > max * 1.4) {
        this.joy.ox = x - (dx / d) * max * 1.4;
        this.joy.oy = y - (dy / d) * max * 1.4;
      }
    }
  };
  private onUp = (e: PointerEvent) => {
    if (this.joy.active && e.pointerId === this.joy.id) this.joy.active = false;
    this.heldBtn.delete(e.pointerId);
  };

  attach(el: HTMLElement) {
    this.el = el;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    el.addEventListener('pointerdown', this.onDown, { passive: false });
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
  }
  detach() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.el?.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
  }

  consume(a: string) {
    if (this.pressed.has(a)) {
      this.pressed.delete(a);
      return true;
    }
    return false;
  }

  held(id: string) {
    for (const v of this.heldBtn.values()) if (v === id) return true;
    return false;
  }

  axis() {
    let x = 0;
    let y = 0;
    const k = this.keys;
    if (k.has('ArrowLeft') || k.has('KeyA')) x -= 1;
    if (k.has('ArrowRight') || k.has('KeyD')) x += 1;
    if (k.has('ArrowUp') || k.has('KeyW')) y -= 1;
    if (k.has('ArrowDown') || k.has('KeyS')) y += 1;
    if (x || y) {
      const d = Math.hypot(x, y);
      return { x: x / d, y: y / d, joy: false };
    }
    if (this.joy.active) {
      const dx = this.joy.x - this.joy.ox;
      const dy = this.joy.y - this.joy.oy;
      const d = Math.hypot(dx, dy);
      if (d < 8) return { x: 0, y: 0, joy: true };
      const m = Math.min(1, d / 60);
      return { x: (dx / d) * m, y: (dy / d) * m, joy: true };
    }
    return { x: 0, y: 0, joy: false };
  }

  endFrame() {
    this.pressed.clear();
  }
}
