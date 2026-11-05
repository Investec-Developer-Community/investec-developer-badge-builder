import type { BadgeFormat } from '../types';

export const FORMATS: { id: BadgeFormat; label: string }[] = [
  { id: 'square', label: 'Square 1:1' },
  { id: 'portrait', label: 'Portrait 4:5' },
];

/** "id-name-dark.png" stays as is; the 4:5 format becomes "id-name-dark-portrait.png". */
export function badgeFilename(base: string, format: BadgeFormat): string {
  return format === 'portrait' ? base.replace(/(\.png)?$/i, '-portrait.png') : base;
}
