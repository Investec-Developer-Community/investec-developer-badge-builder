import type { ValidationResult } from '../types';

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MIN_PHOTO_SIDE = 200;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

const GITHUB_RE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

/** P4. Empty input is valid (field is optional) and yields ''. Leading "@" is normalised away. */
export function validateGithubUsername(input: string): ValidationResult<string> {
  const v = input.trim().replace(/^@/, '');
  if (!v) return { ok: true, value: '' };
  if (v.length > 39) return { ok: false, message: 'GitHub usernames are at most 39 characters.' };
  if (!GITHUB_RE.test(v)) {
    return {
      ok: false,
      message: 'Use only letters, numbers and single hyphens; a username cannot start or end with a hyphen.',
    };
  }
  return { ok: true, value: v };
}

/** P5 (sync part): type + size from file metadata. */
export function validatePhotoFile(file: { type: string; size: number }): ValidationResult<true> {
  if (file.size === 0) return { ok: false, message: 'That file is empty. Please choose another photo.' };
  if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, message: 'Please choose a JPEG, PNG or WebP photo.' };
  }
  if (file.size > MAX_PHOTO_BYTES) return { ok: false, message: 'That photo is larger than 10 MB. Please choose a smaller one.' };
  return { ok: true, value: true };
}

/** P5 (dimension part). */
export function validatePhotoDimensions(width: number, height: number): ValidationResult<true> {
  if (width < MIN_PHOTO_SIDE || height < MIN_PHOTO_SIDE) {
    return {
      ok: false,
      message: `That photo is too small (${width}×${height}). It must be at least ${MIN_PHOTO_SIDE}×${MIN_PHOTO_SIDE} pixels.`,
    };
  }
  return { ok: true, value: true };
}

/** True when the leading bytes match the declared JPEG/PNG/WebP type (guards against renamed files). */
export function sniffImageType(bytes: Uint8Array): (typeof PHOTO_TYPES)[number] | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  const ascii = (a: number, b: number) => String.fromCharCode(...bytes.slice(a, b));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/**
 * Validates and decodes a visitor photo entirely in the browser (P5, P7).
 * The caller owns the returned bitmap: call `.close()` when it is replaced or removed.
 */
export async function loadPhoto(file: File): Promise<ValidationResult<ImageBitmap>> {
  const basic = validatePhotoFile(file);
  if (!basic.ok) return basic;
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!sniffImageType(head)) return { ok: false, message: 'That file does not look like a JPEG, PNG or WebP image.' };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return { ok: false, message: 'We could not read that image. It may be damaged; please try another photo.' };
  }
  const dims = validatePhotoDimensions(bitmap.width, bitmap.height);
  if (!dims.ok) {
    bitmap.close();
    return dims;
  }
  return { ok: true, value: bitmap };
}

function slug(s: string, max: number): string {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}

/** B4. Always safe: lowercase a-z, 0-9 and hyphens only. Name part is dropped if nothing usable remains. */
export function sanitiseFilename(parts: { campaignId: string; name: string; style: string }): string {
  const bits = [slug(parts.campaignId, 40) || 'badge', slug(parts.name, 30), slug(parts.style, 10)].filter(Boolean);
  return `${bits.join('-')}.png`;
}
