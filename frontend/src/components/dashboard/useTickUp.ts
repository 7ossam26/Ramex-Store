import { useEffect, useRef, useState } from 'react';

/* Animate a value when it changes.
 * Patched for the live-polling dashboard:
 *   - Only animates on REAL value change (skips identical refetch payloads)
 *   - Does NOT reset to 0 on every refetch; animates from previous to new
 *   - First mount: snap to value (no count-up from 0 on the first render)
 *   - Respects prefers-reduced-motion. */
export function useTickUp(target: number, duration = 600): number {
  const [value, setValue] = useState<number>(target);
  const prevTargetRef = useRef<number>(target);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef<number>(target);
  const rafRef = useRef<number | null>(null);
  const mountedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      prevTargetRef.current = target;
      setValue(target);
      return;
    }

    const prev = prevTargetRef.current;
    const delta = Math.abs(target - prev);

    if (delta < 0.01) {
      prevTargetRef.current = target;
      setValue(target);
      return;
    }

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      prevTargetRef.current = target;
      setValue(target);
      return;
    }

    fromRef.current = prev;
    startRef.current = null;
    prevTargetRef.current = target;

    const tick = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(fromRef.current + (target - fromRef.current) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  return value;
}
