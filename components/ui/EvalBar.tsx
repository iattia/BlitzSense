import React from 'react';
import type { EngineEvaluation } from '../../types';

interface EvalBarProps {
  /** Evaluation text (e.g. "+1.5", "-0.8", "M3", "-M2", "0.0") or raw centipawn number */
  evalScore?: string | number;
  orientation?: 'white' | 'black';
  concealed?: boolean;
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
  concealed = false,
  className = '',
}) => {
  if (concealed) {
    return (
      <div
        className={`relative overflow-hidden rounded-md border border-stone-700/40 bg-stone-100 shadow-inner ${className}`}
        title="Evaluation hidden until you move"
        aria-label="Stockfish evaluation hidden until you move"
        style={{ width: '22px', alignSelf: 'stretch' }}
      >
        <div className="h-1/2 bg-stone-900" />
        <div className="h-1/2 bg-stone-100" />
      </div>
    );
  }

  const { cp, text } = parseEvalToCentipawns(evalScore);
  const whitePercent = getWhiteFillPercentage(cp, text.includes('M'));

  // Adjust display based on board orientation
  const isWhiteBottom = orientation === 'white';
  const fillPercent = isWhiteBottom ? whitePercent : 100 - whitePercent;

  return (
    <div
      className={`relative flex flex-col justify-between overflow-hidden rounded-md border border-stone-700/40 bg-[#1e1c18] shadow-inner select-none ${className}`}
      title={`Stockfish Evaluation: ${text}`}
      style={{ width: '22px', alignSelf: 'stretch' }}
    >
      {/* Top section (Black advantage area if white is bottom, White area if black is bottom) */}
      <div
        className="w-full bg-stone-900 transition-all duration-500 ease-out flex items-start justify-center pt-1"
        style={{ height: `${100 - fillPercent}%` }}
      >
        {!isWhiteBottom && cp > 0 && (
          <span className="text-[10px] font-bold text-stone-200 tracking-tighter leading-none">
            {text}
          </span>
        )}
      </div>

      {/* Bottom section (White advantage area if white is bottom) */}
      <div
        className="w-full bg-stone-100 transition-all duration-500 ease-out flex items-end justify-center pb-1 shadow-md"
        style={{ height: `${fillPercent}%` }}
      >
        {isWhiteBottom && cp > 0 && (
          <span className="text-[10px] font-bold text-stone-800 tracking-tighter leading-none">
            {text}
          </span>
        )}
        {!isWhiteBottom && cp < 0 && (
          <span className="text-[10px] font-bold text-stone-800 tracking-tighter leading-none">
            {text}
          </span>
        )}
      </div>

      {/* Centered evaluation badge overlay */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center pointer-events-none">
        <span className="rounded bg-black/60 px-1 py-0.5 text-[9px] font-extrabold text-amber-300 backdrop-blur-xs">
          {text}
        </span>
      </div>
    </div>
  );
};
