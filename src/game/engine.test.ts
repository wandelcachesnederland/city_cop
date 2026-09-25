import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Game, SHIFT } from './engine';
import type { Stats } from './engine';
import { T, World } from './world';
import type { Precinct } from './world';
import type { Input } from './input';

// A World only needs its generated collision map for these tests. Avoid
// pre-rendering canvases in the Node test environment.
beforeAll(() => {
  vi.stubGlobal('document', { createElement: () => ({}) });
  vi.spyOn(World.prototype as unknown as { render(): void }, 'render').mockImplementation(() => {});
  vi.spyOn(World.prototype as unknown as { renderMini(): void }, 'renderMini').mockImplementation(() => {});
});
afterAll(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const internals = (game: Game) => game as unknown as {
  citySolid: (x: number, y: number) => boolean;
  updateCityPlayer: (dt: number) => void;
  updatePlay: (dt: number) => void;
  update: (dt: number) => void;
  gameOver: (reason: string, sub: string) => void;
  updatePrecinctPlayer: (dt: number) => void;
  updatePersons: (dt: number, ambient: boolean) => void;
  updateTraffic: (dt: number) => void;
  updateBullets: (dt: number) => void;
  updateFx: (dt: number) => void;
  updateCamera: (dt: number) => void;
  manageSpawns: (dt: number) => void;
};

function doorGame(): Game {
  const game = Object.create(Game.prototype) as Game;
  game.world = new World();
  game.mode = 'play';
  game.scene = 'city';
  game.player = { x: 31 * T, y: 34 * T + 6, vx: 0, vy: 0, dir: Math.PI / 2, walk: 0, hp: 100, boost: 0, inv: 0, shootCd: 0, squash: 0, inCar: false };
  game.car = { x: 0, y: 0, vx: 0, vy: 0, angle: 0, speed: 0, siren: false, crashCd: 0, hitCd: 0 };
  game.persons = [];
  game.ncars = [];
  game.custody = [];
  game.bullets = [];
  game.parts = [];
  game.cam = { x: 0, y: 0, zoom: 1 };
  game.precinct = { spawn: { x: 10 * T, y: 11.9 * T } } as Precinct;
  game.input = { axis: () => ({ x: 0, y: -1, joy: false }), consume: () => false, keys: new Set(), held: () => false } as unknown as Input;
  internals(game).citySolid = (x, y) => game.world.solidPx(x, y);
  return game;
}

const initialStats = (): Stats => ({
  score: 0, arrests: 0, helps: 0, tickets: 0, kills: 0, innocents: 0, booked: 0, good: 0, bad: 0,
  bestCombo: 1, rides: 0, trustBonus: 0, reason: '', sub: '', time: 0, trust: 0,
});

describe('game transitions', () => {
  it.each([30, 40, 60])('enters the precinct when holding Up at %i FPS', (fps) => {
    const game = doorGame();
    for (let frame = 0; frame < 120 && game.scene === 'city'; frame++) {
      internals(game).updateCityPlayer(Math.min(1 / fps, 1 / 30));
    }
    expect(game.scene).toBe('precinct');
  });

  it('can still enter at full boosted speed on a 30 FPS device', () => {
    const game = doorGame();
    game.player.boost = 10;
    for (let frame = 0; frame < 120 && game.scene === 'city'; frame++) {
      internals(game).updateCityPlayer(1 / 30);
    }
    expect(game.scene).toBe('precinct');
  });

  it('does not finish a shift indoors while city calls are frozen', () => {
    const game = Object.create(Game.prototype) as Game;
    game.mode = 'play';
    game.scene = 'precinct';
    game.elapsed = SHIFT - 0.1;
    game.trust = 60;
    game.player = { x: 320, y: 380, vx: 0, vy: 0, dir: 0, walk: 0, hp: 100, boost: 0, inv: 0, shootCd: 0, squash: 0, inCar: false };
    game.car = { x: 0, y: 0, vx: 0, vy: 0, angle: 0, speed: 0, siren: false, crashCd: 0, hitCd: 0 };
    game.input = { consume: () => false } as unknown as Input;
    game.radio = null;
    game.radioQ = [];
    game.persons = [{ role: 'inc', inc: { timer: 50, priority: true } } as Game['persons'][number]];
    const incident = game.persons[0];
    const methods = internals(game);
    methods.updatePrecinctPlayer = () => {};
    methods.updateBullets = () => {};
    methods.updateFx = () => {};
    methods.updateCamera = () => {};

    for (let i = 0; i < 120; i++) methods.updatePlay(1 / 30);

    expect(game.elapsed).toBe(SHIFT - 0.1);
    expect(incident.inc?.timer).toBe(50);
    expect(game.mode).toBe('play');
  });

  it('freezes the result before any pending bullet can hit after game over', () => {
    const game = Object.create(Game.prototype) as Game;
    const onGameOver = vi.fn();
    game.cb = { onGameOver, onPause: () => {}, onTransit: () => {} };
    game.mode = 'play';
    game.scene = 'city';
    game.t = 0;
    game.score = 1000;
    game.trust = 60;
    game.elapsed = 10;
    game.stats = initialStats();
    game.cam = { x: 0, y: 0, zoom: 1 };
    game.baseZoom = 1;
    game.shake = 0;
    game.flashA = 0;
    game.bullets = [{ x: 0, y: 0, vx: 1050, vy: 0, life: 0.55, from: 'p' }];
    const methods = internals(game);
    methods.updatePersons = () => {};
    methods.updateTraffic = () => {};
    methods.updateFx = () => {};
    const updateBullets = vi.spyOn(methods, 'updateBullets');

    methods.gameOver('OFFICER DOWN', 'test');
    methods.update(1.3);

    expect(game.bullets).toEqual([]);
    expect(updateBullets).not.toHaveBeenCalled();
    expect(game.score).toBe(1000);
    expect(game.stats.score).toBe(1000);
    expect(game.stats.kills).toBe(0);
    expect(onGameOver).toHaveBeenCalledWith(expect.objectContaining({ score: 1000, kills: 0 }));
  });
});
