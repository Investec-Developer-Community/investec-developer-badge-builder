import { describe, expect, it } from 'vitest';
import {
  sanitiseFilename,
  sniffImageType,
  validateGithubUsername,
  validatePhotoDimensions,
  validatePhotoFile,
} from '../src/lib/validators';
import { clampCrop, MAX_ZOOM } from '../src/lib/render';
import { buildCampaignUrl, checkDeepLink } from '../src/lib/campaigns';
import type { CampaignSummary, ContentIndex } from '../src/types';

describe('validateGithubUsername (P4)', () => {
  it('accepts empty as optional and normalises a leading @', () => {
    expect(validateGithubUsername('')).toEqual({ ok: true, value: '' });
    expect(validateGithubUsername('  ')).toEqual({ ok: true, value: '' });
    expect(validateGithubUsername(' @octo-cat ')).toEqual({ ok: true, value: 'octo-cat' });
  });
  it('enforces the 39 character limit', () => {
    expect(validateGithubUsername('a'.repeat(39)).ok).toBe(true);
    expect(validateGithubUsername('a'.repeat(40)).ok).toBe(false);
  });
  it.each(['-abc', 'abc-', 'a--b', 'a_b', 'a b', 'octo.cat', '@@octo', 'héllo'])('rejects %j', (v) => {
    expect(validateGithubUsername(v).ok).toBe(false);
  });
});

describe('photo validation (P5)', () => {
  it('accepts jpeg/png/webp up to 10 MB and rejects the rest', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(validatePhotoFile({ type, size: 1000 }).ok).toBe(true);
    }
    expect(validatePhotoFile({ type: 'image/png', size: 10 * 1024 * 1024 }).ok).toBe(true);
    expect(validatePhotoFile({ type: 'image/png', size: 10 * 1024 * 1024 + 1 }).ok).toBe(false);
    expect(validatePhotoFile({ type: 'image/gif', size: 1000 }).ok).toBe(false);
    expect(validatePhotoFile({ type: 'application/pdf', size: 1000 }).ok).toBe(false);
    expect(validatePhotoFile({ type: 'image/png', size: 0 }).ok).toBe(false);
  });
  it('requires at least 200x200 pixels', () => {
    expect(validatePhotoDimensions(200, 200).ok).toBe(true);
    expect(validatePhotoDimensions(199, 4000).ok).toBe(false);
    expect(validatePhotoDimensions(4000, 199).ok).toBe(false);
  });
  it('detects real type from magic bytes, so renamed files are caught', () => {
    expect(sniffImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImageType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe('image/png');
    const webp = new TextEncoder().encode('RIFF\0\0\0\0WEBP');
    expect(sniffImageType(webp)).toBe('image/webp');
    expect(sniffImageType(new TextEncoder().encode('GIF89a......'))).toBeNull();
    expect(sniffImageType(new Uint8Array(0))).toBeNull();
  });
});

describe('sanitiseFilename (B4)', () => {
  const safe = /^[a-z0-9]+(?:-[a-z0-9]+)*\.png$/;
  it('produces a lowercase, hyphenated .png from campaign, name and style', () => {
    expect(sanitiseFilename({ campaignId: 'cape-town-meetup', name: 'Ada Lovelace', style: 'dark' })).toBe(
      'cape-town-meetup-ada-lovelace-dark.png',
    );
  });
  it.each([
    '../../etc/passwd',
    'a/b\\c:d*e?"<>|',
    'Zoë Ñandú 😀',
    '   ',
    '日本語の名前',
    'CON.exe\u0000',
    'x'.repeat(500),
  ])('is always path-safe for hostile name %j', (name) => {
    const f = sanitiseFilename({ campaignId: 'demo', name, style: 'light' });
    expect(f).toMatch(safe);
    expect(f.length).toBeLessThanOrEqual(90);
  });
  it('strips diacritics and falls back when the name has no usable characters', () => {
    expect(sanitiseFilename({ campaignId: 'demo', name: 'Zoë', style: 'dark' })).toBe('demo-zoe-dark.png');
    expect(sanitiseFilename({ campaignId: 'demo', name: '😀', style: 'dark' })).toBe('demo-dark.png');
    expect(sanitiseFilename({ campaignId: '', name: '', style: 'dark' })).toBe('badge-dark.png');
  });
});

describe('clampCrop', () => {
  it('keeps pan within [-1,1] and zoom within [1,MAX_ZOOM]', () => {
    expect(clampCrop({ x: 5, y: -5, zoom: 99 })).toEqual({ x: 1, y: -1, zoom: MAX_ZOOM });
    expect(clampCrop({ x: 0.3, y: -0.2, zoom: 2 })).toEqual({ x: 0.3, y: -0.2, zoom: 2 });
    expect(clampCrop({ x: 0, y: 0, zoom: 0.2 }).zoom).toBe(1);
  });
  it('never returns NaN/Infinity', () => {
    const c = clampCrop({ x: NaN, y: Infinity, zoom: NaN });
    expect(Object.values(c).every(Number.isFinite)).toBe(true);
    expect(c.zoom).toBeGreaterThanOrEqual(1);
  });
});

describe('deep link resolution (C3-C5)', () => {
  const s = (id: string, archived = false): CampaignSummary => ({
    id,
    programme: 'meetup',
    title: id,
    status: archived ? 'archived' : 'active',
    archived,
    demo: false,
    theme: 'investec-classic',
    tagline: '',
    roles: ['attending'],
  });
  const index: ContentIndex = { campaigns: [s('live-one'), s('old-one', true)] };

  it('returns none without a campaign param', () => {
    expect(checkDeepLink('', index)).toEqual({ kind: 'none' });
    expect(checkDeepLink('?other=1', index)).toEqual({ kind: 'none' });
  });
  it('resolves active and archived campaigns, flagging archived', () => {
    expect(checkDeepLink('?campaign=live-one', index)).toMatchObject({ kind: 'ok', archived: false });
    expect(checkDeepLink('?campaign=old-one', index)).toMatchObject({ kind: 'ok', archived: true });
  });
  it('treats unknown and draft (never published) ids as unavailable', () => {
    expect(checkDeepLink('?campaign=draft-one', index)).toMatchObject({ kind: 'error', error: { kind: 'unavailable' } });
  });
  it.each(['?campaign=', '?campaign=Bad_ID', '?campaign=../x', '?campaign=a--b', `?campaign=${'a'.repeat(61)}`, '?campaign=%00'])(
    'treats %j as malformed',
    (q) => {
      expect(checkDeepLink(q, index)).toMatchObject({ kind: 'error', error: { kind: 'malformed' } });
    },
  );
  it('builds a share URL that keeps the deployment subpath and only carries the id', () => {
    expect(buildCampaignUrl('live-one', { origin: 'https://x.github.io', pathname: '/idc-event-badge/' })).toBe(
      'https://x.github.io/idc-event-badge/?campaign=live-one',
    );
  });
});
