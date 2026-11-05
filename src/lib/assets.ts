import logoOnLightUrl from '../../content/Assets/InvestecDeveloper-Logo.png';
import logoOnDarkUrl from '../../content/Assets/InvestecDeveloper-Logo-white.png';

/** Font stacks used on the badge. Libre Caslon Text / Inter are used when the page provides them. */
export const BADGE_FONTS = {
  serif: '"Libre Caslon Text", Georgia, "Times New Roman", serif',
  sans: 'Inter, "Helvetica Neue", Helvetica, Arial, sans-serif',
  mono: 'Menlo, Consolas, "Courier New", monospace',
} as const;

export type BadgeImage = HTMLImageElement | ImageBitmap;

/** Bundled artwork the renderer needs. `null` means "unavailable": the badge is drawn without it. */
export interface BadgeAssets {
  /** Dark logo for the light badge style. */
  logoOnLight: BadgeImage | null;
  /** White logo for the dark badge style. */
  logoOnDark: BadgeImage | null;
}

export const NO_BADGE_ASSETS: BadgeAssets = { logoOnLight: null, logoOnDark: null };

const FONT_TIMEOUT_MS = 3000;
const IMAGE_TIMEOUT_MS = 5000;
let loaded: BadgeAssets | null = null;
let pending: Promise<BadgeAssets> | null = null;
const listeners = new Set<() => void>();

function loadImage(url: string): Promise<BadgeImage | null> {
  if (typeof Image === 'undefined') return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    const timeout = setTimeout(() => {
      img.onload = null;
      img.onerror = null;
      reject(new Error('Badge artwork took too long to load.'));
    }, IMAGE_TIMEOUT_MS);
    const finish = (image: BadgeImage | null) => {
      clearTimeout(timeout);
      img.onload = null;
      img.onerror = null;
      if (!image) console.warn('Badge artwork could not be loaded:', url);
      resolve(image);
    };
    img.onload = () => finish(img.naturalWidth > 0 && img.naturalHeight > 0 ? img : null);
    img.onerror = () => finish(null);
    img.src = url;
  });
}

/** Requests the badge typefaces (if the page declares them) so canvas text never uses a late fallback. */
async function loadFonts(): Promise<void> {
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
  if (!fonts) return;
  const requests = [`400 80px ${BADGE_FONTS.serif}`, `400 28px ${BADGE_FONTS.sans}`, `600 28px ${BADGE_FONTS.sans}`].map((f) =>
    fonts.load(f).catch(() => []),
  );
  const timeout = new Promise<void>((r) => setTimeout(r, FONT_TIMEOUT_MS));
  await Promise.race([Promise.all(requests).then(() => fonts.ready), timeout]).catch(() => undefined);
}

/** Loads logos and fonts once; unavailable images resolve as `null`, while stalled images reject. */
export function loadBadgeAssets(): Promise<BadgeAssets> {
  pending ??= Promise.all([loadImage(logoOnLightUrl), loadImage(logoOnDarkUrl), loadFonts()])
    .then(([logoOnLight, logoOnDark]) => {
      loaded = { logoOnLight, logoOnDark };
      listeners.forEach((listener) => listener());
      return loaded;
    })
    .catch((error: unknown) => {
      pending = null;
      throw error;
    });
  return pending;
}

/** Synchronous snapshot: the loaded assets, or `null` while they are still loading. */
export function loadedBadgeAssets(): BadgeAssets | null {
  return loaded;
}

export function subscribeBadgeAssets(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
