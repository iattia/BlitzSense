import stockfishWorkerUrl from 'stockfish.js/stockfish.js?url';
import type { EngineEvaluation, EngineLineEvaluation } from '../types';

const ENGINE_TIMEOUT_MS = 15_000;
const MULTI_PV = 5;

type PendingSearch = {
  resolve: (result: LocalAnalysisResult) => void;
  reject: (error: Error) => void;
  lines: Map<number, EngineLine>;
  timer: number;
  turn: 'w' | 'b';
};

export interface EngineLine {
  move: string;
  evaluation?: EngineEvaluation;
}

export interface LocalAnalysisResult {
  moves: string[];
  lines: EngineLineEvaluation[];
  evaluation: EngineEvaluation;
}

/** Parse one UCI info line and normalize its score to White's point of view. */
export function parseUciInfoLine(line: string, turn: 'w' | 'b'): EngineLine | null {
  const move = line.match(/\spv\s+([a-h][1-8][a-h][1-8][qrbn]?)/)?.[1];
  if (!move) return null;

  const score = line.match(/\sscore\s+(cp|mate)\s+(-?\d+)/);
  const sideFactor = turn === 'w' ? 1 : -1;
  const evaluation = score
    ? { type: score[1] as EngineEvaluation['type'], value: Number(score[2]) * sideFactor }
    : undefined;
  return { move, evaluation };
}

/**
 * One isolated Stockfish process. The asm.js build is deliberately used here:
 * it is a single self-contained worker, needs no network request, SharedArrayBuffer,
 * cross-origin headers, or WebAssembly companion file.
 */
class StockfishProcess {
  private worker: Worker;
  private readyPromise: Promise<void>;
  private resolveReady!: () => void;
  private rejectReady!: (error: Error) => void;
  private readyTimer: number;
  private pending: PendingSearch | null = null;
  private disposed = false;

  constructor() {
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });

    this.worker = new Worker(stockfishWorkerUrl);
    this.worker.addEventListener('message', this.onMessage);
    this.worker.addEventListener('error', this.onError);
    this.readyTimer = window.setTimeout(() => {
      this.rejectReady(new Error('Local Stockfish did not finish starting.'));
      this.dispose();
    }, ENGINE_TIMEOUT_MS);
    this.worker.postMessage('uci');
  }

  private onMessage = (event: MessageEvent<string>) => {
    const line = String(event.data ?? '').trim();
    if (!line) return;

    if (line === 'uciok') {
      this.worker.postMessage(`setoption name MultiPV value ${MULTI_PV}`);
      this.worker.postMessage('isready');
      return;
    }

    if (line === 'readyok') {
      window.clearTimeout(this.readyTimer);
      this.resolveReady();
      return;
    }

    const search = this.pending;
    if (!search) return;

    if (line.startsWith('info ') && line.includes(' pv ')) {
      const rank = Number(line.match(/\smultipv\s+(\d+)/)?.[1] ?? '1');
      const parsed = parseUciInfoLine(line, search.turn);
      if (parsed && rank >= 1 && rank <= MULTI_PV) search.lines.set(rank, parsed);
      return;
    }

    if (line.startsWith('bestmove ')) {
      const best = line.split(/\s+/)[1];
      if (best && best !== '(none)' && !search.lines.has(1)) search.lines.set(1, { move: best });
      const orderedLines = [...search.lines.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, engineLine]) => engineLine);
      const moves = orderedLines
        .map(({ move }) => move)
        .filter((move, index, all) => all.indexOf(move) === index)
        .slice(0, MULTI_PV);
      const evaluation = search.lines.get(1)?.evaluation ?? { type: 'cp' as const, value: 0 };
      const lines = orderedLines
        .filter((engineLine): engineLine is EngineLine & { evaluation: EngineEvaluation } => !!engineLine.evaluation)
        .filter((engineLine, index, all) => all.findIndex(({ move }) => move === engineLine.move) === index)
        .slice(0, MULTI_PV)
        .map((engineLine) => ({ move: engineLine.move, evaluation: engineLine.evaluation }));
      this.finishSearch(moves.length > 0 ? { moves, lines, evaluation } : null);
    }
  };

  private onError = () => {
    window.clearTimeout(this.readyTimer);
    const error = new Error('The local Stockfish worker stopped unexpectedly.');
    this.rejectReady(error);
    this.finishSearch(null, error);
  };

  private finishSearch(result: LocalAnalysisResult | null, error?: Error) {
    const search = this.pending;
    if (!search) return;
    this.pending = null;
    window.clearTimeout(search.timer);
    if (result) search.resolve(result);
    else search.reject(error ?? new Error('Stockfish returned no legal move.'));
  }

  async analyze(fen: string, depth: number): Promise<LocalAnalysisResult> {
    await this.readyPromise;
    if (this.disposed) throw new Error('Stockfish was disposed before analysis.');
    if (this.pending) throw new Error('Stockfish received overlapping searches.');

    return new Promise<LocalAnalysisResult>((resolve, reject) => {
      const searchTimeoutMs = depth >= 18 ? 45_000 : depth >= 14 ? 25_000 : ENGINE_TIMEOUT_MS;
      const timer = window.setTimeout(() => {
        this.worker.postMessage('stop');
        this.finishSearch(null, new Error('Local Stockfish analysis timed out.'));
      }, searchTimeoutMs);
      const turn = fen.split(/\s+/)[1] === 'b' ? 'b' : 'w';
      this.pending = { resolve, reject, lines: new Map(), timer, turn };
      this.worker.postMessage('ucinewgame');
      this.worker.postMessage(`position fen ${fen}`);
      this.worker.postMessage(`go depth ${depth}`);
    });
  }

  dispose() {
    window.clearTimeout(this.readyTimer);
    this.disposed = true;
    this.finishSearch(null, new Error('Stockfish restarted.'));
    this.worker.removeEventListener('message', this.onMessage);
    this.worker.removeEventListener('error', this.onError);
    this.worker.terminate();
  }
}

let process: StockfishProcess | null = null;
let analysisQueue: Promise<void> = Promise.resolve();

async function analyzeWithRecovery(fen: string, depth: number): Promise<LocalAnalysisResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      process ??= new StockfishProcess();
      return await process.analyze(fen, depth);
    } catch (error) {
      lastError = error;
      process?.dispose();
      process = null;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Local Stockfish could not start.');
}

/** Serializes work through the single worker and restarts it transparently on failure. */
export function analyzeLocally(fen: string, depth: number): Promise<LocalAnalysisResult> {
  return new Promise<LocalAnalysisResult>((resolve, reject) => {
    analysisQueue = analysisQueue
      .catch(() => undefined)
      .then(async () => {
        try {
          resolve(await analyzeWithRecovery(fen, depth));
        } catch (error) {
          reject(error);
        }
      });
  });
}
