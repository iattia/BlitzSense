import React, { useEffect, useRef } from 'react';
import { Chessground } from 'chessground';
import { Api } from 'chessground/api';
import { Chess } from 'chess.js';
import { BoardTheme } from '../types';

// Import Chessground base styles
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.cburnett.css';

import { MoveShape } from '../utils/chessLogic';

interface ChessgroundBoardProps {
  fen: string;
  boardOrientation: 'white' | 'black';
  onPieceDrop: (sourceSquare: string, targetSquare: string) => boolean;
  boardTheme: BoardTheme;
  interactive?: boolean;
  /** Revealed only after an attempt, so it never gives the puzzle away. */
  highlightMove?: string;
  /** Custom multi-color move shapes (arrows) to render on board */
  moveShapes?: MoveShape[];
}

// Map themes to Slate / Wood / Green hex colors
const BOARD_THEMES: Record<BoardTheme, { light: string; dark: string; lastMove: string }> = {
  slate: {
    light: '#d6d3cd',
    dark: '#64645f',
    lastMove: 'rgba(74, 103, 65, 0.5)',
  },
  wood: {
    light: '#f0d9b5',
    dark: '#b58863',
    lastMove: 'rgba(170, 162, 58, 0.5)',
  },
  green: {
    light: '#ebecd0',
    dark: '#779556',
    lastMove: 'rgba(185, 202, 67, 0.5)',
  },
};

const MOVE_ARROW_BRUSHES = {
  green: { key: 'engine', color: '#22c55e', opacity: 0.92, lineWidth: 10 },
  blue: { key: 'played', color: '#38bdf8', opacity: 0.92, lineWidth: 10 },
  red: { key: 'user', color: '#fb7185', opacity: 0.94, lineWidth: 10 },
  yellow: { key: 'alternate', color: '#fbbf24', opacity: 0.92, lineWidth: 10 },
};

// Generate valid destinations Map for Chessground based on chess.js
const getDests = (fen: string) => {
  const dests = new Map<string, string[]>();
  try {
    const chess = new Chess(fen);
    if (chess.isGameOver()) return dests;

    for (const square of chess.board().flat()) {
      if (square && square.color === chess.turn()) {
        const moves = chess.moves({ square: square.square as any, verbose: true });
        if (moves.length > 0) {
          dests.set(square.square, moves.map((m) => m.to));
        }
      }
    }
  } catch (e) {
    console.error('Error generating dests:', e);
  }
  return dests;
};

function getMoveShape(fen: string, moveSan?: string) {
  if (!moveSan) return [];
  try {
    const chess = new Chess(fen);
    const move = chess.move(moveSan);
    return move ? [{ orig: move.from, dest: move.to, brush: 'green' }] : [];
  } catch {
    return [];
  }
}

export const ChessgroundBoard: React.FC<ChessgroundBoardProps> = ({
  fen,
  boardOrientation,
  onPieceDrop,
  boardTheme,
  interactive = true,
  highlightMove,
  moveShapes,
}) => {
  const elementRef = useRef<HTMLDivElement>(null);
  const cgRef = useRef<Api | null>(null);
  const onPieceDropRef = useRef(onPieceDrop);
  const tapOriginRef = useRef<string | null>(null);
  const keyboardSquareRef = useRef('a1');
  onPieceDropRef.current = onPieceDrop;

  // Get active theme colors
  const colors = BOARD_THEMES[boardTheme];
  const autoShapes = moveShapes && moveShapes.length > 0 ? moveShapes : getMoveShape(fen, highlightMove);

  // Generate a crisp, URL-encoded SVG checkered board.
  // Using encodeURIComponent is 100% compatible with all browsers and prevents transparency.
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 8 8' shape-rendering='crispEdges'><rect width='8' height='8' fill='${colors.light}'/><path d='M1,0h1v1h-1z M3,0h1v1h-1z M5,0h1v1h-1z M7,0h1v1h-1z M0,1h1v1h-1z M2,1h1v1h-1z M4,1h1v1h-1z M6,1h1v1h-1z M1,2h1v1h-1z M3,2h1v1h-1z M5,2h1v1h-1z M7,2h1v1h-1z M0,3h1v1h-1z M2,3h1v1h-1z M4,3h1v1h-1z M6,3h1v1h-1z M1,4h1v1h-1z M3,4h1v1h-1z M5,4h1v1h-1z M7,4h1v1h-1z M0,5h1v1h-1z M2,5h1v1h-1z M4,5h1v1h-1z M6,5h1v1h-1z M1,6h1v1h-1z M3,6h1v1h-1z M5,6h1v1h-1z M7,6h1v1h-1z M0,7h1v1h-1z M2,7h1v1h-1z M4,7h1v1h-1z M6,7h1v1h-1z' fill='${colors.dark}'/></svg>`;
  const boardBg = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg).replace(/'/g, '%27').replace(/"/g, '%22')}")`;

  const applyBoardBackground = () => {
    const boardEl = elementRef.current?.querySelector('cg-board');
    if (boardEl) {
      (boardEl as HTMLElement).style.backgroundImage = boardBg;
      (boardEl as HTMLElement).style.backgroundSize = 'cover';
      (boardEl as HTMLElement).style.borderRadius = '0';
    }
  };

  useEffect(() => {
    if (!elementRef.current) return;

    const chess = new Chess(fen);
    const checkColor = chess.isCheck() ? (chess.turn() === 'w' ? 'white' : 'black') : false;

    // Initialize chessground
    cgRef.current = Chessground(elementRef.current, {
      fen,
      orientation: boardOrientation,
      coordinates: true,
      blockTouchScroll: interactive,
      trustAllEvents: true,
      turnColor: chess.turn() === 'w' ? 'white' : 'black',
      check: checkColor,
      movable: {
        free: false,
        color: interactive ? (chess.turn() === 'w' ? 'white' : 'black') : undefined,
        dests: interactive ? (getDests(fen) as any) : undefined,
        showDests: interactive,
        events: {
          after: (orig: string, dest: string) => {
            // Callback when piece drop is animated or dragged
            const success = onPieceDropRef.current(orig, dest);
            // If drop failed (e.g. invalid SAN or wrong turn), reset the board to the previous FEN
            if (!success && cgRef.current) {
              cgRef.current.set({ fen });
            }
          },
        },
      },
      draggable: {
        enabled: interactive,
        showGhost: true,
        // A little movement tolerance prevents a mobile tap from being
        // interpreted as a tiny drag. Tap-tap and drag remain available.
        distance: 6,
        autoDistance: true,
      },
      selectable: {
        enabled: interactive,
      },
      highlight: {
        lastMove: true,
        check: true,
      },
      drawable: {
        enabled: true,
        visible: true,
        autoShapes: autoShapes,
        brushes: MOVE_ARROW_BRUSHES,
      },
      animation: {
        enabled: true,
        duration: 180,
      },
    } as any);

    applyBoardBackground();

    return () => {
      if (cgRef.current) {
        cgRef.current.destroy();
      }
    };
  // Position and shape changes are handled by the lightweight update effect
  // below; recreating Chessground here would interrupt drag animations.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardOrientation, interactive, boardTheme]);

  // Update position on change without destroying the instance (for smooth animations)
  useEffect(() => {
    if (!cgRef.current) return;

    const chess = new Chess(fen);
    const checkColor = chess.isCheck() ? (chess.turn() === 'w' ? 'white' : 'black') : false;

    cgRef.current.set({
      fen,
      turnColor: chess.turn() === 'w' ? 'white' : 'black',
      check: checkColor,
      movable: {
        color: interactive ? (chess.turn() === 'w' ? 'white' : 'black') : undefined,
        dests: interactive ? (getDests(fen) as any) : undefined,
      },
      drawable: {
        enabled: true,
        visible: true,
        autoShapes: autoShapes,
        brushes: MOVE_ARROW_BRUSHES,
      },
    } as any);

    applyBoardBackground();

  // applyBoardBackground and autoShapes are render-local derivations of the
  // explicit dependencies below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, interactive, highlightMove, moveShapes, boardTheme]);

  useEffect(() => {
    tapOriginRef.current = null;
  }, [fen, interactive]);

  const squareFromPointer = (clientX: number, clientY: number): string | null => {
    const board = elementRef.current?.querySelector('cg-board');
    if (!board) return null;
    const rect = board.getBoundingClientRect();
    const col = Math.floor(((clientX - rect.left) / rect.width) * 8);
    const row = Math.floor(((clientY - rect.top) / rect.height) * 8);
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;
    const fileIndex = boardOrientation === 'white' ? col : 7 - col;
    const rank = boardOrientation === 'white' ? 8 - row : row + 1;
    return `${String.fromCharCode(97 + fileIndex)}${rank}`;
  };

  const activateSquare = (square: string) => {
    const dests = getDests(fen);
    const origin = tapOriginRef.current;

    if (origin && dests.get(origin)?.includes(square)) {
      tapOriginRef.current = null;
      const success = onPieceDropRef.current(origin, square);
      if (success) cgRef.current?.move(origin as any, square as any);
      else cgRef.current?.set({ fen });
      return;
    }

    if (dests.has(square)) {
      tapOriginRef.current = square;
      cgRef.current?.selectSquare(square as any, true);
    } else {
      tapOriginRef.current = null;
      cgRef.current?.selectSquare(null);
    }
  };

  const handleBoardClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const square = squareFromPointer(event.clientX, event.clientY);
    if (square) activateSquare(square);
  };

  const handleBoardKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activateSquare(keyboardSquareRef.current);
      return;
    }
    if (event.key === 'Escape') {
      tapOriginRef.current = null;
      cgRef.current?.selectSquare(null);
      return;
    }
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1],
    };
    const delta = deltas[event.key];
    if (!delta) return;
    event.preventDefault();
    const current = keyboardSquareRef.current;
    const orientationFactor = boardOrientation === 'white' ? 1 : -1;
    const file = Math.max(0, Math.min(7, current.charCodeAt(0) - 97 + delta[0] * orientationFactor));
    const rank = Math.max(1, Math.min(8, Number(current[1]) + delta[1] * orientationFactor));
    const next = `${String.fromCharCode(97 + file)}${rank}`;
    keyboardSquareRef.current = next;
    cgRef.current?.selectSquare(next as any, true);
  };

  return (
    <div
      ref={elementRef}
      className="chessground-board-container w-full h-full shadow-2xl relative overflow-hidden"
      role="application"
      aria-label={interactive ? 'Chessboard. Use arrow keys to move between squares and Enter to select or move; tap-tap and drag also work.' : 'Chessboard'}
      aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Enter Space Escape"
      tabIndex={interactive ? 0 : -1}
      onClick={handleBoardClick}
      onKeyDown={handleBoardKeyDown}
      style={{
        aspectRatio: '1',
        touchAction: interactive ? 'none' : 'auto',
      }}
    >
      <style>{`
        .chessground-board-container cg-container {
          background-image: none !important;
          background-color: transparent !important;
        }

        /* Keep coordinates readable on both the pale and dark board squares. */
        .chessground-board-container coords {
          font-weight: 800;
          font-size: clamp(11px, 2.4vw, 15px) !important;
          user-select: none;
          opacity: 1 !important;
          color: #ffffff !important;
          mix-blend-mode: difference;
          text-shadow: 0 1px 1px rgba(0, 0, 0, 0.45);
        }

        /* Chessground default last move highlight color */
        .chessground-board-container cg-board square.last-move {
          background-color: ${colors.lastMove} !important;
        }

        /* Chessground selected square highlight color */
        .chessground-board-container cg-board square.selected {
          background-color: rgba(129, 182, 76, 0.4) !important;
        }

        /* Chessground destination highlight styles (dots & capture rings) */
        .chessground-board-container cg-board square.move-dest {
          background: radial-gradient(rgba(129, 182, 76, 0.7) 19%, transparent 20%) !important;
        }
        
        .chessground-board-container cg-board square.oc.move-dest {
          background: radial-gradient(transparent 0%, transparent 76%, rgba(129, 182, 76, 0.7) 77%) !important;
        }
        
        .chessground-board-container cg-board square.move-dest:hover {
          background: radial-gradient(rgba(129, 182, 76, 0.45) 28%, transparent 29%) !important;
        }

        /* Checking square styling */
        .chessground-board-container cg-board square.check {
          background: radial-gradient(
            ellipse at center,
            rgba(239, 68, 68, 0.6) 0%,
            rgba(239, 68, 68, 0.3) 45%,
            transparent 75%
          ) !important;
        }

        /* Piece shadow during drag */
        .chessground-board-container cg-board piece.dragging {
          filter: drop-shadow(0 15px 10px rgba(0,0,0,0.5)) scale(1.08) !important;
          transition: transform 0.05s ease-out;
        }
      `}</style>
    </div>
  );
};
