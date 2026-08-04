import { useState, useEffect, useRef } from 'react';

/**
 * Returns a display value that smoothly tweens toward `target`
 * using requestAnimationFrame. Duration is in ms.
 */
export function useAnimatedScore(target: number, duration = 600): number {
    const [display, setDisplay] = useState(target);
    const startRef = useRef<number | null>(null);
    const fromRef = useRef(target);
    const rafRef = useRef<number | null>(null);

    useEffect(() => {
        const from = fromRef.current;
        if (from === target) return;

        // Cancel any in-progress animation
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

        startRef.current = null;

        const animate = (timestamp: number) => {
            if (startRef.current === null) startRef.current = timestamp;
            const elapsed = timestamp - startRef.current;
            const progress = Math.min(elapsed / duration, 1);

            // Ease-out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(from + (target - from) * eased);
            setDisplay(current);

            if (progress < 1) {
                rafRef.current = requestAnimationFrame(animate);
            } else {
                fromRef.current = target;
                rafRef.current = null;
            }
        };

        rafRef.current = requestAnimationFrame(animate);
        return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
    }, [target, duration]);

    return display;
}
