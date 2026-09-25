export interface HighScore {
  name: string;
  score: number;
  rank: string;
  date: string;
}

export const SCORE_STORAGE_PREFIX = 'nightbeat.highscores.';
const LEGACY_KEY = `${SCORE_STORAGE_PREFIX}v1`;
const ENTRY_PREFIX = `${SCORE_STORAGE_PREFIX}v2.`;
const MAX_SCORES = 10;

type StoredScore = { key: string; entry: HighScore };

function isHighScore(value: unknown): value is HighScore {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Partial<HighScore>;
  return typeof entry.name === 'string' && typeof entry.rank === 'string' && typeof entry.date === 'string'
    && typeof entry.score === 'number' && Number.isFinite(entry.score) && entry.score > 0;
}

function readScores(): StoredScore[] {
  const scores: StoredScore[] = [];

  // Existing players' v1 leaderboard is read-only; new records are written
  // under independent keys so concurrent tabs never replace the same list.
  try {
    const old = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null') as unknown;
    if (Array.isArray(old)) old.forEach((entry, i) => {
      if (isHighScore(entry)) scores.push({ key: `${LEGACY_KEY}.${i}`, entry });
    });
  } catch {
    // Ignore a corrupt or inaccessible legacy list; still try v2 records.
  }

  const count = localStorage.length;
  for (let i = 0; i < count; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(ENTRY_PREFIX)) continue;
    try {
      const entry = JSON.parse(localStorage.getItem(key) || 'null') as unknown;
      if (isHighScore(entry)) scores.push({ key, entry });
    } catch {
      // A bad individual record must not prevent the game from loading.
    }
  }
  return scores;
}

function topScores(scores: StoredScore[]): StoredScore[] {
  return scores.sort((a, b) => b.entry.score - a.entry.score || a.entry.date.localeCompare(b.entry.date) || a.key.localeCompare(b.key)).slice(0, MAX_SCORES);
}

export function loadScores(): HighScore[] {
  try {
    return topScores(readScores()).map(({ entry }) => entry);
  } catch {
    return [];
  }
}

export function qualifies(score: number): boolean {
  if (!Number.isFinite(score) || score <= 0) return false;
  const scores = loadScores();
  return scores.length < MAX_SCORES || score > scores[scores.length - 1].score;
}

function newEntryKey(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return ENTRY_PREFIX + Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function saveScore(entry: HighScore): { scores: HighScore[]; index: number } {
  // A unique key makes each score an atomic localStorage write, rather than
  // a read-modify-write of a shared top-ten array across tabs.
  let key = newEntryKey();
  for (let attempt = 0; localStorage.getItem(key) !== null; attempt++) {
    if (attempt >= 3) throw new Error('Could not allocate a high-score key');
    key = newEntryKey();
  }
  localStorage.setItem(key, JSON.stringify(entry)); // Let write failures reach the UI.

  let records: StoredScore[] = [];
  try {
    records = readScores();
  } catch {
    // The write succeeded, even if listing storage is temporarily unavailable.
  }
  if (!records.some((record) => record.key === key)) records.push({ key, entry });
  const top = topScores(records);
  return { scores: top.map((record) => record.entry), index: top.findIndex((record) => record.key === key) };
}

export function rankFor(score: number): string {
  if (score >= 12000) return 'Commissioner';
  if (score >= 8000) return 'Captain';
  if (score >= 5000) return 'Lieutenant';
  if (score >= 3000) return 'Detective';
  if (score >= 1500) return 'Sergeant';
  if (score >= 500) return 'Officer';
  return 'Rookie';
}
