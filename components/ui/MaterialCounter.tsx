import React from 'react';
import { getMaterialBalance } from '../../utils/chessLogic';

interface MaterialCounterProps {
  fen: string;
  orientation?: 'white' | 'black';
  side: 'top' | 'bottom';
  className?: string;
}

type PieceType = 'p' | 'n' | 'b' | 'r' | 'q';
type CapturedPieces = Record<PieceType, number>;

const PIECE_ORDER: PieceType[] = ['q', 'r', 'b', 'n', 'p'];
const PIECE_NAMES: Record<PieceType, string> = {
  p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen',
};
const PIECE_CLASSES: Record<PieceType, string> = {
  p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen',
};

function capturedDescription(captured: CapturedPieces): string {
  const parts = PIECE_ORDER.flatMap((type) => {
    const count = captured[type];
    if (count === 0) return [];
    return [`${count} ${PIECE_NAMES[type]}${count === 1 ? '' : 's'}`];
  });
  return parts.length > 0 ? parts.join(', ') : 'no captured pieces';
}

function MaterialRow({
  playerColor,
  captured,
  advantage,
}: {
  playerColor: 'white' | 'black';
  captured: CapturedPieces;
  advantage: number;
}) {
  // A player's capture row displays the opposing pieces they have taken.
  const capturedColor = playerColor === 'white' ? 'black' : 'white';
  const label = `${playerColor === 'white' ? 'White' : 'Black'} captured ${capturedDescription(captured)}${advantage > 0 ? ` and leads by ${advantage} point${advantage === 1 ? '' : 's'}` : ''}`;

  return (
    <div className="flex min-h-6 items-center gap-1" aria-label={label}>
      <span className="cg-wrap flex min-w-0 items-center overflow-hidden" aria-hidden="true">
        {PIECE_ORDER.flatMap((type) => Array.from({ length: captured[type] }, (_, index) => (
          React.createElement('piece', {
            key: `${type}-${index}`,
            title: `${capturedColor} ${PIECE_NAMES[type]}`,
            className: `material-piece ${PIECE_CLASSES[type]} ${capturedColor} -ml-0.5 first:ml-0 drop-shadow-sm`,
            style: {
              position: 'static',
              display: 'inline-block',
              width: '20px',
              height: '20px',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              backgroundSize: 'contain',
            },
          })
        )))}
      </span>

      <span className={`shrink-0 text-xs font-semibold tabular-nums ${advantage > 0
        ? 'text-stone-700 dark:text-stone-200'
        : 'text-transparent'
      }`} aria-hidden="true">
        {advantage > 0 ? `+${advantage}` : ''}
      </span>
    </div>
  );
}

export const MaterialCounter: React.FC<MaterialCounterProps> = ({
  fen,
  orientation = 'white',
  side,
  className = '',
}) => {
  const { diff, capturedByWhite, capturedByBlack } = getMaterialBalance(fen);
  const isWhitePerspective = orientation === 'white';

  const topPlayerColor = isWhitePerspective ? 'black' : 'white';
  const bottomPlayerColor = isWhitePerspective ? 'white' : 'black';
  const topCaptured = isWhitePerspective ? capturedByBlack : capturedByWhite;
  const bottomCaptured = isWhitePerspective ? capturedByWhite : capturedByBlack;
  const topAdvantage = isWhitePerspective ? -diff : diff;
  const bottomAdvantage = isWhitePerspective ? diff : -diff;

  const isTop = side === 'top';
  return (
    <div className={`w-full px-1 ${className}`}>
      <MaterialRow
        playerColor={isTop ? topPlayerColor : bottomPlayerColor}
        captured={isTop ? topCaptured : bottomCaptured}
        advantage={isTop ? topAdvantage : bottomAdvantage}
      />
    </div>
  );
};
