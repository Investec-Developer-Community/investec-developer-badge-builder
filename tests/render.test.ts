import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ARC_MESSAGE,
  DEFAULT_CROP,
  EXPORT_SIZE,
  EXPORT_SIZES,
  LAYOUT,
  PORTRAIT_LAYOUT,
  arcBytes,
  badgeHeadline,
  badgeVenueLine,
  formatBadgeDate,
  renderBadge,
  renderBadgeToBlob,
  stripEmoji,
  type BadgeFormat,
} from '../src/lib/render';
import { NO_BADGE_ASSETS, type BadgeAssets } from '../src/lib/assets';
import { nudgePhoto, PHOTO_ARROW_DIRECTIONS, type PhotoDirection } from '../src/components/photoCrop';
import type { BadgeInput, Campaign, Crop, Role, Theme } from '../src/types';

interface TextCall {
  text: string;
  x: number;
  y: number;
  size: number;
  font: string;
  transformed: boolean;
}

/** Minimal recording 2D context: measures text as 0.55em per character. */
function mockCtx() {
  const texts: TextCall[] = [];
  const images: { img: unknown; x: number; y: number; w: number; h: number }[] = [];
  const rects: { op: string; x: number; y: number; w: number; h: number }[] = [];
  let depth = 0;
  const stack: number[] = [];
  const state = { font: '10px sans-serif' };
  const size = () => Number(/(\d+(?:\.\d+)?)px/.exec(state.font)?.[1] ?? 10);
  const target: Record<string, unknown> = {
    canvas: {},
    get font() {
      return state.font;
    },
    set font(v: string) {
      state.font = v;
    },
    save: () => stack.push(depth),
    restore: () => {
      depth = stack.pop() ?? 0;
    },
    translate: () => {
      depth++;
    },
    measureText: (t: string) => ({ width: Array.from(t).length * size() * 0.55 }),
    fillText: (text: string, x: number, y: number) => texts.push({ text, x, y, size: size(), font: state.font, transformed: depth > 0 }),
    drawImage: (img: unknown, x: number, y: number, w: number, h: number) => images.push({ img, x, y, w, h }),
    rect: (x: number, y: number, w: number, h: number) => rects.push({ op: 'rect', x, y, w, h }),
    fillRect: (x: number, y: number, w: number, h: number) => rects.push({ op: 'fillRect', x, y, w, h }),
  };
  const ctx = new Proxy(target, {
    get: (t, k: string) => (k in t ? t[k] : () => undefined),
    set: (t, k: string, v) => {
      if (k === 'font') state.font = v;
      else t[k] = v;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts, images, rects };
}

const pal = { background: '#0c2338', accent: '#5fc1cc', text: '#ffffff', mutedText: '#b6c4d1' };
const legacyDecorations = { font: 'sans', pattern: 'none', photoShape: 'circle', stickers: ['🚀'], ribbonText: 'RIBBON' };
const theme: Theme = {
  id: 't', name: 'T', ...legacyDecorations,
  dark: pal, light: { ...pal, background: '#f3efe7', text: '#0c2338' },
};
const meetup: Campaign = {
  id: 'm', programme: 'meetup', title: '🎤 Cape Town Dev Meetup', status: 'active', archived: false, demo: true, theme: 't',
  tagline: 'A tagline', roles: ['attending', 'volunteering', 'speaking'],
  fields: { sessionTitle: true, projectName: false, githubUsername: false },
  meetup: { date: '2026-11-12', venue: 'Demo Venue Hall', city: 'Cape Town' },
};
const bounty: Campaign = {
  id: 'b', programme: 'bounty', title: 'Demo API Bounty', status: 'active', archived: false, demo: false, theme: 't',
  tagline: '', roles: ['submission'], link: 'https://example.com/bounty',
  fields: { sessionTitle: false, projectName: true, githubUsername: true },
  bounty: { challenge: 'Build a small app that uses the sandbox API.', deadline: '2026-12-15', prize: 'A prize' },
};
const input = (over: Partial<BadgeInput> = {}): BadgeInput => ({
  campaign: meetup, theme, style: 'dark', role: 'attending', name: 'Thandi Nkosi', photo: null, crop: DEFAULT_CROP, details: {}, ...over,
});
const logoDark = { width: 399, height: 66, tag: 'white-logo' } as unknown as ImageBitmap;
const logoLight = { width: 399, height: 66, tag: 'dark-logo' } as unknown as ImageBitmap;
const assets: BadgeAssets = { logoOnDark: logoDark, logoOnLight: logoLight };

function render(over: Partial<BadgeInput> = {}, a: BadgeAssets = assets) {
  const m = mockCtx();
  renderBadge(m.ctx, input(over), 1080, a);
  const flat = m.texts.filter((t) => !t.transformed);
  return { ...m, flat, all: flat.map((t) => t.text).join(' ') };
}
const EMOJI = /\p{Extended_Pictographic}/u;
const width = (t: TextCall) => Array.from(t.text).length * t.size * 0.55;

describe('badge helpers', () => {
  it('encodes "Out of the ordinary" as eight-bit ASCII for the arcs', () => {
    const bytes = arcBytes();
    expect(bytes).toHaveLength(ARC_MESSAGE.length);
    expect(bytes.every((b) => /^[01]{8}$/.test(b))).toBe(true);
    expect(bytes.map((b) => String.fromCharCode(parseInt(b, 2))).join('')).toBe('Out of the ordinary');
  });
  it('formats dates without locale dependence', () => {
    expect(formatBadgeDate('2026-11-12')).toBe('Thursday 12 November 2026');
    expect(formatBadgeDate('2026-12-15', false)).toBe('15 December 2026');
  });
  it('strips emoji from configured copy', () => {
    expect(stripEmoji('🎤 Cape Town ✨ Meetup 🚀')).toBe('Cape Town Meetup');
  });
});

describe('photo movement controls', () => {
  const photo: ImageBitmap = { width: 400, height: 400, close: () => undefined };
  const centered: Crop = { x: 0, y: 0, zoom: 2 };
  const position = (crop: Crop) => {
    const image = render({ photo, crop }).images.find((item) => item.img === photo);
    expect(image).toBeDefined();
    return image!;
  };

  it.each<[PhotoDirection, 'x' | 'y', number]>([
    ['left', 'x', -1],
    ['right', 'x', 1],
    ['up', 'y', -1],
    ['down', 'y', 1],
  ])('moves the rendered photo %s for the corresponding control', (direction, axis, sign) => {
    const before = position(centered);
    const after = position(nudgePhoto(centered, direction, 0.06));
    expect((after[axis] - before[axis]) * sign).toBeGreaterThan(0);
  });

  it('maps arrow keys to their visible directions and clamps movement', () => {
    expect(PHOTO_ARROW_DIRECTIONS).toEqual({
      ArrowLeft: 'left',
      ArrowRight: 'right',
      ArrowUp: 'up',
      ArrowDown: 'down',
    });
    expect(nudgePhoto({ x: 1, y: -1, zoom: 2 }, 'left', 0.06).x).toBe(1);
    expect(nudgePhoto({ x: 1, y: -1, zoom: 2 }, 'down', 0.06).y).toBe(-1);
  });
});

describe('renderBadge composition', () => {
  it('draws no emoji, stickers, ribbon text, tagline or big watermark', () => {
    const { flat, texts, all } = render();
    expect(texts.some((t) => EMOJI.test(t.text))).toBe(false);
    expect(all).not.toContain('RIBBON');
    expect(all).not.toContain('A tagline');
    expect(texts.filter((t) => t.text === 'DEMO').every((t) => t.size <= 20)).toBe(true);
    expect(flat.some((t) => t.text.includes('Cape Town Dev Meetup'))).toBe(true);
  });

  it('labels demo campaigns discreetly and only demo campaigns', () => {
    const demo = render().flat.filter((t) => ['D', 'E', 'M', 'O'].includes(t.text) && t.y > LAYOUT.footerRule);
    expect(demo.map((t) => t.text).join('')).toBe('DEMO');
    expect(demo.every((t) => t.size <= 20)).toBe(true);
    const none = render({ campaign: bounty, role: 'submission' }).flat.filter((t) => ['D', 'E', 'M', 'O'].includes(t.text) && t.y > LAYOUT.footerRule);
    expect(none.map((t) => t.text).join('')).not.toBe('DEMO');
  });

  it('places the style-appropriate logo top-left at the 72px margin', () => {
    const dark = render().images;
    expect(dark[0]).toMatchObject({ img: logoDark, x: 72, y: 72 });
    const light = render({ style: 'light' }).images;
    expect(light[0]).toMatchObject({ img: logoLight, x: 72 });
  });

  it('still renders everything when the logo is unavailable', () => {
    const { images, all } = render({}, NO_BADGE_ASSETS);
    expect(images).toHaveLength(0);
    expect(all).toContain('Thandi Nkosi');
    expect(all).toContain(badgeHeadline('attending'));
  });

  it.each<[Role, Campaign]>([
    ['attending', meetup],
    ['volunteering', meetup],
    ['speaking', meetup],
    ['submission', bounty],
  ])('uses the %s serif headline and no repeated role label', (role, campaign) => {
    const { flat } = render({ campaign, role });
    const head = flat.find((t) => t.text === badgeHeadline(role));
    expect(head?.font).toMatch(/Georgia/);
    // Role labels were uppercase and drawn glyph by glyph (tracked); join both forms to catch either.
    const glyphs = flat.filter((t) => t.text.length === 1).map((t) => t.text).join('');
    const words = flat.filter((t) => t !== head).map((t) => t.text).join(' ');
    for (const label of ['ATTENDEE', 'ATTENDING', 'VOLUNTEER', 'SPEAKER', 'BOUNTY SUBMISSION', 'BOUNTY ENTRY']) {
      expect(glyphs).not.toContain(label);
      expect(words).not.toContain(label);
    }
    const column = flat.filter((t) => t.x >= LAYOUT.column.x && t.y < LAYOUT.footerRule);
    expect(column.some((t) => t.text.length === 1)).toBe(false);
    expect(column[0].text).toBe('Thandi Nkosi');
  });

  it('centres a lone name on the portrait', () => {
    const name = render().flat.filter((t) => t.text === 'Thandi Nkosi');
    expect(name).toHaveLength(1);
    const mid = LAYOUT.portrait.y + LAYOUT.portrait.d / 2;
    expect(Math.abs(name[0].y - mid)).toBeLessThanOrEqual(6);
  });

  it('keeps long names, titles and details inside their columns without overlap', () => {
    const long = render({
      campaign: { ...meetup, title: 'Johannesburg Programmable Banking Community Hack Night and Open Source Showcase 2026' },
      role: 'speaking',
      name: 'Maximiliana Alexandra Wolfeschlegelsteinhausen-Bergerdorff van der Merwe the Third of Her Name',
      details: { sessionTitle: 'Building reliable card automations with programmable banking, webhooks and a lot of patience' },
    });
    for (const t of long.flat) {
      expect(t.x).toBeGreaterThanOrEqual(LAYOUT.margin - 4);
      expect(t.x + width(t)).toBeLessThanOrEqual(LAYOUT.right + 1);
    }
    const title = long.flat.filter((t) => t.y < 260 && t.y > 160);
    expect(title.length).toBeGreaterThan(0);
    for (const t of title) expect(t.x + width(t)).toBeLessThanOrEqual(LAYOUT.margin + LAYOUT.title.w + 1);
    const column = long.flat.filter((t) => t.x >= LAYOUT.column.x && t.y < LAYOUT.footerRule);
    for (const t of column) {
      expect(t.y - t.size / 2).toBeGreaterThanOrEqual(LAYOUT.column.top - 1);
      expect(t.y + t.size / 2).toBeLessThanOrEqual(LAYOUT.column.bottom + 1);
    }
  });

  it('shows bounty challenge, deadline, prize, details and link below the footer rule', () => {
    const { flat, all } = render({
      campaign: bounty, role: 'submission', details: { projectName: 'Round-up Saver', githubUsername: '@lerato-d' },
    });
    expect(all).toContain(badgeHeadline('submission'));
    expect(all).toContain('Round-up Saver');
    expect(all).toContain('github.com/lerato-d');
    const footer = flat.filter((t) => t.y > LAYOUT.footerRule).map((t) => t.text).join(' ');
    expect(footer).toContain('Deadline 15 December 2026');
    expect(footer).toContain('Prize: A prize');
    expect(footer).toContain('example.com/bounty');
    for (const t of flat.filter((x) => x.y > LAYOUT.footerRule)) expect(t.y).toBeLessThanOrEqual(LAYOUT.footer.bottom);
  });

  it('only shows a session title for speakers', () => {
    expect(render({ role: 'attending', details: { sessionTitle: 'Secret talk' } }).all).not.toContain('Secret talk');
    expect(render({ role: 'speaking', details: { sessionTitle: 'Secret talk' } }).all).toContain('Secret talk');
  });
});

describe('meetup venue line', () => {
  const venue = { date: '2026-11-26', venue: 'Investec Sandton, 100 Greyston Road', city: 'Johannesburg' };
  it('prefers venueShort and falls back to venue', () => {
    expect(badgeVenueLine({ ...venue, venueShort: 'Investec Sandton' })).toBe('Investec Sandton, Johannesburg');
    expect(badgeVenueLine(venue)).toBe('Investec Sandton, 100 Greyston Road, Johannesburg');
  });
  it('prints the short venue on the badge footer', () => {
    const { flat } = render({ campaign: { ...meetup, meetup: { ...venue, venueShort: 'Investec Sandton' } } });
    const footer = flat.filter((t) => t.y > LAYOUT.footerRule).map((t) => t.text);
    expect(footer).toContain('Investec Sandton, Johannesburg');
    expect(footer.join(' ')).not.toContain('Greyston');
  });
});

describe('badge formats', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('exports square 1080×1080 and portrait 1080×1350', () => {
    expect(EXPORT_SIZE).toBe(1080);
    expect(EXPORT_SIZES).toEqual({ square: { width: 1080, height: 1080 }, portrait: { width: 1080, height: 1350 } });
  });

  it.each<[BadgeFormat | undefined, number]>([
    [undefined, 1080],
    ['square', 1080],
    ['portrait', 1350],
  ])('fills and clips the %s canvas to 1080×%i', (format, height) => {
    const m = mockCtx();
    renderBadge(m.ctx, input({ format }), 1080, assets);
    expect(m.rects.find((r) => r.op === 'rect')).toMatchObject({ x: 0, y: 0, w: 1080, h: height });
    expect(m.rects.find((r) => r.op === 'fillRect')).toMatchObject({ x: 0, y: 0, w: 1080, h: height });
  });

  it('uses the extra portrait height: larger portrait, lower footer, everything inside the canvas', () => {
    const m = mockCtx();
    renderBadge(m.ctx, input({ format: 'portrait' }), 1080, assets);
    const flat = m.texts.filter((t) => !t.transformed);
    expect(PORTRAIT_LAYOUT.portrait.d).toBeGreaterThan(LAYOUT.portrait.d);
    const footer = flat.filter((t) => t.y > PORTRAIT_LAYOUT.footerRule);
    expect(footer.map((t) => t.text)).toContain('Thursday 12 November 2026');
    for (const t of footer) expect(t.y).toBeGreaterThan(LAYOUT.footer.bottom);
    for (const t of flat) {
      expect(t.y + t.size / 2).toBeLessThanOrEqual(1350 - PORTRAIT_LAYOUT.margin + 1);
      expect(t.x + width(t)).toBeLessThanOrEqual(PORTRAIT_LAYOUT.right + 1);
    }
    const name = flat.filter((t) => t.x === PORTRAIT_LAYOUT.column.x && /Thandi|Nkosi/.test(t.text));
    expect(name.map((t) => t.text).join(' ')).toBe('Thandi Nkosi');
    const square = render().flat.find((t) => t.text === 'Thandi Nkosi')!;
    expect(name[0].size).toBeGreaterThanOrEqual(square.size);
    const centre = (name[0].y + name[name.length - 1].y) / 2;
    expect(Math.abs(centre - (PORTRAIT_LAYOUT.portrait.y + PORTRAIT_LAYOUT.portrait.d / 2))).toBeLessThanOrEqual(6);
  });

  it('scales a smaller preview canvas to the same 4:5 composition', () => {
    const m = mockCtx();
    const scales: number[][] = [];
    (m.ctx as unknown as { scale: (x: number, y: number) => void }).scale = (x, y) => scales.push([x, y]);
    renderBadge(m.ctx, input({ format: 'portrait' }), 540, assets);
    expect(scales).toEqual([[0.5, 0.5]]);
  });

  it.each<[BadgeFormat | undefined, number]>([
    [undefined, 1080],
    ['portrait', 1350],
  ])('renderBadgeToBlob sizes the %s export canvas', async (format, height) => {
    const m = mockCtx();
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => m.ctx,
      toBlob: (cb: (b: Blob) => void) => cb(new Blob(['png'], { type: 'image/png' })),
    };
    vi.stubGlobal('document', { createElement: () => canvas });
    const blob = await renderBadgeToBlob(input({ format }));
    expect(blob.size).toBeGreaterThan(0);
    expect([canvas.width, canvas.height]).toEqual([1080, height]);
    expect(m.rects.find((r) => r.op === 'rect')).toMatchObject({ w: 1080, h: height });
  });
});
