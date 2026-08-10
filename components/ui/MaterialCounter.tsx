import React, { useLayoutEffect, useRef } from 'react';
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

function PieceStrip({
  captured,
  capturedColor,
}: {
  captured: CapturedPieces;
  capturedColor: 'white' | 'black';
}) {
  const stripRef = useRef<HTMLSpanElement>(null);
  const { p, n, b, r, q } = captured;

  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;

    const fragment = document.createDocumentFragment();
    const counts: CapturedPieces = { p, n, b, r, q };
    let pieceIndex = 0;

    for (const type of PIECE_ORDER) {
      for (let index = 0; index < counts[type]; index += 1) {
        // Chessground's piece artwork is keyed to the custom <piece> tag.
        // Create those static decorative nodes directly so React does not emit
        // an unknown-element warning for every captured piece.
        const piece = document.createElement('piece');
        piece.className = `material-piece ${PIECE_CLASSES[type]} ${capturedColor}`;
        piece.title = `${capturedColor} ${PIECE_NAMES[type]}`;
        piece.style.position = 'static';
        piece.style.display = 'inline-block';
        piece.style.width = '22px';
        piece.style.height = '22px';
        piece.style.marginLeft = pieceIndex === 0 ? '0' : '-2px';
        piece.style.backgroundPosition = 'center';
        piece.style.backgroundRepeat = 'no-repeat';
        piece.style.backgroundSize = 'contain';
        piece.style.filter = capturedColor === 'white'
          ? 'drop-shadow(0 0 1px rgba(0, 0, 0, 0.95)) drop-shadow(0 1px 1px rgba(0, 0, 0, 0.45))'
          : 'drop-shadow(0 0 1px rgba(255, 255, 255, 0.9)) drop-shadow(0 1px 1px rgba(0, 0, 0, 0.65))';
        fragment.appendChild(piece);
        pieceIndex += 1;
      }
    }

    strip.replaceChildren(fragment);
  }, [b, capturedColor, n, p, q, r]);

  return <span ref={stripRef} className="cg-wrap flex min-w-0 items-center overflow-hidden" aria-hidden="true" />;
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
  const hasCapturedPieces = PIECE_ORDER.some((type) => captured[type] > 0);

  return (
    <div className="flex min-h-7 items-center" aria-label={label}>
      {hasCapturedPieces ? (
        <div className="inline-flex max-w-full items-center gap-1 rounded-md border border-stone-400/45 bg-stone-500/10 px-1.5 py-0.5 dark:border-stone-500/60 dark:bg-stone-100/10">
          <PieceStrip captured={captured} capturedColor={capturedColor} />
          {advantage > 0 ? (
            <span className="shrink-0 text-xs font-bold tabular-nums text-stone-800 dark:text-stone-100" aria-hidden="true">
              +{advantage}
            </span>
          ) : null}
        </div>
      ) : null}
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
    <div className={`w-full ${className}`}>
      <MaterialRow
        playerColor={isTop ? topPlayerColor : bottomPlayerColor}
        captured={isTop ? topCaptured : bottomCaptured}
        advantage={isTop ? topAdvantage : bottomAdvantage}
      />
    </div>
  );
};
