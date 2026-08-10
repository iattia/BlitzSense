import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Game } from '../components/Game';
import { MaterialCounter } from '../components/ui/MaterialCounter';
import type { ChessPosition, RawPosition } from '../types';
import '../index.css';

const fen = '8/P7/8/8/8/8/7k/5K2 w - - 0 1';
const engineLines = [
  { move: 'a8=Q', evaluation: { type: 'cp' as const, value: 900 } },
  { move: 'a8=R', evaluation: { type: 'cp' as const, value: 520 } },
  { move: 'a8=B', evaluation: { type: 'cp' as const, value: 320 } },
  { move: 'a8=N', evaluation: { type: 'cp' as const, value: 300 } },
];
const raw: RawPosition = {
  id: 'e2e_promotion_m1_w', fen, turn: 'w', gmMove: 'a8=R', difficulty: 'Hard',
  players: 'Test White vs Test Black', year: '2026', gmUsername: 'Test White',
  opponentUsername: 'Test Black', gameUrl: 'https://lichess.org/e2etest', isGm: true,
};
const analyzed: ChessPosition = {
  ...raw,
  bestMoves: engineLines.slice(0, 3).map(({ move }) => move),
  engineLines,
  evaluation: engineLines[0].evaluation,
};

function Harness() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [darkTheme, setDarkTheme] = useState(() => document.documentElement.classList.contains('dark'));
  const timeoutMode = params.get('mode') === 'timeout';

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkTheme);
  }, [darkTheme]);

  return (
    <>
      <div className="fixed right-2 top-2 z-[200] rounded bg-slate-950 p-2" data-testid="material-demo">
        <button type="button" onClick={() => setOrientation((value) => value === 'white' ? 'black' : 'white')}>Flip material demo</button>
        <button type="button" className="ml-2" onClick={() => setDarkTheme((value) => !value)}>Toggle theme</button>
        <div data-testid="material-top"><MaterialCounter fen={fen} orientation={orientation} side="top" /></div>
        <div data-testid="material-bottom"><MaterialCounter fen={fen} orientation={orientation} side="bottom" /></div>
      </div>
      <Game
        rawPositions={[raw]}
        analyzedPositions={new Map([[raw.id, analyzed]])}
        analysisMode="between"
        boardTheme="green"
        soundEnabled={false}
        difficulty="Hard"
        timerMode="timed"
        onGameEnd={() => undefined}
        onQuit={() => undefined}
        moveTimeMsOverride={timeoutMode ? 250 : 60_000}
        engineDepth={10}
      />
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Harness />);
