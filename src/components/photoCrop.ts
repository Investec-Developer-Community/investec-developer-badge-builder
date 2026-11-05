import { clampCrop } from '../lib/render';
import type { Crop } from '../types';

export type PhotoDirection = 'left' | 'right' | 'up' | 'down';

export const PHOTO_ARROW_DIRECTIONS: Readonly<Record<string, PhotoDirection | undefined>> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

const CROP_OFFSETS: Record<PhotoDirection, [number, number]> = {
  left: [1, 0],
  right: [-1, 0],
  up: [0, 1],
  down: [0, -1],
};

export function nudgePhoto(crop: Crop, direction: PhotoDirection, step: number): Crop {
  const [dx, dy] = CROP_OFFSETS[direction];
  return clampCrop({ ...crop, x: crop.x + dx * step, y: crop.y + dy * step });
}
