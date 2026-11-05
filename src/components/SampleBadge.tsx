import { useEffect, useRef, useSyncExternalStore } from 'react';
import { DEFAULT_CROP, cancelBadgeRender, loadedBadgeAssets, renderBadge, subscribeBadgeAssets } from '../lib';
import type { Campaign, Theme } from '../types';

const SAMPLE_PX = 720;

/** Neutral generated silhouette so the example never shows a real person. */
async function placeholderPhoto(): Promise<ImageBitmap | null> {
  if (typeof createImageBitmap !== 'function') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 400;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const bg = ctx.createLinearGradient(0, 0, 0, 400);
  bg.addColorStop(0, '#d7e6e8');
  bg.addColorStop(1, '#f3efe7');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 400, 400);
  ctx.fillStyle = '#8fb3b9';
  ctx.beginPath();
  ctx.arc(200, 165, 72, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(200, 400, 150, 140, 0, Math.PI, 0);
  ctx.fill();
  try {
    return await createImageBitmap(c);
  } catch {
    return null;
  }
}

export function SampleBadge({ campaign, theme }: { campaign: Campaign; theme: Theme }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const assets = useSyncExternalStore(subscribeBadgeAssets, loadedBadgeAssets, () => null);

  useEffect(() => {
    let cancelled = false;
    let photo: ImageBitmap | null = null;
    let ctx: CanvasRenderingContext2D | null = null;
    void (async () => {
      const created = await placeholderPhoto();
      if (cancelled) {
        created?.close();
        return;
      }
      photo = created;
      await document.fonts?.ready;
      ctx = ref.current?.getContext('2d') ?? null;
      if (!cancelled && ctx) {
        renderBadge(
          ctx,
          { campaign, theme, style: 'dark', role: campaign.roles[0], name: 'Your name', photo, crop: DEFAULT_CROP, details: {} },
          SAMPLE_PX,
          assets ?? undefined,
        );
      }
    })();
    return () => {
      cancelled = true;
      if (ctx) cancelBadgeRender(ctx);
      photo?.close();
    };
  }, [campaign, theme, assets]);

  return (
    <figure className="sample">
      <canvas
        ref={ref}
        width={SAMPLE_PX}
        height={SAMPLE_PX}
        role="img"
        aria-label={`Example badge for ${campaign.title} with a placeholder photo and the name “Your name”`}
      />
      <figcaption>Example badge. Your badge will use your photo, name and role.</figcaption>
    </figure>
  );
}
