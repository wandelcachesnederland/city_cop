import { World, Precinct, T, WORLD_PX, AREA_INFO, areaAtPx, roadNode, NB, TL, PW, PH, BLOCK, MW, MH } from './world';
import type { AreaId, Station, PObj } from './world';
import { INCIDENTS, ACTIONS, ACTION_INFO, INNOCENT_SHOT, CUFFED_SHOT, PED_HIT } from './incidents';
import type { IncidentDef, Action, Outcome } from './incidents';
import { sfx } from './audio';
import { Input } from './input';
import type { Btn } from './input';
import { rr, drawEmoji, drawPerson, drawCar, randLook, CAR_COLORS } from './draw';
import type { Look } from './draw';

export const SHIFT = 300;
const MAX_CUSTODY = 4;
const SEG = BLOCK * T;
const DIRS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];
const TAU = Math.PI * 2;
const FONT = '"Russo One", "Arial Black", sans-serif';
const UIFONT = '"Chakra Petch", sans-serif';
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <X,>(a: X[]) => a[Math.floor(Math.random() * a.length)];
const angDiff = (a: number, b: number) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};
const lerpAngle = (a: number, b: number, k: number) => a + angDiff(a, b) * k;

export type Mode = 'attract' | 'play' | 'paused' | 'menu' | 'over';

export interface Stats {
  score: number;
  arrests: number;
  helps: number;
  tickets: number;
  kills: number;
  innocents: number;
  booked: number;
  good: number;
  bad: number;
  bestCombo: number;
  rides: number;
  trustBonus: number;
  reason: string;
  sub: string;
  time: number;
  trust: number;
}

export interface GameCallbacks {
  onGameOver: (s: Stats) => void;
  onPause: () => void;
  onTransit: (stations: Station[], current: number) => void;
}

type Role = 'ped' | 'inc' | 'cuffed' | 'leave' | 'down';

interface Prop {
  kind: 'car' | 'graffiti' | 'stall' | 'cat';
  x: number;
  y: number;
  angle: number;
  color: string;
  alpha: number;
}

interface Inc {
  def: IncidentDef;
  timer: number;
  max: number;
  state: 'idle' | 'flee' | 'hostile' | 'wander' | 'road';
  active: boolean;
  priority: boolean;
  fleeT: number;
  shootCd: number;
  prop: Prop | null;
  ox: number;
  oy: number;
}

interface Person {
  id: number;
  x: number;
  y: number;
  dir: number;
  walk: number;
  look: Look;
  role: Role;
  inc: Inc | null;
  wt: number;
  wdx: number;
  wdy: number;
  speed: number;
  stun: number;
  fall: number;
  life: number;
  mood: '' | 'happy' | 'angry';
  flash: number;
  kx: number;
  ky: number;
  small: boolean;
}

interface NCar {
  ni: number;
  nj: number;
  dir: number;
  t: number;
  speed: number;
  max: number;
  x: number;
  y: number;
  angle: number;
  color: string;
  kind: 'car' | 'taxi' | 'bus';
  bump: number;
  honk: number;
  wait: number;
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  from: 'p' | 'e';
}

type PType = 'spark' | 'smoke' | 'heart' | 'star' | 'coin' | 'conf' | 'paper' | 'ring' | 'flash' | 'shell' | 'drop' | 'dust' | 'plus';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  type: PType;
  rot: number;
  vr: number;
  drag: number;
  grav: number;
}

interface FText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  max: number;
  size: number;
}

const ADDITIVE = new Set<PType>(['spark', 'ring', 'flash']);

function emptyStats(): Stats {
  return { score: 0, arrests: 0, helps: 0, tickets: 0, kills: 0, innocents: 0, booked: 0, good: 0, bad: 0, bestCombo: 1, rides: 0, trustBonus: 0, reason: '', sub: '', time: 0, trust: 0 };
}

export class Game {
  cb: GameCallbacks;
  canvas: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  dpr = 1;
  w = 800;
  h = 600;
  baseZoom = 1;
  world: World;
  precinct: Precinct;
  input = new Input();
  mode: Mode = 'attract';
  scene: 'city' | 'precinct' = 'city';
  t = 0;
  elapsed = 0;
  player = { x: 0, y: 0, vx: 0, vy: 0, dir: 0, walk: 0, hp: 100, boost: 0, inv: 0, shootCd: 0, squash: 0, inCar: false };
  car = { x: 0, y: 0, vx: 0, vy: 0, angle: 0, speed: 0, siren: false, crashCd: 0, hitCd: 0 };
  cityPos = { x: 0, y: 0 };
  persons: Person[] = [];
  custody: Person[] = [];
  booked: { x: number; y: number; look: Look; dir: number }[] = [];
  ncars: NCar[] = [];
  bullets: Bullet[] = [];
  parts: Particle[] = [];
  texts: FText[] = [];
  skids: { x: number; y: number; a: number }[] = [];
  chalks: { x: number; y: number; dir: number; life: number }[] = [];
  fading: Prop[] = [];
  panics: { x: number; y: number; life: number; r: number }[] = [];
  cam = { x: 0, y: 0, zoom: 1 };
  shake = 0;
  hitstop = 0;
  zoomPunch = 0;
  flashA = 0;
  flashC = '#fff';
  fadeA = 0;
  score = 0;
  scoreShown = 0;
  scorePop = 0;
  trust = 60;
  trustShown = 60;
  combo = 1;
  streak = 0;
  stats: Stats = emptyStats();
  radioQ: { text: string; color: string }[] = [];
  radio: { text: string; color: string; life: number } | null = null;
  verdict: { text: string; sub: string; color: string; life: number } | null = null;
  banner: { title: string; tag: string; color: string; life: number } | null = null;
  curArea: AreaId | null = null;
  priorityCd = 6;
  spawnCd = 0;
  armoryCd = 0;
  coffeeCd = 0;
  motorCd = 0;
  recklessCd = 0;
  focus: Person | null = null;
  prompt: string | null = null;
  hint = 0;
  nextId = 1;
  last = 0;
  raf = 0;
  overT = 0;
  overSent = false;
  ignorePauseUntil = 0;
  vignette: HTMLCanvasElement | null = null;
  private vis: Person[] = [];
  private citySolid = (x: number, y: number) => this.world.solidPx(x, y);
  private precSolid = (x: number, y: number) => this.precinct.solidPx(x, y);

  constructor(canvas: HTMLCanvasElement, cb: GameCallbacks) {
    this.canvas = canvas;
    this.cb = cb;
    this.g = canvas.getContext('2d', { alpha: false })!;
    this.world = new World();
    this.precinct = new Precinct();
    this.input.attach(canvas);
    this.resize();
    window.addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', this.onVis);
    this.resetWorld();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.input.detach();
    window.removeEventListener('resize', this.resize);
    document.removeEventListener('visibilitychange', this.onVis);
    sfx.stopLoops();
  }

  private onVis = () => {
    if (document.hidden && this.mode === 'play') this.pause();
  };

  resize = () => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w * h * dpr * dpr > 4_500_000) dpr = Math.max(1, Math.sqrt(4_500_000 / (w * h)));
    this.dpr = dpr;
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.baseZoom = clamp(Math.min(w, h) / 620, 0.62, 1.35);
    const v = document.createElement('canvas');
    v.width = Math.max(1, Math.round(w / 2));
    v.height = Math.max(1, Math.round(h / 2));
    const vg = v.getContext('2d')!;
    const gr = vg.createRadialGradient(v.width / 2, v.height / 2, Math.min(v.width, v.height) * 0.3, v.width / 2, v.height / 2, Math.max(v.width, v.height) * 0.75);
    gr.addColorStop(0, 'rgba(4,4,20,0)');
    gr.addColorStop(1, 'rgba(4,4,20,0.7)');
    vg.fillStyle = gr;
    vg.fillRect(0, 0, v.width, v.height);
    this.vignette = v;
  };

  // ------------------------------------------------------------ lifecycle
  resetWorld() {
    this.persons = [];
    this.custody = [];
    this.booked = [];
    this.bullets = [];
    this.parts = [];
    this.texts = [];
    this.skids = [];
    this.chalks = [];
    this.fading = [];
    this.panics = [];
    this.ncars = [];
    this.scene = 'city';
    const f = this.world.precinctFront;
    Object.assign(this.player, { x: f.x, y: f.y + 6, vx: 0, vy: 0, dir: Math.PI / 2, walk: 0, hp: 100, boost: 0, inv: 0, shootCd: 0, squash: 0, inCar: false });
    const cs = this.world.carSpawn;
    Object.assign(this.car, { x: cs.x, y: cs.y, vx: 0, vy: 0, angle: cs.angle, speed: 0, siren: false, crashCd: 0, hitCd: 0 });
    this.score = 0;
    this.scoreShown = 0;
    this.trust = 60;
    this.trustShown = 60;
    this.combo = 1;
    this.streak = 0;
    this.stats = emptyStats();
    this.elapsed = 0;
    this.priorityCd = 7;
    this.spawnCd = 1;
    this.armoryCd = this.coffeeCd = this.motorCd = this.recklessCd = 0;
    this.radioQ = [];
    this.radio = null;
    this.verdict = null;
    this.banner = null;
    this.curArea = null;
    this.focus = null;
    this.prompt = null;
    this.shake = this.hitstop = this.zoomPunch = this.flashA = 0;
    for (let i = 0; i < 60; i++) this.spawnPed(false);
    for (let i = 0; i < 24; i++) this.spawnCar();
    this.cam.x = this.player.x;
    this.cam.y = this.player.y;
    this.cam.zoom = this.baseZoom;
  }

  newGame() {
    sfx.init();
    sfx.stopLoops();
    this.resetWorld();
    this.mode = 'play';
    this.overSent = false;
    this.hint = 14;
    this.fadeA = 1;
    this.input.pressed.clear();
    this.input.keys.clear();
    this.ignorePauseUntil = performance.now() + 250;
    this.spawnIncident('jaywalk', 70, 240, false);
    this.spawnIncident('drunk', 110, 300, false);
    this.spawnIncident('tourist', 160, 420, false);
    this.radioMsg('DISPATCH: Evening, Officer. The city is yours tonight.', '#4fc3ff');
    this.spawnIncident('shoplift', 330, 620, true);
    for (let i = 0; i < 3; i++) this.spawnIncident(null, 500, 1500, false);
    this.cam.zoom = this.baseZoom * 1.6;
  }

  pause() {
    if (this.mode !== 'play') return;
    this.mode = 'paused';
    sfx.stopLoops();
    this.cb.onPause();
  }

  resume() {
    if (this.mode !== 'paused' && this.mode !== 'menu') return;
    this.mode = 'play';
    this.input.pressed.clear();
    this.ignorePauseUntil = performance.now() + 250;
    this.last = performance.now();
  }

  quitToTitle() {
    sfx.stopLoops();
    this.resetWorld();
    this.mode = 'attract';
  }

  // ------------------------------------------------------------ main loop
  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!(dt > 0)) dt = 1 / 60;
    dt = Math.min(dt, 1 / 30);
    if (this.input.consume('mute')) sfx.setMuted(!sfx.muted);
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      this.render();
      this.input.endFrame();
      return;
    }
    this.update(dt);
    this.render();
    this.input.endFrame();
  };

  private update(dt: number) {
    this.t += dt;
    switch (this.mode) {
      case 'play':
        this.updatePlay(dt);
        break;
      case 'attract':
        this.updatePersons(dt, true);
        this.updateTraffic(dt);
        this.updateFx(dt);
        this.cam.x = WORLD_PX / 2 + Math.cos(this.t * 0.045) * 760;
        this.cam.y = WORLD_PX / 2 + Math.sin(this.t * 0.06) * 640;
        this.cam.zoom = this.baseZoom * 0.95;
        break;
      case 'over': {
        const s = dt * 0.35;
        if (this.scene === 'city') {
          this.updatePersons(s, true);
          this.updateTraffic(s);
        }
        this.updateBullets(s);
        this.updateFx(s);
        this.cam.zoom += (this.baseZoom * 1.35 - this.cam.zoom) * (1 - Math.exp(-dt * 1.5));
        this.overT += dt;
        if (this.overT > 1.2 && !this.overSent) {
          this.overSent = true;
          this.cb.onGameOver({ ...this.stats });
        }
        break;
      }
      default:
        break;
    }
  }

  private updatePlay(dt: number) {
    const inp = this.input;
    if (inp.consume('pause') && performance.now() > this.ignorePauseUntil) {
      this.pause();
      return;
    }
    this.elapsed += dt;
    const P = this.player;
    P.inv -= dt;
    P.shootCd -= dt;
    P.boost = Math.max(0, P.boost - dt);
    P.squash = Math.max(0, P.squash - dt * 4);
    this.armoryCd -= dt;
    this.coffeeCd -= dt;
    this.motorCd -= dt;
    this.recklessCd -= dt;
    this.car.crashCd -= dt;
    this.car.hitCd -= dt;
    if (this.hint > 0) this.hint -= dt;

    if (this.scene === 'city') {
      this.updateCityPlayer(dt);
      this.updatePersons(dt, false);
      this.updateTraffic(dt);
      this.manageSpawns(dt);
      const a = areaAtPx(P.x, P.y);
      if (a !== this.curArea) {
        this.curArea = a;
        const info = AREA_INFO[a];
        this.banner = { title: info.name, tag: info.tag, color: info.color, life: 2.4 };
      }
    } else {
      this.updatePrecinctPlayer(dt);
    }
    this.updateBullets(dt);
    this.updateFx(dt);
    this.updateCamera(dt);

    // radio queue
    if (this.radio) {
      this.radio.life -= dt;
      if (this.radio.life <= 0) this.radio = null;
    }
    if (!this.radio && this.radioQ.length) {
      const r = this.radioQ.shift()!;
      this.radio = { ...r, life: 3.6 };
      sfx.radio();
    }

    // sounds
    if (P.inCar && this.scene === 'city') {
      sfx.setEngine(true, this.car.speed);
      sfx.setSiren(this.car.siren);
    } else sfx.stopLoops();

    // end conditions
    if (P.hp <= 0) this.gameOver('OFFICER DOWN', 'You took too many rounds out there.');
    else if (this.trust <= 0) this.gameOver('BADGE REVOKED', 'The public lost all trust in you.');
    else if (this.elapsed >= SHIFT) this.gameOver('SHIFT COMPLETE', 'You survived the night. Clock out, officer.');
  }

  private gameOver(reason: string, sub: string) {
    if (this.mode === 'over') return;
    if (reason === 'SHIFT COMPLETE') {
      const bonus = Math.round(this.trust * 15);
      this.score += bonus;
      this.stats.trustBonus = bonus;
    }
    this.mode = 'over';
    this.overT = 0;
    this.overSent = false;
    Object.assign(this.stats, { score: this.score, reason, sub, time: this.elapsed, trust: Math.round(this.trust) });
    sfx.stopLoops();
    sfx.gameOver();
    this.addShake(14);
    this.flash(reason === 'SHIFT COMPLETE' ? '#4fc3ff' : '#ff2040', 0.5);
  }

  // ------------------------------------------------------------ player
  private move(o: { x: number; y: number }, dx: number, dy: number, r: number, solid: (x: number, y: number) => boolean) {
    let hit = false;
    if (dx) {
      const nx = o.x + dx;
      if (!this.blocked(nx, o.y, r, solid)) o.x = nx;
      else hit = true;
    }
    if (dy) {
      const ny = o.y + dy;
      if (!this.blocked(o.x, ny, r, solid)) o.y = ny;
      else hit = true;
    }
    return hit;
  }

  private blocked(x: number, y: number, r: number, solid: (x: number, y: number) => boolean) {
    return solid(x - r, y - r) || solid(x + r, y - r) || solid(x - r, y + r) || solid(x + r, y + r);
  }

  private walkPlayer(dt: number, solid: (x: number, y: number) => boolean) {
    const P = this.player;
    const a = this.input.axis();
    const spd = 195 * (P.boost > 0 ? 1.5 : 1);
    const k = 1 - Math.exp(-dt * 16);
    P.vx += (a.x * spd - P.vx) * k;
    P.vy += (a.y * spd - P.vy) * k;
    this.move(P, P.vx * dt, P.vy * dt, 9, solid);
    const sp = Math.hypot(P.vx, P.vy);
    if (sp > 20) {
      P.dir = lerpAngle(P.dir, Math.atan2(P.vy, P.vx), 1 - Math.exp(-dt * 18));
      P.walk += dt * sp * 0.075;
      if (P.boost > 0 && Math.random() < 0.35) this.spawnP(P.x - P.vx * 0.05, P.y - P.vy * 0.05 + 6, 'dust', { size: 3, life: 0.4, color: '#c9b8ff' });
    }
  }

  private updateCityPlayer(dt: number) {
    const P = this.player;
    const inp = this.input;
    if (P.inCar) {
      this.driveCar(dt);
      P.x = this.car.x;
      P.y = this.car.y;
    } else {
      this.walkPlayer(dt, this.citySolid);
      this.coastCar(dt);
      // do not walk through NPC cars
      for (const c of this.ncars) {
        const dx = P.x - c.x;
        const dy = P.y - c.y;
        const r = c.kind === 'bus' ? 26 : 20;
        const d = Math.hypot(dx, dy);
        if (d < r && d > 0.01) this.move(P, (dx / d) * (r - d), (dy / d) * (r - d), 9, this.citySolid);
      }
    }

    // focus + prompts
    this.focus = null;
    this.prompt = null;
    let station: Station | null = null;
    let nearCar = false;
    if (!P.inCar) {
      let best = 64;
      for (const p of this.persons) {
        if (p.role !== 'inc') continue;
        const d = Math.hypot(p.x - P.x, p.y - P.y);
        if (d < best) {
          best = d;
          this.focus = p;
        }
      }
      for (const s of this.world.stations) if (Math.hypot(s.x - P.x, s.y - P.y) < 40) station = s;
      nearCar = Math.hypot(this.car.x - P.x, this.car.y - P.y) < 50;
      if (station) this.prompt = `METRO · ${station.name}`;
      else if (nearCar) this.prompt = 'DRIVE CRUISER';
    } else {
      this.prompt = 'EXIT CAR';
    }

    if (this.focus) {
      for (const a of ACTIONS) if (inp.consume('act_' + a)) {
        if (this.focus && this.focus.inc) this.resolve(this.focus, a);
      }
    }
    if (inp.consume('use')) {
      if (P.inCar) this.exitCar();
      else if (station) this.openTransit(station);
      else if (nearCar) this.enterCar();
    }
    if (P.inCar) {
      if (inp.consume('shoot') || inp.consume('siren')) {
        this.car.siren = !this.car.siren;
        sfx.blip();
        this.text(this.car.x, this.car.y - 30, this.car.siren ? 'SIREN ON' : 'SIREN OFF', this.car.siren ? '#ff4d6d' : '#8899bb', 13);
      }
    } else {
      const wants = inp.consume('shoot') || inp.keys.has('Space') || inp.keys.has('KeyF') || inp.held('shoot');
      if (wants) this.playerShoot();
    }

    // precinct door
    const dr = this.world.doorRect;
    if (!P.inCar && P.x > dr.x0 && P.x < dr.x1 && P.y < dr.y && P.vy < 0) this.enterPrecinct();
  }

  private playerShoot() {
    const P = this.player;
    if (P.shootCd > 0) return;
    P.shootCd = 0.26;
    let ang = P.dir;
    let best = 470;
    let tgt: Person | null = null;
    for (const p of this.persons) {
      if (p.role !== 'inc' || !p.inc || p.inc.state !== 'hostile') continue;
      const d = Math.hypot(p.x - P.x, p.y - P.y);
      if (d < best) {
        best = d;
        tgt = p;
      }
    }
    if (tgt) ang = Math.atan2(tgt.y - P.y, tgt.x - P.x);
    P.dir = ang;
    this.fire(P.x, P.y, ang, 'p');
  }

  private fire(x: number, y: number, ang: number, from: 'p' | 'e') {
    const sp = from === 'p' ? 1050 : 430;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    this.bullets.push({ x: x + c * 16, y: y + s * 16, vx: c * sp, vy: s * sp, life: from === 'p' ? 0.55 : 1.3, from });
    this.spawnP(x + c * 20, y + s * 20, 'flash', { size: from === 'p' ? 18 : 14, life: 0.07, color: '#fff3b0' });
    for (let i = 0; i < 4; i++) {
      const a = ang + rand(-0.5, 0.5);
      this.spawnP(x + c * 18, y + s * 18, 'spark', { vx: Math.cos(a) * rand(150, 380), vy: Math.sin(a) * rand(150, 380), life: 0.18, color: '#ffcc55', size: 2 });
    }
    this.spawnP(x, y, 'shell', { vx: -s * rand(60, 120), vy: c * rand(60, 120), life: 0.5, color: '#e0b04a', size: 3, vr: 20, drag: 5 });
    if (from === 'p') {
      sfx.shoot();
      this.addShake(3.5);
      this.player.squash = 0.5;
    } else sfx.enemyShot();
    this.panics.push({ x, y, life: 2.5, r: 280 });
  }

  // ------------------------------------------------------------ car
  private carBlocked(x: number, y: number, a: number) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    for (const [lx, ly] of [
      [20, 9],
      [20, -9],
      [-20, 9],
      [-20, -9],
      [0, 10],
      [0, -10],
    ]) {
      if (this.world.solidPx(x + c * lx - s * ly, y + s * lx + c * ly)) return true;
    }
    return false;
  }

  private driveCar(dt: number) {
    const c = this.car;
    const a = this.input.axis();
    let throttle = 0;
    let steer = 0;
    if (a.joy) {
      const m = Math.hypot(a.x, a.y);
      if (m > 0.15) {
        const target = Math.atan2(a.y, a.x);
        const d = angDiff(c.angle, target);
        if (Math.abs(d) > 2.4 && c.speed < 60) {
          throttle = -m;
          steer = -Math.sign(d);
        } else {
          throttle = m * (Math.abs(d) > 1.3 ? 0.35 : 1);
          steer = clamp(d * 2.2, -1, 1);
        }
      }
    } else {
      throttle = -a.y;
      steer = a.x;
    }
    if (throttle > 0) c.speed += (c.speed < 0 ? 900 : 560) * throttle * dt;
    else if (throttle < 0) c.speed += (c.speed > 0 ? 950 : 380) * throttle * dt;
    else c.speed *= Math.exp(-dt * 1.4);
    c.speed = clamp(c.speed, -190, 470);
    const prevA = c.angle;
    const rate = 2.9 * clamp(Math.abs(c.speed) / 130, 0, 1) * (c.speed < 0 ? -1 : 1);
    c.angle += steer * rate * dt;
    if (this.carBlocked(c.x, c.y, c.angle)) c.angle = prevA;
    const drifting = Math.abs(steer) > 0.5 && Math.abs(c.speed) > 280;
    this.integrateCar(dt, drifting ? 3.2 : 8);

    // skids + smoke
    const lat = Math.abs(-Math.sin(c.angle) * c.vx + Math.cos(c.angle) * c.vy);
    if (lat > 70 && Math.abs(c.speed) > 120) {
      const co = Math.cos(c.angle);
      const si = Math.sin(c.angle);
      for (const sy of [-8, 8]) {
        const x = c.x - co * 16 - si * sy;
        const y = c.y - si * 16 + co * sy;
        this.skids.push({ x, y, a: 1 });
        if (Math.random() < 0.25) this.spawnP(x, y, 'smoke', { size: 5, life: 0.7, color: '#9aa3c0', vx: rand(-20, 20), vy: rand(-20, 20) });
      }
      if (this.skids.length > 600) this.skids.splice(0, this.skids.length - 600);
    }

    // hit people
    const sp = Math.abs(c.speed);
    if (sp > 50) {
      for (const p of this.persons) {
        if (p.role !== 'ped' && p.role !== 'inc' && p.role !== 'leave') continue;
        const dx = p.x - c.x;
        const dy = p.y - c.y;
        const d = Math.hypot(dx, dy);
        if (d > 21 || d < 0.01) continue;
        if (sp > 250) {
          let o: Outcome;
          let pr = false;
          if (p.role === 'inc' && p.inc) {
            o = p.inc.def.outcomes.shoot;
            pr = p.inc.priority;
            this.fadeProp(p.inc);
            this.stats.kills++;
          } else {
            o = PED_HIT;
            this.stats.innocents++;
          }
          p.role = 'down';
          p.inc = null;
          p.fall = 0;
          p.life = 5;
          p.kx = c.vx * 0.7;
          p.ky = c.vy * 0.7;
          p.dir = Math.atan2(c.vy, c.vx);
          this.hitstop = 0.06;
          this.addShake(10);
          sfx.crash(0.8);
          this.burst(p.x, p.y, 'star', 6, '#ffd84d', 180);
          c.speed *= 0.6;
          this.applyOutcome(o, p.x, p.y, pr);
        } else {
          p.kx = (dx / d) * 300;
          p.ky = (dy / d) * 300;
          if (p.role === 'inc' && p.inc && p.inc.state === 'flee' && p.inc.active && p.stun <= 0) {
            p.stun = 2.8;
            this.text(p.x, p.y - 30, 'TACKLED!', '#4fc3ff', 18);
            this.burst(p.x, p.y, 'star', 6, '#ffd84d', 120);
            sfx.hit();
          }
          c.speed *= 0.85;
          this.addShake(2);
        }
      }
    }

    // NPC cars
    for (const n of this.ncars) {
      const dx = c.x - n.x;
      const dy = c.y - n.y;
      const r = n.kind === 'bus' ? 42 : 32;
      const d = Math.hypot(dx, dy);
      if (d < r && d > 0.01) {
        const nx = dx / d;
        const ny = dy / d;
        const impact = Math.hypot(c.vx, c.vy);
        if (!this.carBlocked(c.x + nx * (r - d), c.y + ny * (r - d), c.angle)) {
          c.x += nx * (r - d);
          c.y += ny * (r - d);
        }
        c.vx = nx * impact * 0.4;
        c.vy = ny * impact * 0.4;
        c.speed *= -0.25;
        n.bump = 1.5;
        if (impact > 70 && c.crashCd <= 0) {
          c.crashCd = 0.3;
          sfx.crash(Math.min(1, impact / 400));
          this.addShake(Math.min(14, impact / 28));
          this.burst(c.x - nx * 16, c.y - ny * 16, 'spark', 12, '#ffcc55', 300);
          if (impact > 280 && this.recklessCd <= 0) {
            this.recklessCd = 2;
            this.trust = Math.max(0, this.trust - 2);
            this.text(c.x, c.y - 34, 'RECKLESS DRIVING  TRUST -2', '#ff4d6d', 14);
          }
        }
      }
    }
  }

  private integrateCar(dt: number, grip: number) {
    const c = this.car;
    const fx = Math.cos(c.angle) * c.speed;
    const fy = Math.sin(c.angle) * c.speed;
    const k = Math.min(1, grip * dt);
    c.vx += (fx - c.vx) * k;
    c.vy += (fy - c.vy) * k;
    const hitX = this.carBlocked(c.x + c.vx * dt, c.y, c.angle);
    if (!hitX) c.x += c.vx * dt;
    const hitY = this.carBlocked(c.x, c.y + c.vy * dt, c.angle);
    if (!hitY) c.y += c.vy * dt;
    if (hitX || hitY) {
      const impact = Math.hypot(c.vx, c.vy);
      if (hitX) c.vx *= -0.35;
      if (hitY) c.vy *= -0.35;
      c.speed *= -0.3;
      if (impact > 90 && c.crashCd <= 0 && this.player.inCar) {
        c.crashCd = 0.25;
        sfx.crash(Math.min(1, impact / 420));
        this.addShake(Math.min(14, impact / 30));
        const fx2 = c.x + Math.cos(c.angle) * 22;
        const fy2 = c.y + Math.sin(c.angle) * 22;
        this.burst(fx2, fy2, 'spark', 10, '#ffcc55', 260);
        this.burst(fx2, fy2, 'smoke', 3, '#8890aa', 40);
      }
    }
  }

  private coastCar(dt: number) {
    const c = this.car;
    c.speed *= Math.exp(-dt * 3);
    if (Math.abs(c.speed) > 1 || Math.abs(c.vx) + Math.abs(c.vy) > 1) this.integrateCar(dt, 8);
    c.siren = false;
  }

  private enterCar() {
    this.player.inCar = true;
    sfx.init();
    sfx.door();
    this.car.speed = 0;
    this.burst(this.car.x, this.car.y, 'ring', 1, '#4fc3ff', 0);
    this.text(this.car.x, this.car.y - 30, 'BUCKLE UP', '#4fc3ff', 14);
  }

  private exitCar() {
    const c = this.car;
    const P = this.player;
    const co = Math.cos(c.angle);
    const si = Math.sin(c.angle);
    const spots = [
      [-si * 28, co * 28],
      [si * 28, -co * 28],
      [-co * 34, -si * 34],
      [co * 34, si * 34],
    ];
    for (const [ox, oy] of spots) {
      if (!this.blocked(c.x + ox, c.y + oy, 9, this.citySolid)) {
        P.x = c.x + ox;
        P.y = c.y + oy;
        P.inCar = false;
        P.vx = P.vy = 0;
        c.siren = false;
        sfx.door();
        for (const f of this.custody) {
          f.x = P.x + rand(-10, 10);
          f.y = P.y + rand(-10, 10);
        }
        return;
      }
    }
    this.text(c.x, c.y - 30, 'NO ROOM TO EXIT', '#ff4d6d', 13);
  }

  // ------------------------------------------------------------ precinct
  private enterPrecinct() {
    this.cityPos = { x: this.player.x, y: this.player.y };
    this.scene = 'precinct';
    const s = this.precinct.spawn;
    this.player.x = s.x;
    this.player.y = s.y;
    this.player.vx = this.player.vy = 0;
    this.player.dir = -Math.PI / 2;
    this.bullets = [];
    this.fadeA = 1;
    this.focus = null;
    sfx.door();
    for (const f of this.custody) {
      f.x = s.x + rand(-12, 12);
      f.y = s.y + 20;
    }
    this.banner = { title: 'PRECINCT 9', tag: 'Book suspects · Heal · Coffee', color: '#4fc3ff', life: 2 };
    this.cam.x = s.x;
    this.cam.y = s.y;
  }

  private exitPrecinct() {
    this.scene = 'city';
    const f = this.world.precinctFront;
    this.player.x = f.x;
    this.player.y = f.y + 8;
    this.player.vx = this.player.vy = 0;
    this.player.dir = Math.PI / 2;
    this.fadeA = 1;
    sfx.door();
    for (const c of this.custody) {
      c.x = f.x + rand(-10, 10);
      c.y = f.y;
    }
    this.cam.x = this.player.x;
    this.cam.y = this.player.y;
    this.curArea = areaAtPx(f.x, f.y);
  }

  private updatePrecinctPlayer(dt: number) {
    const P = this.player;
    this.walkPlayer(dt, this.precSolid);
    for (const c of this.custody) this.updateCuffed(c, dt);
    this.focus = null;
    this.prompt = null;
    let obj: PObj | null = null;
    for (const o of this.precinct.objs) if (Math.hypot(o.x - P.x, o.y - P.y) < 46) obj = o;
    if (obj) this.prompt = obj.label;
    if (this.input.consume('use') && obj) this.usePrecinct(obj);
    if (this.input.consume('shoot')) this.text(P.x, P.y - 30, 'Holster it, officer.', '#8899bb', 13);
    if (P.y > (PH - 1) * T + 2) this.exitPrecinct();
  }

  private usePrecinct(o: PObj) {
    const P = this.player;
    switch (o.id) {
      case 'book': {
        const n = this.custody.length;
        if (!n) {
          this.text(o.x, o.y - 30, 'No suspects in custody', '#8899bb', 14);
          sfx.blip();
          return;
        }
        const pts = Math.round(200 * n * (1 + (n - 1) * 0.25) * this.combo);
        this.score += pts;
        this.trust = Math.min(100, this.trust + 2 * n);
        this.stats.booked += n;
        const ca = this.precinct.cellArea;
        for (const c of this.custody) {
          this.booked.push({ x: ca.x + rand(14, ca.w - 14), y: ca.y + rand(14, ca.h - 14), look: c.look, dir: rand(0, TAU) });
          this.burst(c.x, c.y, 'ring', 1, '#4fc3ff', 0);
        }
        if (this.booked.length > 14) this.booked.splice(0, this.booked.length - 14);
        this.persons = this.persons.filter((p) => !this.custody.includes(p));
        this.custody = [];
        this.burst(o.x, o.y - 20, 'conf', 40, '', 260);
        this.burst(o.x, o.y - 20, 'coin', 10, '#ffd84d', 200);
        sfx.coin(6);
        sfx.cuff();
        this.zoomPunch = 1;
        this.addShake(5);
        this.scorePop = 1;
        this.verdict = { text: `BOOKED ${n} SUSPECT${n > 1 ? 'S' : ''}`, sub: `+${pts}  ·  TRUST +${2 * n}`, color: '#4fc3ff', life: 1.8 };
        this.text(o.x, o.y - 40, `+${pts}`, '#ffd84d', 24);
        break;
      }
      case 'armory':
        if (this.armoryCd > 0) {
          this.text(o.x, o.y - 30, `Restocking… ${Math.ceil(this.armoryCd)}s`, '#8899bb', 14);
          sfx.blip();
          return;
        }
        this.armoryCd = 45;
        P.hp = 100;
        sfx.powerup();
        this.burst(P.x, P.y, 'plus', 12, '#5cff9d', 120);
        this.text(P.x, P.y - 30, 'HEALTH RESTORED', '#5cff9d', 16);
        break;
      case 'coffee':
        if (this.coffeeCd > 0) {
          this.text(o.x, o.y - 30, `Brewing… ${Math.ceil(this.coffeeCd)}s`, '#8899bb', 14);
          sfx.blip();
          return;
        }
        this.coffeeCd = 35;
        P.boost = 22;
        sfx.powerup();
        this.burst(P.x, P.y, 'smoke', 8, '#d9b38c', 60);
        this.text(P.x, P.y - 30, '☕ SPEED BOOST!', '#ffb347', 16);
        break;
      case 'motor':
        if (this.motorCd > 0) {
          this.text(o.x, o.y - 30, `Motor pool busy ${Math.ceil(this.motorCd)}s`, '#8899bb', 14);
          return;
        }
        this.motorCd = 15;
        Object.assign(this.car, { x: this.world.carSpawn.x, y: this.world.carSpawn.y, angle: 0, speed: 0, vx: 0, vy: 0 });
        sfx.powerup();
        this.text(P.x, P.y - 30, 'Cruiser waiting out front', '#4fc3ff', 15);
        break;
    }
  }

  // ------------------------------------------------------------ transit
  private openTransit(s: Station) {
    this.mode = 'menu';
    sfx.stopLoops();
    sfx.blip();
    this.cb.onTransit(this.world.stations, s.id);
  }

  travelTo(id: number) {
    const s = this.world.stations[id];
    if (!s) return this.resume();
    const P = this.player;
    P.x = s.x + 30;
    P.y = s.y;
    P.vx = P.vy = 0;
    for (const c of this.custody) {
      c.x = P.x + rand(-10, 10);
      c.y = P.y + rand(-10, 10);
    }
    this.cam.x = P.x;
    this.cam.y = P.y;
    this.fadeA = 1;
    this.stats.rides++;
    sfx.whoosh();
    this.bullets = [];
    this.resume();
  }

  // ------------------------------------------------------------ spawning
  private makePerson(x: number, y: number, role: Role): Person {
    return {
      id: this.nextId++,
      x,
      y,
      dir: rand(0, TAU),
      walk: rand(0, 6),
      look: randLook(),
      role,
      inc: null,
      wt: 0,
      wdx: 0,
      wdy: 0,
      speed: rand(34, 58),
      stun: 0,
      fall: 0,
      life: 0,
      mood: '',
      flash: 0,
      kx: 0,
      ky: 0,
      small: false,
    };
  }

  private spawnPed(far: boolean) {
    const P = this.player;
    for (let i = 0; i < 30; i++) {
      const pos = this.world.randomTile((t) => t === TL.Side || t === TL.Plaza || t === TL.Park || t === TL.Dock || t === TL.Lawn);
      if (far && Math.hypot(pos.x - P.x, pos.y - P.y) < 700) continue;
      this.persons.push(this.makePerson(pos.x + rand(-8, 8), pos.y + rand(-8, 8), 'ped'));
      return;
    }
  }

  private spawnCar() {
    const ni = Math.floor(Math.random() * (NB + 1));
    const nj = Math.floor(Math.random() * (NB + 1));
    const dirs = this.validDirs(ni, nj);
    const dir = pick(dirs);
    const r = Math.random();
    const kind: NCar['kind'] = r < 0.1 ? 'bus' : r < 0.3 ? 'taxi' : 'car';
    const max = kind === 'bus' ? 110 : rand(130, 190);
    const c: NCar = {
      ni,
      nj,
      dir,
      t: rand(40, SEG - 40),
      speed: max,
      max,
      x: 0,
      y: 0,
      angle: Math.atan2(DIRS[dir][1], DIRS[dir][0]),
      color: kind === 'taxi' ? '#f2c230' : kind === 'bus' ? '#2f7de1' : pick(CAR_COLORS),
      kind,
      bump: 0,
      honk: 0,
      wait: 0,
    };
    const p = this.carTarget(c);
    c.x = p.x;
    c.y = p.y;
    this.ncars.push(c);
  }

  private validDirs(i: number, j: number) {
    const out: number[] = [];
    for (let d = 0; d < 4; d++) {
      const ni = i + DIRS[d][0];
      const nj = j + DIRS[d][1];
      if (ni >= 0 && nj >= 0 && ni <= NB && nj <= NB) out.push(d);
    }
    return out;
  }

  private carTarget(c: NCar) {
    const [dx, dy] = DIRS[c.dir];
    return { x: roadNode(c.ni) + dx * c.t - dy * 16, y: roadNode(c.nj) + dy * c.t + dx * 16 };
  }

  private spawnIncident(defId: string | null, minD: number, maxD: number, priority: boolean): Person | null {
    let def: IncidentDef | undefined;
    if (defId) def = INCIDENTS.find((d) => d.id === defId);
    else {
      const pool = INCIDENTS.filter((d) => (d.minTime ?? 0) <= this.elapsed && (!priority || d.urgent));
      const hostileBoost = 1 + this.elapsed / 150;
      const tot = pool.reduce((s, d) => s + d.weight * (d.behavior === 'hostile' ? hostileBoost : 1), 0);
      let r = Math.random() * tot;
      for (const d of pool) {
        r -= d.weight * (d.behavior === 'hostile' ? hostileBoost : 1);
        if (r <= 0) {
          def = d;
          break;
        }
      }
      def = def || pool[0];
    }
    if (!def) return null;
    const spot = this.findSpot(def, minD, maxD);
    if (!spot) return null;
    const p = this.makePerson(spot.x, spot.y, 'inc');
    const timer = priority ? 50 : def.urgent ? 65 : 85;
    p.inc = { def, timer, max: timer, state: def.behavior, active: false, priority, fleeT: 0, shootCd: 1.3, prop: null, ox: spot.x, oy: spot.y };
    if (def.id === 'cat') {
      p.small = true;
      p.look = { ...p.look, shirt: pick(['#ff7ab6', '#7ad0ff', '#ffe066']) };
    }
    if (def.behavior === 'hostile') p.look = { ...p.look, shirt: '#1a1a22', pants: '#101014' };
    if (def.behavior === 'flee') p.look = { ...p.look, shirt: pick(['#3a3a48', '#4a2a2a', '#2a3a2a']) };
    if (def.behavior === 'road') {
      const vRoad = spot.tx % BLOCK <= 1;
      if (vRoad) p.wdx = Math.random() < 0.5 ? 1 : -1;
      else p.wdy = Math.random() < 0.5 ? 1 : -1;
    }
    if (def.prop) {
      const prop: Prop = { kind: def.prop, x: spot.x + 26, y: spot.y, angle: 0, color: pick(CAR_COLORS), alpha: 1 };
      if (def.prop === 'car') {
        for (const [ox, oy] of [
          [0, 1],
          [0, -1],
          [1, 0],
          [-1, 0],
        ]) {
          if (this.world.get(spot.tx + ox, spot.ty + oy) === TL.Road) {
            prop.x = (spot.tx + ox + 0.5) * T;
            prop.y = (spot.ty + oy + 0.5) * T;
            prop.angle = oy !== 0 ? 0 : Math.PI / 2;
            break;
          }
        }
      } else if (def.prop === 'graffiti') {
        prop.x = spot.x;
        prop.y = spot.y - 18;
      }
      p.inc.prop = prop;
    }
    this.persons.push(p);
    if (priority) {
      const area = AREA_INFO[areaAtPx(spot.x, spot.y)].name;
      this.radioMsg(`PRIORITY · ${def.radio} · ${area}`, '#ffd84d');
    }
    return p;
  }

  private findSpot(def: IncidentDef, minD: number, maxD: number) {
    const P = this.scene === 'city' ? this.player : this.cityPos;
    for (let tries = 0; tries < 160; tries++) {
      const tx = Math.floor(Math.random() * MW);
      const ty = Math.floor(Math.random() * MH);
      const t = this.world.get(tx, ty);
      if (def.behavior === 'road') {
        if (t !== TL.Road) continue;
        const lx = tx % BLOCK;
        const ly = ty % BLOCK;
        const h = ly <= 1;
        const v = lx <= 1;
        if (h === v) continue;
        if (h && (lx < 3 || lx > 10)) continue;
        if (v && (ly < 3 || ly > 10)) continue;
      } else if (!(t === TL.Side || t === TL.Plaza || t === TL.Park || t === TL.Lawn || t === TL.Dock || t === TL.Lot)) continue;
      const x = (tx + 0.5) * T;
      const y = (ty + 0.5) * T;
      if (def.areas && !def.areas.includes(areaAtPx(x, y))) continue;
      const d = Math.hypot(x - P.x, y - P.y);
      if (tries < 120 && (d < minD || d > maxD)) continue;
      if (d < 60) continue;
      let crowded = false;
      for (const p of this.persons) if (p.role === 'inc' && Math.abs(p.x - x) < 130 && Math.abs(p.y - y) < 130) crowded = true;
      if (crowded && tries < 140) continue;
      return { x, y, tx, ty };
    }
    return null;
  }

  private manageSpawns(dt: number) {
    let n = 0;
    let peds = 0;
    let hasPri = false;
    for (const p of this.persons) {
      if (p.role === 'inc') {
        n++;
        if (p.inc && p.inc.priority) hasPri = true;
      } else if (p.role === 'ped') peds++;
    }
    const target = Math.min(12, 7 + Math.floor(this.elapsed / 50));
    this.spawnCd -= dt;
    if (n < target && this.spawnCd <= 0) {
      this.spawnIncident(null, 380, 1500, false);
      this.spawnCd = 2.2;
    }
    this.priorityCd -= dt;
    if (!hasPri && this.priorityCd <= 0) {
      this.spawnIncident(null, 450, 1500, true);
      this.priorityCd = 5;
    }
    if (peds < 55) this.spawnPed(true);
  }

  // ------------------------------------------------------------ NPC updates
  private tryMove(p: Person, ang: number, spd: number, dt: number) {
    for (const off of [0, 0.7, -0.7, 1.5, -1.5, 2.3, -2.3]) {
      const a = ang + off;
      const mx = Math.cos(a) * spd * dt;
      const my = Math.sin(a) * spd * dt;
      if (!this.blocked(p.x + Math.cos(a) * 14, p.y + Math.sin(a) * 14, 8, this.citySolid)) {
        p.x += mx;
        p.y += my;
        p.dir = lerpAngle(p.dir, a, 0.3);
        p.walk += dt * spd * 0.08;
        return true;
      }
    }
    return false;
  }

  private updatePersons(dt: number, ambient: boolean) {
    for (let i = this.persons.length - 1; i >= 0; i--) {
      const p = this.persons[i];
      if (p.flash > 0) p.flash -= dt;
      if (p.stun > 0) p.stun -= dt;
      if (Math.abs(p.kx) + Math.abs(p.ky) > 2) {
        this.move(p, p.kx * dt, p.ky * dt, 7, this.citySolid);
        const f = Math.exp(-dt * 6);
        p.kx *= f;
        p.ky *= f;
      }
      switch (p.role) {
        case 'ped':
          this.updatePed(p, dt);
          break;
        case 'inc':
          if (!ambient) this.updateInc(p, dt);
          break;
        case 'cuffed':
          this.updateCuffed(p, dt);
          break;
        case 'leave':
          p.life -= dt;
          if (p.wdx || p.wdy) {
            if (!this.move(p, p.wdx * 60 * dt, p.wdy * 60 * dt, 7, this.citySolid)) p.walk += dt * 5;
            else {
              const a = rand(0, TAU);
              p.wdx = Math.cos(a);
              p.wdy = Math.sin(a);
            }
            p.dir = Math.atan2(p.wdy, p.wdx);
          }
          if (p.life <= 0) this.persons.splice(i, 1);
          break;
        case 'down':
          p.fall = Math.min(1, p.fall + dt * 5);
          p.life -= dt;
          if (p.life <= 0) {
            this.chalks.push({ x: p.x, y: p.y, dir: p.dir, life: 40 });
            if (this.chalks.length > 20) this.chalks.shift();
            this.persons.splice(i, 1);
          }
          break;
      }
    }
    for (let i = this.panics.length - 1; i >= 0; i--) {
      this.panics[i].life -= dt;
      if (this.panics[i].life <= 0) this.panics.splice(i, 1);
    }
  }

  private updatePed(p: Person, dt: number) {
    for (const pa of this.panics) {
      const dx = p.x - pa.x;
      const dy = p.y - pa.y;
      if (dx * dx + dy * dy < pa.r * pa.r) {
        this.tryMove(p, Math.atan2(dy, dx), 125, dt);
        return;
      }
    }
    p.wt -= dt;
    if (p.wt <= 0) {
      if (Math.random() < 0.18) {
        p.wdx = p.wdy = 0;
      } else {
        const d = pick(DIRS);
        p.wdx = d[0];
        p.wdy = d[1];
      }
      p.wt = rand(1.5, 4.5);
    }
    if (p.wdx || p.wdy) {
      const nx = p.x + p.wdx * p.speed * dt;
      const ny = p.y + p.wdy * p.speed * dt;
      const ax = nx + p.wdx * 10;
      const ay = ny + p.wdy * 10;
      const ok = this.world.pedWalkPx(p.x, p.y) ? this.world.pedWalkPx(ax, ay) : !this.world.solidPx(ax, ay);
      if (ok) {
        p.x = nx;
        p.y = ny;
        p.dir = lerpAngle(p.dir, Math.atan2(p.wdy, p.wdx), 0.25);
        p.walk += dt * p.speed * 0.08;
      } else p.wt = 0;
    }
  }

  private updateInc(p: Person, dt: number) {
    const inc = p.inc!;
    const P = this.player;
    const dx = P.x - p.x;
    const dy = P.y - p.y;
    const d = Math.hypot(dx, dy);
    const toP = Math.atan2(dy, dx);
    if (!inc.active) inc.timer -= dt;
    if (inc.timer <= 0) {
      if (inc.priority) {
        this.applyOutcome({ pts: 0, trust: -6, text: 'Priority call missed!' }, P.x, P.y, false);
        this.priorityCd = 4;
      }
      this.fadeProp(inc);
      p.inc = null;
      p.role = 'leave';
      p.life = 3;
      const a = rand(0, TAU);
      p.wdx = Math.cos(a);
      p.wdy = Math.sin(a);
      return;
    }
    if (p.stun > 0) return;
    switch (inc.state) {
      case 'idle':
        if (d < 220) p.dir = lerpAngle(p.dir, toP, 1 - Math.exp(-dt * 6));
        break;
      case 'wander': {
        p.wt -= dt;
        if (p.wt <= 0) {
          const a = rand(0, TAU);
          p.wdx = Math.cos(a);
          p.wdy = Math.sin(a);
          p.wt = rand(1, 2.5);
        }
        if (Math.hypot(p.x - inc.ox, p.y - inc.oy) > 50) {
          const a = Math.atan2(inc.oy - p.y, inc.ox - p.x);
          p.wdx = Math.cos(a);
          p.wdy = Math.sin(a);
        }
        this.move(p, p.wdx * 28 * dt, p.wdy * 28 * dt, 7, this.citySolid);
        p.dir = Math.atan2(p.wdy, p.wdx) + Math.sin(this.t * 3 + p.id) * 0.5;
        p.walk += dt * 3;
        break;
      }
      case 'road': {
        const ax = p.x + p.wdx * 16;
        const ay = p.y + p.wdy * 16;
        if (!this.world.isRoadPx(ax, ay)) {
          p.wdx *= -1;
          p.wdy *= -1;
        } else {
          p.x += p.wdx * 36 * dt;
          p.y += p.wdy * 36 * dt;
        }
        p.dir = Math.atan2(p.wdy, p.wdx);
        p.walk += dt * 4;
        break;
      }
      case 'flee': {
        const trig = P.inCar ? 230 : 150;
        if (!inc.active && d < trig && this.scene === 'city') {
          inc.active = true;
          this.text(p.x, p.y - 34, '!', '#ff4d6d', 30);
          this.text(P.x, P.y - 34, 'STOP! POLICE!', '#4fc3ff', 14);
        }
        if (inc.active) {
          inc.fleeT += dt;
          const away = toP + Math.PI + Math.sin(this.t * 2 + p.id) * 0.5;
          const spd = inc.fleeT < 7 ? 168 : 108;
          this.tryMove(p, away, spd, dt);
          if (inc.fleeT > 7 && Math.random() < dt * 2) this.spawnP(p.x, p.y - 10, 'drop', { color: '#9fd3ff', size: 2, life: 0.4, vy: -30 });
          if (d > 900) {
            this.applyOutcome({ pts: 0, trust: -3, text: 'Suspect escaped!' }, P.x, P.y, false);
            if (inc.priority) this.priorityCd = 4;
            this.fadeProp(inc);
            p.inc = null;
            p.role = 'leave';
            p.life = 0;
          }
        }
        break;
      }
      case 'hostile': {
        if (!inc.active && d < 430 && this.scene === 'city') {
          inc.active = true;
          this.text(p.x, p.y - 34, 'DROP THE WEAPON!', '#ff4d6d', 15);
        }
        if (inc.active) {
          p.dir = toP;
          const want = d > 260 ? 1 : d < 150 ? -1 : 0;
          const str = Math.sin(this.t * 1.3 + p.id) * 70;
          const mx = Math.cos(toP) * want * 85 + Math.cos(toP + Math.PI / 2) * str;
          const my = Math.sin(toP) * want * 85 + Math.sin(toP + Math.PI / 2) * str;
          this.move(p, mx * dt, my * dt, 8, this.citySolid);
          p.walk += dt * 6;
          inc.shootCd -= dt;
          if (inc.shootCd <= 0 && d < 420) {
            const spread = P.inCar ? 0.18 : 0.12;
            this.fire(p.x, p.y, toP + rand(-spread, spread), 'e');
            inc.shootCd = rand(0.9, 1.5) - Math.min(0.35, this.elapsed / 700);
            if (inc.def.id === 'gang') inc.shootCd *= 0.7;
          }
        }
        break;
      }
    }
  }

  private updateCuffed(p: Person, dt: number) {
    const idx = this.custody.indexOf(p);
    if (idx < 0) {
      p.role = 'leave';
      p.life = 2;
      return;
    }
    if (this.player.inCar) {
      p.x = this.car.x;
      p.y = this.car.y;
      return;
    }
    const lead = idx === 0 ? this.player : this.custody[idx - 1];
    const dx = lead.x - p.x;
    const dy = lead.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d > 22) {
      const sp = Math.min(280, (d - 18) * 7);
      p.x += (dx / d) * sp * dt;
      p.y += (dy / d) * sp * dt;
      p.dir = Math.atan2(dy, dx);
      p.walk += dt * sp * 0.08;
    }
  }

  private updateTraffic(dt: number) {
    const P = this.player;
    const walking = !P.inCar && this.scene === 'city';
    for (const c of this.ncars) {
      const [dx, dy] = DIRS[c.dir];
      const look = c.kind === 'bus' ? 52 : 38;
      const lx = c.x + dx * look;
      const ly = c.y + dy * look;
      let blocked = c.bump > 0;
      if (c.bump > 0) c.bump -= dt;
      if (!blocked && walking && Math.abs(P.x - lx) < 24 && Math.abs(P.y - ly) < 24) blocked = true;
      if (!blocked && Math.abs(this.car.x - lx) < 34 && Math.abs(this.car.y - ly) < 34) {
        blocked = true;
        if (P.inCar && c.honk <= 0 && Math.random() < 0.02) {
          c.honk = 4;
          sfx.horn();
          this.text(c.x, c.y - 24, 'HONK!', '#ffd84d', 12);
        }
      }
      if (!blocked && c.wait >= 0) {
        let carBlock = false;
        for (const o of this.ncars) {
          if (o === c) continue;
          if (Math.abs(o.x - lx) < 26 && Math.abs(o.y - ly) < 26) {
            carBlock = true;
            break;
          }
        }
        if (carBlock) {
          blocked = true;
          c.wait += dt;
          if (c.wait > 2.5) c.wait = -1.2; // break gridlock: ghost through briefly
        } else c.wait = 0;
      } else if (c.wait < 0) c.wait = Math.min(0, c.wait + dt);
      if (!blocked)
        for (const p of this.persons) {
          if (Math.abs(p.x - lx) < 18 && Math.abs(p.y - ly) < 18 && p.role !== 'cuffed') {
            blocked = true;
            break;
          }
        }
      c.honk -= dt;
      const target = blocked ? 0 : c.max;
      c.speed += (target - c.speed) * (1 - Math.exp(-dt * (blocked ? 9 : 2)));
      c.t += c.speed * dt;
      if (c.t >= SEG) {
        c.t -= SEG;
        c.ni += dx;
        c.nj += dy;
        const opts = this.validDirs(c.ni, c.nj).filter((d) => d !== (c.dir + 2) % 4);
        const straight = opts.includes(c.dir) && Math.random() < 0.55;
        c.dir = straight ? c.dir : pick(opts.length ? opts : [(c.dir + 2) % 4]);
      }
      const tp = this.carTarget(c);
      const k = 1 - Math.exp(-dt * 10);
      c.x += (tp.x - c.x) * k;
      c.y += (tp.y - c.y) * k;
      const ta = Math.atan2(DIRS[c.dir][1], DIRS[c.dir][0]);
      c.angle = lerpAngle(c.angle, ta, 1 - Math.exp(-dt * 8));
    }
  }

  private updateBullets(dt: number) {
    const P = this.player;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.life -= dt;
      let dead = b.life <= 0;
      const steps = Math.max(1, Math.ceil((Math.hypot(b.vx, b.vy) * dt) / 8));
      for (let s = 0; s < steps && !dead; s++) {
        b.x += (b.vx * dt) / steps;
        b.y += (b.vy * dt) / steps;
        if (this.world.solidPx(b.x, b.y)) {
          dead = true;
          this.burst(b.x - b.vx * 0.01, b.y - b.vy * 0.01, 'spark', 6, '#ffcc55', 200);
          break;
        }
        if (b.from === 'p') {
          for (const p of this.persons) {
            if (p.role === 'down') continue;
            if (p.role === 'cuffed' && P.inCar) continue;
            const ddx = p.x - b.x;
            const ddy = p.y - b.y;
            if (ddx * ddx + ddy * ddy < 144) {
              this.hitPerson(p, b.vx, b.vy);
              dead = true;
              break;
            }
          }
        } else if (this.mode === 'play' && this.scene === 'city') {
          const tx = P.inCar ? this.car.x : P.x;
          const ty = P.inCar ? this.car.y : P.y;
          const r = P.inCar ? 22 : 11;
          if ((tx - b.x) ** 2 + (ty - b.y) ** 2 < r * r) {
            dead = true;
            this.hurtPlayer(P.inCar ? 4 : 10);
            this.burst(b.x, b.y, 'spark', 8, P.inCar ? '#ffcc55' : '#ff4d6d', 200);
          }
        }
      }
      if (dead) {
        this.bullets[i] = this.bullets[this.bullets.length - 1];
        this.bullets.pop();
      }
    }
  }

  private hitPerson(p: Person, vx: number, vy: number) {
    let o: Outcome;
    let pr = false;
    if (p.role === 'inc' && p.inc) {
      o = p.inc.def.outcomes.shoot;
      pr = p.inc.priority;
      this.fadeProp(p.inc);
      this.stats.kills++;
      if (inc_isPriority(p)) this.priorityCd = 4;
    } else if (p.role === 'cuffed') {
      o = CUFFED_SHOT;
      this.custody = this.custody.filter((c) => c !== p);
      this.stats.innocents++;
    } else {
      o = INNOCENT_SHOT;
      this.stats.innocents++;
    }
    p.role = 'down';
    p.inc = null;
    p.fall = 0;
    p.life = 5;
    p.flash = 0.12;
    p.kx = vx * 0.28;
    p.ky = vy * 0.28;
    p.dir = Math.atan2(vy, vx);
    this.hitstop = 0.07;
    this.addShake(9);
    this.zoomPunch = 0.6;
    sfx.hit();
    this.burst(p.x, p.y, 'star', 5, '#ffd84d', 160);
    this.burst(p.x, p.y, 'drop', 6, '#9b1c32', 140);
    this.burst(p.x, p.y, 'ring', 1, '#ff4d6d', 0);
    this.panics.push({ x: p.x, y: p.y, life: 3, r: 320 });
    this.applyOutcome(o, p.x, p.y, pr);
  }

  private hurtPlayer(d: number) {
    const P = this.player;
    if (P.inv > 0) return;
    P.inv = 0.12;
    P.hp = Math.max(0, P.hp - d);
    this.flash('#ff2040', 0.3);
    this.addShake(7);
    sfx.hurt();
    this.text(P.x, P.y - 26, `-${d}`, '#ff4d6d', 16);
  }

  // ------------------------------------------------------------ decisions
  resolve(p: Person, a: Action) {
    if (!p.inc) return;
    const P = this.player;
    const inc = p.inc;
    if (a === 'shoot') {
      if (P.shootCd > 0) return;
      const ang = Math.atan2(p.y - P.y, p.x - P.x);
      P.dir = ang;
      P.shootCd = 0.26;
      this.fire(P.x, P.y, ang, 'p');
      return;
    }
    if (a === 'arrest' && this.custody.length >= MAX_CUSTODY) {
      this.text(P.x, P.y - 32, 'CUSTODY FULL!', '#ff4d6d', 16);
      this.radioMsg('Custody full — book suspects at the Precinct desk.', '#ff4d6d');
      sfx.bad();
      return;
    }
    const o = inc.def.outcomes[a];
    this.fadeProp(inc);
    p.inc = null;
    P.squash = 1;
    P.dir = Math.atan2(p.y - P.y, p.x - P.x);
    this.hint = 0;
    const away = Math.atan2(p.y - P.y, p.x - P.x);
    if (a === 'arrest') {
      p.role = 'cuffed';
      p.stun = 0;
      p.kx = p.ky = 0;
      this.custody.push(p);
      this.stats.arrests++;
      sfx.cuff();
      this.burst(p.x, p.y, 'ring', 1, '#4fc3ff', 0);
      this.burst(p.x, p.y, 'spark', 14, '#9fdcff', 220);
      this.zoomPunch = 1;
      this.addShake(5);
      this.text(p.x, p.y - 50, 'CUFFED!', '#4fc3ff', 20);
    } else if (a === 'help') {
      p.role = 'leave';
      p.life = 4;
      p.mood = 'happy';
      p.wdx = Math.cos(away);
      p.wdy = Math.sin(away);
      this.stats.helps++;
      sfx.heart();
      this.burst(p.x, p.y - 10, 'heart', 10, '#ff6fa8', 110);
      if (inc.def.id === 'cat' || inc.def.id === 'cardiac' || inc.def.id === 'injured') this.burst(p.x, p.y, 'conf', 30, '', 220);
      this.zoomPunch = 0.5;
    } else {
      p.role = 'leave';
      p.life = 4;
      p.mood = 'angry';
      p.wdx = Math.cos(away);
      p.wdy = Math.sin(away);
      this.stats.tickets++;
      sfx.paper();
      for (let i = 0; i < 7; i++) {
        this.spawnP(P.x, P.y, 'paper', {
          vx: (p.x - P.x) * 3 + rand(-80, 80),
          vy: (p.y - P.y) * 3 + rand(-80, 80),
          life: 0.7,
          size: 5,
          color: '#fff8e0',
          vr: rand(-10, 10),
          drag: 4,
        });
      }
      this.zoomPunch = 0.4;
    }
    this.applyOutcome(o, p.x, p.y, inc.priority);
    if (inc.priority) {
      this.priorityCd = 4;
      if (o.pts > 0) this.radioMsg('DISPATCH: Good work, Officer. Stand by for next call.', '#5cff9d');
    }
  }

  private applyOutcome(o: Outcome, x: number, y: number, priority: boolean) {
    let pts = o.pts;
    const good = pts > 0;
    let sub = '';
    if (good) {
      const mult = this.combo * (priority ? 2 : 1);
      pts = Math.round(pts * mult);
      sub = `+${pts}` + (mult > 1 ? `  (x${mult.toFixed(1)})` : '') + (priority ? '  PRIORITY' : '');
      this.streak++;
      this.combo = Math.min(5, 1 + this.streak * 0.5);
      this.stats.bestCombo = Math.max(this.stats.bestCombo, this.combo);
      this.stats.good++;
      sfx.coin(this.streak);
      this.burst(x, y - 10, 'coin', Math.min(16, 5 + this.streak * 2), '#ffd84d', 200);
      this.text(x, y - 40, `+${pts}`, '#ffd84d', 24);
      this.scorePop = 1;
    } else {
      if (this.streak > 1) this.text(x, y - 60, 'COMBO LOST', '#ff9aa9', 14);
      this.streak = 0;
      this.combo = 1;
      this.stats.bad++;
      sfx.bad();
      this.flash('#ff2040', 0.35);
      this.addShake(8);
      if (pts) this.text(x, y - 40, `${pts}`, '#ff4d6d', 24);
      sub = `${pts ? pts + '  ·  ' : ''}TRUST ${o.trust}`;
    }
    this.score = Math.max(0, this.score + pts);
    if (o.trust) {
      this.trust = clamp(this.trust + o.trust, 0, 100);
      this.text(x, y - 18, `TRUST ${o.trust > 0 ? '+' : ''}${o.trust}`, o.trust > 0 ? '#5cff9d' : '#ff4d6d', 13);
    }
    this.verdict = { text: o.text, sub, color: good ? '#5cff9d' : '#ff4d6d', life: 1.7 };
  }

  private fadeProp(inc: Inc) {
    if (inc.prop) {
      this.fading.push(inc.prop);
      inc.prop = null;
    }
  }

  // ------------------------------------------------------------ fx
  private radioMsg(text: string, color: string) {
    this.radioQ.push({ text, color });
    if (this.radioQ.length > 3) this.radioQ.shift();
  }
  private flash(c: string, a: number) {
    this.flashC = c;
    this.flashA = Math.max(this.flashA, a);
  }
  private addShake(n: number) {
    this.shake = Math.min(22, Math.max(this.shake, n));
  }
  private text(x: number, y: number, text: string, color: string, size: number) {
    this.texts.push({ x, y, text, color, life: 1.2, max: 1.2, size });
    if (this.texts.length > 40) this.texts.shift();
  }
  private spawnP(x: number, y: number, type: PType, o: Partial<Particle> = {}) {
    if (this.parts.length > 700) return;
    const life = o.life ?? 0.8;
    this.parts.push({
      x,
      y,
      vx: o.vx ?? 0,
      vy: o.vy ?? 0,
      life,
      max: life,
      size: o.size ?? 4,
      color: o.color ?? '#fff',
      type,
      rot: o.rot ?? rand(0, TAU),
      vr: o.vr ?? 0,
      drag: o.drag ?? 3,
      grav: o.grav ?? 0,
    });
  }
  private burst(x: number, y: number, type: PType, n: number, color: string, speed: number) {
    const confCols = ['#ff4d6d', '#4fc3ff', '#ffd84d', '#5cff9d', '#ff4dd2', '#ffffff'];
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const s = rand(0.35, 1) * speed;
      const base: Partial<Particle> = { vx: Math.cos(a) * s, vy: Math.sin(a) * s, color: color || pick(confCols) };
      switch (type) {
        case 'heart':
        case 'plus':
          this.spawnP(x, y, type, { ...base, vy: -rand(60, 140), vx: rand(-70, 70), life: rand(0.8, 1.3), size: rand(12, 18), drag: 1.5 });
          break;
        case 'coin':
          this.spawnP(x, y, type, { ...base, vy: base.vy! - 120, life: rand(0.6, 1), size: rand(4, 6), vr: rand(8, 14), grav: 380, drag: 1.5 });
          break;
        case 'conf':
          this.spawnP(x, y, type, { ...base, vy: base.vy! - 140, life: rand(0.9, 1.6), size: rand(3, 6), vr: rand(-12, 12), grav: 260, drag: 2 });
          break;
        case 'star':
          this.spawnP(x, y, type, { ...base, life: rand(0.5, 0.9), size: rand(10, 15), vr: rand(-6, 6) });
          break;
        case 'ring':
          this.spawnP(x, y, type, { life: 0.45, size: 8, color });
          break;
        case 'smoke':
          this.spawnP(x, y, type, { ...base, life: rand(0.5, 1), size: rand(5, 9), drag: 2 });
          break;
        default:
          this.spawnP(x, y, type, { ...base, life: rand(0.2, 0.45), size: rand(1.5, 3) });
      }
    }
  }

  private updateFx(dt: number) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.parts[i] = this.parts[this.parts.length - 1];
        this.parts.pop();
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const f = Math.exp(-dt * p.drag);
      p.vx *= f;
      p.vy *= f;
      p.vy += p.grav * dt;
      p.rot += p.vr * dt;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.y -= 34 * dt;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    for (let i = this.fading.length - 1; i >= 0; i--) {
      this.fading[i].alpha -= dt * 0.6;
      if (this.fading[i].alpha <= 0) this.fading.splice(i, 1);
    }
    for (const s of this.skids) s.a -= dt * 0.08;
    if (this.skids.length && this.skids[0].a <= 0) this.skids = this.skids.filter((s) => s.a > 0);
    for (const c of this.chalks) c.life -= dt;
    this.shake = Math.max(0, this.shake - dt * 45);
    this.zoomPunch = Math.max(0, this.zoomPunch - dt * 3);
    this.flashA = Math.max(0, this.flashA - dt * 1.8);
    this.fadeA = Math.max(0, this.fadeA - dt * 2.8);
    this.scorePop = Math.max(0, this.scorePop - dt * 3);
    this.scoreShown += (this.score - this.scoreShown) * (1 - Math.exp(-dt * 8));
    if (Math.abs(this.score - this.scoreShown) < 1) this.scoreShown = this.score;
    this.trustShown += (this.trust - this.trustShown) * (1 - Math.exp(-dt * 6));
    if (this.verdict) {
      this.verdict.life -= dt;
      if (this.verdict.life <= 0) this.verdict = null;
    }
    if (this.banner) {
      this.banner.life -= dt;
      if (this.banner.life <= 0) this.banner = null;
    }
  }

  private updateCamera(dt: number) {
    const P = this.player;
    let tx = P.x;
    let ty = P.y;
    let z = this.baseZoom * 1.12;
    if (this.scene === 'precinct') z = this.baseZoom * 1.25;
    else if (P.inCar) {
      tx += this.car.vx * 0.38;
      ty += this.car.vy * 0.38;
      z = this.baseZoom * (0.86 - Math.min(0.16, Math.abs(this.car.speed) / 2800));
    } else if (this.focus) {
      z *= 1.1;
      tx += (this.focus.x - P.x) * 0.35;
      ty += (this.focus.y - P.y) * 0.35;
    }
    const k = 1 - Math.exp(-dt * 6);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
    this.cam.zoom += (z - this.cam.zoom) * (1 - Math.exp(-dt * 3));
  }

  private clampCam() {
    const z = this.cam.zoom * (1 + this.zoomPunch * 0.06);
    const vw = this.w / z;
    const vh = this.h / z;
    const W = this.scene === 'city' ? WORLD_PX : PW * T;
    const H = this.scene === 'city' ? WORLD_PX : PH * T;
    const x = vw >= W ? W / 2 : clamp(this.cam.x, vw / 2, W - vw / 2);
    const y = vh >= H ? H / 2 : clamp(this.cam.y, vh / 2, H - vh / 2);
    return { x, y, z, vw, vh };
  }

  // ============================================================ RENDER
  private render() {
    const g = this.g;
    const { w, h } = this;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = this.scene === 'city' ? '#07172b' : '#05060d';
    g.fillRect(0, 0, w, h);
    const cam = this.clampCam();
    const sx = (Math.random() - 0.5) * 2 * this.shake;
    const sy = (Math.random() - 0.5) * 2 * this.shake;
    g.save();
    g.translate(w / 2 + sx, h / 2 + sy);
    g.scale(cam.z, cam.z);
    g.translate(-cam.x, -cam.y);
    const view = { x0: cam.x - cam.vw / 2 - 60, y0: cam.y - cam.vh / 2 - 60, x1: cam.x + cam.vw / 2 + 60, y1: cam.y + cam.vh / 2 + 60 };
    if (this.scene === 'city') this.renderCity(g, view);
    else this.renderPrecinct(g);
    this.renderFx(g, view);
    g.restore();

    // atmosphere
    if (this.scene === 'city') {
      g.fillStyle = 'rgba(10,6,40,0.16)';
      g.fillRect(0, 0, w, h);
    }
    if (this.vignette) g.drawImage(this.vignette, 0, 0, w, h);
    if (this.mode === 'play' || this.mode === 'over' || this.mode === 'paused' || this.mode === 'menu') this.renderHUD(g);
    else this.input.buttons = [];
    if (this.flashA > 0) {
      g.globalAlpha = this.flashA;
      g.fillStyle = this.flashC;
      g.fillRect(0, 0, w, h);
      g.globalAlpha = 1;
    }
    if (this.fadeA > 0) {
      g.globalAlpha = this.fadeA;
      g.fillStyle = '#000';
      g.fillRect(0, 0, w, h);
      g.globalAlpha = 1;
    }
  }

  private inView(x: number, y: number, v: { x0: number; y0: number; x1: number; y1: number }) {
    return x > v.x0 && x < v.x1 && y > v.y0 && y < v.y1;
  }

  private renderCity(g: CanvasRenderingContext2D, v: { x0: number; y0: number; x1: number; y1: number }) {
    const W = WORLD_PX;
    const sx = clamp(Math.floor(v.x0), 0, W);
    const sy = clamp(Math.floor(v.y0), 0, W);
    const ex = clamp(Math.ceil(v.x1), 0, W);
    const ey = clamp(Math.ceil(v.y1), 0, W);
    if (ex > sx && ey > sy) g.drawImage(this.world.canvas, sx, sy, ex - sx, ey - sy, sx, sy, ex - sx, ey - sy);

    // water shimmer at docks is static; skids
    g.fillStyle = 'rgba(0,0,0,0.5)';
    for (const s of this.skids) {
      if (!this.inView(s.x, s.y, v)) continue;
      g.globalAlpha = Math.max(0, s.a) * 0.6;
      g.fillRect(s.x - 2, s.y - 2, 4, 4);
    }
    g.globalAlpha = 1;
    // chalk outlines
    g.strokeStyle = 'rgba(240,240,255,0.55)';
    g.lineWidth = 1.5;
    for (const c of this.chalks) {
      if (c.life <= 0 || !this.inView(c.x, c.y, v)) continue;
      g.save();
      g.globalAlpha = Math.min(1, c.life / 5) * 0.7;
      g.translate(c.x, c.y);
      g.rotate(c.dir);
      g.beginPath();
      g.ellipse(0, 0, 12, 8, 0, 0, TAU);
      g.moveTo(16, 0);
      g.arc(11, 0, 5, 0, TAU);
      g.moveTo(-8, -6);
      g.lineTo(-18, -9);
      g.moveTo(-8, 6);
      g.lineTo(-18, 9);
      g.stroke();
      g.restore();
    }
    g.globalAlpha = 1;

    // priority beacon
    for (const p of this.persons) {
      if (p.role !== 'inc' || !p.inc || !p.inc.priority || !this.inView(p.x, p.y, v)) continue;
      const pulse = (this.t * 1.2) % 1;
      g.strokeStyle = `rgba(255,216,77,${1 - pulse})`;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(p.x, p.y, 14 + pulse * 40, 0, TAU);
      g.stroke();
    }

    // props
    const drawProp = (pr: Prop) => {
      if (!this.inView(pr.x, pr.y, v)) return;
      g.save();
      g.globalAlpha = Math.max(0, Math.min(1, pr.alpha));
      if (pr.kind === 'car') {
        drawCar(g, pr.x, pr.y, pr.angle, pr.color, 'car');
        if (Math.floor(this.t * 3) % 2 === 0) {
          g.fillStyle = '#ffae33';
          g.shadowColor = '#ffae33';
          g.shadowBlur = 10;
          const c = Math.cos(pr.angle);
          const s = Math.sin(pr.angle);
          for (const [lx, ly] of [
            [21, 9],
            [21, -9],
            [-21, 9],
            [-21, -9],
          ])
            g.fillRect(pr.x + c * lx - s * ly - 2, pr.y + s * lx + c * ly - 2, 4, 4);
          g.shadowBlur = 0;
        }
      } else if (pr.kind === 'graffiti') {
        const cols = ['#ff4dd2', '#5cff9d', '#4fc3ff', '#ffd84d'];
        g.lineWidth = 4;
        g.lineCap = 'round';
        for (let i = 0; i < 4; i++) {
          g.strokeStyle = cols[i];
          g.beginPath();
          g.moveTo(pr.x - 18 + i * 3, pr.y - 4 + i * 2);
          g.bezierCurveTo(pr.x - 8, pr.y - 14 + i * 3, pr.x + 4, pr.y + 8 - i * 2, pr.x + 18 - i * 2, pr.y - 6 + i * 3);
          g.stroke();
        }
      } else if (pr.kind === 'stall') {
        g.fillStyle = 'rgba(0,0,0,0.4)';
        g.fillRect(pr.x - 12, pr.y - 6, 28, 18);
        g.fillStyle = '#b8b8c8';
        g.fillRect(pr.x - 14, pr.y - 9, 26, 16);
        for (let i = 0; i < 6; i++) {
          g.fillStyle = i % 2 ? '#fff' : '#e0414f';
          g.beginPath();
          g.moveTo(pr.x - 1, pr.y - 1);
          g.arc(pr.x - 1, pr.y - 1, 17, (i / 6) * TAU, ((i + 1) / 6) * TAU);
          g.fill();
        }
        drawEmoji(g, '🌭', pr.x - 1, pr.y - 1, 12);
      } else if (pr.kind === 'cat') {
        g.fillStyle = 'rgba(0,0,0,0.4)';
        g.beginPath();
        g.arc(pr.x + 4, pr.y + 5, 17, 0, TAU);
        g.fill();
        g.fillStyle = '#2a8a50';
        g.beginPath();
        g.arc(pr.x, pr.y, 17, 0, TAU);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.beginPath();
        g.arc(pr.x - 5, pr.y - 5, 9, 0, TAU);
        g.fill();
        drawEmoji(g, '🐱', pr.x + 3, pr.y - 3 + Math.sin(this.t * 4) * 1.5, 14);
      }
      g.restore();
    };
    for (const p of this.persons) if (p.inc?.prop && p.inc.prop.kind !== 'graffiti') drawProp(p.inc.prop);
    for (const pr of this.fading) drawProp(pr);
    for (const p of this.persons) if (p.inc?.prop && p.inc.prop.kind === 'graffiti') drawProp(p.inc.prop);

    // NPC cars
    for (const c of this.ncars) if (this.inView(c.x, c.y, v)) drawCar(g, c.x, c.y, c.angle, c.color, c.kind);
    // player car
    const car = this.car;
    drawCar(g, car.x, car.y, car.angle, '#101422', 'cop', this.t, car.siren);
    if (!this.player.inCar && this.mode === 'play' && Math.hypot(car.x - this.player.x, car.y - this.player.y) < 50) {
      g.strokeStyle = `rgba(79,195,255,${0.5 + Math.sin(this.t * 6) * 0.3})`;
      g.lineWidth = 2;
      g.setLineDash([6, 5]);
      g.lineDashOffset = -this.t * 20;
      rr(g, car.x - 30, car.y - 22, 60, 44, 10);
      g.stroke();
      g.setLineDash([]);
    }

    // persons (y-sorted)
    const vis = this.vis;
    vis.length = 0;
    for (const p of this.persons) {
      if (p.role === 'cuffed' && this.player.inCar) continue;
      if (this.inView(p.x, p.y, v)) vis.push(p);
    }
    vis.sort((a, b) => a.y - b.y);
    for (const p of vis) this.drawPersonEntity(g, p);

    // hostile red glow
    for (const p of vis) {
      if (p.role === 'inc' && p.inc?.state === 'hostile' && p.inc.active) {
        g.strokeStyle = `rgba(255,50,80,${0.4 + Math.sin(this.t * 10) * 0.3})`;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(p.x, p.y, 16, 0, TAU);
        g.stroke();
      }
    }

    // player
    if (!this.player.inCar) this.drawPlayer(g);

    // lights (additive)
    g.save();
    g.globalCompositeOperation = 'lighter';
    if (this.player.inCar) {
      const c = Math.cos(car.angle);
      const s = Math.sin(car.angle);
      const hx = car.x + c * 22;
      const hy = car.y + s * 22;
      const gr = g.createRadialGradient(hx + c * 50, hy + s * 50, 5, hx + c * 50, hy + s * 50, 90);
      gr.addColorStop(0, 'rgba(255,240,190,0.22)');
      gr.addColorStop(1, 'rgba(255,240,190,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(hx, hy);
      g.arc(hx, hy, 150, car.angle - 0.45, car.angle + 0.45);
      g.closePath();
      g.fill();
    }
    if (car.siren) {
      const on = Math.floor(this.t * 8) % 2 === 0;
      const col = on ? '255,40,80' : '40,110,255';
      const gr = g.createRadialGradient(car.x, car.y, 4, car.x, car.y, 110);
      gr.addColorStop(0, `rgba(${col},0.45)`);
      gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr;
      g.fillRect(car.x - 110, car.y - 110, 220, 220);
    }
    // bullets
    for (const b of this.bullets) {
      if (!this.inView(b.x, b.y, v)) continue;
      g.strokeStyle = b.from === 'p' ? 'rgba(255,240,160,0.95)' : 'rgba(255,90,90,0.95)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(b.x, b.y);
      g.lineTo(b.x - b.vx * 0.03, b.y - b.vy * 0.03);
      g.stroke();
    }
    g.restore();

    // incident bubbles
    for (const p of vis) {
      if (p.role === 'inc' && p.inc) this.drawBubble(g, p);
      else if (p.role === 'leave' && p.mood && p.life > 2.5) drawEmoji(g, p.mood === 'happy' ? '💖' : '💢', p.x + 8, p.y - 22 - (4 - p.life) * 8, 14);
    }
    // focus ring
    if (this.focus && this.mode === 'play') {
      const f = this.focus;
      g.save();
      g.translate(f.x, f.y);
      g.rotate(this.t * 2);
      g.strokeStyle = '#ffffff';
      g.lineWidth = 2;
      g.setLineDash([8, 6]);
      g.beginPath();
      g.arc(0, 0, 20, 0, TAU);
      g.stroke();
      g.setLineDash([]);
      g.restore();
    }
  }

  private drawPlayer(g: CanvasRenderingContext2D) {
    const P = this.player;
    const sq = P.squash;
    const moving = Math.hypot(P.vx, P.vy) > 20;
    drawPerson(g, P.x, P.y, P.dir, P.walk, { skin: '#d9a27a', shirt: '#1f3a8a', pants: '#14204a', hair: '#1b1410' }, {
      cop: true,
      gun: P.shootCd > 0,
      scale: 1.08 + sq * 0.18,
      flash: P.inv > 0,
    });
    if (P.boost > 0 && moving) {
      g.strokeStyle = 'rgba(255,179,71,0.6)';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(P.x, P.y, 15, 0, TAU);
      g.stroke();
    }
  }

  private drawPersonEntity(g: CanvasRenderingContext2D, p: Person) {
    const hostile = p.inc?.state === 'hostile';
    drawPerson(g, p.x, p.y, p.dir, p.walk, p.look, {
      cuffed: p.role === 'cuffed',
      down: p.role === 'down' ? Math.max(0.01, p.fall) : 0,
      flash: p.flash > 0,
      alpha: p.role === 'leave' ? clamp(p.life, 0, 1) : p.role === 'down' ? clamp(p.life / 1.5, 0, 1) : 1,
      scale: p.small ? 0.78 : 1,
      gun: hostile && p.inc!.active,
    });
    if (p.stun > 0) {
      for (let i = 0; i < 3; i++) {
        const a = this.t * 6 + (i * TAU) / 3;
        drawEmoji(g, '⭐', p.x + Math.cos(a) * 12, p.y - 14 + Math.sin(a) * 4, 9);
      }
    }
    if (p.role === 'inc' && p.inc?.def.id === 'drunk' && Math.random() < 0.01) this.spawnP(p.x, p.y - 16, 'heart', { color: '#9fd3ff', size: 10, life: 1, vy: -30 });
  }

  private drawBubble(g: CanvasRenderingContext2D, p: Person) {
    const inc = p.inc!;
    const bob = Math.sin(this.t * 4 + p.id) * 2.5;
    const x = p.x;
    const y = p.y - 32 + bob;
    const urgent = inc.def.urgent || inc.def.behavior === 'hostile';
    const col = inc.priority ? '#ffd84d' : inc.def.behavior === 'hostile' ? '#ff4d6d' : urgent ? '#ff9f43' : '#4fc3ff';
    g.fillStyle = 'rgba(8,12,30,0.85)';
    g.beginPath();
    g.arc(x, y, 14, 0, TAU);
    g.fill();
    g.beginPath();
    g.moveTo(x - 5, y + 11);
    g.lineTo(x, y + 19);
    g.lineTo(x + 5, y + 11);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.15)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(x, y, 14, 0, TAU);
    g.stroke();
    const frac = clamp(inc.timer / inc.max, 0, 1);
    g.strokeStyle = col;
    g.beginPath();
    g.arc(x, y, 14, -Math.PI / 2, -Math.PI / 2 + frac * TAU);
    g.stroke();
    drawEmoji(g, inc.def.icon, x, y, 15);
    if (inc.priority) {
      g.fillStyle = '#ffd84d';
      g.font = `12px ${FONT}`;
      g.textAlign = 'center';
      g.fillText('★', x + 13, y - 10);
    }
  }

  private renderPrecinct(g: CanvasRenderingContext2D) {
    g.drawImage(this.precinct.canvas, 0, 0);
    // officers at desks
    const officers: [number, number, number][] = [
      [10 * T, 3 * T, Math.PI / 2],
      [2.5 * T, 8.3 * T, Math.PI / 2],
      [12.5 * T, 8.3 * T, Math.PI / 2],
      [2.5 * T, 10.3 * T, Math.PI / 2],
    ];
    officers.forEach(([x, y, d], i) => {
      drawPerson(g, x, y + Math.sin(this.t * 2 + i) * 0.8, d + Math.sin(this.t * 0.7 + i) * 0.3, 0, { skin: pick(['#d9a27a']), shirt: '#1f3a8a', pants: '#14204a', hair: '#222' }, { cop: true });
    });
    // prisoners
    for (const b of this.booked) {
      drawPerson(g, b.x + Math.sin(this.t + b.dir) * 2, b.y, b.dir + Math.sin(this.t * 0.5 + b.dir) * 0.5, this.t * 2, b.look, { cuffed: false });
    }
    // interaction markers
    for (const o of this.precinct.objs) {
      const d = Math.hypot(o.x - this.player.x, o.y - this.player.y);
      const near = d < 46;
      const cd = o.id === 'armory' ? this.armoryCd : o.id === 'coffee' ? this.coffeeCd : o.id === 'motor' ? this.motorCd : 0;
      const ready = cd <= 0 && (o.id !== 'book' || this.custody.length > 0);
      g.strokeStyle = ready ? (near ? '#ffd84d' : 'rgba(79,195,255,0.6)') : 'rgba(140,150,180,0.35)';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(o.x, o.y, 16 + (near ? Math.sin(this.t * 8) * 2 : 0), 0, TAU);
      g.stroke();
      if (o.id === 'book' && this.custody.length) {
        g.fillStyle = '#ffd84d';
        g.font = `12px ${FONT}`;
        g.textAlign = 'center';
        g.fillText(`${this.custody.length} TO BOOK`, o.x, o.y + 30);
      }
    }
    // cuffed followers
    for (const c of this.custody) this.drawPersonEntity(g, c);
    this.drawPlayer(g);
    // exit sign
    g.fillStyle = '#5cff9d';
    g.font = `11px ${FONT}`;
    g.textAlign = 'center';
    g.fillText('▼ EXIT TO STREET ▼', 10 * T, 12.9 * T);
  }

  private renderFx(g: CanvasRenderingContext2D, v: { x0: number; y0: number; x1: number; y1: number }) {
    // normal particles
    for (let pass = 0; pass < 2; pass++) {
      if (pass === 1) {
        g.save();
        g.globalCompositeOperation = 'lighter';
      }
      for (const p of this.parts) {
        if (ADDITIVE.has(p.type) !== (pass === 1)) continue;
        if (!this.inView(p.x, p.y, v)) continue;
        const l = p.life / p.max;
        g.globalAlpha = Math.min(1, l * 1.6);
        switch (p.type) {
          case 'spark':
            g.strokeStyle = p.color;
            g.lineWidth = p.size;
            g.beginPath();
            g.moveTo(p.x, p.y);
            g.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
            g.stroke();
            break;
          case 'flash': {
            const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
            gr.addColorStop(0, 'rgba(255,255,220,1)');
            gr.addColorStop(0.4, 'rgba(255,200,80,0.8)');
            gr.addColorStop(1, 'rgba(255,120,0,0)');
            g.fillStyle = gr;
            g.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
            break;
          }
          case 'ring':
            g.strokeStyle = p.color;
            g.lineWidth = 3 * l + 1;
            g.beginPath();
            g.arc(p.x, p.y, p.size + (1 - l) * 46, 0, TAU);
            g.stroke();
            break;
          case 'smoke':
          case 'dust':
            g.globalAlpha = l * 0.5;
            g.fillStyle = p.color;
            g.beginPath();
            g.arc(p.x, p.y, p.size * (1 + (1 - l) * 1.6), 0, TAU);
            g.fill();
            break;
          case 'heart':
          case 'star':
          case 'plus':
            g.save();
            g.translate(p.x, p.y);
            g.rotate(p.type === 'star' ? p.rot : Math.sin(p.rot) * 0.2);
            g.fillStyle = p.color;
            g.font = `${p.size}px ${FONT}`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText(p.type === 'heart' ? '♥' : p.type === 'star' ? '★' : '+', 0, 0);
            g.restore();
            break;
          case 'coin': {
            const sc = Math.abs(Math.cos(p.rot));
            g.fillStyle = '#ffd84d';
            g.beginPath();
            g.ellipse(p.x, p.y, p.size * sc + 0.5, p.size, 0, 0, TAU);
            g.fill();
            g.fillStyle = '#fff6b0';
            g.fillRect(p.x - 1, p.y - p.size * 0.6, 1.5, p.size * 0.6);
            break;
          }
          case 'conf':
          case 'paper':
          case 'shell':
            g.save();
            g.translate(p.x, p.y);
            g.rotate(p.rot);
            g.fillStyle = p.color;
            if (p.type === 'paper') g.fillRect(-p.size, -p.size * 0.7, p.size * 2, p.size * 1.4);
            else if (p.type === 'shell') g.fillRect(-2, -1, 4, 2);
            else g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
            g.restore();
            break;
          case 'drop':
            g.fillStyle = p.color;
            g.beginPath();
            g.arc(p.x, p.y, p.size, 0, TAU);
            g.fill();
            break;
        }
      }
      if (pass === 1) g.restore();
    }
    g.globalAlpha = 1;
    // floating texts
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const t of this.texts) {
      const l = t.life / t.max;
      const pop = l > 0.85 ? 1 + (l - 0.85) * 3 : 1;
      g.globalAlpha = Math.min(1, l * 2.5);
      g.font = `${Math.round(t.size * pop)}px ${FONT}`;
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(0,0,0,0.75)';
      g.strokeText(t.text, t.x, t.y);
      g.fillStyle = t.color;
      g.fillText(t.text, t.x, t.y);
    }
    g.globalAlpha = 1;
    g.textBaseline = 'alphabetic';
  }

  // ============================================================ HUD
  private renderHUD(g: CanvasRenderingContext2D) {
    const { w, h } = this;
    const u = clamp(Math.min(w, h) / 720, 0.72, 1.12);
    const btns: Btn[] = [];
    const touch = this.input.isTouch;
    const P = this.player;

    // --- top-left panel
    const px = 12;
    const py = 12;
    const pw = 206 * u;
    const ph = 104 * u;
    g.fillStyle = 'rgba(6,10,28,0.78)';
    rr(g, px, py, pw, ph, 10);
    g.fill();
    g.strokeStyle = 'rgba(79,195,255,0.35)';
    g.lineWidth = 1;
    g.stroke();
    g.textAlign = 'left';
    g.fillStyle = '#7f8bb8';
    g.font = `600 ${11 * u}px ${UIFONT}`;
    g.fillText('SCORE', px + 12 * u, py + 17 * u);
    g.save();
    const sp = 1 + this.scorePop * 0.25;
    g.translate(px + 12 * u, py + 44 * u);
    g.scale(sp, sp);
    g.font = `${26 * u}px ${FONT}`;
    g.fillStyle = '#fff';
    g.shadowColor = '#4fc3ff';
    g.shadowBlur = 12 * this.scorePop;
    g.fillText(Math.round(this.scoreShown).toLocaleString(), 0, 0);
    g.restore();
    if (this.combo > 1) {
      const cx = px + pw - 12 * u;
      g.textAlign = 'right';
      g.font = `${16 * u + Math.sin(this.t * 10) * 1}px ${FONT}`;
      g.fillStyle = '#ffd84d';
      g.fillText(`x${this.combo.toFixed(1)}`, cx, py + 42 * u);
      g.font = `600 ${9 * u}px ${UIFONT}`;
      g.fillText('COMBO', cx, py + 17 * u);
      g.textAlign = 'left';
    }
    const bar = (y: number, label: string, v: number, col: string, warn: boolean) => {
      const bx = px + 12 * u;
      const bw = pw - 24 * u;
      g.fillStyle = '#7f8bb8';
      g.font = `600 ${9 * u}px ${UIFONT}`;
      g.fillText(label, bx, y - 3 * u);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      rr(g, bx, y, bw, 8 * u, 4);
      g.fill();
      const f = clamp(v / 100, 0, 1);
      g.fillStyle = warn && Math.floor(this.t * 5) % 2 === 0 ? '#ffffff' : col;
      if (f > 0) {
        rr(g, bx, y, Math.max(8, bw * f), 8 * u, 4);
        g.fill();
      }
      g.textAlign = 'right';
      g.fillStyle = '#c9d3ff';
      g.fillText(`${Math.round(v)}`, bx + bw, y - 3 * u);
      g.textAlign = 'left';
    };
    bar(py + 66 * u, 'PUBLIC TRUST', this.trustShown, '#4fc3ff', this.trust < 20);
    bar(py + 88 * u, 'HEALTH', P.hp, '#ff4d6d', P.hp < 30);
    // custody + boost row
    const rowY = py + ph + 6;
    if (this.custody.length || P.boost > 0) {
      g.fillStyle = 'rgba(6,10,28,0.78)';
      rr(g, px, rowY, pw, 24 * u, 8);
      g.fill();
      g.font = `600 ${11 * u}px ${UIFONT}`;
      g.fillStyle = this.custody.length >= MAX_CUSTODY ? '#ff4d6d' : '#9fdcff';
      g.fillText(`⛓ CUSTODY ${this.custody.length}/${MAX_CUSTODY}`, px + 10 * u, rowY + 16 * u);
      if (P.boost > 0) {
        g.textAlign = 'right';
        g.fillStyle = '#ffb347';
        g.fillText(`☕ ${Math.ceil(P.boost)}s`, px + pw - 10 * u, rowY + 16 * u);
        g.textAlign = 'left';
      }
    }

    // --- minimap (top-right)
    const M = Math.round((w < 520 ? 96 : 128) * u);
    const mx = w - M - 12;
    const my = 12;
    g.fillStyle = 'rgba(6,10,28,0.85)';
    rr(g, mx - 4, my - 4, M + 8, M + 36 * u, 10);
    g.fill();
    g.strokeStyle = 'rgba(79,195,255,0.35)';
    g.stroke();
    g.imageSmoothingEnabled = false;
    g.drawImage(this.world.mini, mx, my, M, M);
    g.imageSmoothingEnabled = true;
    const ms = M / WORLD_PX;
    const cityP = this.scene === 'city' ? P : this.cityPos;
    // stations
    g.fillStyle = '#ffd84d';
    for (const s of this.world.stations) g.fillRect(mx + s.x * ms - 2, my + s.y * ms - 2, 4, 4);
    // precinct
    g.fillStyle = '#4fc3ff';
    g.font = `${10 * u}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('★', mx + 31 * T * ms, my + 30 * T * ms);
    // incidents
    for (const p of this.persons) {
      if (p.role !== 'inc' || !p.inc) continue;
      const inc = p.inc;
      const col = inc.priority ? '#ffd84d' : inc.def.behavior === 'hostile' ? '#ff4d6d' : inc.def.urgent ? '#ff9f43' : '#e6ecff';
      const r = inc.priority ? 3 + Math.sin(this.t * 8) * 1 : 2;
      g.fillStyle = col;
      g.beginPath();
      g.arc(mx + p.x * ms, my + p.y * ms, r, 0, TAU);
      g.fill();
    }
    // car
    if (!P.inCar) {
      g.fillStyle = '#2d7bff';
      g.fillRect(mx + this.car.x * ms - 2.5, my + this.car.y * ms - 2.5, 5, 5);
    }
    // player
    g.save();
    g.translate(mx + cityP.x * ms, my + cityP.y * ms);
    g.rotate(P.inCar ? this.car.angle : P.dir);
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(5, 0);
    g.lineTo(-3.5, -3.5);
    g.lineTo(-3.5, 3.5);
    g.closePath();
    g.fill();
    g.restore();
    g.textBaseline = 'alphabetic';
    // clock
    const rem = Math.max(0, SHIFT - this.elapsed);
    const mins = (this.elapsed / SHIFT) * 480;
    const hh = (22 + Math.floor(mins / 60)) % 24;
    const mm = Math.floor(mins % 60);
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    const clock = `${h12}:${mm.toString().padStart(2, '0')} ${hh >= 12 ? 'PM' : 'AM'}`;
    g.textAlign = 'center';
    g.font = `${14 * u}px ${FONT}`;
    g.fillStyle = rem < 30 && Math.floor(this.t * 3) % 2 === 0 ? '#ff4d6d' : '#fff';
    g.fillText(clock, mx + M / 2, my + M + 15 * u);
    g.font = `600 ${9 * u}px ${UIFONT}`;
    g.fillStyle = this.scene === 'precinct' ? '#4fc3ff' : this.curArea ? AREA_INFO[this.curArea].color : '#8899bb';
    g.fillText(this.scene === 'precinct' ? 'PRECINCT 9' : this.curArea ? AREA_INFO[this.curArea].name : '', mx + M / 2, my + M + 27 * u);

    // pause button
    const pbs = 38 * u;
    const pbx = mx - pbs - 12;
    const pby = my;
    g.fillStyle = 'rgba(6,10,28,0.8)';
    rr(g, pbx, pby, pbs, pbs, 8);
    g.fill();
    g.strokeStyle = 'rgba(79,195,255,0.35)';
    g.stroke();
    g.fillStyle = '#e6ecff';
    g.fillRect(pbx + pbs * 0.33, pby + pbs * 0.28, pbs * 0.12, pbs * 0.44);
    g.fillRect(pbx + pbs * 0.55, pby + pbs * 0.28, pbs * 0.12, pbs * 0.44);
    btns.push({ id: 'pause', x: pbx, y: pby, w: pbs, h: pbs });

    // --- radio
    if (this.radio) {
      const r = this.radio;
      const a = Math.min(1, r.life * 3, (3.6 - r.life) * 5);
      const narrow = w < 820;
      const ry = narrow ? py + ph + (this.custody.length || P.boost > 0 ? 38 : 10) * u + 4 : 16;
      g.globalAlpha = a;
      g.font = `600 ${13 * u}px ${UIFONT}`;
      const maxW = narrow ? w - 24 : Math.min(560, w - pw - M - 120);
      let txt = r.text;
      while (g.measureText(txt).width > maxW - 46 && txt.length > 10) txt = txt.slice(0, -2);
      if (txt !== r.text) txt += '…';
      const tw = g.measureText(txt).width + 46;
      const rx = narrow ? 12 : w / 2 - tw / 2;
      g.fillStyle = 'rgba(6,10,28,0.88)';
      rr(g, rx, ry, tw, 28 * u, 8);
      g.fill();
      g.strokeStyle = r.color;
      g.stroke();
      g.textAlign = 'left';
      g.fillStyle = r.color;
      g.fillText('📻', rx + 10, ry + 19 * u);
      g.fillText(txt, rx + 34, ry + 19 * u);
      g.globalAlpha = 1;
    }

    // --- area banner
    if (this.banner) {
      const b = this.banner;
      const a = Math.min(1, b.life * 2, (2.4 - b.life) * 4);
      g.globalAlpha = clamp(a, 0, 1);
      g.textAlign = 'center';
      g.font = `${Math.min(40, w / 12) * u}px ${FONT}`;
      g.fillStyle = b.color;
      g.shadowColor = b.color;
      g.shadowBlur = 20;
      g.fillText(b.title, w / 2, h * 0.2);
      g.shadowBlur = 0;
      g.font = `600 ${14 * u}px ${UIFONT}`;
      g.fillStyle = '#c9d3ff';
      g.fillText(b.tag.toUpperCase(), w / 2, h * 0.2 + 24 * u);
      g.globalAlpha = 1;
    }

    // --- verdict
    if (this.verdict) {
      const v = this.verdict;
      const age = 1.7 - v.life;
      const sc = age < 0.15 ? 1.5 - (age / 0.15) * 0.5 : 1;
      g.globalAlpha = Math.min(1, v.life * 3);
      g.save();
      g.translate(w / 2, h * 0.33);
      g.scale(sc, sc);
      g.textAlign = 'center';
      g.font = `${Math.min(30 * u, w / 16)}px ${FONT}`;
      g.lineWidth = 6;
      g.strokeStyle = 'rgba(0,0,0,0.8)';
      g.strokeText(v.text, 0, 0);
      g.fillStyle = v.color;
      g.fillText(v.text, 0, 0);
      if (v.sub) {
        g.font = `${15 * u}px ${FONT}`;
        g.strokeText(v.sub, 0, 26 * u);
        g.fillStyle = '#fff';
        g.fillText(v.sub, 0, 26 * u);
      }
      g.restore();
      g.globalAlpha = 1;
    }

    // --- priority arrow + edge markers
    if (this.scene === 'city') {
      const cam = this.clampCam();
      for (const p of this.persons) {
        if (p.role !== 'inc' || !p.inc) continue;
        const sx = w / 2 + (p.x - cam.x) * cam.z;
        const sy = h / 2 + (p.y - cam.y) * cam.z;
        const m = 44;
        const on = sx > m && sx < w - m && sy > m && sy < h - m;
        if (on) continue;
        const d = Math.hypot(p.x - cityP.x, p.y - cityP.y);
        if (!p.inc.priority && d > 1000) continue;
        const ang = Math.atan2(sy - h / 2, sx - w / 2);
        const ex = clamp(sx, m, w - m);
        const ey = clamp(sy, m + 60 * u, h - m - (touch ? 150 : 40));
        const col = p.inc.priority ? '#ffd84d' : p.inc.def.behavior === 'hostile' ? '#ff4d6d' : 'rgba(230,236,255,0.6)';
        g.save();
        g.translate(ex, ey);
        g.rotate(ang);
        const s = p.inc.priority ? 1.4 + Math.sin(this.t * 8) * 0.12 : 0.8;
        g.scale(s, s);
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(12, 0);
        g.lineTo(-6, -8);
        g.lineTo(-2, 0);
        g.lineTo(-6, 8);
        g.closePath();
        g.fill();
        g.restore();
        if (p.inc.priority) {
          g.textAlign = 'center';
          g.font = `${11 * u}px ${FONT}`;
          g.fillStyle = '#ffd84d';
          g.fillText(`${p.inc.def.icon} ${Math.round(d / 10)}m`, ex - Math.cos(ang) * 26, ey - Math.sin(ang) * 26 + 4);
        }
      }
    }

    // --- decision card or prompt
    const bottomPad = touch ? 150 * u : 16;
    if (this.focus && this.focus.inc && this.mode === 'play') {
      const inc = this.focus.inc;
      const cw = Math.min(640, w - 20);
      const ch = 124 * u;
      const cx = (w - cw) / 2;
      const cy = h - ch - bottomPad;
      g.fillStyle = 'rgba(6,10,28,0.92)';
      rr(g, cx, cy, cw, ch, 14);
      g.fill();
      const edge = inc.def.behavior === 'hostile' ? '#ff4d6d' : inc.priority ? '#ffd84d' : '#4fc3ff';
      g.strokeStyle = edge;
      g.lineWidth = 2;
      g.stroke();
      drawEmoji(g, inc.def.icon, cx + 26 * u, cy + 27 * u, 24 * u);
      g.textAlign = 'left';
      g.font = `${17 * u}px ${FONT}`;
      g.fillStyle = '#fff';
      g.fillText(inc.def.title.toUpperCase(), cx + 50 * u, cy + 24 * u);
      if (inc.priority) {
        const tw = g.measureText(inc.def.title.toUpperCase()).width;
        g.font = `${10 * u}px ${FONT}`;
        g.fillStyle = '#ffd84d';
        g.fillText('★ PRIORITY x2', cx + 58 * u + tw, cy + 23 * u);
      }
      g.font = `${12 * u}px ${UIFONT}`;
      g.fillStyle = '#aab6e0';
      let desc = inc.def.desc;
      while (g.measureText(desc).width > cw - 64 * u && desc.length > 10) desc = desc.slice(0, -2);
      if (desc !== inc.def.desc) desc += '…';
      g.fillText(desc, cx + 50 * u, cy + 42 * u);
      const gap = 8;
      const bw = (cw - 24 - gap * 3) / 4;
      const bh = 52 * u;
      const by = cy + ch - bh - 12;
      ACTIONS.forEach((a, i) => {
        const info = ACTION_INFO[a];
        const bx = cx + 12 + i * (bw + gap);
        const pressed = this.input.held('act_' + a);
        g.fillStyle = pressed ? info.color : 'rgba(255,255,255,0.05)';
        rr(g, bx, by, bw, bh, 10);
        g.fill();
        g.strokeStyle = info.color;
        g.lineWidth = 2;
        g.stroke();
        g.textAlign = 'center';
        g.fillStyle = pressed ? '#000' : info.color;
        g.font = `${18 * u}px ${FONT}`;
        g.fillText(info.icon, bx + bw / 2, by + 22 * u);
        g.font = `${Math.min(13 * u, bw / 6.2)}px ${FONT}`;
        g.fillText(info.label, bx + bw / 2, by + 41 * u);
        if (!touch) {
          g.fillStyle = 'rgba(255,255,255,0.12)';
          rr(g, bx + 5, by + 5, 16, 16, 4);
          g.fill();
          g.fillStyle = '#fff';
          g.font = `${10}px ${FONT}`;
          g.fillText(info.key, bx + 13, by + 17);
        }
        btns.push({ id: 'act_' + a, x: bx, y: by, w: bw, h: bh });
      });
    } else if (this.prompt && this.mode === 'play') {
      g.font = `${14 * u}px ${FONT}`;
      const label = (touch ? '' : 'E  ·  ') + this.prompt;
      const tw = g.measureText(label).width + 36;
      const bx = w / 2 - tw / 2;
      const by = h - bottomPad - 44 * u;
      const pulse = 0.6 + Math.sin(this.t * 6) * 0.25;
      g.fillStyle = 'rgba(6,10,28,0.9)';
      rr(g, bx, by, tw, 38 * u, 19 * u);
      g.fill();
      g.strokeStyle = `rgba(255,216,77,${pulse})`;
      g.lineWidth = 2;
      g.stroke();
      g.textAlign = 'center';
      g.fillStyle = '#ffd84d';
      g.fillText(label, w / 2, by + 24 * u);
      btns.push({ id: 'use', x: bx, y: by, w: tw, h: 38 * u });
    } else if (this.player.inCar === false && this.scene === 'city' && this.mode === 'play') {
      // hint for nearby incident while in car handled elsewhere
    }
    if (P.inCar && this.mode === 'play') {
      let near = false;
      for (const p of this.persons) if (p.role === 'inc' && Math.hypot(p.x - P.x, p.y - P.y) < 90) near = true;
      if (near) {
        g.textAlign = 'center';
        g.font = `${12 * u}px ${FONT}`;
        g.fillStyle = '#ffd84d';
        g.fillText('Exit the car to respond', w / 2, h - bottomPad - 56 * u);
      }
    }

    // tutorial hint
    if (this.hint > 0 && this.mode === 'play' && !this.focus) {
      const a = Math.min(1, this.hint);
      g.globalAlpha = a;
      const lines = touch
        ? ['Drag left side to move · walk to a citizen with a bubble', 'Then choose: ARREST · HELP · TICKET · SHOOT']
        : ['WASD / Arrows to move · walk to a citizen with a bubble', 'Choose 1 ARREST · 2 HELP · 3 TICKET · 4 SHOOT — choose wisely!'];
      g.font = `600 ${13 * u}px ${UIFONT}`;
      const tw = Math.max(...lines.map((l) => g.measureText(l).width)) + 30;
      const bx = w / 2 - Math.min(tw, w - 20) / 2;
      const by = h - bottomPad - 110 * u;
      g.fillStyle = 'rgba(6,10,28,0.85)';
      rr(g, bx, by, Math.min(tw, w - 20), 50 * u, 10);
      g.fill();
      g.strokeStyle = 'rgba(92,255,157,0.6)';
      g.stroke();
      g.textAlign = 'center';
      g.fillStyle = '#e6ecff';
      g.fillText(lines[0], w / 2, by + 20 * u);
      g.fillStyle = '#5cff9d';
      g.fillText(lines[1], w / 2, by + 38 * u);
      g.globalAlpha = 1;
    }

    // low health vignette
    if (P.hp < 35 && this.mode === 'play') {
      g.globalAlpha = (0.25 + Math.sin(this.t * 6) * 0.12) * (1 - P.hp / 35);
      g.strokeStyle = '#ff2040';
      g.lineWidth = 40;
      g.strokeRect(0, 0, w, h);
      g.globalAlpha = 1;
    }

    // --- touch controls
    if (touch && this.mode === 'play') {
      const j = this.input.joy;
      if (j.active) {
        g.fillStyle = 'rgba(255,255,255,0.08)';
        g.strokeStyle = 'rgba(79,195,255,0.5)';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(j.ox, j.oy, 60, 0, TAU);
        g.fill();
        g.stroke();
        const dx = j.x - j.ox;
        const dy = j.y - j.oy;
        const d = Math.hypot(dx, dy);
        const k = d > 60 ? 60 / d : 1;
        g.fillStyle = 'rgba(79,195,255,0.6)';
        g.beginPath();
        g.arc(j.ox + dx * k, j.oy + dy * k, 26, 0, TAU);
        g.fill();
      } else {
        g.globalAlpha = 0.35;
        g.strokeStyle = 'rgba(79,195,255,0.6)';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(90, h - 100, 50, 0, TAU);
        g.stroke();
        g.fillStyle = '#9fdcff';
        g.font = `12px ${FONT}`;
        g.textAlign = 'center';
        g.fillText('MOVE', 90, h - 96);
        g.globalAlpha = 1;
      }
      const circleBtn = (id: string, x: number, y: number, r: number, label: string, col: string, active: boolean) => {
        const held = this.input.held(id);
        g.globalAlpha = active ? 1 : 0.4;
        g.fillStyle = held ? col : 'rgba(6,10,28,0.7)';
        g.beginPath();
        g.arc(x, y, r, 0, TAU);
        g.fill();
        g.strokeStyle = col;
        g.lineWidth = 3;
        g.stroke();
        g.fillStyle = held ? '#000' : col;
        g.font = `${Math.round(r * 0.36)}px ${FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(label, x, y + 1);
        g.textBaseline = 'alphabetic';
        g.globalAlpha = 1;
        btns.push({ id, x: x - r, y: y - r, w: r * 2, h: r * 2 });
      };
      const r1 = 42 * u;
      const r2 = 32 * u;
      if (this.scene === 'city') {
        if (P.inCar) circleBtn('siren', w - 20 - r1, h - 24 - r1, r1, 'SIREN', this.car.siren ? '#ff4d6d' : '#4fc3ff', true);
        else circleBtn('shoot', w - 20 - r1, h - 24 - r1, r1, 'FIRE', '#ff4d6d', true);
      }
      circleBtn('use', w - 20 - r1 * 2 - r2 - 14, h - 20 - r2, r2, P.inCar ? 'EXIT' : 'USE', '#ffd84d', !!this.prompt);
    }

    this.input.buttons = this.mode === 'play' ? btns : [];
  }
}

function inc_isPriority(p: Person) {
  return !!p.inc?.priority;
}
