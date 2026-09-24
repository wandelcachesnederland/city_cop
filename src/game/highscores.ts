export interface HighScore {
  name: string;
  score: number;
  rank: string;
  date: string;
}

const KEY = 'nightbeat.highscores.v1';

export function loadScores(): HighScore[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as HighScore[];
    return Array.isArray(arr) ? arr.slice(0, 10) : [];
  } catch {
    return [];
  }
}

export function qualifies(score: number): boolean {
  if (score <= 0) return false;
  const s = loadScores();
  return s.length < 10 || score > s[s.length - 1].score;
}

export function saveScore(entry: HighScore): HighScore[] {
  const s = loadScores();
  s.push(entry);
  s.sort((a, b) => b.score - a.score);
  const top = s.slice(0, 10);
  try {
    localStorage.setItem(KEY, JSON.stringify(top));
  } catch {
    /* ignore */
  }
  return top;
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
