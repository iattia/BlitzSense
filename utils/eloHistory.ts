import { SessionRecord } from '../types';

// Converts session history into an Intuition Elo series.
// Base Elo starts at 1200. Each session adjusts it based on accuracy vs expected.
// Uses a simplified Elo formula: K=32, expected = 0.5 (neutral baseline).

const BASE_ELO = 1200;
const K = 32;

export function sessionEloChange(record: SessionRecord): number {
    const accuracy = record.totalPlayed > 0 ? record.correctCount / record.totalPlayed : 0;
    // Expected score = 0.5 (neutral). Actual = accuracy.
    return Math.round(K * (accuracy - 0.5));
}

export function computeEloHistory(sessions: SessionRecord[]): number[] {
    // sessions are newest-first; reverse for chronological order
    const chronological = [...sessions].reverse();
    let elo = BASE_ELO;
    return chronological.map((s) => {
        elo = Math.max(800, Math.min(3000, elo + sessionEloChange(s)));
        return elo;
    });
}

export function currentElo(sessions: SessionRecord[]): number {
    const history = computeEloHistory(sessions);
    return history.length > 0 ? history[history.length - 1] : BASE_ELO;
}
