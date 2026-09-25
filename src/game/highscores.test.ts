import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadScores, qualifies, saveScore } from './highscores';
import type { HighScore } from './highscores';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  onWrite?: (key: string) => void;
  rejectWrites = false;

  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (this.rejectWrites) throw new Error('QuotaExceededError');
    this.onWrite?.(key);
    this.values.set(key, value);
  }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

const score = (name: string, points: number): HighScore => ({ name, score: points, rank: 'Officer', date: '2026-09-25T00:00:00.000Z' });
let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('crypto', webcrypto);
});

afterEach(() => vi.unstubAllGlobals());

describe('high scores', () => {
  it('reads the legacy top ten alongside new independently stored scores', () => {
    const legacy = [score('OLD', 500), null, { name: 'broken', score: 'not a number' }];
    storage.setItem('nightbeat.highscores.v1', JSON.stringify(legacy));

    const saved = saveScore(score('NEW', 1000));

    expect(saved.index).toBe(0);
    expect(saved.scores.map((entry) => entry.name)).toEqual(['NEW', 'OLD']);
    expect(loadScores().map((entry) => entry.name)).toEqual(['NEW', 'OLD']);
    expect(JSON.parse(storage.getItem('nightbeat.highscores.v1')!)).toEqual(legacy);
  });

  it('does not lose a score when another tab writes before our write completes', () => {
    let interleaved = false;
    storage.onWrite = (key) => {
      if (key.startsWith('nightbeat.highscores.v2.') && !interleaved) {
        interleaved = true;
        saveScore(score('OTHER TAB', 800));
      }
    };

    saveScore(score('THIS TAB', 1000));

    expect(loadScores().map((entry) => entry.name)).toEqual(['THIS TAB', 'OTHER TAB']);
    expect(storage.length).toBe(2);
  });

  it('throws instead of claiming a failed write was saved', () => {
    storage.rejectWrites = true;

    expect(() => saveScore(score('UNSAVED', 1000))).toThrow('QuotaExceededError');
    expect(loadScores()).toEqual([]);
  });

  it('ignores damaged records and uses the sorted top ten for qualification', () => {
    storage.setItem('nightbeat.highscores.v2.corrupt', '{');
    storage.setItem('nightbeat.highscores.v1', JSON.stringify(Array.from({ length: 10 }, (_, i) => score(`P${i}`, 100 + i))));

    expect(loadScores()).toHaveLength(10);
    expect(qualifies(100)).toBe(false);
    expect(qualifies(101)).toBe(true);
  });
});
