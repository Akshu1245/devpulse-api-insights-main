"use client";

import { useState, useEffect, useRef } from "react";

export function useAnimatedCounter(target: number, duration = 800): number {
  const [value, setValue] = useState(0);
  const prevTarget = useRef(0);
  const rafRef = useRef<number>();

  useEffect(() => {
    const start = prevTarget.current;
    const diff = target - start;
    if (diff === 0) return;

    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(start + diff * eased));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        prevTarget.current = target;
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  return value;
}
