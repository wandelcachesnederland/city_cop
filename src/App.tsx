import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Game } from './game/engine';
import type { Stats } from './game/engine';
import type { Station } from './game/world';
import { AREA_INFO } from './game/world';
import { loadScores, qualifies, saveScore, rankFor } from './game/highscores';
import type { HighScore } from './game/highscores';
import { sfx } from './game/audio';
import { ACTION_INFO, ACTIONS } from './game/incidents';

type Screen = 'title' | 'playing' | 'paused' | 'transit' | 'over';

const NAME_KEY = 'nightbeat.name';

function Btn({ children, onClick, variant = 'primary', className = '' }: { children: ReactNode; onClick: () => void; variant?: 'primary' | 'ghost' | 'danger'; className?: string }) {
  const base = 'font-display tracking-wider rounded-xl px-6 py-3 transition-all active:scale-95 select-none cursor-pointer';
  const styles = {
    primary: 'bg-cyan-400 text-slate-950 hover:bg-cyan-300 shadow-[0_0_24px_rgba(79,195,255,0.55)]',
    ghost: 'bg-white/5 text-cyan-100 border border-cyan-300/30 hover:bg-white/10',
    danger: 'bg-rose-500 text-white hover:bg-rose-400 shadow-[0_0_24px_rgba(255,77,109,0.5)]',
  }[variant];
  return (
    <button onClick={onClick} className={`${base} ${styles} ${className}`}>
      {children}
    </button>
  );
}

function ScoreTable({ scores, highlight }: { scores: HighScore[]; highlight?: number | null }) {
  if (!scores.length)
    return <p className="text-sm text-slate-400 italic py-4 text-center">No records yet. Be the first legend of the night shift.</p>;
  return (
    <ol className="space-y-1">
      {scores.map((s, i) => (
        <li
          key={i}
          className={`flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm ${i === highlight ? 'bg-yellow-300/20 ring-1 ring-yellow-300 text-yellow-100' : i % 2 ? 'bg-white/[0.03]' : 'bg-white/[0.06]'}`}
        >
          <span className={`font-display w-6 text-right ${i === 0 ? 'text-yellow-300' : i === 1 ? 'text-slate-200' : i === 2 ? 'text-amber-500' : 'text-slate-500'}`}>{i + 1}</span>
          <span className="font-display flex-1 truncate">{s.name}</span>
          <span className="text-xs text-slate-400 hidden sm:inline">{s.rank}</span>
          <span className="font-display text-cyan-300 tabular-nums">{s.score.toLocaleString()}</span>
        </li>
      ))}
    </ol>
  );
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [screen, setScreen] = useState<Screen>('title');
  const [stats, setStats] = useState<Stats | null>(null);
  const [transit, setTransit] = useState<{ stations: Station[]; current: number } | null>(null);
  const [scores, setScores] = useState<HighScore[]>(() => loadScores());
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem(NAME_KEY) || 'ACE';
    } catch {
      return 'ACE';
    }
  });
  const [savedIdx, setSavedIdx] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const [muted, setMuted] = useState(false);
  const statsRef = useRef<Stats | null>(null);
  const savedRef = useRef(false);

  useEffect(() => {
    const g = new Game(canvasRef.current!, {
      onGameOver: (s) => {
        statsRef.current = s;
        savedRef.current = false;
        setStats(s);
        setSaved(false);
        setSavedIdx(null);
        setScreen('over');
      },
      onPause: () => setScreen('paused'),
      onTransit: (stations, current) => {
        setTransit({ stations, current });
        setScreen('transit');
      },
    });
    gameRef.current = g;
    return () => g.destroy();
  }, []);

  const doSave = useCallback(() => {
    const s = statsRef.current;
    if (!s || savedRef.current || !qualifies(s.score)) return;
    const nm = (name.trim() || 'ACE').slice(0, 10).toUpperCase();
    try {
      localStorage.setItem(NAME_KEY, nm);
    } catch {
      /* noop */
    }
    const entry: HighScore = { name: nm, score: s.score, rank: rankFor(s.score), date: new Date().toISOString() };
    const top = saveScore(entry);
    savedRef.current = true;
    setSaved(true);
    setScores(top);
    setSavedIdx(top.indexOf(top.find((e) => e.date === entry.date)!));
  }, [name]);

  const start = useCallback(() => {
    sfx.init();
    gameRef.current?.newGame();
    setScreen('playing');
  }, []);

  const restart = useCallback(() => {
    doSave();
    start();
  }, [doSave, start]);

  const resume = useCallback(() => {
    gameRef.current?.resume();
    setScreen('playing');
  }, []);

  const quit = useCallback(() => {
    doSave();
    gameRef.current?.quitToTitle();
    setScores(loadScores());
    setScreen('title');
  }, [doSave]);

  const travel = useCallback((id: number) => {
    gameRef.current?.travelTo(id);
    setScreen('playing');
  }, []);

  const cancelTransit = useCallback(() => {
    gameRef.current?.resume();
    setScreen('playing');
  }, []);

  const toggleMute = useCallback(() => {
    const m = !sfx.muted;
    sfx.setMuted(m);
    setMuted(m);
  }, []);

  // keyboard shortcuts for overlays
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing = tag === 'INPUT';
      if (screen === 'title' && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        start();
      } else if (screen === 'paused') {
        if (e.code === 'Escape' || e.code === 'KeyP') resume();
        else if (e.code === 'KeyR') restart();
        else if (e.code === 'KeyQ') quit();
      } else if (screen === 'over' && !typing) {
        if (e.code === 'KeyR' || e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          restart();
        } else if (e.code === 'Escape') quit();
      } else if (screen === 'transit' && transit) {
        if (e.code === 'Escape') cancelTransit();
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= transit.stations.length && n - 1 !== transit.current) travel(n - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, start, resume, restart, quit, transit, travel, cancelTransit]);

  // sync mute indicator after game toggles it via M
  useEffect(() => {
    const id = setInterval(() => setMuted(sfx.muted), 400);
    return () => clearInterval(id);
  }, []);

  const canSave = !!stats && qualifies(stats.score) && !saved;

  return (
    <div className="fixed inset-0 bg-[#070b1a] overflow-hidden font-ui">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* mute toggle */}
      {screen !== 'playing' && (
        <button onClick={toggleMute} className="absolute bottom-3 right-3 z-30 rounded-full bg-black/50 border border-white/10 w-10 h-10 text-lg" aria-label="Toggle sound">
          {muted ? '🔇' : '🔊'}
        </button>
      )}

      {/* ---------------- TITLE ---------------- */}
      {screen === 'title' && (
        <div className="absolute inset-0 z-20 overflow-y-auto scanlines" style={{ touchAction: 'pan-y', background: 'radial-gradient(ellipse at 50% 30%, rgba(7,11,26,0.35), rgba(7,11,26,0.92) 70%)' }}>
          <div className="min-h-full flex flex-col items-center justify-center px-4 py-8 gap-6">
            <div className="text-center floaty">
              <div className="siren-bar h-1.5 w-40 mx-auto rounded-full mb-4 opacity-90" />
              <h1 className="font-display text-6xl sm:text-8xl leading-none neon-text text-white">
                NIGHT<span className="text-cyan-300">BEAT</span>
              </h1>
              <p className="font-display tracking-[0.35em] text-rose-300 text-xs sm:text-sm mt-3">CITY PATROL · ONE SHIFT · EVERY CHOICE COUNTS</p>
            </div>

            <Btn onClick={start} className="text-xl sm:text-2xl px-10 py-4 animate-pulse">
              ▶ START SHIFT
            </Btn>
            <p className="text-xs text-slate-400 -mt-3">Press Enter / tap to begin</p>

            <div className="grid gap-4 w-full max-w-5xl md:grid-cols-3">
              <section className="rounded-2xl bg-slate-950/70 border border-cyan-300/20 p-5 backdrop-blur">
                <h2 className="font-display text-cyan-300 mb-3 tracking-wider">THE JOB</h2>
                <p className="text-sm text-slate-300 mb-3">Walk up to citizens with a bubble and decide. The right call earns points and public trust — the wrong one costs you.</p>
                <div className="grid grid-cols-2 gap-2">
                  {ACTIONS.map((a) => (
                    <div key={a} className="rounded-lg border px-2 py-1.5 text-xs font-display flex items-center gap-2" style={{ borderColor: ACTION_INFO[a].color, color: ACTION_INFO[a].color }}>
                      <span className="text-base">{ACTION_INFO[a].icon}</span> {ACTION_INFO[a].label}
                    </div>
                  ))}
                </div>
                <ul className="mt-3 text-xs text-slate-400 space-y-1">
                  <li>⭐ Priority calls pay <b className="text-yellow-300">x2</b> — follow the gold arrow</li>
                  <li>⛓ Book arrests at the <b className="text-cyan-300">Precinct</b> for bonus points</li>
                  <li>🚇 Metro stations & your cruiser cover the 7 districts</li>
                  <li>☠ Trust hits 0 or health hits 0 = shift over</li>
                </ul>
              </section>

              <section className="rounded-2xl bg-slate-950/70 border border-cyan-300/20 p-5 backdrop-blur">
                <h2 className="font-display text-cyan-300 mb-3 tracking-wider">CONTROLS</h2>
                <div className="text-sm space-y-1.5 text-slate-300">
                  {[
                    ['WASD / Arrows', 'Walk · Drive'],
                    ['1 2 3 4', 'Arrest · Help · Ticket · Shoot'],
                    ['E / Enter', 'Drive car · Metro · Use'],
                    ['Space / F', 'Fire (auto-aims threats)'],
                    ['Space / H (car)', 'Toggle siren'],
                    ['P / Esc', 'Pause'],
                    ['M', 'Mute'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-2">
                      <kbd className="font-display text-xs bg-white/10 rounded px-2 py-0.5 text-cyan-100">{k}</kbd>
                      <span className="text-right text-xs">{v}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-slate-400">📱 Touch: drag the left side to move/steer, tap the on-screen buttons to act.</p>
              </section>

              <section className="rounded-2xl bg-slate-950/70 border border-yellow-300/20 p-5 backdrop-blur">
                <h2 className="font-display text-yellow-300 mb-3 tracking-wider">🏆 HALL OF FAME</h2>
                <ScoreTable scores={scores} />
              </section>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- PAUSE ---------------- */}
      {screen === 'paused' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="pop-in rounded-2xl bg-slate-950/90 border border-cyan-300/30 p-8 w-full max-w-sm text-center shadow-[0_0_60px_rgba(79,195,255,0.2)]">
            <div className="siren-bar h-1 w-24 mx-auto rounded-full mb-4" />
            <h2 className="font-display text-4xl text-white neon-text mb-6">PAUSED</h2>
            <div className="flex flex-col gap-3">
              <Btn onClick={resume}>▶ RESUME <span className="opacity-60 text-sm">(Esc)</span></Btn>
              <Btn onClick={restart} variant="ghost">↻ RESTART SHIFT <span className="opacity-60 text-sm">(R)</span></Btn>
              <Btn onClick={toggleMute} variant="ghost">{muted ? '🔇 SOUND OFF' : '🔊 SOUND ON'}</Btn>
              <Btn onClick={quit} variant="ghost">⏏ QUIT TO TITLE <span className="opacity-60 text-sm">(Q)</span></Btn>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- TRANSIT ---------------- */}
      {screen === 'transit' && transit && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" style={{ touchAction: 'pan-y' }}>
          <div className="pop-in rounded-2xl bg-slate-950/95 border border-yellow-300/40 p-6 w-full max-w-md shadow-[0_0_60px_rgba(255,216,77,0.15)] max-h-[92vh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-1">
              <span className="w-10 h-10 rounded-full bg-yellow-300 text-slate-950 font-display text-xl flex items-center justify-center">M</span>
              <div>
                <h2 className="font-display text-2xl text-yellow-300 leading-none">CITY METRO</h2>
                <p className="text-xs text-slate-400">Now at {transit.stations[transit.current].name}. Pick a destination.</p>
              </div>
            </div>
            <div className="relative mt-4 pl-6">
              <div className="absolute left-[11px] top-3 bottom-3 w-1 rounded bg-yellow-300/40" />
              {transit.stations.map((s, i) => {
                const info = AREA_INFO[s.area];
                const here = i === transit.current;
                return (
                  <button
                    key={s.id}
                    disabled={here}
                    onClick={() => travel(i)}
                    className={`relative w-full text-left flex items-center gap-3 rounded-xl px-3 py-2.5 mb-1.5 transition ${here ? 'opacity-50 cursor-default' : 'hover:bg-white/10 active:scale-[0.98] cursor-pointer'}`}
                  >
                    <span className="absolute -left-[19px] w-4 h-4 rounded-full border-2 border-slate-950" style={{ background: info.color }} />
                    <kbd className="font-display text-xs bg-white/10 rounded px-1.5 py-0.5 text-slate-300 hidden sm:inline">{i + 1}</kbd>
                    <span className="flex-1">
                      <span className="block font-display text-white">{s.name}</span>
                      <span className="block text-xs" style={{ color: info.color }}>{info.name} · {info.tag}</span>
                    </span>
                    {here && <span className="text-xs font-display text-yellow-300">YOU ARE HERE</span>}
                  </button>
                );
              })}
            </div>
            <Btn onClick={cancelTransit} variant="ghost" className="w-full mt-3">✕ STAY HERE <span className="opacity-60 text-sm">(Esc)</span></Btn>
          </div>
        </div>
      )}

      {/* ---------------- GAME OVER ---------------- */}
      {screen === 'over' && stats && (
        <div className="absolute inset-0 z-20 overflow-y-auto bg-black/70 backdrop-blur-sm" style={{ touchAction: 'pan-y' }}>
          <div className="min-h-full flex items-center justify-center px-4 py-8">
            <div className="pop-in rounded-2xl bg-slate-950/95 border p-6 sm:p-8 w-full max-w-2xl" style={{ borderColor: stats.reason === 'SHIFT COMPLETE' ? '#4fc3ff66' : '#ff4d6d66' }}>
              <div className="text-center">
                <p className="text-xs tracking-[0.3em] text-slate-400 font-display">END OF WATCH</p>
                <h2 className={`font-display text-4xl sm:text-6xl mt-1 ${stats.reason === 'SHIFT COMPLETE' ? 'text-cyan-300' : 'text-rose-400'}`} style={{ textShadow: '0 0 24px currentColor' }}>
                  {stats.reason}
                </h2>
                <p className="text-slate-300 mt-1">{stats.sub}</p>
                <div className="mt-5">
                  <div className="text-xs text-slate-400 font-display tracking-widest">FINAL SCORE</div>
                  <div className="font-display text-5xl sm:text-6xl text-white tabular-nums">{stats.score.toLocaleString()}</div>
                  <div className="inline-block mt-2 rounded-full bg-yellow-300/15 border border-yellow-300/50 px-4 py-1 font-display text-yellow-300 text-sm">RANK: {rankFor(stats.score).toUpperCase()}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-6">
                {[
                  ['⛓ Arrests', stats.arrests, '#4fc3ff'],
                  ['♥ Helped', stats.helps, '#5cff9d'],
                  ['✎ Tickets', stats.tickets, '#ffd84d'],
                  ['🏢 Booked', stats.booked, '#4fc3ff'],
                  ['✸ Shootings', stats.kills, '#ff9f43'],
                  ['☠ Innocents', stats.innocents, '#ff4d6d'],
                  ['🔥 Best combo', `x${stats.bestCombo.toFixed(1)}`, '#ffd84d'],
                  ['🤝 Trust', `${stats.trust}${stats.trustBonus ? ` (+${stats.trustBonus})` : ''}`, '#4fc3ff'],
                ].map(([label, val, col]) => (
                  <div key={label as string} className="rounded-xl bg-white/5 p-3 text-center">
                    <div className="text-[11px] text-slate-400">{label}</div>
                    <div className="font-display text-xl" style={{ color: col as string }}>{val}</div>
                  </div>
                ))}
              </div>

              {canSave && (
                <div className="mt-6 rounded-xl border border-yellow-300/40 bg-yellow-300/10 p-4">
                  <p className="font-display text-yellow-300 text-sm mb-2">🏆 NEW HIGH SCORE! Sign the logbook:</p>
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      doSave();
                    }}
                  >
                    <input
                      value={name}
                      maxLength={10}
                      autoFocus
                      onChange={(e) => setName(e.target.value.toUpperCase())}
                      className="flex-1 min-w-0 rounded-lg bg-slate-900 border border-yellow-300/40 px-3 py-2 font-display text-white tracking-widest outline-none focus:ring-2 focus:ring-yellow-300"
                      style={{ touchAction: 'auto' }}
                    />
                    <button type="submit" className="font-display rounded-lg bg-yellow-300 text-slate-950 px-4 py-2 active:scale-95">SAVE</button>
                  </form>
                </div>
              )}

              <div className="mt-6">
                <h3 className="font-display text-yellow-300 text-sm tracking-wider mb-2">🏆 HALL OF FAME</h3>
                <ScoreTable scores={scores} highlight={savedIdx} />
              </div>

              <div className="flex flex-col sm:flex-row gap-3 mt-6">
                <Btn onClick={restart} className="flex-1 text-lg">↻ PLAY AGAIN <span className="opacity-60 text-sm">(R)</span></Btn>
                <Btn onClick={quit} variant="ghost" className="sm:w-48">TITLE</Btn>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
