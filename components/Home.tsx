import React, { useState } from 'react';
import type { User } from '@supabase/supabase-js';
import {
  Calendar, ChevronRight, Cpu, History, LogOut, Moon, Settings2, Sun,
  Trophy, UserRound, X,
} from 'lucide-react';
import { Button } from './ui/Button';
import { DailyChallenge } from './DailyChallenge';
import { useAuth } from '../hooks/useAuth';
import type {
  AnalysisMode, Appearance, BoardTheme, ColorPref, Difficulty, EngineDepth, GameTypeFilter, RatingRange, TimerMode,
} from '../types';
import { ALL_OPENINGS } from '../utils/openings';
import { useDialogA11y } from '../hooks/useDialogA11y';

interface HomeProps {
  setDifficulty: (d: Difficulty) => void;
  currentDifficulty: Difficulty;
  analysisMode: AnalysisMode;
  setAnalysisMode: (m: AnalysisMode) => void;
  positionCount: number;
  setPositionCount: (n: number) => void;
  boardTheme: BoardTheme;
  setBoardTheme: (t: BoardTheme) => void;
  soundEnabled: boolean;
  setSoundEnabled: (v: boolean) => void;
  gameTypeFilter: GameTypeFilter;
  setGameTypeFilter: (v: GameTypeFilter) => void;
  highScore: number;
  streak: number;
  onStart: () => void;
  onStartDaily: (gmUsername: string, challengeDate: string) => void;
  onShowHistory: () => void;
  user?: User;
  isGuest?: boolean;
  onSignIn?: () => void;
  timerMode: TimerMode;
  setTimerMode: (m: TimerMode) => void;
  openingFilter: string[];
  setOpeningFilter: (v: string[]) => void;
  colorPref: ColorPref;
  setColorPref: (v: ColorPref) => void;
  ratingRange: RatingRange;
  setRatingRange: (r: RatingRange) => void;
  sessionCount: number;
  appearance: Appearance;
  setAppearance: (value: Appearance) => void;
  engineDepth: EngineDepth;
  setEngineDepth: (value: EngineDepth) => void;
}

function SelectRow({
  id, label, description, value, onChange, children,
}: {
  id: string;
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2 border-b border-stone-200 py-4 last:border-b-0 dark:border-stone-700 sm:grid-cols-[minmax(0,1fr)_11rem] sm:items-center sm:gap-6">
      <div>
        <label className="block text-sm font-medium text-stone-800 dark:text-stone-100" htmlFor={id}>{label}</label>
        {description && <p className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">{description}</p>}
      </div>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-800 shadow-sm outline-none transition focus:border-stone-500 focus:ring-2 focus:ring-stone-200 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100 dark:focus:ring-stone-700"
      >
        {children}
      </select>
    </div>
  );
}

function ToggleRow({
  label, description, checked, onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-5 py-4">
      <div>
        <div className="text-sm font-medium text-stone-800 dark:text-stone-100">{label}</div>
        <p className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-stone-300 focus:ring-offset-2 ${checked ? 'bg-[#53652c]' : 'bg-stone-300'}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}

function SettingsPanel(props: Omit<HomeProps, 'highScore' | 'streak' | 'onStart' | 'onStartDaily' | 'onShowHistory' | 'user' | 'isGuest' | 'onSignIn' | 'sessionCount'> & { onClose: () => void }) {
  const [openingQuery, setOpeningQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'training' | 'source' | 'board'>('training');

  const addOpening = (value = openingQuery) => {
    const opening = value.trim().replace(/,$/, '').trim();
    if (!opening) return;
    if (!props.openingFilter.some((item) => item.toLowerCase() === opening.toLowerCase())) {
      props.setOpeningFilter([...props.openingFilter, opening]);
    }
    setOpeningQuery('');
  };

  const dialogRef = useDialogA11y(props.onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/30 p-4 sm:p-6" role="dialog" aria-modal="true" aria-label="Training settings">
      <div ref={dialogRef} className="flex max-h-[min(44rem,calc(100vh-2rem))] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-stone-300 bg-white shadow-2xl dark:border-stone-700 dark:bg-stone-900 sm:max-h-[calc(100vh-3rem)]">
        <header className="flex min-h-16 items-center justify-between border-b border-stone-200 px-5 dark:border-stone-700 sm:px-6">
          <div>
            <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">Settings</h2>
            <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">Changes are saved for your next training session.</p>
          </div>
          <button onClick={props.onClose} className="rounded-md p-2 text-stone-500 transition hover:bg-stone-100 hover:text-stone-900" aria-label="Close settings">
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto sm:grid sm:grid-cols-[11rem_minmax(0,1fr)]">
          <nav className="flex gap-1 overflow-x-auto border-b border-stone-200 bg-stone-50 p-2 dark:border-stone-700 dark:bg-stone-950 sm:block sm:border-b-0 sm:border-r sm:p-3" aria-label="Settings sections" role="tablist" aria-orientation="vertical">
            {([
              ['training', 'Training'],
              ['source', 'Puzzle source'],
              ['board', 'Board & feedback'],
            ] as const).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                aria-controls={`${tab}-panel`}
                onClick={() => setActiveTab(tab)}
                className={`shrink-0 whitespace-nowrap rounded-md px-3 py-2 text-left text-sm transition sm:mt-1 sm:block sm:w-full ${
                  activeTab === tab
                    ? 'bg-white font-medium text-stone-900 shadow-sm dark:bg-stone-800 dark:text-stone-100'
                    : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
          <main className="p-5 sm:p-7">
            {activeTab === 'training' && (
            <section id="training-panel" role="tabpanel" aria-label="Training settings">
              <div className="mb-3 border-b border-stone-300 pb-3">
                <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Training</h3>
                <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">Set the length and pace of a regular session.</p>
              </div>
              <SelectRow id="difficulty" label="Difficulty" value={props.currentDifficulty} onChange={(value) => props.setDifficulty(value as Difficulty)}>
                <option value="Easy">Easy</option><option value="Medium">Medium</option><option value="Hard">Hard</option>
              </SelectRow>
              <SelectRow id="puzzle-count" label="Puzzles per session" value={String(props.positionCount)} onChange={(value) => props.setPositionCount(Number(value))}>
                <option value="5">5 puzzles</option><option value="10">10 puzzles</option><option value="20">20 puzzles</option>
              </SelectRow>
              <SelectRow id="pace" label="Pace" description="Timed sessions show a clock for each move." value={props.timerMode} onChange={(value) => props.setTimerMode(value as TimerMode)}>
                <option value="timed">Timed</option><option value="zen">No timer</option>
              </SelectRow>
            </section>
            )}

            {activeTab === 'source' && (
            <section id="source-panel" role="tabpanel" aria-label="Puzzle source settings">
              <div className="mb-3 border-b border-stone-300 pb-3 dark:border-stone-700"><h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Position source</h3><p className="mt-1 text-xs text-stone-500 dark:text-stone-400">Narrow the rated games used to build your session.</p></div>
              <SelectRow id="game-speed" label="Game speed" value={props.gameTypeFilter} onChange={(value) => props.setGameTypeFilter(value as GameTypeFilter)}>
                <option value="all">Any speed</option><option value="blitz">Blitz</option><option value="rapid">Rapid</option><option value="classical">Classical</option>
              </SelectRow>
              <SelectRow id="side" label="Play as" value={props.colorPref} onChange={(value) => props.setColorPref(value as ColorPref)}>
                <option value="random">Either side</option><option value="white">White</option><option value="black">Black</option>
              </SelectRow>
              <SelectRow id="rating" label="Minimum player rating" value={props.ratingRange.min === null ? 'any' : String(props.ratingRange.min)} onChange={(value) => props.setRatingRange({ ...props.ratingRange, min: value === 'any' ? null : Number(value) })}>
                <option value="any">Any rating</option><option value="2000">2000+</option><option value="2200">2200+</option><option value="2400">2400+</option>
              </SelectRow>
              <div className="py-4">
                <label className="block text-sm font-medium text-stone-800 dark:text-stone-100" htmlFor="openings">Opening focus</label>
                <p className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">Search by family or variation. Every returned position must match.</p>
                <div className="mt-2 flex gap-2">
                  <input
                    id="openings"
                    list="opening-suggestions"
                    value={openingQuery}
                    onChange={(event) => setOpeningQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ',') {
                        event.preventDefault();
                        addOpening();
                      }
                    }}
                    placeholder="Try Sicilian, Najdorf, or Queen's Gambit"
                    className="h-10 min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-800 shadow-sm outline-none transition placeholder:text-stone-400 focus:border-stone-500 focus:ring-2 focus:ring-stone-200 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100 dark:focus:ring-stone-700"
                  />
                  <datalist id="opening-suggestions">{ALL_OPENINGS.map((opening) => <option value={opening} key={opening} />)}</datalist>
                  <button type="button" onClick={() => addOpening()} className="rounded-md border border-stone-300 px-3 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800">Add</button>
                </div>
                {props.openingFilter.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2" aria-label="Active opening filters">
                    {props.openingFilter.map((opening) => (
                      <button
                        key={opening}
                        type="button"
                        onClick={() => props.setOpeningFilter(props.openingFilter.filter((item) => item !== opening))}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[#53652c]/10 px-2.5 py-1 text-xs font-medium text-[#465624] hover:bg-[#53652c]/20 dark:bg-[#91ad63]/15 dark:text-[#c6d9a2]"
                        aria-label={`Remove ${opening} filter`}
                      >
                        {opening}<X className="h-3 w-3" />
                      </button>
                    ))}
                    <button type="button" onClick={() => props.setOpeningFilter([])} className="px-1 text-xs text-stone-500 underline-offset-2 hover:underline dark:text-stone-400">Clear all</button>
                  </div>
                )}
              </div>
            </section>
            )}

            {activeTab === 'board' && (
            <section id="board-panel" role="tabpanel" aria-label="Board and feedback settings">
              <div className="mb-3 border-b border-stone-300 pb-3 dark:border-stone-700"><h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Board &amp; feedback</h3><p className="mt-1 text-xs text-stone-500 dark:text-stone-400">Choose how positions look and how feedback is delivered.</p></div>
              <SelectRow id="review" label="Review moves" value={props.analysisMode} onChange={(value) => props.setAnalysisMode(value as AnalysisMode)}>
                <option value="between">After each puzzle</option><option value="end-only">At the end of the session</option>
              </SelectRow>
              <SelectRow id="engine-depth" label="Analysis depth" description="Higher depth is stronger, but takes longer to prepare." value={String(props.engineDepth)} onChange={(value) => props.setEngineDepth(Number(value) as EngineDepth)}>
                <option value="10">Depth 10 · Fast</option><option value="14">Depth 14 · Balanced</option><option value="18">Depth 18 · Deep</option>
              </SelectRow>
              <SelectRow id="board-theme" label="Board colors" value={props.boardTheme} onChange={(value) => props.setBoardTheme(value as BoardTheme)}>
                <option value="green">Green</option><option value="wood">Wood</option><option value="slate">Slate</option>
              </SelectRow>
              <ToggleRow label="Sound effects" description="Play sounds for moves and results." checked={props.soundEnabled} onChange={props.setSoundEnabled} />
            </section>
            )}
          </main>
        </div>
        <footer className="flex items-center justify-between border-t border-stone-200 bg-stone-50 px-5 py-3 dark:border-stone-700 dark:bg-stone-950 sm:px-6">
          <span className="hidden text-xs text-stone-500 sm:block">Your settings are saved automatically.</span>
          <button onClick={props.onClose} className="ml-auto inline-flex h-9 items-center rounded-md bg-stone-800 px-4 text-sm font-medium text-white transition hover:bg-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:ring-offset-2 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white">Done</button>
        </footer>
      </div>
    </div>
  );
}

export const Home: React.FC<HomeProps> = (props) => {
  const [showSettings, setShowSettings] = useState(false);
  const [showDailyChallenge, setShowDailyChallenge] = useState(false);
  const { signOut } = useAuth();
  const displayName = props.user?.user_metadata?.name ?? props.user?.email?.split('@')[0] ?? 'Player';
  return (
    <div className="min-h-screen bg-[#f5f4ef] text-stone-900 transition-colors dark:bg-[#191917] dark:text-stone-100">
      <header className="h-[4.25rem] border-b border-stone-200/80 bg-[#fbfaf7]/90 transition-colors backdrop-blur dark:border-stone-800/80 dark:bg-[#1d1d1b]/90">
        <div className="h-full max-w-5xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#53652c] text-xs font-bold text-white shadow-sm dark:bg-[#91ad63] dark:text-[#1b1a18]" aria-hidden="true">B</span>
            <div className="text-[1.05rem] font-bold tracking-[-0.02em]">BlitzSense</div>
          </div>
          <div className="flex items-center gap-1">
            {props.isGuest ? (
              <button onClick={props.onSignIn} className="hidden h-9 items-center gap-2 px-3 text-sm font-medium text-stone-600 hover:text-stone-900 dark:text-stone-300 dark:hover:text-white sm:flex">
                <UserRound className="w-4 h-4" /> Sign in
              </button>
            ) : props.user ? (
              <div className="hidden sm:flex items-center gap-2 mr-2 text-sm text-stone-600"><UserRound className="w-4 h-4" />{displayName}</div>
            ) : null}
            <button
              onClick={() => props.setAppearance(props.appearance === 'dark' ? 'light' : 'dark')}
              className="rounded-lg p-2 text-stone-500 transition hover:bg-stone-100 hover:text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#748c4a]/50 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
              aria-label={props.appearance === 'dark' ? 'Use light mode' : 'Use dark mode'}
              title={props.appearance === 'dark' ? 'Light mode' : 'Dark mode'}
            >
              {props.appearance === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <button onClick={props.onShowHistory} className="rounded-lg p-2 text-stone-500 transition hover:bg-stone-100 hover:text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#748c4a]/50 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-white" aria-label="View history"><History className="w-5 h-5" /></button>
            <button onClick={() => setShowSettings(true)} className="rounded-lg p-2 text-stone-500 transition hover:bg-stone-100 hover:text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#748c4a]/50 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-white" aria-label="Open settings"><Settings2 className="w-5 h-5" /></button>
            {props.user && <button onClick={signOut} className="hidden rounded-lg p-2 text-stone-500 transition hover:bg-stone-100 hover:text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#748c4a]/50 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-white sm:block" aria-label="Sign out"><LogOut className="w-5 h-5" /></button>}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-9 sm:px-6 sm:py-12">
        <div className="mb-7 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-[1.75rem] font-bold tracking-[-0.035em] text-stone-900 dark:text-stone-100 sm:text-3xl">Training</h1>
            <p className="mt-1.5 text-sm text-stone-500 dark:text-stone-400">Real rated games, evaluated on your device.</p>
          </div>
          <button onClick={() => setShowSettings(true)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-stone-300/90 bg-white px-3.5 text-sm font-semibold text-stone-700 shadow-sm transition hover:border-stone-400 hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#748c4a]/50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800">
            <Settings2 className="h-4 w-4" /> All settings
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18.5rem]">
          <section className="overflow-hidden rounded-2xl border border-stone-200/90 bg-white shadow-[0_10px_32px_rgba(41,37,36,0.04)] dark:border-stone-800 dark:bg-[#22211f] dark:shadow-none" aria-label="Start a training session">
            <div className="border-b border-stone-200/90 px-5 py-5 dark:border-stone-800 sm:px-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[1.05rem] font-semibold tracking-[-0.015em] text-stone-900 dark:text-stone-100">Move training</h2>
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 dark:text-stone-400"><Cpu className="h-3.5 w-3.5 text-[#748c4a] dark:text-[#b3c78f]" /> Local Stockfish</span>
              </div>
              <p className="mt-1.5 max-w-xl text-sm leading-6 text-stone-500 dark:text-stone-400">Find the best move, then compare it with what was played.</p>
            </div>

            <div className="space-y-7 px-5 py-6 sm:px-6 sm:py-7">
              {/* Active Session Configuration */}
              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">Current session</div>
                  <button type="button" onClick={() => setShowSettings(true)} className="text-xs font-semibold text-[#5f763b] transition hover:text-[#465724] focus:outline-none focus-visible:underline dark:text-[#b3c78f] dark:hover:text-[#c6d9a2]">Edit</button>
                </div>
                <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-stone-200 bg-stone-200/80 dark:border-stone-700 dark:bg-stone-700/60 sm:grid-cols-4">
                  {[
                    ['Positions', String(props.positionCount)],
                    ['Difficulty', props.currentDifficulty],
                    ['Pace', props.timerMode === 'zen' ? 'No timer' : 'Timed'],
                    ['Playing as', props.colorPref === 'random' ? 'Either side' : props.colorPref === 'white' ? 'White' : 'Black'],
                  ].map(([label, value]) => (
                    <div key={label} className="bg-white px-3 py-3 dark:bg-[#292927]">
                      <dt className="text-[0.68rem] font-medium uppercase tracking-[0.08em] text-stone-500 dark:text-stone-400">{label}</dt>
                      <dd className="mt-1 text-sm font-semibold text-stone-800 dark:text-stone-100">{value}</dd>
                    </div>
                  ))}
                </dl>
                {props.gameTypeFilter !== 'all' && <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">Source filter: <span className="font-semibold text-stone-700 dark:text-stone-200">{props.gameTypeFilter.toUpperCase()}</span></p>}
              </div>

              {props.openingFilter.length > 0 && (
                <button type="button" onClick={() => setShowSettings(true)} className="flex w-full items-start justify-between gap-3 rounded-md border border-[#748c4a]/30 bg-[#748c4a]/5 px-3 py-2.5 text-left hover:bg-[#748c4a]/10 dark:bg-[#91ad63]/10">
                  <span><span className="block text-xs font-semibold text-stone-800 dark:text-stone-100">Opening focus</span><span className="mt-0.5 block text-xs text-stone-500 dark:text-stone-400">{props.openingFilter.join(' · ')}</span></span>
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-[#5f763b] dark:text-[#b3c78f]" />
                </button>
              )}

              {/* Action buttons */}
              <div className="border-t border-stone-200 pt-5 dark:border-stone-800 space-y-2.5">
                <Button onClick={props.onStart} size="md" className="w-full text-base font-bold shadow-sm">
                  Start Training Session
                </Button>
                <button
                  type="button"
                  onClick={() => setShowSettings(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-md border border-stone-300 bg-white py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
                >
                  <Settings2 className="h-4 w-4" /> Configure Session &amp; Filters
                </button>
              </div>
            </div>
          </section>

          <aside className="space-y-5">
            <section className="rounded-2xl border border-stone-200/90 bg-white p-5 shadow-[0_10px_32px_rgba(41,37,36,0.03)] dark:border-stone-800 dark:bg-[#22211f] dark:shadow-none">
              <div className="flex items-center gap-2 text-stone-700 dark:text-stone-200"><Trophy className="h-4 w-4 text-[#748c4a] dark:text-[#b3c78f]" /><h2 className="text-sm font-semibold">Progress</h2></div>
              <div className="mt-4 grid grid-cols-2 divide-x divide-stone-200 dark:divide-stone-700">
                <div><div className="text-2xl font-semibold tabular-nums">{props.highScore || '—'}</div><div className="mt-1 text-xs text-stone-500 dark:text-stone-400">Best score</div></div>
                <div className="pl-4"><div className="text-2xl font-semibold tabular-nums">{props.sessionCount}</div><div className="mt-1 text-xs text-stone-500 dark:text-stone-400">Sessions</div></div>
              </div>
              {props.streak > 0 && <p className="mt-4 border-t border-stone-200 pt-3 text-xs text-stone-600"><span className="font-semibold text-stone-900">{props.streak} day</span> current streak</p>}
            </section>

            <button onClick={() => setShowDailyChallenge(true)} className="w-full rounded-2xl border border-stone-200/90 bg-white p-5 text-left shadow-[0_10px_32px_rgba(41,37,36,0.03)] transition hover:-translate-y-0.5 hover:border-stone-400 hover:shadow-[0_14px_36px_rgba(41,37,36,0.06)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#748c4a]/50 dark:border-stone-800 dark:bg-[#22211f] dark:shadow-none dark:hover:border-stone-600">
              <div className="flex items-center gap-2 text-stone-700 dark:text-stone-200"><Calendar className="h-4 w-4 text-[#748c4a] dark:text-[#b3c78f]" /><h2 className="text-sm font-semibold">Daily challenge</h2></div>
              <p className="mt-2 text-sm leading-5 text-stone-500 dark:text-stone-400">10 positions. 10 seconds each.</p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#5f763b] dark:text-[#b3c78f]">Play today <ChevronRight className="h-4 w-4" /></span>
            </button>
          </aside>
        </div>
      </main>

      {showSettings && <SettingsPanel {...props} onClose={() => setShowSettings(false)} />}
      {showDailyChallenge && <DailyChallenge onClose={() => setShowDailyChallenge(false)} onStart={props.onStartDaily} />}
    </div>
  );
};
