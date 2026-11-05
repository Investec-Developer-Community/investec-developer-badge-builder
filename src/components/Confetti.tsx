import { useEffect, useState } from 'react';

const COLOURS = ['#ff4d6d', '#ffd166', '#06d6a0', '#4cc9f0', '#b388ff', '#ff9f1c'];

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** One-shot confetti burst; renders nothing when the visitor prefers reduced motion. */
export function Confetti({ burst }: { burst: number }) {
  const [pieces, setPieces] = useState<{ id: number; style: React.CSSProperties }[]>([]);

  useEffect(() => {
    if (!burst || prefersReducedMotion()) return;
    setPieces(
      Array.from({ length: 70 }, (_, i) => {
        const angle = Math.random() * Math.PI * 2;
        const dist = 160 + Math.random() * 380;
        return {
          id: burst * 100 + i,
          style: {
            background: COLOURS[i % COLOURS.length],
            '--dx': `${Math.cos(angle) * dist}px`,
            '--dy': `${Math.sin(angle) * dist - 140}px`,
            '--rot': `${Math.round(Math.random() * 720 - 360)}deg`,
            animationDelay: `${Math.random() * 120}ms`,
          } as React.CSSProperties,
        };
      }),
    );
    const t = window.setTimeout(() => setPieces([]), 2200);
    return () => window.clearTimeout(t);
  }, [burst]);

  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p) => (
        <span key={p.id} style={p.style} />
      ))}
    </div>
  );
}
