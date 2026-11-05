import { fitText, type Ctx2D, type FitResult } from './textfit';
import { BADGE_FONTS, NO_BADGE_ASSETS, loadBadgeAssets, loadedBadgeAssets, type BadgeAssets } from './assets';
import type { BadgeFormat, BadgeInput, Campaign, Crop, Palette, Role } from '../types';

export type { BadgeFormat } from '../types';

/** Export width in px (and the height of the default square format). */
export const EXPORT_SIZE = 1080;
/** Exported PNG size per format: square 1:1 (default) and portrait 4:5. */
export const EXPORT_SIZES: Record<BadgeFormat, { width: number; height: number }> = {
  square: { width: 1080, height: 1080 },
  portrait: { width: 1080, height: 1350 },
};
export const DEFAULT_FORMAT: BadgeFormat = 'square';
export const DEFAULT_CROP: Crop = { x: 0, y: 0, zoom: 1 };
export const MAX_ZOOM = 4;

const ROLE_LABEL: Record<Role, string> = {
  attending: 'ATTENDING',
  volunteering: 'VOLUNTEER',
  speaking: 'SPEAKER',
  submission: 'BOUNTY ENTRY',
};
export const roleLabel = (r: Role) => ROLE_LABEL[r];

/** Role-specific serif participation headline (DESIGN_GUIDELINES: bounties use “I built something”). */
const HEADLINE: Record<Role, string> = {
  attending: 'I’m attending',
  volunteering: 'I’m volunteering',
  speaking: 'I’m speaking',
  submission: 'I built something',
};
export const badgeHeadline = (r: Role) => HEADLINE[r];

/** Design grid for one export format, in export pixels (1080 wide). */
export interface BadgeLayout {
  width: number;
  height: number;
  margin: number;
  right: number;
  logo: { x: number; y: number; h: number };
  titleRule: { y: number; w: number; h: number };
  title: { y: number; w: number };
  headlineBottom: number;
  /** Preferred serif headline size (shrinks to fit). */
  headlineMax: number;
  portrait: { x: number; y: number; d: number };
  column: { x: number; top: number; bottom: number };
  /** Preferred name size (shrinks to fit). */
  nameMax: number;
  footerRule: number;
  footer: { top: number; bottom: number; scale: number };
  arcs: { cx: number; cy: number; r0: number; step: number; count: number };
}

/** 1080 × 1080 design grid. */
export const LAYOUT = {
  width: 1080,
  height: 1080,
  margin: 72,
  right: 1008,
  logo: { x: 72, y: 72, h: 44 },
  titleRule: { y: 166, w: 40, h: 3 },
  title: { y: 186, w: 600 },
  headlineBottom: 396,
  headlineMax: 96,
  portrait: { x: 72, y: 417, d: 325 },
  column: { x: 439, top: 436, bottom: 762 },
  nameMax: 64,
  footerRule: 790,
  footer: { top: 822, bottom: 1008, scale: 1 },
  arcs: { cx: 1080, cy: 250, r0: 120, step: 45, count: 7 },
} as const satisfies BadgeLayout;

/**
 * 1080 × 1350 (4:5) grid: the same composition with the extra 270px spent on a larger headline,
 * a larger portrait and name, more air around the identity block and a roomier footer.
 */
export const PORTRAIT_LAYOUT = {
  width: 1080,
  height: 1350,
  margin: 72,
  right: 1008,
  logo: { x: 72, y: 72, h: 48 },
  titleRule: { y: 180, w: 40, h: 3 },
  title: { y: 200, w: 600 },
  headlineBottom: 500,
  headlineMax: 116,
  portrait: { x: 72, y: 530, d: 440 },
  column: { x: 556, top: 546, bottom: 954 },
  nameMax: 72,
  footerRule: 1030,
  footer: { top: 1066, bottom: 1278, scale: 1.15 },
  arcs: { cx: 1080, cy: 250, r0: 120, step: 45, count: 7 },
} as const satisfies BadgeLayout;

export const LAYOUTS: Record<BadgeFormat, BadgeLayout> = { square: LAYOUT, portrait: PORTRAIT_LAYOUT };
/** Normalises an untrusted/missing format to a supported one (default square). */
export const badgeFormat = (f: unknown): BadgeFormat => (f === 'portrait' ? 'portrait' : 'square');

export const ARC_MESSAGE = 'Out of the ordinary';

export function clampCrop(c: Crop): Crop {
  const n = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
  return { x: n(c.x, -1, 1), y: n(c.y, -1, 1), zoom: n(c.zoom, 1, MAX_ZOOM) };
}

function alpha(hex: string, a: number): string {
  let h = hex.slice(1);
  if (h.length === 3) h = h.replace(/./g, '$&$&');
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Configured campaign copy is drawn without emoji (brand: no decorative icon clusters). */
export function stripEmoji(s: string): string {
  return s
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** Locale-independent so preview and export (and every browser) agree: "Thursday 12 November 2026". */
export function formatBadgeDate(iso: string, withDay = true): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  const date = `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}`;
  return withDay ? `${DAYS[d.getUTCDay()]} ${date}` : date;
}

/** Eight-bit ASCII groups for the background arcs. */
export function arcBytes(message = ARC_MESSAGE): string[] {
  return Array.from(message, (c) => c.charCodeAt(0).toString(2).padStart(8, '0'));
}

// ---------------------------------------------------------------- text helpers

interface Block {
  text: string;
  font: (size: number) => string;
  color: string;
  max: number;
  min: number;
  lines: number;
  lh: number;
  /** Space after this block. */
  gap: number;
  /** Letter spacing in em (drawn per glyph so it is identical in every browser). */
  tracking?: number;
}
interface Placed {
  block: Block;
  fit: FitResult;
  height: number;
}

function trackedWidth(ctx: Ctx2D, text: string, tracking: number, size: number): number {
  const chars = Array.from(text);
  return chars.reduce((w, c) => w + ctx.measureText(c).width, 0) + tracking * size * Math.max(0, chars.length - 1);
}

function fitBlock(ctx: Ctx2D, b: Block, width: number, maxSize: number): FitResult {
  if (b.tracking) {
    for (let s = maxSize; s >= b.min; s--) {
      ctx.font = b.font(s);
      if (trackedWidth(ctx, b.text, b.tracking, s) <= width || s === b.min) return { size: s, lines: [b.text], lineHeight: b.lh };
    }
  }
  return fitText(ctx, b.text, {
    maxWidth: width,
    maxHeight: b.lines * maxSize * b.lh + 0.5,
    maxSize,
    minSize: b.min,
    maxLines: b.lines,
    fontFor: b.font,
    lineHeight: b.lh,
    avoidWordBreaks: true,
  });
}

/** Fits a vertical stack of text blocks into width × height, shrinking all type together until it fits. */
interface Stack {
  placed: Placed[];
  height: number;
  /** Shared type scale (1 = preferred sizes). */
  k: number;
}
const gapScale = (k: number) => Math.max(Math.min(1, k), 0.6);

function fitStack(ctx: Ctx2D, blocks: Block[], width: number, height: number): Stack {
  let best: Stack = { placed: [], height: 0, k: 1 };
  for (let k = 1; k >= 0.5; k -= 0.05) {
    const placed = blocks.map((block) => {
      const fit = fitBlock(ctx, block, width, Math.max(block.min, Math.round(block.max * k)));
      return { block, fit, height: fit.lines.length * fit.size * fit.lineHeight };
    });
    const total = placed.reduce((h, p, i) => h + p.height + (i < placed.length - 1 ? p.block.gap * gapScale(k) : 0), 0);
    best = { placed, height: total, k };
    if (total <= height) break;
  }
  return best;
}

function drawStack(ctx: Ctx2D, stack: Stack, x: number, top: number): number {
  let y = top;
  stack.placed.forEach((p, i) => {
    const { block, fit } = p;
    ctx.font = block.font(fit.size);
    ctx.fillStyle = block.color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const lh = fit.size * fit.lineHeight;
    fit.lines.forEach((line, j) => {
      const cy = y + lh * (j + 0.5);
      if (block.tracking) drawTracked(ctx, line, x, cy, block.tracking, fit.size);
      else ctx.fillText(line, x, cy);
    });
    y += p.height + (i < stack.placed.length - 1 ? block.gap * gapScale(stack.k) : 0);
  });
  return y;
}

function drawTracked(ctx: Ctx2D, text: string, x: number, y: number, tracking: number, size: number) {
  let cx = x;
  for (const c of Array.from(text)) {
    ctx.fillText(c, cx, y);
    cx += ctx.measureText(c).width + tracking * size;
  }
}

const sans = (weight: number) => (s: number) => `${weight} ${s}px ${BADGE_FONTS.sans}`;
const serif = (s: number) => `400 ${s}px ${BADGE_FONTS.serif}`;

// ---------------------------------------------------------------- drawing

function drawArcs(ctx: Ctx2D, p: Palette, L: BadgeLayout) {
  const { cx, cy, r0, step, count } = L.arcs;
  const radii = Array.from({ length: count }, (_, i) => r0 + i * step);
  // Each arc reads from its leftmost point (angle π) clockwise towards the top, stopping short of the top edge.
  const span = (r: number) => (r <= cy - 14 ? Math.PI / 2 : Math.asin((cy - 14) / r)) - 0.06;
  const bytes = arcBytes();
  ctx.save();
  ctx.strokeStyle = alpha(p.text, 0.1);
  ctx.lineWidth = 1;
  for (const r of radii) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, Math.PI * 1.5);
    ctx.stroke();
  }
  // Largest glyph advance at which every byte fits, whole bytes per arc, inner arc first.
  let adv = 16;
  let plan: string[][] = [];
  for (; adv >= 8; adv -= 0.5) {
    plan = radii.map(() => []);
    let next = 0;
    radii.forEach((r, i) => {
      let used = 0;
      while (next < bytes.length && used + (used ? adv : 0) + 8 * adv <= r * span(r)) {
        used += (used ? adv : 0) + 8 * adv;
        plan[i].push(bytes[next++]);
      }
    });
    if (next === bytes.length) break;
  }
  ctx.fillStyle = alpha(p.text, 0.32);
  ctx.font = `400 ${Math.round(adv * 1.05)}px ${BADGE_FONTS.mono}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  radii.forEach((r, i) => {
    const text = plan[i].join(' ');
    const tr = r + adv * 0.75;
    Array.from(text).forEach((c, j) => {
      if (c === ' ') return;
      const a = Math.PI + 0.06 + ((j + 0.5) * adv) / r;
      ctx.save();
      ctx.translate(cx + tr * Math.cos(a), cy + tr * Math.sin(a));
      ctx.rotate(a + Math.PI / 2);
      ctx.fillText(c, 0, 0);
      ctx.restore();
    });
  });
  ctx.restore();
}

function drawLogo(ctx: Ctx2D, input: BadgeInput, assets: BadgeAssets, L: BadgeLayout) {
  const img = input.style === 'dark' ? assets.logoOnDark : assets.logoOnLight;
  if (!img) return;
  const w = 'naturalWidth' in img ? img.naturalWidth : img.width;
  const h = 'naturalHeight' in img ? img.naturalHeight : img.height;
  if (!(w > 0 && h > 0)) return;
  const { x, y, h: dh } = L.logo;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, x, y, (w / h) * dh, dh);
}

function drawPhoto(ctx: Ctx2D, input: BadgeInput, p: Palette, L: BadgeLayout) {
  const { x, y, d } = L.portrait;
  const r = d / 2;
  const cx = x + r;
  const cy = y + r;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  const photo = input.photo;
  const w = photo ? ('naturalWidth' in photo ? photo.naturalWidth : photo.width) : 0;
  const h = photo ? ('naturalHeight' in photo ? photo.naturalHeight : photo.height) : 0;
  if (photo && w > 0 && h > 0) {
    const crop = clampCrop(input.crop);
    const scale = Math.max(d / w, d / h) * crop.zoom;
    const sw = w * scale;
    const sh = h * scale;
    const tx = (sw - d) / 2;
    const ty = (sh - d) / 2;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(photo, cx - sw / 2 - crop.x * tx, cy - sh / 2 - crop.y * ty, sw, sh);
  } else {
    // Neutral silhouette placeholder.
    ctx.fillStyle = alpha(p.text, 0.08);
    ctx.fillRect(x, y, d, d);
    ctx.fillStyle = alpha(p.text, 0.18);
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.22, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.78, r * 0.62, r * 0.58, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function detailBlocks(input: BadgeInput, p: Palette): Block[] {
  const { campaign, role, details: d } = input;
  const blocks: Block[] = [];
  const session = d.sessionTitle?.trim();
  if (role === 'speaking' && campaign.fields.sessionTitle && session) {
    blocks.push({ text: `“${session}”`, font: serif, color: p.text, max: 34, min: 20, lines: 3, lh: 1.25, gap: 14 });
  }
  const project = d.projectName?.trim();
  if (campaign.fields.projectName && project) {
    blocks.push({ text: project, font: sans(500), color: p.text, max: 32, min: 18, lines: 2, lh: 1.25, gap: 12 });
  }
  const gh = d.githubUsername?.trim().replace(/^@/, '');
  if (campaign.fields.githubUsername && gh) {
    blocks.push({ text: `github.com/${gh}`, font: sans(400), color: p.mutedText, max: 26, min: 16, lines: 2, lh: 1.3, gap: 0 });
  }
  return blocks;
}

function drawIdentity(ctx: Ctx2D, input: BadgeInput, p: Palette, L: BadgeLayout) {
  const { x, top, bottom } = L.column;
  const width = L.right - x;
  const name = input.name.trim().replace(/\s+/g, ' ') || 'Your Name';
  // No role label here: the serif headline already says it. The name block is centred on the portrait.
  const blocks: Block[] = [
    { text: name, font: sans(600), color: p.text, max: L.nameMax, min: 28, lines: 3, lh: 1.1, gap: 20 },
    ...detailBlocks(input, p),
  ];
  const stack = fitStack(ctx, blocks, width, bottom - top);
  const portraitMid = L.portrait.y + L.portrait.d / 2;
  // Lift slightly: line boxes include descender space below the glyphs, so a box-centred block reads low.
  const optical = stack.placed[0] ? stack.placed[0].fit.size * 0.04 : 0;
  const start = Math.min(Math.max(top, portraitMid - stack.height / 2 - optical), bottom - stack.height);
  drawStack(ctx, stack, x, Math.max(top, start));
}

/** Footer location line: the short venue when configured, else the full venue, then the city. */
export function badgeVenueLine(m: NonNullable<Campaign['meetup']>): string {
  const venue = stripEmoji(m.venueShort?.trim() || m.venue);
  return [venue, stripEmoji(m.city)].filter(Boolean).join(', ');
}

function footerBlocks(campaign: Campaign, p: Palette, k: number): Block[] {
  const z = (n: number) => Math.round(n * k);
  const primary = (text: string, lines = 2, weight = 600): Block => ({ text, font: sans(weight), color: p.text, max: z(30), min: 16, lines, lh: 1.25, gap: z(8) });
  const secondary = (text: string): Block => ({ text, font: sans(400), color: p.mutedText, max: z(26), min: 15, lines: 2, lh: 1.3, gap: z(8) });
  const blocks: Block[] = [];
  if (campaign.programme === 'meetup' && campaign.meetup) {
    const m = campaign.meetup;
    blocks.push(primary(formatBadgeDate(m.date)));
    const where = badgeVenueLine(m);
    if (where) blocks.push(secondary(where));
  } else if (campaign.bounty) {
    const b = campaign.bounty;
    blocks.push(primary(stripEmoji(b.challenge), 3, 500));
    const meta = [`Deadline ${formatBadgeDate(b.deadline, false)}`, b.prize ? `Prize: ${stripEmoji(b.prize)}` : ''].filter(Boolean);
    blocks.push(secondary(meta.join('  ·  ')));
  }
  if (campaign.link) {
    blocks.push({
      text: campaign.link.replace(/^https:\/\//, '').replace(/\/$/, ''),
      font: sans(500), color: p.accent, max: z(22), min: 14, lines: 2, lh: 1.3, gap: 0,
    });
  }
  return blocks;
}

function drawDemoLabel(ctx: Ctx2D, p: Palette, L: BadgeLayout): number {
  const size = 16;
  const tracking = 0.2;
  ctx.font = sans(600)(size);
  const tw = trackedWidth(ctx, 'DEMO', tracking, size);
  const w = Math.round(tw + 28);
  const h = 34;
  const x = L.right - w;
  const y = L.footer.top;
  ctx.strokeStyle = alpha(p.mutedText, 0.7);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5, 4);
  ctx.stroke();
  ctx.fillStyle = p.mutedText;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  drawTracked(ctx, 'DEMO', x + (w - tw) / 2, y + h / 2 + 1, tracking, size);
  return w;
}

function drawFooter(ctx: Ctx2D, campaign: Campaign, p: Palette, L: BadgeLayout) {
  const { margin, right } = L;
  ctx.fillStyle = alpha(p.text, 0.22);
  ctx.fillRect(margin, L.footerRule, right - margin, 1);
  const reserve = campaign.demo ? drawDemoLabel(ctx, p, L) + 32 : 0;
  const { top, bottom, scale } = L.footer;
  const stack = fitStack(ctx, footerBlocks(campaign, p, scale), right - margin - reserve, bottom - top);
  drawStack(ctx, stack, margin, top);
}

function drawBadge(ctx: Ctx2D, input: BadgeInput, size: number, assets: BadgeAssets) {
  const { campaign, style, role } = input;
  const p = style === 'dark' ? input.theme.dark : input.theme.light;
  const L = LAYOUTS[badgeFormat(input.format)];

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  ctx.scale(size / L.width, size / L.width);
  ctx.beginPath();
  ctx.rect(0, 0, L.width, L.height);
  ctx.clip();

  ctx.fillStyle = p.background;
  ctx.fillRect(0, 0, L.width, L.height);
  drawArcs(ctx, p, L);
  drawLogo(ctx, input, assets, L);

  // Accent rule + restrained campaign title (kept clear of the arcs).
  const { margin } = L;
  ctx.fillStyle = p.accent;
  ctx.fillRect(margin, L.titleRule.y, L.titleRule.w, L.titleRule.h);
  const title = fitStack(
    ctx,
    [{ text: stripEmoji(campaign.title) || campaign.title, font: sans(600), color: p.text, max: 28, min: 18, lines: 2, lh: 1.25, gap: 0 }],
    L.title.w,
    72,
  );
  const titleBottom = drawStack(ctx, title, margin, L.title.y);

  // Serif participation headline, bottom-aligned just above the portrait.
  const room = L.headlineBottom - (titleBottom + 22);
  const head = fitText(ctx, HEADLINE[role], {
    maxWidth: L.right - margin, maxHeight: room, maxSize: L.headlineMax, minSize: 40, maxLines: 2, fontFor: serif, lineHeight: 1.08, avoidWordBreaks: true,
  });
  ctx.font = serif(head.size);
  ctx.fillStyle = p.text;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const hl = head.size * head.lineHeight;
  head.lines.forEach((line, i) => {
    ctx.fillText(line, margin - head.size * 0.03, L.headlineBottom - (head.lines.length - 1 - i) * hl - head.size * 0.08);
  });

  drawPhoto(ctx, input, p, L);
  drawIdentity(ctx, input, p, L);
  drawFooter(ctx, campaign, p, L);
  ctx.restore();
}

const pendingRedraw = new WeakMap<object, number>();
let redrawSeq = 0;

export function cancelBadgeRender(ctx: Ctx2D): void {
  pendingRedraw.delete(ctx.canvas ?? ctx);
}

/**
 * Pure canvas renderer shared by the live preview and the export.
 * `size` is the drawn width; the badge fills (0,0)-(size, size × height/width) of `ctx` for
 * `input.format` (default 'square' = 1:1, 'portrait' = 4:5), scaling from a 1080-wide design grid.
 *
 * `assets` defaults to the bundled logos/fonts once loaded. If they are still loading, the badge is
 * drawn without them and automatically redrawn on the same canvas when they arrive (unless a newer
 * render has happened since), so the preview converges to exactly what the export draws.
 */
export function renderBadge(ctx: Ctx2D, input: BadgeInput, size: number = EXPORT_SIZE, assets?: BadgeAssets): void {
  const key: object = ctx.canvas ?? ctx;
  const ready = assets ?? loadedBadgeAssets();
  if (ready) {
    pendingRedraw.delete(key);
    drawBadge(ctx, input, size, ready);
    return;
  }
  const token = ++redrawSeq;
  pendingRedraw.set(key, token);
  drawBadge(ctx, input, size, NO_BADGE_ASSETS);
  void loadBadgeAssets().then(
    (loaded) => {
      if (pendingRedraw.get(key) !== token) return;
      pendingRedraw.delete(key);
      drawBadge(ctx, input, size, loaded);
    },
    (error: unknown) => {
      if (pendingRedraw.get(key) !== token) return;
      pendingRedraw.delete(key);
      console.error('Could not load badge artwork for the preview.', error);
    },
  );
}

/**
 * B3/B5: renders at EXPORT_SIZES[input.format ?? 'square'] (1080×1080 or 1080×1350) and resolves
 * a PNG blob; rejects (never silently succeeds) on failure.
 */
export async function renderBadgeToBlob(input: BadgeInput): Promise<Blob> {
  const assets = await loadBadgeAssets();
  const { width, height } = EXPORT_SIZES[badgeFormat(input.format)];
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not supported in this browser.');
  renderBadge(ctx, input, width, assets);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
  if (!blob || blob.size === 0) throw new Error('Could not create the PNG image.');
  return blob;
}
