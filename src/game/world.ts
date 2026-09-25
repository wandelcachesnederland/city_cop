// World generation & pre-rendering for NIGHT BEAT (tile map, districts, precinct interior)
export const T = 32;
export const BLOCK = 12;
export const NB = 6;
export const MW = NB * BLOCK + 2; // 74 tiles
export const MH = MW;
export const WORLD_PX = MW * T;

export const TL = {
  Grass: 0,
  Road: 1,
  Side: 2,
  Bldg: 3,
  Water: 4,
  Park: 5,
  Plaza: 6,
  Dock: 7,
  Tree: 8,
  Box: 9,
  Lawn: 10,
  Lot: 11,
} as const;

export type AreaId = 'downtown' | 'midtown' | 'chinatown' | 'park' | 'suburbs' | 'southside' | 'docks';

export const AREA_INFO: Record<AreaId, { name: string; color: string; tag: string }> = {
  downtown: { name: 'DOWNTOWN', color: '#4fc3ff', tag: 'Financial District' },
  midtown: { name: 'MIDTOWN', color: '#ffb347', tag: 'Old Brick Quarter' },
  chinatown: { name: 'CHINATOWN', color: '#ff4d6d', tag: 'Neon Lanterns' },
  park: { name: 'CENTRAL PARK', color: '#5cff9d', tag: 'Green Lungs' },
  suburbs: { name: 'MAPLE HEIGHTS', color: '#c9a7ff', tag: 'The Suburbs' },
  southside: { name: 'SOUTHSIDE', color: '#ffd84d', tag: 'Industrial Zone' },
  docks: { name: 'THE DOCKS', color: '#3de0d0', tag: 'Harbor Front' },
};

export function blockArea(bx: number, by: number): AreaId {
  if (bx >= 4 && by >= 4) return 'docks';
  if (bx >= 4) return 'chinatown';
  if (bx <= 1 && by >= 3) return 'suburbs';
  if (bx <= 1) return 'midtown';
  if (by === 3) return 'park';
  if (by >= 4) return 'southside';
  return 'downtown';
}

export function areaAtPx(x: number, y: number): AreaId {
  const tx = Math.floor(x / T);
  const ty = Math.floor(y / T);
  const bx = Math.max(0, Math.min(NB - 1, Math.floor((tx - 2) / BLOCK)));
  const by = Math.max(0, Math.min(NB - 1, Math.floor((ty - 2) / BLOCK)));
  return blockArea(bx, by);
}

export function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Building {
  x: number;
  y: number;
  w: number;
  h: number;
  roof: string;
  wall: string;
  kind: 'tower' | 'brick' | 'shop' | 'house' | 'ware' | 'precinct';
  neon?: string;
  neonColor?: string;
}

export interface Station {
  id: number;
  area: AreaId;
  name: string;
  x: number;
  y: number;
}

export const roadNode = (i: number) => (i * BLOCK + 1) * T;

const SOLID = new Set<number>([TL.Bldg, TL.Water, TL.Tree, TL.Box]);
const PED_WALK = new Set<number>([TL.Side, TL.Plaza, TL.Park, TL.Lawn, TL.Dock, TL.Lot]);

interface Rect { x: number; y: number; w: number; h: number }

export class World {
  tiles = new Uint8Array(MW * MH);
  buildings: Building[] = [];
  trees: { x: number; y: number; r: number; c: string }[] = [];
  boxes: { x: number; y: number; w: number; h: number; c: string }[] = [];
  lamps: { x: number; y: number }[] = [];
  stations: Station[] = [];
  canvas: HTMLCanvasElement;
  mini: HTMLCanvasElement;
  precinctFront = { x: 31 * T, y: 34 * T };
  carSpawn = { x: 28.6 * T, y: 34 * T, angle: 0 };
  // Trigger before the collision boundary (33*T + player radius), so even a
  // full movement step at low frame rates cannot skip the entrance.
  doorRect = { x0: 30 * T + 4, x1: 32 * T - 4, y: 33 * T + 24 };
  rng = mulberry32(1337);

  constructor() {
    this.generate();
    this.canvas = document.createElement('canvas');
    this.mini = document.createElement('canvas');
    this.render();
    this.renderMini();
  }

  get(tx: number, ty: number) {
    if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) return TL.Water;
    return this.tiles[ty * MW + tx];
  }
  set(tx: number, ty: number, v: number) {
    if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) return;
    this.tiles[ty * MW + tx] = v;
  }
  solid(tx: number, ty: number) {
    return SOLID.has(this.get(tx, ty));
  }
  solidPx(x: number, y: number) {
    return this.solid(Math.floor(x / T), Math.floor(y / T));
  }
  pedWalk(tx: number, ty: number) {
    return PED_WALK.has(this.get(tx, ty));
  }
  pedWalkPx(x: number, y: number) {
    return this.pedWalk(Math.floor(x / T), Math.floor(y / T));
  }
  isRoadPx(x: number, y: number) {
    return this.get(Math.floor(x / T), Math.floor(y / T)) === TL.Road;
  }

  randomTile(pred: (t: number, tx: number, ty: number) => boolean, rnd = Math.random): { x: number; y: number } {
    for (let i = 0; i < 400; i++) {
      const tx = Math.floor(rnd() * MW);
      const ty = Math.floor(rnd() * MH);
      if (pred(this.get(tx, ty), tx, ty)) return { x: (tx + 0.5) * T, y: (ty + 0.5) * T };
    }
    return { x: this.precinctFront.x, y: this.precinctFront.y };
  }

  private split(r: Rect, depth: number, min: number): Rect[] {
    const rng = this.rng;
    if (depth <= 0 || (depth < 2 && rng() < 0.25)) return [r];
    const canV = r.w >= min * 2 + 1;
    const canH = r.h >= min * 2 + 1;
    if (!canV && !canH) return [r];
    const vertical = canV && canH ? (r.w === r.h ? rng() < 0.5 : r.w > r.h) : canV;
    if (vertical) {
      const cut = min + Math.floor(rng() * (r.w - min * 2));
      return [
        ...this.split({ x: r.x, y: r.y, w: cut, h: r.h }, depth - 1, min),
        ...this.split({ x: r.x + cut + 1, y: r.y, w: r.w - cut - 1, h: r.h }, depth - 1, min),
      ];
    }
    const cut = min + Math.floor(rng() * (r.h - min * 2));
    return [
      ...this.split({ x: r.x, y: r.y, w: r.w, h: cut }, depth - 1, min),
      ...this.split({ x: r.x, y: r.y + cut + 1, w: r.w, h: r.h - cut - 1 }, depth - 1, min),
    ];
  }

  private fill(x: number, y: number, w: number, h: number, v: number) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, v);
  }

  private addBuilding(b: Building) {
    this.buildings.push(b);
    this.fill(b.x, b.y, b.w, b.h, TL.Bldg);
  }

  private addTree(tx: number, ty: number, c = '#1f7a4a') {
    if (this.get(tx, ty) === TL.Bldg) return;
    this.set(tx, ty, TL.Tree);
    this.trees.push({ x: (tx + 0.5) * T, y: (ty + 0.5) * T, r: 13 + this.rng() * 5, c });
  }

  private generate() {
    const rng = this.rng;
    for (let ty = 0; ty < MH; ty++) {
      for (let tx = 0; tx < MW; tx++) {
        const lx = tx % BLOCK;
        const ly = ty % BLOCK;
        let v: number = TL.Grass;
        if (lx <= 1 || ly <= 1) v = TL.Road;
        else if (lx === 2 || lx === 11 || ly === 2 || ly === 11) v = TL.Side;
        else v = TL.Plaza;
        this.tiles[ty * MW + tx] = v;
      }
    }
    const pick = <X,>(arr: X[]) => arr[Math.floor(rng() * arr.length)];
    const NEONS = ['BAR', 'HOTEL', '24/7', 'DINER', 'JAZZ', 'PIZZA', 'CLUB', 'MOTEL', 'BANK', 'LOANS'];
    const CHN = ['麺', '龍', '茶', '福', 'KARAOKE', 'DIM SUM', '酒'];

    for (let by = 0; by < NB; by++) {
      for (let bx = 0; bx < NB; bx++) {
        const ox = bx * BLOCK + 3;
        const oy = by * BLOCK + 3;
        const area = blockArea(bx, by);
        if (bx === 2 && by === 2) {
          // Precinct block
          this.fill(ox, oy, 8, 8, TL.Plaza);
          this.addBuilding({ x: 27, y: 27, w: 8, h: 6, roof: '#2a3a66', wall: '#1a2344', kind: 'precinct', neon: 'POLICE', neonColor: '#4fc3ff' });
          continue;
        }
        switch (area) {
          case 'downtown': {
            this.fill(ox, oy, 8, 8, TL.Plaza);
            for (const r of this.split({ x: ox, y: oy, w: 8, h: 8 }, 2, 3)) {
              const shade = pick(['#34405e', '#2c3b5a', '#3a3f63', '#27324f', '#3b4a6b']);
              this.addBuilding({ ...r, roof: shade, wall: '#141a2e', kind: 'tower', neon: rng() < 0.35 ? pick(NEONS) : undefined, neonColor: pick(['#4fc3ff', '#ff4dd2', '#7dff6a']) });
            }
            break;
          }
          case 'midtown': {
            this.fill(ox, oy, 8, 8, TL.Plaza);
            for (const r of this.split({ x: ox, y: oy, w: 8, h: 8 }, 3, 2)) {
              const shade = pick(['#6b3a33', '#7a4536', '#5e3530', '#81503c', '#5a4034']);
              this.addBuilding({ ...r, roof: shade, wall: '#2b1714', kind: 'brick', neon: rng() < 0.3 ? pick(NEONS) : undefined, neonColor: pick(['#ffb347', '#ff4d6d', '#fff36b']) });
            }
            break;
          }
          case 'chinatown': {
            this.fill(ox, oy, 8, 8, TL.Plaza);
            for (const r of this.split({ x: ox, y: oy, w: 8, h: 8 }, 3, 2)) {
              const shade = pick(['#8a2a2f', '#a33a2a', '#2e6b5f', '#7c2340', '#9a4a1f']);
              this.addBuilding({ ...r, roof: shade, wall: '#2a0f14', kind: 'shop', neon: rng() < 0.6 ? pick(CHN) : undefined, neonColor: pick(['#ff4d6d', '#ffd84d', '#3de0d0', '#ff4dd2']) });
            }
            break;
          }
          case 'park': {
            this.fill(ox, oy, 8, 8, TL.Park);
            this.fill(ox + 3, oy, 2, 8, TL.Plaza);
            this.fill(ox, oy + 3, 8, 2, TL.Plaza);
            if (bx === 3) {
              // pond
              for (let j = 0; j < 8; j++)
                for (let i = 0; i < 8; i++) {
                  const dx = i - 5.5;
                  const dy = j - 5.5;
                  if (dx * dx + dy * dy < 4.2) this.set(ox + i, oy + j, TL.Water);
                }
            }
            for (let k = 0; k < 14; k++) {
              const i = Math.floor(rng() * 8);
              const j = Math.floor(rng() * 8);
              if (this.get(ox + i, oy + j) === TL.Park) this.addTree(ox + i, oy + j, pick(['#1f7a4a', '#23874f', '#2a6e3f', '#338a57']));
            }
            break;
          }
          case 'suburbs': {
            this.fill(ox, oy, 8, 8, TL.Lawn);
            const spots = [
              [0, 0], [5, 0], [0, 5], [5, 5],
            ];
            for (const [i, j] of spots) {
              if (rng() < 0.9) {
                const shade = pick(['#6d5a8a', '#4f6d8a', '#8a6d4f', '#5a8a6d', '#8a4f5e']);
                this.addBuilding({ x: ox + i, y: oy + j, w: 3, h: 3, roof: shade, wall: '#231a2e', kind: 'house' });
              }
            }
            for (let k = 0; k < 6; k++) {
              const i = Math.floor(rng() * 8);
              const j = Math.floor(rng() * 8);
              if (this.get(ox + i, oy + j) === TL.Lawn && (i === 3 || i === 4 || j === 3 || j === 4) && rng() < 0.7)
                this.addTree(ox + i, oy + j, pick(['#2f8a4a', '#6a8a2f', '#8a5a2f']));
            }
            break;
          }
          case 'southside': {
            this.fill(ox, oy, 8, 8, TL.Lot);
            const rs = this.split({ x: ox, y: oy, w: 8, h: 8 }, 1, 3);
            rs.forEach((r, idx) => {
              if (idx === 0 || rng() < 0.5) {
                this.addBuilding({ ...r, roof: pick(['#4a4a3a', '#5a5540', '#3f4a44', '#55483a']), wall: '#1e1c16', kind: 'ware', neon: rng() < 0.2 ? pick(['GARAGE', 'SCRAP', 'TIRES']) : undefined, neonColor: '#ffd84d' });
              }
            });
            break;
          }
          case 'docks': {
            this.fill(ox, oy, 8, 8, TL.Dock);
            if (bx === 5) {
              this.fill(ox + 5, oy, 3, 8, TL.Water);
            }
            const maxX = bx === 5 ? 4 : 8;
            for (let j = 0; j < 8; j += 3) {
              for (let i = 0; i + 1 < maxX; i += 3) {
                if (rng() < 0.7) {
                  const c = pick(['#c0392b', '#2471a3', '#d68910', '#1e8449', '#7d3c98']);
                  this.fill(ox + i, oy + j, 2, 1, TL.Box);
                  this.boxes.push({ x: (ox + i) * T, y: (oy + j) * T, w: 2 * T, h: T, c });
                }
              }
            }
            break;
          }
        }
      }
    }

    // lamps along sidewalks
    for (let ty = 0; ty < MH; ty++)
      for (let tx = 0; tx < MW; tx++) {
        if (this.get(tx, ty) !== TL.Side) continue;
        const lx = tx % BLOCK;
        const ly = ty % BLOCK;
        const corner = (lx === 2 || lx === 11) && (ly === 2 || ly === 11);
        const mid = (lx === 6 && (ly === 2 || ly === 11)) || (ly === 6 && (lx === 2 || lx === 11));
        if (corner || mid) {
          const ex = lx === 2 ? -10 : lx === 11 ? 10 : 0;
          const ey = ly === 2 ? -10 : ly === 11 ? 10 : 0;
          this.lamps.push({ x: (tx + 0.5) * T + ex, y: (ty + 0.5) * T + ey });
        }
      }

    // metro stations
    const defs: [AreaId, number, number, string][] = [
      ['downtown', 3, 1, 'Wall St.'],
      ['midtown', 0, 1, 'Brick Lane'],
      ['chinatown', 5, 1, 'Dragon Gate'],
      ['park', 2, 3, 'Central Park'],
      ['suburbs', 0, 4, 'Maple Hts.'],
      ['southside', 3, 5, 'Foundry Rd.'],
      ['docks', 4, 5, 'Pier 9'],
    ];
    defs.forEach(([area, bx, by, name], id) => {
      const tx = bx * BLOCK + 7;
      const ty = by * BLOCK + 11;
      this.stations.push({ id, area, name, x: (tx + 0.5) * T, y: (ty + 0.5) * T });
    });
  }

  // ---------------------------------------------------------------- render
  private render() {
    const c = this.canvas;
    c.width = WORLD_PX;
    c.height = WORLD_PX;
    const g = c.getContext('2d')!;
    const rng = mulberry32(99);
    const baseCol: Record<number, string> = {
      [TL.Grass]: '#16301f',
      [TL.Road]: '#161a28',
      [TL.Side]: '#343a52',
      [TL.Bldg]: '#10131f',
      [TL.Water]: '#0a2744',
      [TL.Park]: '#173f2b',
      [TL.Plaza]: '#2a3046',
      [TL.Dock]: '#3d3024',
      [TL.Tree]: '#173f2b',
      [TL.Box]: '#3d3024',
      [TL.Lawn]: '#1d4a30',
      [TL.Lot]: '#23262f',
    };
    for (let ty = 0; ty < MH; ty++)
      for (let tx = 0; tx < MW; tx++) {
        let v = this.get(tx, ty);
        if (v === TL.Tree) {
          const a = areaAtPx(tx * T, ty * T);
          v = a === 'suburbs' ? TL.Lawn : TL.Park;
        }
        const x = tx * T;
        const y = ty * T;
        g.fillStyle = baseCol[v];
        g.fillRect(x, y, T, T);
        // texture
        if (v === TL.Road) {
          for (let k = 0; k < 4; k++) {
            g.fillStyle = `rgba(255,255,255,${0.015 + rng() * 0.02})`;
            g.fillRect(x + rng() * T, y + rng() * T, 2, 2);
          }
        } else if (v === TL.Side || v === TL.Plaza) {
          g.strokeStyle = 'rgba(0,0,0,0.25)';
          g.lineWidth = 1;
          g.strokeRect(x + 0.5, y + 0.5, T - 1, T - 1);
          if (v === TL.Plaza) {
            g.fillStyle = 'rgba(120,140,200,0.05)';
            g.fillRect(x + 4, y + 4, T - 8, T - 8);
          }
        } else if (v === TL.Park || v === TL.Lawn || v === TL.Grass) {
          for (let k = 0; k < 6; k++) {
            g.fillStyle = `rgba(120,255,160,${0.04 + rng() * 0.05})`;
            g.fillRect(x + rng() * T, y + rng() * T, 2, 3);
          }
        } else if (v === TL.Dock) {
          g.fillStyle = 'rgba(0,0,0,0.25)';
          for (let k = 0; k < 4; k++) g.fillRect(x, y + k * 8, T, 1);
          g.fillStyle = 'rgba(255,200,140,0.05)';
          g.fillRect(x + ((tx * 7) % 3) * 10, y, 1, T);
        } else if (v === TL.Water) {
          g.strokeStyle = 'rgba(90,180,255,0.18)';
          g.beginPath();
          const wy = y + 8 + rng() * 16;
          g.moveTo(x + 4, wy);
          g.quadraticCurveTo(x + 16, wy - 4, x + 28, wy);
          g.stroke();
        } else if (v === TL.Lot) {
          if (tx % 2 === 0) {
            g.fillStyle = 'rgba(255,230,120,0.25)';
            g.fillRect(x, y + 2, 2, T - 4);
          }
        }
      }

    // curb lines
    g.fillStyle = 'rgba(160,180,230,0.25)';
    for (let ty = 0; ty < MH; ty++)
      for (let tx = 0; tx < MW; tx++) {
        if (this.get(tx, ty) !== TL.Road) continue;
        const x = tx * T;
        const y = ty * T;
        if (this.get(tx, ty - 1) === TL.Side) g.fillRect(x, y, T, 2);
        if (this.get(tx, ty + 1) === TL.Side) g.fillRect(x, y + T - 2, T, 2);
        if (this.get(tx - 1, ty) === TL.Side) g.fillRect(x, y, 2, T);
        if (this.get(tx + 1, ty) === TL.Side) g.fillRect(x + T - 2, y, 2, T);
      }

    // lane markings + crosswalks
    for (let ty = 0; ty < MH; ty++)
      for (let tx = 0; tx < MW; tx++) {
        if (this.get(tx, ty) !== TL.Road) continue;
        const lx = tx % BLOCK;
        const ly = ty % BLOCK;
        const x = tx * T;
        const y = ty * T;
        const hRoad = ly <= 1;
        const vRoad = lx <= 1;
        if (hRoad && !vRoad) {
          if (lx === 2 || lx === 11) {
            g.fillStyle = 'rgba(230,235,255,0.55)';
            for (let k = 0; k < 4; k++) g.fillRect(x + 4 + k * 7, y + 3, 4, T - 6);
          } else if (ly === 0) {
            g.fillStyle = '#e8b93a';
            g.fillRect(x + 4, y + T - 1, 14, 2);
          }
        }
        if (vRoad && !hRoad) {
          if (ly === 2 || ly === 11) {
            g.fillStyle = 'rgba(230,235,255,0.55)';
            for (let k = 0; k < 4; k++) g.fillRect(x + 3, y + 4 + k * 7, T - 6, 4);
          } else if (lx === 0) {
            g.fillStyle = '#e8b93a';
            g.fillRect(x + T - 1, y + 4, 2, 14);
          }
        }
      }

    // lamp glows on ground
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const l of this.lamps) {
      const a = areaAtPx(l.x, l.y);
      const col = a === 'chinatown' ? '255,90,120' : a === 'docks' ? '80,230,210' : '255,200,120';
      const gr = g.createRadialGradient(l.x, l.y, 2, l.x, l.y, 70);
      gr.addColorStop(0, `rgba(${col},0.22)`);
      gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr;
      g.fillRect(l.x - 70, l.y - 70, 140, 140);
    }
    g.restore();

    // containers
    for (const b of this.boxes) {
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillRect(b.x + 6, b.y + 6, b.w - 2, b.h - 2);
      g.fillStyle = b.c;
      g.fillRect(b.x + 2, b.y + 3, b.w - 4, b.h - 6);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      for (let k = 6; k < b.w - 4; k += 5) g.fillRect(b.x + k, b.y + 3, 1, b.h - 6);
      g.fillStyle = 'rgba(255,255,255,0.15)';
      g.fillRect(b.x + 2, b.y + 3, b.w - 4, 2);
    }

    // buildings
    for (const b of this.buildings) this.drawBuilding(g, b, rng);

    // precinct door & lot markings
    {
      g.fillStyle = '#0b0f1c';
      g.fillRect(30 * T + 4, 32 * T + 10, 2 * T - 8, T - 10);
      g.fillStyle = '#4fc3ff';
      g.shadowColor = '#4fc3ff';
      g.shadowBlur = 12;
      g.fillRect(30 * T + 4, 32 * T + 8, 2 * T - 8, 3);
      g.shadowBlur = 0;
      g.fillStyle = 'rgba(79,195,255,0.35)';
      g.fillRect(30 * T + 8, 32 * T + 14, 2 * T - 16, T - 16);
      g.strokeStyle = 'rgba(255,255,255,0.5)';
      g.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.moveTo(27 * T + 8 + i * 20, 33 * T + 18);
        g.lineTo(27 * T + 8 + i * 20, 35 * T - 4);
        g.stroke();
      }
      g.fillStyle = 'rgba(79,195,255,0.8)';
      g.font = 'bold 11px "Chakra Petch", sans-serif';
      g.textAlign = 'center';
      g.fillText('POLICE ONLY', 28.6 * T, 35 * T - 8);
    }

    // trees
    for (const t of this.trees) {
      g.fillStyle = 'rgba(0,0,0,0.4)';
      g.beginPath();
      g.ellipse(t.x + 5, t.y + 6, t.r, t.r * 0.85, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = t.c;
      g.beginPath();
      g.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.1)';
      g.beginPath();
      g.arc(t.x - t.r * 0.3, t.y - t.r * 0.3, t.r * 0.55, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(0,0,0,0.15)';
      g.beginPath();
      g.arc(t.x + t.r * 0.35, t.y + t.r * 0.3, t.r * 0.5, 0, Math.PI * 2);
      g.fill();
    }

    // Chinatown lanterns across roads
    for (let by = 0; by <= NB; by++) {
      const ry = roadNode(by);
      for (let tx = 4 * BLOCK + 2; tx < MW - 1; tx += 3) {
        if (tx % BLOCK <= 1) continue;
        if (areaAtPx(tx * T, ry) !== 'chinatown' || by > 4) continue;
        const x = tx * T + 16;
        g.strokeStyle = 'rgba(255,200,200,0.25)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x, ry - 36);
        g.quadraticCurveTo(x + 4, ry, x, ry + 36);
        g.stroke();
        for (let k = -1; k <= 1; k++) {
          const ly = ry + k * 20;
          g.fillStyle = '#ff3b4f';
          g.shadowColor = '#ff3b4f';
          g.shadowBlur = 10;
          g.beginPath();
          g.ellipse(x + 2, ly, 4, 5, 0, 0, Math.PI * 2);
          g.fill();
          g.shadowBlur = 0;
        }
      }
    }

    // stations
    for (const s of this.stations) {
      const x = s.x;
      const y = s.y;
      g.fillStyle = '#05070f';
      g.fillRect(x - 15, y - 12, 30, 24);
      g.fillStyle = '#1a2240';
      for (let k = 0; k < 4; k++) g.fillRect(x - 12, y - 9 + k * 5, 24, 3);
      g.strokeStyle = '#ffd84d';
      g.lineWidth = 2;
      g.shadowColor = '#ffd84d';
      g.shadowBlur = 14;
      g.strokeRect(x - 15, y - 12, 30, 24);
      g.beginPath();
      g.arc(x, y - 22, 9, 0, Math.PI * 2);
      g.fillStyle = '#ffd84d';
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = '#05070f';
      g.font = 'bold 12px "Russo One", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('M', x, y - 21);
      g.textBaseline = 'alphabetic';
    }

    // lamp posts
    for (const l of this.lamps) {
      g.fillStyle = '#0a0c14';
      g.beginPath();
      g.arc(l.x, l.y, 3.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff1c9';
      g.beginPath();
      g.arc(l.x, l.y, 2, 0, Math.PI * 2);
      g.fill();
    }
  }

  private drawBuilding(g: CanvasRenderingContext2D, b: Building, rng: () => number) {
    const x = b.x * T;
    const y = b.y * T;
    const w = b.w * T;
    const h = b.h * T;
    const tall = b.kind === 'tower' ? 18 : b.kind === 'house' ? 8 : b.kind === 'precinct' ? 14 : 12;
    // shadow
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(x + 8, y + 10, w, h);
    // wall face (bottom)
    g.fillStyle = b.wall;
    g.fillRect(x + 1, y + h - tall - 1, w - 2, tall);
    // lit windows on wall face
    for (let wx = x + 6; wx < x + w - 8; wx += 9) {
      if (rng() < 0.55) {
        g.fillStyle = rng() < 0.7 ? 'rgba(255,214,120,0.85)' : 'rgba(140,220,255,0.8)';
        g.fillRect(wx, y + h - tall + 3, 4, Math.max(3, tall - 8));
      }
    }
    // roof
    const rh = h - tall - 1;
    g.fillStyle = b.roof;
    if (b.kind === 'house') {
      g.fillRect(x + 2, y + 2, w - 4, rh);
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.beginPath();
      g.moveTo(x + 2, y + 2);
      g.lineTo(x + w - 2, y + 2);
      g.lineTo(x + w / 2, y + rh / 2 + 2);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(0,0,0,0.2)';
      g.beginPath();
      g.moveTo(x + 2, y + rh + 2);
      g.lineTo(x + w - 2, y + rh + 2);
      g.lineTo(x + w / 2, y + rh / 2 + 2);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.3)';
      g.beginPath();
      g.moveTo(x + 2, y + 2);
      g.lineTo(x + w - 2, y + rh + 2);
      g.moveTo(x + w - 2, y + 2);
      g.lineTo(x + 2, y + rh + 2);
      g.stroke();
      return;
    }
    g.fillRect(x + 1, y + 1, w - 2, rh);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(x + 1, y + 1, w - 2, 3);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(x + 1, y + rh - 2, w - 2, 3);
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 2;
    g.strokeRect(x + 5, y + 5, w - 10, rh - 8);
    // roof details
    const n = Math.floor((b.w * b.h) / 6) + 1;
    for (let k = 0; k < n; k++) {
      const ax = x + 10 + rng() * (w - 30);
      const ay = y + 10 + rng() * Math.max(4, rh - 30);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(ax + 3, ay + 3, 12, 10);
      g.fillStyle = 'rgba(180,190,210,0.35)';
      g.fillRect(ax, ay, 12, 10);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath();
      g.arc(ax + 6, ay + 5, 3, 0, Math.PI * 2);
      g.fill();
    }
    if (b.kind === 'tower' && rng() < 0.5) {
      // helipad / blinking tower light
      g.fillStyle = 'rgba(255,60,60,0.9)';
      g.beginPath();
      g.arc(x + w - 10, y + 10, 2.5, 0, Math.PI * 2);
      g.fill();
    }
    if (b.kind === 'precinct') {
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.beginPath();
      g.arc(x + w - 40, y + rh / 2, 22, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x + w - 40, y + rh / 2, 22, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.font = 'bold 22px "Russo One", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('H', x + w - 40, y + rh / 2 + 1);
      g.textBaseline = 'alphabetic';
      // flag stripes
      g.fillStyle = '#ff2d55';
      g.fillRect(x + 1, y + 1, w / 2 - 1, 4);
      g.fillStyle = '#2d7bff';
      g.fillRect(x + w / 2, y + 1, w / 2 - 1, 4);
    }
    if (b.neon) {
      const fs = b.neon.length <= 2 ? 20 : Math.min(18, Math.max(10, (w - 12) / (b.neon.length * 0.75)));
      g.font = `${fs}px "Russo One", sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = b.neonColor || '#ff4dd2';
      g.shadowColor = b.neonColor || '#ff4dd2';
      g.shadowBlur = 16;
      const tx = b.kind === 'precinct' ? x + 90 : x + w / 2;
      g.fillText(b.neon, tx, y + rh / 2 + 1);
      g.fillText(b.neon, tx, y + rh / 2 + 1);
      g.shadowBlur = 0;
      g.textBaseline = 'alphabetic';
    }
  }

  private renderMini() {
    const c = this.mini;
    c.width = MW;
    c.height = MH;
    const g = c.getContext('2d')!;
    const img = g.createImageData(MW, MH);
    const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    for (let ty = 0; ty < MH; ty++)
      for (let tx = 0; tx < MW; tx++) {
        const v = this.get(tx, ty);
        const a = AREA_INFO[areaAtPx(tx * T, ty * T)].color;
        const ac = hex(a);
        let col: number[];
        if (v === TL.Road) col = [40, 46, 70];
        else if (v === TL.Water) col = [14, 50, 90];
        else if (v === TL.Bldg) col = ac.map((q) => q * 0.45);
        else if (v === TL.Park || v === TL.Tree || v === TL.Lawn) col = [30, 90, 55];
        else col = ac.map((q) => q * 0.2 + 20);
        const i = (ty * MW + tx) * 4;
        img.data[i] = col[0];
        img.data[i + 1] = col[1];
        img.data[i + 2] = col[2];
        img.data[i + 3] = 255;
      }
    g.putImageData(img, 0, 0);
  }
}

// ------------------------------------------------------------------ Precinct interior
export const PW = 20;
export const PH = 14;
export const PT = {
  Floor: 0,
  Wall: 1,
  Desk: 2,
  Bars: 3,
  Locker: 4,
  Machine: 5,
  Cell: 6,
  Door: 7,
  Rug: 8,
} as const;

export interface PObj {
  id: 'book' | 'armory' | 'coffee' | 'motor';
  x: number;
  y: number;
  label: string;
}

export class Precinct {
  tiles = new Uint8Array(PW * PH);
  canvas: HTMLCanvasElement;
  objs: PObj[] = [
    { id: 'book', x: 10 * T, y: 5.6 * T, label: 'BOOK SUSPECTS' },
    { id: 'armory', x: 16 * T, y: 2.6 * T, label: 'ARMORY · HEAL' },
    { id: 'coffee', x: 17.2 * T, y: 7.5 * T, label: 'COFFEE · SPEED' },
    { id: 'motor', x: 17.2 * T, y: 10.5 * T, label: 'MOTOR POOL · CALL CAR' },
  ];
  spawn = { x: 10 * T, y: 11.9 * T };
  cellArea = { x: 1 * T, y: 1 * T, w: 5 * T, h: 5 * T };

  constructor() {
    const s = (x: number, y: number, v: number) => (this.tiles[y * PW + x] = v);
    for (let y = 0; y < PH; y++)
      for (let x = 0; x < PW; x++) {
        let v: number = PT.Floor;
        if (x === 0 || y === 0 || x === PW - 1 || y === PH - 1) v = PT.Wall;
        s(x, y, v);
      }
    s(9, PH - 1, PT.Door);
    s(10, PH - 1, PT.Door);
    for (let y = 1; y <= 5; y++) for (let x = 1; x <= 5; x++) s(x, y, PT.Cell);
    for (let x = 1; x <= 6; x++) s(x, 6, PT.Bars);
    for (let y = 1; y <= 6; y++) s(6, y, PT.Bars);
    for (let x = 8; x <= 11; x++) s(x, 4, PT.Desk);
    for (let x = 14; x <= 18; x++) s(x, 1, PT.Locker);
    s(18, 7, PT.Machine);
    s(18, 10, PT.Machine);
    for (const [a, b] of [[2, 9], [3, 9], [12, 9], [13, 9], [2, 11], [3, 11]]) s(a, b, PT.Desk);
    for (let y = 7; y <= 12; y++) for (let x = 8; x <= 11; x++) if (this.tiles[y * PW + x] === PT.Floor) s(x, y, PT.Rug);
    this.canvas = document.createElement('canvas');
    this.render();
  }

  get(x: number, y: number) {
    if (x < 0 || y < 0 || x >= PW || y >= PH) return PT.Wall;
    return this.tiles[y * PW + x];
  }
  solidPx(px: number, py: number) {
    const v = this.get(Math.floor(px / T), Math.floor(py / T));
    return v === PT.Wall || v === PT.Desk || v === PT.Bars || v === PT.Locker || v === PT.Machine;
  }

  private render() {
    const c = this.canvas;
    c.width = PW * T;
    c.height = PH * T;
    const g = c.getContext('2d')!;
    for (let y = 0; y < PH; y++)
      for (let x = 0; x < PW; x++) {
        const v = this.get(x, y);
        const px = x * T;
        const py = y * T;
        const checker = (x + y) % 2 === 0;
        switch (v) {
          case PT.Floor:
            g.fillStyle = checker ? '#2b3350' : '#252c46';
            g.fillRect(px, py, T, T);
            break;
          case PT.Rug:
            g.fillStyle = '#1b3a7a';
            g.fillRect(px, py, T, T);
            g.fillStyle = 'rgba(255,215,90,0.35)';
            if (x === 8) g.fillRect(px + 3, py, 2, T);
            if (x === 11) g.fillRect(px + T - 5, py, 2, T);
            break;
          case PT.Cell:
            g.fillStyle = '#1a1d28';
            g.fillRect(px, py, T, T);
            g.strokeStyle = 'rgba(255,255,255,0.04)';
            g.strokeRect(px + 0.5, py + 0.5, T - 1, T - 1);
            break;
          case PT.Wall:
          case PT.Door:
            g.fillStyle = v === PT.Door ? '#2b3350' : '#0e1224';
            g.fillRect(px, py, T, T);
            if (v === PT.Wall) {
              g.fillStyle = '#1c2340';
              g.fillRect(px, py + T - 8, T, 8);
            } else {
              g.fillStyle = 'rgba(79,195,255,0.4)';
              g.fillRect(px, py + T - 6, T, 6);
            }
            break;
          default:
            g.fillStyle = checker ? '#2b3350' : '#252c46';
            g.fillRect(px, py, T, T);
        }
      }
    // bars
    for (let y = 0; y < PH; y++)
      for (let x = 0; x < PW; x++) {
        const v = this.get(x, y);
        const px = x * T;
        const py = y * T;
        if (v === PT.Bars) {
          g.fillStyle = '#8791b3';
          if (y === 6) for (let k = 2; k < T; k += 6) g.fillRect(px + k, py + 10, 3, 12);
          if (x === 6 && y < 6) for (let k = 2; k < T; k += 6) g.fillRect(px + 10, py + k, 12, 3);
          g.fillStyle = '#5a6384';
          if (y === 6) g.fillRect(px, py + 14, T, 4);
          if (x === 6) g.fillRect(px + 14, py, 4, T);
        } else if (v === PT.Desk) {
          g.fillStyle = 'rgba(0,0,0,0.4)';
          g.fillRect(px + 4, py + 6, T, T);
          g.fillStyle = '#6b4a2e';
          g.fillRect(px, py + 2, T, T - 4);
          g.fillStyle = '#80593a';
          g.fillRect(px, py + 2, T, 4);
          if ((x + y) % 2 === 0) {
            g.fillStyle = '#9ad7ff';
            g.fillRect(px + 8, py + 8, 14, 10);
            g.fillStyle = '#1b2a44';
            g.fillRect(px + 10, py + 10, 10, 6);
          } else {
            g.fillStyle = '#f5f0e0';
            g.fillRect(px + 6, py + 10, 10, 12);
            g.fillRect(px + 12, py + 8, 10, 12);
          }
        } else if (v === PT.Locker) {
          g.fillStyle = '#39507a';
          g.fillRect(px + 1, py, T - 2, T - 2);
          g.fillStyle = '#2a3d60';
          g.fillRect(px + T / 2 - 1, py, 2, T - 2);
          g.fillStyle = '#c8d4ff';
          g.fillRect(px + 10, py + 12, 3, 5);
          g.fillRect(px + 19, py + 12, 3, 5);
        } else if (v === PT.Machine) {
          g.fillStyle = 'rgba(0,0,0,0.4)';
          g.fillRect(px + 2, py + 4, T, T);
          g.fillStyle = y === 7 ? '#7a2b2b' : '#2b6a5a';
          g.fillRect(px + 2, py + 1, T - 4, T - 2);
          g.fillStyle = y === 7 ? '#ffcf8a' : '#7dffd8';
          g.shadowColor = g.fillStyle as string;
          g.shadowBlur = 10;
          g.fillRect(px + 7, py + 6, T - 14, 8);
          g.shadowBlur = 0;
        }
      }
    // labels
    g.textAlign = 'center';
    g.font = 'bold 12px "Russo One", sans-serif';
    g.fillStyle = 'rgba(255,90,110,0.9)';
    g.fillText('HOLDING', 3.5 * T, 0.7 * T);
    g.fillStyle = 'rgba(79,195,255,0.9)';
    g.fillText('BOOKING', 10 * T, 3.6 * T);
    g.fillStyle = 'rgba(160,200,255,0.9)';
    g.fillText('ARMORY', 16.5 * T, 0.7 * T);
    // badge emblem on rug
    g.fillStyle = 'rgba(255,215,90,0.25)';
    g.beginPath();
    const cx = 10 * T;
    const cy = 9.5 * T;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? 34 : 20;
      g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  }
}
