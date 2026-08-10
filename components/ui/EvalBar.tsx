import React from 'react';
import type { EngineEvaluation } from '../../types';

interface EvalBarProps {
  /** Evaluation text (e.g. "+1.5", "-0.8", "M3", "-M2", "0.0") or raw centipawn number */
  evalScore?: string | number;
  orientation?: 'white' | 'black';
  className?: string;
}

export function formatEngineEvaluation(evaluation?: EngineEvaluation): string {
  if (!evaluation) return '0.0';
  if (evaluation.type === 'mate') {
    return evaluation.value < 0 ? `-M${Math.abs(evaluation.value)}` : `M${evaluation.value}`;
  }
  const pawns = evaluation.value / 100;
  return pawns > 0 ? `+${pawns.toFixed(1)}` : pawns.toFixed(1);
}

function parseEvalToCentipawns(score?: string | number): { cp: number; isMate: boolean; text: string } {
  if (score === undefined || score === null) return { cp: 0, isMate: false, text: '0.0' };

  if (typeof score === 'number') {
    return { cp: score * 100, isMate: false, text: (score >= 0 ? `+${score.toFixed(1)}` : score.toFixed(1)) };
  }

  const str = String(score).trim();
  if (str.toUpperCase().includes('M')) {
    const isWhiteMate = !str.startsWith('-');
    return {
      cp: isWhiteMate ? 10000 : -10000,
      isMate: true,
      text: str,
    };
  }

  const parsed = parseFloat(str);
  if (isNaN(parsed)) return { cp: 0, isMate: false, text: '0.0' };
  const cp = parsed * 100;
  return {
    cp,
    isMate: false,
    text: parsed > 0 ? `+${parsed.toFixed(1)}` : parsed.toFixed(1),
  };
}

/** Convert centipawn advantage to White fill percentage (0% to 100%) */
function getWhiteFillPercentage(cp: number, isMate: boolean): number {
  if (isMate) return cp > 0 ? 100 : 0;
  // Non-linear sigmoid-style mapping centered at 50% for 0 cp
  // +500 cp (5.0 pawns) maps to ~88%, +1000 cp maps to ~96%
  const winChance = 1 / (1 + Math.pow(10, -cp / 400));
  return Math.min(98, Math.max(2, winChance * 100));
}

export const EvalBar: React.FC<EvalBarProps> = ({
  evalScore = '0.0',
  orientation = 'white',
  className = '',
}) => {
  const { cp, text } = parseEvalToCentipawns(evalScore);
  const whitePercent = getWhiteFillPercentage(cp, text.includes('M'));

  // The lower segment always belongs to the player shown at the bottom.
  const bottomIsWhite = orientation === 'white';
  const bottomPercent = bottomIsWhite ? whitePercent : 100 - whitePercent;
  const topIsWhite = !bottomIsWhite;

  return (
    <div
      className={`relative flex flex-col justify-between overflow-hidden rounded-lg border border-stone-600/70 bg-stone-950 shadow-inner select-none ${className}`}
      title={`Stockfish Evaluation: ${text}`}
      aria-label={`Stockfish evaluation ${text}`}
      style={{ width: '44px', alignSelf: 'stretch' }}
    >
      <div
        className={`w-full transition-all duration-500 ease-out ${topIsWhite ? 'bg-stone-100' : 'bg-stone-950'}`}
        style={{ height: `${100 - bottomPercent}%` }}
      />

      <div
        className={`w-full shadow-md transition-all duration-500 ease-out ${bottomIsWhite ? 'bg-stone-100' : 'bg-stone-950'}`}
        style={{ height: `${bottomPercent}%` }}
      />

      <div className="pointer-events-none absolute inset-x-1 top-1/2 flex -translate-y-1/2 justify-center">
        <span className="w-full rounded-md border border-white/15 bg-stone-950/95 px-1 py-1 text-center text-[11px] font-extrabold leading-none tracking-[-0.02em] text-white shadow-lg">
          {text}
        </span>
      </div>
    </div>
  );
};
