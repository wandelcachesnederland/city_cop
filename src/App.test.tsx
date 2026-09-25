// @vitest-environment happy-dom
import { webcrypto } from 'node:crypto';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Stats } from './game/engine';
import { loadScores, SCORE_STORAGE_PREFIX } from './game/highscores';

const mockGame = vi.hoisted(() => ({
  onGameOver: null as ((stats: Stats) => void) | null,
  newGame: vi.fn(),
  quitToTitle: vi.fn(),
}));
vi.mock('./game/engine', () => ({
  Game: class {
    constructor(_canvas: HTMLCanvasElement, callbacks: { onGameOver: (stats: Stats) => void }) {
      mockGame.onGameOver = callbacks.onGameOver;
    }
    newGame() { mockGame.newGame(); }
    quitToTitle() { mockGame.quitToTitle(); }
    resume() {}
    travelTo() {}
    destroy() {}
  },
}));
vi.mock('./game/audio', () => ({ sfx: { muted: false, init: vi.fn(), setMuted: vi.fn() } }));

import App from './App';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  rejectScoreWrites = false;
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (this.rejectScoreWrites && key.startsWith(SCORE_STORAGE_PREFIX)) throw new Error('QuotaExceededError');
    this.values.set(key, value);
  }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

let storage: MemoryStorage;
beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('crypto', webcrypto);
  mockGame.onGameOver = null;
  mockGame.newGame.mockClear();
  mockGame.quitToTitle.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const finalStats: Stats = {
  score: 1500, arrests: 1, helps: 0, tickets: 0, kills: 0, innocents: 0, booked: 0,
  good: 1, bad: 0, bestCombo: 1, rides: 0, trustBonus: 0,
  reason: 'SHIFT COMPLETE', sub: 'End of shift', time: 300, trust: 60,
};

async function finishRun() {
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: /START SHIFT/ }));
  expect(mockGame.newGame).toHaveBeenCalledTimes(1);
  act(() => mockGame.onGameOver!(finalStats));
}

describe('game UI', () => {
  it('does not offer Start before the engine effect has run', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('PREPARING CITY');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>PREPARING CITY/);
  });

  it('keeps a failed score available for retry instead of leaving the result screen', async () => {
    await finishRun();
    storage.rejectScoreWrites = true;
    fireEvent.click(screen.getByRole('button', { name: 'SAVE' }));

    expect(screen.getByRole('alert').textContent).toContain('Could not save your score');
    expect(screen.getByRole('button', { name: 'SAVE' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /↻ PLAY AGAIN/ }));
    expect(mockGame.newGame).toHaveBeenCalledTimes(1);
    expect(loadScores()).toEqual([]);

    storage.rejectScoreWrites = false;
    fireEvent.click(screen.getByRole('button', { name: 'SAVE' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(loadScores().map((entry) => entry.name)).toEqual(['ACE']);
  });

  it('allows an explicit discard when storage cannot be used', async () => {
    await finishRun();
    storage.rejectScoreWrites = true;
    fireEvent.click(screen.getByRole('button', { name: 'SAVE' }));
    const discard = screen.getByRole('button', { name: 'TITLE WITHOUT SAVING' });
    discard.focus();
    fireEvent.keyDown(discard, { key: 'Enter', code: 'Enter' });
    expect(mockGame.newGame).toHaveBeenCalledTimes(1); // Native button activation, not the restart shortcut.
    fireEvent.click(discard);

    expect(mockGame.quitToTitle).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('button', { name: /START SHIFT/ })).toBeTruthy();
    expect(loadScores()).toEqual([]);
  });

  it('refreshes the hall of fame when another tab saves a score', async () => {
    render(<App />);
    await screen.findByRole('button', { name: /START SHIFT/ });
    const key = `${SCORE_STORAGE_PREFIX}v2.another-tab`;
    storage.setItem(key, JSON.stringify({ name: 'OTHER', score: 2000, rank: 'Officer', date: '2026-09-25T00:00:00.000Z' }));
    act(() => window.dispatchEvent(new StorageEvent('storage', { key })));

    expect(screen.getByText('OTHER')).toBeTruthy();
  });
});
