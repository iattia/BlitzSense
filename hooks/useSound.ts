import { useRef, useCallback } from 'react';

// Synthesized sounds via AudioContext — no external files needed.
// Each sound is a short oscillator burst with an envelope.

export type SoundType = 'drop' | 'success' | 'miss' | 'tick' | 'countdown' | 'beatGm' | 'streak' | 'fast' | 'capture';

function createCtx(): AudioContext | null {
    try {
        return new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
        return null;
    }
}

function playTone(
    ctx: AudioContext,
    frequency: number,
    type: OscillatorType,
    duration: number,
    gainPeak: number,
    startTime = 0
) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime + startTime);

    gain.gain.setValueAtTime(0, ctx.currentTime + startTime);
    gain.gain.linearRampToValueAtTime(gainPeak, ctx.currentTime + startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startTime + duration);

    osc.start(ctx.currentTime + startTime);
    osc.stop(ctx.currentTime + startTime + duration + 0.05);
}

export function useSound(enabled: boolean) {
    const ctxRef = useRef<AudioContext | null>(null);

    const getCtx = useCallback((): AudioContext | null => {
        if (!enabled) return null;
        if (!ctxRef.current) ctxRef.current = createCtx();
        if (ctxRef.current?.state === 'suspended') {
            ctxRef.current.resume();
        }
        return ctxRef.current;
    }, [enabled]);

    const play = useCallback((sound: SoundType) => {
        const ctx = getCtx();
        if (!ctx) return;

        switch (sound) {
            case 'drop':
                // Short click — low sine blip
                playTone(ctx, 300, 'sine', 0.08, 0.15);
                break;

            case 'capture':
                // Crisp double-thud capture sound
                playTone(ctx, 380, 'triangle', 0.06, 0.22);
                playTone(ctx, 240, 'sine', 0.08, 0.18, 0.04);
                break;

            case 'success':
                // Two-note ascending chime
                playTone(ctx, 523, 'sine', 0.15, 0.2, 0);      // C5
                playTone(ctx, 659, 'sine', 0.2, 0.2, 0.12);    // E5
                break;

            case 'beatGm':
                // Triumphant 3-note ascending major chord (C5 - E5 - G5)
                playTone(ctx, 523, 'sine', 0.18, 0.25, 0);       // C5
                playTone(ctx, 659, 'sine', 0.20, 0.25, 0.10);     // E5
                playTone(ctx, 784, 'triangle', 0.35, 0.30, 0.20); // G5
                break;

            case 'streak':
                // Fast multi-tone level-up chime (E5 - G5 - B5 - E6)
                playTone(ctx, 659, 'sine', 0.12, 0.2, 0);
                playTone(ctx, 784, 'sine', 0.12, 0.2, 0.07);
                playTone(ctx, 987, 'sine', 0.15, 0.2, 0.14);
                playTone(ctx, 1318, 'triangle', 0.3, 0.25, 0.21);
                break;

            case 'fast':
                // High-frequency double ping for speed answers
                playTone(ctx, 1046, 'sine', 0.08, 0.18, 0);
                playTone(ctx, 1318, 'sine', 0.12, 0.22, 0.06);
                break;

            case 'miss':
                // Low descending thud
                playTone(ctx, 200, 'sawtooth', 0.15, 0.12, 0);
                playTone(ctx, 150, 'sawtooth', 0.12, 0.08, 0.08);
                break;

            case 'countdown':
                // Short mid-frequency blip — like a metronome beat
                playTone(ctx, 440, 'sine', 0.1, 0.18);
                break;

            case 'tick':
                // Soft metronome tick
                playTone(ctx, 880, 'square', 0.04, 0.05);
                break;
        }
    }, [getCtx]);

    return { play };
}
