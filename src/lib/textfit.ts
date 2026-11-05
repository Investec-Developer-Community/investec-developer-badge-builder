export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface FitOptions {
  maxWidth: number;
  maxHeight: number;
  maxSize: number;
  minSize: number;
  maxLines: number;
  fontFor: (size: number) => string;
  lineHeight?: number;
  /** Prefer a smaller size over splitting a word mid-word (still splits if nothing else fits). */
  avoidWordBreaks?: boolean;
}
export interface FitResult {
  size: number;
  lines: string[];
  lineHeight: number;
}

interface WrapResult {
  lines: string[];
  /** True when a word had to be split mid-word (no space or hyphen break point). */
  brokeWord: boolean;
}

function wrap(ctx: Ctx2D, text: string, maxWidth: number): WrapResult {
  const lines: string[] = [];
  let brokeWord = false;
  let line = '';
  const push = (s: string) => {
    if (s) lines.push(s);
  };
  // Break opportunities: spaces, and after hyphens inside a word ("Smith-" / "Jones").
  const tokens: { text: string; space: boolean }[] = [];
  text.split(/\s+/).filter(Boolean).forEach((word) => {
    word.split(/(?<=-)(?=.)/).forEach((part, i) => tokens.push({ text: part, space: i === 0 }));
  });
  for (const { text: word, space } of tokens) {
    const trial = line ? `${line}${space ? ' ' : ''}${word}` : word;
    if (ctx.measureText(trial).width <= maxWidth) {
      line = trial;
      continue;
    }
    push(line);
    line = '';
    if (ctx.measureText(word).width <= maxWidth) {
      line = word;
      continue;
    }
    // A single very long word: break it by characters.
    brokeWord = true;
    for (const ch of Array.from(word)) {
      if (ctx.measureText(line + ch).width > maxWidth && line) {
        push(line);
        line = ch;
      } else line += ch;
    }
  }
  push(line);
  return { lines, brokeWord };
}

function ellipsise(ctx: Ctx2D, line: string, maxWidth: number): string {
  let s = line;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxWidth) s = s.slice(0, -1);
  return s.trimEnd() + '…';
}

/** B6: largest font size that fits the box (wrapping up to maxLines); truncates with "…" as a last resort. */
export function fitText(ctx: Ctx2D, text: string, o: FitOptions): FitResult {
  const lh = o.lineHeight ?? 1.15;
  const clean = text.replace(/\s+/g, ' ').trim();
  let last: FitResult = { size: o.minSize, lines: [], lineHeight: lh };
  let firstFit: FitResult | null = null;
  for (let size = o.maxSize; size >= o.minSize; size -= 2) {
    ctx.font = o.fontFor(size);
    const { lines, brokeWord } = wrap(ctx, clean, o.maxWidth);
    last = { size, lines, lineHeight: lh };
    if (lines.length <= o.maxLines && lines.length * size * lh <= o.maxHeight) {
      if (!o.avoidWordBreaks || !brokeWord) return last;
      firstFit ??= last;
    }
  }
  if (firstFit) {
    ctx.font = o.fontFor(firstFit.size);
    return firstFit;
  }
  const rows = Math.max(1, Math.min(o.maxLines, Math.floor(o.maxHeight / (o.minSize * lh))));
  const lines = last.lines.slice(0, rows);
  if (last.lines.length > rows && lines.length) {
    lines[lines.length - 1] = ellipsise(ctx, lines.slice(-1)[0] + ' ' + last.lines.slice(rows).join(' '), o.maxWidth);
  }
  return { ...last, lines };
}
