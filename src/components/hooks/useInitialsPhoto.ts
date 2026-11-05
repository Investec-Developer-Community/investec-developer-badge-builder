import { useEffect, useState } from 'react';
import type { BadgeInput, Palette } from '../../types';

type InitialsResult =
  | { kind: 'ready'; key: string; image: HTMLImageElement }
  | { kind: 'error'; key: string };

function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? [words[0], words[words.length - 1]] : words)
    .map((word) => Array.from(word.normalize('NFC'))[0])
    .join('')
    .toLocaleUpperCase();
}

function initialsKey(initials: string, palette: Palette): string {
  return JSON.stringify([initials, palette.accent, palette.background]);
}

export function useInitialsPhoto(name: string, palette: Palette, enabled: boolean, downloaded?: BadgeInput) {
  const initials = initialsFor(name);
  const key = initialsKey(initials, palette);
  const active = enabled && initials.length > 0;
  const [result, setResult] = useState<InitialsResult | null>(null);

  // Reuse the downloaded image when edits are reverted, so sharing can become current again.
  const downloadedInitials =
    downloaded &&
    downloaded.photo instanceof HTMLImageElement &&
    initialsKey(initialsFor(downloaded.name), downloaded.theme[downloaded.style]) === key
      ? downloaded.photo
      : null;

  useEffect(() => {
    if (!active || downloadedInitials || result?.key === key) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 400;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setResult({ kind: 'error', key });
        return;
      }
      ctx.fillStyle = palette.accent;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = palette.background;
      ctx.font = '600 160px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(initials, 200, 210, 320);

      const image = new Image();
      image.onload = () => setResult({ kind: 'ready', key, image });
      image.onerror = () => setResult({ kind: 'error', key });
      image.src = canvas.toDataURL('image/png');
      return () => {
        image.onload = null;
        image.onerror = null;
      };
    } catch {
      setResult({ kind: 'error', key });
    }
  }, [active, downloadedInitials, initials, key, palette.accent, palette.background, result]);

  const current = active && !downloadedInitials && result?.key === key ? result : null;
  return {
    initialsPhoto: active ? downloadedInitials ?? (current?.kind === 'ready' ? current.image : null) : null,
    initialsError: current?.kind === 'error' ? 'We couldn’t prepare your initials. Please try again or add a photo.' : '',
    retryInitials: () => setResult(null),
  };
}
