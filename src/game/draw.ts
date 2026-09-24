// Sprite-less procedural drawing helpers (people, cars, emoji cache)
export function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const q = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + q, y);
  g.lineTo(x + w - q, y);
  g.quadraticCurveTo(x + w, y, x + w, y + q);
  g.lineTo(x + w, y + h - q);
  g.quadraticCurveTo(x + w, y + h, x + w - q, y + h);
  g.lineTo(x + q, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - q);
  g.lineTo(x, y + q);
  g.quadraticCurveTo(x, y, x + q, y);
  g.closePath();
}

const emojiCache = new Map<string, HTMLCanvasElement>();
export function emoji(e: string, size: number): HTMLCanvasElement {
  const key = e + size;
  let c = emojiCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  const s = Math.ceil(size * 1.4);
  c.width = s * 2;
  c.height = s * 2;
  const g = c.getContext('2d')!;
  g.scale(2, 2);
  g.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(e, s / 2, s / 2 + size * 0.06);
  emojiCache.set(key, c);
  return c;
}
export function drawEmoji(g: CanvasRenderingContext2D, e: string, x: number, y: number, size: number) {
  const c = emoji(e, size);
  const s = c.width / 2;
  g.drawImage(c, x - s / 2, y - s / 2, s, s);
}

export interface Look {
  skin: string;
  shirt: string;
  pants: string;
  hair: string;
}

export function drawPerson(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  dir: number,
  walk: number,
  look: Look,
  opt: { cop?: boolean; cuffed?: boolean; down?: number; flash?: boolean; alpha?: number; scale?: number; gun?: boolean } = {},
) {
  g.save();
  g.translate(x, y);
  if (opt.alpha !== undefined) g.globalAlpha = opt.alpha;
  const sc = opt.scale ?? 1;
  if (sc !== 1) g.scale(sc, sc);
  // shadow
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.ellipse(2, 5, 10, 6, 0, 0, Math.PI * 2);
  g.fill();
  g.rotate(dir);
  const fl = opt.flash;
  const skin = fl ? '#fff' : look.skin;
  const shirt = fl ? '#fff' : look.shirt;
  const pants = fl ? '#fff' : look.pants;
  const hair = fl ? '#fff' : look.hair;
  if (opt.down && opt.down > 0) {
    // lying down: stretched along local x
    const d = opt.down;
    g.fillStyle = pants;
    g.fillRect(-16 * d, -5, 10 * d + 4, 4);
    g.fillRect(-16 * d, 1, 10 * d + 4, 4);
    g.fillStyle = shirt;
    g.beginPath();
    g.ellipse(0, 0, 6 + 3 * d, 8, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = skin;
    g.beginPath();
    g.arc(10 * d, 0, 5.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = hair;
    g.beginPath();
    g.arc(10 * d + 1.5, 0, 4.5, 0, Math.PI * 2);
    g.fill();
    g.restore();
    return;
  }
  const s = Math.sin(walk);
  // legs
  g.fillStyle = pants;
  g.beginPath();
  g.ellipse(s * 5, -4, 4, 2.6, 0, 0, Math.PI * 2);
  g.ellipse(-s * 5, 4, 4, 2.6, 0, 0, Math.PI * 2);
  g.fill();
  // arms
  g.fillStyle = shirt;
  if (opt.cuffed) {
    g.beginPath();
    g.arc(-5, -5, 3, 0, Math.PI * 2);
    g.arc(-5, 5, 3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#d7e3ff';
    g.fillRect(-9, -2, 3, 4);
  } else if (opt.gun) {
    g.beginPath();
    g.arc(6, -4, 3, 0, Math.PI * 2);
    g.arc(6, 4, 3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#111';
    g.fillRect(7, -1.5, 10, 3);
  } else {
    g.beginPath();
    g.arc(-s * 4, -9, 3, 0, Math.PI * 2);
    g.arc(s * 4, 9, 3, 0, Math.PI * 2);
    g.fill();
  }
  // body
  g.fillStyle = shirt;
  g.beginPath();
  g.ellipse(0, 0, 6.5, 9.5, 0, 0, Math.PI * 2);
  g.fill();
  if (opt.cop && !fl) {
    g.fillStyle = '#ffd84d';
    g.beginPath();
    g.arc(3.5, -4.5, 1.8, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#9ab4ff';
    g.fillRect(-2, -9.5, 3, 2);
    g.fillRect(-2, 7.5, 3, 2);
  }
  // head
  g.fillStyle = skin;
  g.beginPath();
  g.arc(0.5, 0, 5.5, 0, Math.PI * 2);
  g.fill();
  if (opt.cop) {
    g.fillStyle = fl ? '#fff' : '#101a3d';
    g.beginPath();
    g.arc(-0.5, 0, 5.8, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = fl ? '#fff' : '#0a0f24';
    g.beginPath();
    g.ellipse(4.5, 0, 2.6, 5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffd84d';
    g.fillRect(2, -1, 2, 2);
  } else {
    g.fillStyle = hair;
    g.beginPath();
    g.arc(-1, 0, 5, Math.PI * 0.35, Math.PI * 1.65);
    g.fill();
  }
  g.restore();
}

export function drawCar(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  color: string,
  kind: 'car' | 'taxi' | 'bus' | 'cop',
  t = 0,
  lights = false,
) {
  const L = kind === 'bus' ? 72 : 44;
  const W = kind === 'bus' ? 26 : 22;
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.fillStyle = 'rgba(0,0,0,0.45)';
  rr(g, -L / 2 + 4, -W / 2 + 5, L, W, 6);
  g.fill();
  // body
  g.fillStyle = kind === 'cop' ? '#101422' : color;
  rr(g, -L / 2, -W / 2, L, W, 6);
  g.fill();
  if (kind === 'cop') {
    g.fillStyle = '#eef2ff';
    g.fillRect(-9, -W / 2, 18, W);
    g.fillStyle = '#101422';
    g.font = 'bold 6px sans-serif';
  }
  // shine
  g.fillStyle = 'rgba(255,255,255,0.12)';
  rr(g, -L / 2 + 2, -W / 2 + 1, L - 4, 4, 2);
  g.fill();
  if (kind === 'bus') {
    g.fillStyle = '#9fd3ff';
    for (let i = -L / 2 + 8; i < L / 2 - 14; i += 10) {
      g.fillRect(i, -W / 2 + 2, 7, 3);
      g.fillRect(i, W / 2 - 5, 7, 3);
    }
    g.fillStyle = '#1b2640';
    g.fillRect(L / 2 - 10, -W / 2 + 3, 6, W - 6);
    g.fillStyle = 'rgba(0,0,0,0.2)';
    g.fillRect(-L / 2 + 6, -4, L - 20, 8);
  } else {
    // windshield / rear window / roof
    g.fillStyle = '#1b2a44';
    rr(g, 5, -W / 2 + 3, 8, W - 6, 2);
    g.fill();
    rr(g, -15, -W / 2 + 3, 6, W - 6, 2);
    g.fill();
    g.fillStyle = kind === 'cop' ? '#eef2ff' : 'rgba(0,0,0,0.15)';
    rr(g, -9, -W / 2 + 3, 14, W - 6, 2);
    g.fill();
    if (kind === 'taxi') {
      g.fillStyle = '#222';
      g.fillRect(-4, -4, 6, 8);
      g.fillStyle = '#ffd84d';
      g.fillRect(-3, -3, 4, 6);
    }
    if (kind === 'cop') {
      const on = Math.floor(t * 8) % 2 === 0;
      g.fillStyle = lights ? (on ? '#ff2d55' : '#5a1020') : '#5a1020';
      g.fillRect(-4, -W / 2 + 3, 4, W / 2 - 3);
      g.fillStyle = lights ? (!on ? '#2d7bff' : '#10204a') : '#10204a';
      g.fillRect(-4, 0, 4, W / 2 - 3);
    }
  }
  // lights
  g.fillStyle = '#fff6c8';
  g.fillRect(L / 2 - 3, -W / 2 + 2, 3, 4);
  g.fillRect(L / 2 - 3, W / 2 - 6, 3, 4);
  g.fillStyle = '#ff3355';
  g.fillRect(-L / 2, -W / 2 + 2, 2, 4);
  g.fillRect(-L / 2, W / 2 - 6, 2, 4);
  g.restore();
}

export const SKINS = ['#f1c7a3', '#d9a27a', '#b07a52', '#8a5a3b', '#5e3b26', '#f5d6b8'];
export const SHIRTS = ['#e0525f', '#3fa7d6', '#f2b134', '#7bc96f', '#9b6bd6', '#e07a3f', '#d6d6d6', '#2e2e3a', '#e86fb0', '#47c2b1'];
export const PANTS = ['#2a3350', '#3a2a22', '#1e1e24', '#4a4f5c', '#23304a', '#5b4636'];
export const HAIRS = ['#1b1410', '#3b2518', '#7a4a22', '#c9a15a', '#999', '#d1462f', '#101010'];
export const CAR_COLORS = ['#c0392b', '#2471a3', '#d68910', '#1e8449', '#7d3c98', '#95a5a6', '#34495e', '#e8e8e8', '#b03a6d', '#16a085'];

export function randLook(): Look {
  const p = <X,>(a: X[]) => a[Math.floor(Math.random() * a.length)];
  return { skin: p(SKINS), shirt: p(SHIRTS), pants: p(PANTS), hair: p(HAIRS) };
}
