import { afterEach, describe, expect, it, vi } from 'vitest';
import { isCampaign, loadCampaign, loadContent, loadInitialContent, resolveDeepLink } from '../src/lib/campaigns';
import { parseCampaign } from '../src/lib/content';
import type { Campaign, ContentIndex } from '../src/types';

const meetup: Campaign = {
  id: 'test-meetup',
  programme: 'meetup',
  title: 'Test meetup',
  status: 'active',
  archived: false,
  demo: false,
  theme: 'test-theme',
  tagline: '',
  roles: ['attending', 'speaking'],
  fields: { sessionTitle: true, projectName: false, githubUsername: false },
  meetup: { date: '2026-11-26', venue: 'Test venue', city: 'Test city' },
};

const bounty: Campaign = {
  id: 'test-bounty',
  programme: 'bounty',
  title: 'Test bounty',
  status: 'archived',
  archived: true,
  demo: false,
  theme: 'test-theme',
  tagline: '',
  roles: ['submission'],
  fields: { sessionTitle: false, projectName: true, githubUsername: true },
  bounty: { challenge: 'Build something', deadline: '2026-12-01', prize: 'A prize' },
};

describe('runtime campaign validation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('fetches all content and deep links beneath the Pages project path', async () => {
    vi.stubEnv('BASE_URL', '/investec-developer-badge-builder/');
    const fetchMock = vi.fn(async (path: string) => {
      if (path.endsWith('/index.json')) return new Response(JSON.stringify({ campaigns: [meetup] }));
      if (path.endsWith('/themes.json')) return new Response(JSON.stringify({ themes: [] }));
      return new Response(JSON.stringify(meetup));
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await loadInitialContent('?campaign=test-meetup');
    expect(await result.resolution).toEqual({ ok: true, campaign: meetup, archived: false });
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      '/investec-developer-badge-builder/generated/index.json',
      '/investec-developer-badge-builder/generated/themes.json',
      '/investec-developer-badge-builder/generated/campaigns/test-meetup.json',
    ]);
  });

  it('accepts complete meetup and bounty documents', () => {
    expect(isCampaign(meetup)).toBe(true);
    expect(isCampaign(bounty)).toBe(true);
    expect(isCampaign({ ...meetup, meetup: { ...meetup.meetup, venueShort: 'Hall' } })).toBe(true);
    expect(isCampaign({ ...meetup, shareTitle: 'Test meetup for sharing' })).toBe(true);
    expect(isCampaign({ ...bounty, shareTitle: '  ' })).toBe(false);
    expect(isCampaign({ ...bounty, shareTitle: 7 })).toBe(false);
  });

  describe('initial content loading', () => {
    afterEach(() => vi.unstubAllGlobals());

    function mockContent(index: ContentIndex) {
      const calls: string[] = [];
      vi.stubGlobal('fetch', vi.fn(async (path: string) => {
        calls.push(path);
        if (path.endsWith('/index.json')) return new Response(JSON.stringify(index), { status: 200 });
        if (path.endsWith('/themes.json')) return new Response(JSON.stringify({ themes: [] }), { status: 200 });
        if (path.endsWith('/campaigns/test-bounty.json')) return new Response(JSON.stringify(bounty), { status: 200 });
        throw new Error(`Unexpected fetch: ${path}`);
      }));
      return calls;
    }

    it('loads only the index and themes when there is no deep link', async () => {
      const index: ContentIndex = { campaigns: [meetup, bounty], sampleCampaign: meetup };
      const calls = mockContent(index);
      const result = await loadInitialContent('');
      expect(result.index).toEqual(index);
      expect(await result.resolution).toBeNull();
      expect(calls).toHaveLength(2);
      expect(calls.some((path) => path.endsWith('/index.json'))).toBe(true);
      expect(calls.some((path) => path.endsWith('/themes.json'))).toBe(true);
      expect(calls.some((path) => path.includes('/campaigns/'))).toBe(false);
    });

    it('fetches only the requested archived campaign for a deep link', async () => {
      const calls = mockContent({ campaigns: [meetup, bounty], sampleCampaign: meetup });
      const result = await loadInitialContent('?campaign=test-bounty');
      expect(await result.resolution).toEqual({ ok: true, campaign: bounty, archived: true });
      expect(calls).toHaveLength(3);
      expect(calls.filter((path) => path.includes('/campaigns/'))).toEqual([
        expect.stringMatching(/\/campaigns\/test-bounty\.json$/),
      ]);
    });

    it('makes the index available while a deep-link campaign is still loading', async () => {
      const index: ContentIndex = { campaigns: [meetup, bounty], sampleCampaign: meetup };
      let finish: (response: Response) => void = () => { throw new Error('Pending fetch was not initialized'); };
      const pending = new Promise<Response>((resolve) => { finish = resolve; });
      vi.stubGlobal('fetch', vi.fn(async (path: string) => {
        if (path.endsWith('/index.json')) return new Response(JSON.stringify(index), { status: 200 });
        if (path.endsWith('/themes.json')) return new Response(JSON.stringify({ themes: [] }), { status: 200 });
        if (path.endsWith('/campaigns/test-bounty.json')) return pending;
        throw new Error(`Unexpected fetch: ${path}`);
      }));
      const result = await loadInitialContent('?campaign=test-bounty');
      expect(result.index).toEqual(index);
      finish(new Response(JSON.stringify(bounty), { status: 200 }));
      expect(await result.resolution).toEqual({ ok: true, campaign: bounty, archived: true });
    });

    it('does not fetch an unavailable deep link', async () => {
      const calls = mockContent({ campaigns: [meetup], sampleCampaign: meetup });
      const result = await loadInitialContent('?campaign=not-published');
      expect(await result.resolution).toMatchObject({ ok: false, error: { kind: 'unavailable' } });
      expect(calls).toHaveLength(2);
    });

    it('rejects a sample that is not an active indexed campaign', async () => {
      mockContent({ campaigns: [meetup], sampleCampaign: { ...meetup, id: 'unlisted' } });
      await expect(loadContent()).rejects.toThrow('Sample campaign is malformed');
    });
  });

  it('accepts valid campaigns emitted by the source parser', () => {
    const themes = new Set(['test-theme']);
    const sources = [
      {
        programme: 'meetup' as const,
        raw: {
          title: 'Test meetup', status: 'active', theme: 'test-theme',
          date: '2026-11-26', venue: 'Test venue', city: 'C'.repeat(60),
          roles: ['speaking', 'attending'], link: 'https://example.test/event',
        },
      },
      {
        programme: 'bounty' as const,
        raw: {
          title: 'Test bounty', status: 'archived', theme: 'test-theme',
          challenge: 'C'.repeat(200), deadline: '2026-12-01', prize: 'P'.repeat(60),
        },
      },
    ];
    for (const { programme, raw } of sources) {
      const result = parseCampaign(raw, programme, `test-${programme}`, themes);
      expect(result.ok).toBe(true);
      if (result.ok) expect(isCampaign(result.value.campaign)).toBe(true);
    }
  });

  it.each([
    ['unknown role', { ...meetup, roles: ['dj'] }],
    ['bounty role on meetup', { ...meetup, roles: ['submission'] }],
    ['meetup role on bounty', { ...bounty, roles: ['attending'] }],
    ['missing meetup information', { ...meetup, meetup: undefined }],
    ['missing bounty information', { ...bounty, bounty: undefined }],
    ['both programme details', { ...meetup, bounty: bounty.bounty }],
    ['invalid date', { ...meetup, meetup: { ...meetup.meetup, date: '2026-02-30' } }],
    ['missing city', { ...meetup, meetup: { date: '2026-11-26', venue: 'Test venue' } }],
    ['non-object fields', { ...meetup, fields: 'yes' }],
    ['missing field flag', { ...meetup, fields: { sessionTitle: true } }],
    ['non-boolean field flag', { ...meetup, fields: { ...meetup.fields, sessionTitle: 'yes' } }],
    ['missing demo flag', { ...meetup, demo: undefined }],
    ['inconsistent archived flag', { ...meetup, status: 'archived' }],
    ['missing tagline', { ...meetup, tagline: undefined }],
    ['blank title', { ...meetup, title: '  ' }],
    ['oversized id', { ...meetup, id: 'a'.repeat(61) }],
    ['non-string link', { ...meetup, link: 7 }],
    ['unsafe link', { ...meetup, link: 'http://example.test/' }],
  ])('rejects %s before the document reaches the UI', (_label, candidate) => {
    expect(isCampaign(candidate)).toBe(false);
  });

  it('surfaces an invalid fetched campaign through both loading paths', async () => {
    const invalid = { ...meetup, roles: ['dj'], meetup: undefined };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(invalid), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const index: ContentIndex = { campaigns: [meetup] };

    await expect(loadCampaign(meetup.id)).rejects.toThrow('Campaign "test-meetup" is malformed');
    await expect(resolveDeepLink('?campaign=test-meetup', index)).resolves.toEqual({
      ok: false,
      error: { kind: 'load-failed', message: 'We could not load that campaign. Please try again.' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('loads and resolves a valid fetched campaign', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(meetup), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const index: ContentIndex = { campaigns: [meetup] };

    await expect(loadCampaign(meetup.id)).resolves.toEqual(meetup);
    await expect(resolveDeepLink('?campaign=test-meetup', index)).resolves.toEqual({
      ok: true,
      campaign: meetup,
      archived: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
