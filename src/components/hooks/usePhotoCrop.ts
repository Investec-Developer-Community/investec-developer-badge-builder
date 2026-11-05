import { useCallback, useRef, type Dispatch, type KeyboardEvent, type PointerEvent, type SetStateAction } from 'react';
import { LAYOUTS, clampCrop } from '../../lib';
import type { BadgeFormat, Crop } from '../../types';
import { nudgePhoto, PHOTO_ARROW_DIRECTIONS, type PhotoDirection } from '../photoCrop';

const STEP = 0.06;

export function usePhotoCrop(
  bitmap: ImageBitmap | null,
  crop: Crop,
  setCrop: Dispatch<SetStateAction<Crop>>,
  format: BadgeFormat,
) {
  const dragRef = useRef<{ x: number; y: number; crop: Crop } | null>(null);

  const travel = useCallback(() => {
    if (!bitmap) return { tx: 0, ty: 0 };
    const { d } = LAYOUTS[format].portrait;
    const scale = Math.max(d / bitmap.width, d / bitmap.height) * crop.zoom;
    return { tx: (bitmap.width * scale - d) / 2, ty: (bitmap.height * scale - d) / 2 };
  }, [bitmap, crop.zoom, format]);

  const nudge = (direction: PhotoDirection) => setCrop((c) => nudgePhoto(c, direction, STEP));
  const zoomBy = (dz: number) => setCrop((c) => clampCrop({ ...c, zoom: c.zoom + dz }));

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!bitmap) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, crop };
  };
  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const start = dragRef.current;
    if (!start) return;
    const k = 1080 / e.currentTarget.getBoundingClientRect().width;
    const { tx, ty } = travel();
    setCrop(
      clampCrop({
        ...start.crop,
        x: tx > 0 ? start.crop.x - ((e.clientX - start.x) * k) / tx : 0,
        y: ty > 0 ? start.crop.y - ((e.clientY - start.y) * k) / ty : 0,
      }),
    );
  };
  const endDrag = () => {
    dragRef.current = null;
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (!bitmap) return;
    const direction = Object.prototype.hasOwnProperty.call(PHOTO_ARROW_DIRECTIONS, e.key)
      ? PHOTO_ARROW_DIRECTIONS[e.key]
      : undefined;
    if (direction) nudge(direction);
    else if (e.key === '+' || e.key === '=') zoomBy(0.1);
    else if (e.key === '-' || e.key === '_') zoomBy(-0.1);
    else return;
    e.preventDefault();
  };

  return { nudge, zoomBy, onPointerDown, onPointerMove, endDrag, onKeyDown };
}
