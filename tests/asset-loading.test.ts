import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BadgeInput } from '../src/types';

let behavior: 'stall' | 'load' | 'error' = 'stall';
const images: FakeImage[] = [];

class FakeImage {
  naturalWidth = 100;
  naturalHeight = 50;
  decoding = '';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor() {
    images.push(this);
  }

  set src(_url: string) {
    if (behavior === 'load') this.onload?.();
    if (behavior === 'error') this.onerror?.();
  }
}

const badge: BadgeInput = {
  campaign: {
    id: 'test-meetup',
    programme: 'meetup',
    title: 'Test meetup',
    status: 'active',
    archived: false,
    demo: false,
    theme: 'test-theme',
    tagline: '',
    roles: ['attending'],
    fields: { sessionTitle: true, projectName: false, githubUsername: false },
    meetup: { date: '2026-11-26', venue: 'Test venue', city: 'Test city' },
  },
  theme: {
    id: 'test-theme',
    name: 'Test theme',
    dark: { background: '#000', accent: '#fff', text: '#fff', mutedText: '#fff' },
    light: { background: '#fff', accent: '#000', text: '#000', mutedText: '#000' },
  },
  style: 'dark',
  role: 'attending',
  name: 'Example',
  photo: null,
  crop: { x: 0, y: 0, zoom: 1 },
  details: {},
};

function previewContext() {
  const drawImage = vi.fn();
  const target: Record<PropertyKey, unknown> = {
    canvas: {},
    font: '10px sans-serif',
    measureText: (text: string) => ({ width: text.length * 5 }),
    drawImage,
  };
  const ctx = new Proxy(target, {
    get: (object, key) => (key in object ? object[key] : () => undefined),
    set: (object, key, value) => {
      object[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, drawImage };
}

describe('badge artwork loading', () => {
  beforeEach(() => {
    behavior = 'stall';
    images.length = 0;
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubGlobal('Image', FakeImage);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('rejects a stalled image within five seconds and retries on a later request', async () => {
    const { loadBadgeAssets } = await import('../src/lib/assets');
    const attempt = loadBadgeAssets().then(
      () => ({ status: 'resolved' }),
      (error: Error) => ({ status: 'rejected', message: error.message }),
    );

    await vi.advanceTimersByTimeAsync(4999);
    await expect(Promise.race([attempt, Promise.resolve({ status: 'pending' })])).resolves.toEqual({
      status: 'pending',
    });
    await vi.advanceTimersByTimeAsync(1);
    await expect(Promise.race([attempt, Promise.resolve({ status: 'pending' })])).resolves.toEqual({
      status: 'rejected',
      message: 'Badge artwork took too long to load.',
    });
    expect(vi.getTimerCount()).toBe(0);
    expect(images).toHaveLength(2);
    expect(images.every((image) => image.onload === null && image.onerror === null)).toBe(true);

    behavior = 'load';
    const recovered = await loadBadgeAssets();
    expect(recovered.logoOnLight).not.toBeNull();
    expect(recovered.logoOnDark).not.toBeNull();
  });

  it('propagates a stalled artwork error to the download caller', async () => {
    const { renderBadgeToBlob } = await import('../src/lib/render');
    const attempt = renderBadgeToBlob(badge).then(
      () => ({ status: 'resolved' }),
      (error: Error) => ({ status: 'rejected', message: error.message }),
    );

    await vi.advanceTimersByTimeAsync(5000);
    await expect(Promise.race([attempt, Promise.resolve({ status: 'pending' })])).resolves.toEqual({
      status: 'rejected',
      message: 'Badge artwork took too long to load.',
    });
  });

  it('handles a stalled preview without an unhandled rejection', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { ctx } = previewContext();
    const { renderBadge } = await import('../src/lib/render');

    renderBadge(ctx, badge);
    await vi.advanceTimersByTimeAsync(5000);
    expect(error).toHaveBeenCalledWith(
      'Could not load badge artwork for the preview.',
      expect.objectContaining({ message: 'Badge artwork took too long to load.' }),
    );
  });

  it('notifies preview subscribers after a successful retry', async () => {
    const { loadBadgeAssets, subscribeBadgeAssets } = await import('../src/lib/assets');
    const notify = vi.fn();
    const unsubscribe = subscribeBadgeAssets(notify);
    const failed = loadBadgeAssets().catch(() => undefined);

    await vi.advanceTimersByTimeAsync(5000);
    await failed;
    expect(notify).not.toHaveBeenCalled();
    behavior = 'load';
    await loadBadgeAssets();
    expect(notify).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('does not redraw a preview after it has been cancelled', async () => {
    const { ctx, drawImage } = previewContext();
    const { cancelBadgeRender, renderBadge } = await import('../src/lib/render');
    const { loadBadgeAssets } = await import('../src/lib/assets');

    renderBadge(ctx, badge);
    cancelBadgeRender(ctx);
    images.forEach((image) => image.onload?.());
    await loadBadgeAssets();
    expect(drawImage).not.toHaveBeenCalled();
  });

  it('logs failed images while preserving the existing no-logo fallback', async () => {
    behavior = 'error';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { loadBadgeAssets } = await import('../src/lib/assets');
    const result = await loadBadgeAssets();

    expect(result).toEqual({ logoOnLight: null, logoOnDark: null });
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
