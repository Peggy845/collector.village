'use client';

import { useEffect, useState } from 'react';

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default function Countdown({ readyAt, onComplete }: { readyAt: string; onComplete?: () => void }) {
  const target = new Date(readyAt).getTime();
  const [remaining, setRemaining] = useState(() => target - Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      const next = target - Date.now();
      setRemaining(next);
      if (next <= 0) {
        clearInterval(interval);
        onComplete?.();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [target, onComplete]);

  if (remaining <= 0) return <span>已完成</span>;
  return <span>剩餘 {formatRemaining(remaining)}</span>;
}
