import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SharePanel } from '../src/components/SharePanel';
import {
  DEFAULT_HASHTAGS,
  LINKEDIN_SHARE_URL,
  buildCaption,
  canShareFile,
  matchesDownloadedBadge,
  shareBadge,
  type ShareInput,
} from '../src/components/share';
import type { BadgeInput, Campaign, Theme } from '../src/types';

const STREET = '100 Grayston Drive';
const meetup: ShareInput['campaign'] = {
  title: 'Community Meetup | Q4 2026',
  shareTitle: 'Investec Developer Community Meetup',
  link: 'https://luma.com/pb-community',
  meetup: { date: '2026-11-12', venue: `Investec Sandton, ${STREET}`, venueShort: 'Investec Sandton', city: 'Johannesburg' },
};
const bounty: ShareInput['campaign'] = {
  title: 'IoT Code Bounty',
  shareTitle: 'Investec Developer IoT Code Bounty',
  link: 'https://example.com/bounty',
  bounty: { challenge: 'Bring programmable banking into the real world', deadline: '2027-01-31', prize: 'R10 000' },
};
const caption = (campaign: ShareInput['campaign'], role: ShareInput['role'], details: ShareInput['details'] = {}) =>
  buildCaption({ campaign, role, name: 'Ada', details });
const lines = (...paragraphs: string[]) => [...paragraphs, DEFAULT_HASHTAGS].join('\n\n');
const WHEN = 'on Thursday 12 November 2026 at Investec Sandton in Johannesburg.';

describe('buildCaption', () => {
  it('writes the attending caption with the share title, short venue and link', () => {
    expect(caption(meetup, 'attending')).toBe(lines(
      `I’ll be at the Investec Developer Community Meetup ${WHEN}`,
      'If you’re building with programmable banking, or just curious about it, come along: https://luma.com/pb-community',
    ));
  });

  it('writes the volunteering caption', () => {
    expect(caption(meetup, 'volunteering')).toBe(lines(
      `I’m helping out at the Investec Developer Community Meetup ${WHEN}`,
      'If you’re coming, come say hi. Not signed up yet? https://luma.com/pb-community',
    ));
  });

  it('writes the speaking caption with and without a session title', () => {
    expect(caption(meetup, 'speaking', { sessionTitle: '  Cards  as  code ' })).toBe(lines(
      `I’m speaking at the Investec Developer Community Meetup ${WHEN}`,
      'My talk: “Cards as code”. Come along and bring your questions: https://luma.com/pb-community',
    ));
    expect(caption(meetup, 'speaking')).toBe(lines(
      `I’m speaking at the Investec Developer Community Meetup ${WHEN}`,
      'Come along and bring your questions: https://luma.com/pb-community',
    ));
    expect(caption(meetup, 'attending', { sessionTitle: 'X' })).not.toMatch(/talk|“X”/);
  });

  it('does not add a second full stop after a session title that ends a sentence', () => {
    expect(caption(meetup, 'speaking', { sessionTitle: 'Why cards?' })).toContain('My talk: “Why cards?” Come along');
  });

  it('adds a project line to meetup captions when one is given', () => {
    expect(caption(meetup, 'attending', { projectName: 'Card Pulse' }))
      .toContain(`I’ll be at the Investec Developer Community Meetup ${WHEN} Currently building: “Card Pulse”.`);
  });

  it('ends closing sentences with a full stop when there is no link', () => {
    const noLink = { ...meetup, link: undefined };
    expect(caption(noLink, 'attending')).toBe(lines(
      `I’ll be at the Investec Developer Community Meetup ${WHEN}`,
      'If you’re building with programmable banking, or just curious about it, come along.',
    ));
    expect(caption(noLink, 'volunteering')).toContain('\n\nIf you’re coming, come say hi.\n\n');
    expect(caption(noLink, 'speaking', { sessionTitle: 'Cards' })).toContain('My talk: “Cards”. Come along and bring your questions.\n\n');
    expect(caption({ ...bounty, link: undefined }, 'submission')).toContain('if you want to have a go.\n\n');
  });

  it('falls back to the campaign title when there is no share title', () => {
    expect(caption({ ...meetup, shareTitle: undefined }, 'attending')).toMatch(/^I’ll be at the Community Meetup \| Q4 2026 on /);
    expect(caption({ ...meetup, shareTitle: '  ' }, 'attending')).toMatch(/^I’ll be at the Community Meetup \| Q4 2026 on /);
    expect(caption({ title: 'The Big Meetup', meetup: { date: '2026-11-12', venue: 'Hall', city: 'Cape Town' } }, 'attending'))
      .toMatch(/^I’ll be at The Big Meetup on /);
  });

  it('says only the city when the short venue is the city', () => {
    const m = { ...meetup, meetup: { ...meetup.meetup!, venueShort: 'johannesburg' } };
    expect(caption(m, 'attending')).toMatch(/^I’ll be at the Investec Developer Community Meetup on Thursday 12 November 2026 in Johannesburg\.\n/);
  });

  it('falls back to the badge venue line when there is no short venue', () => {
    const m = { ...meetup, meetup: { date: '2026-11-12', venue: 'Workshop 17', city: 'Cape Town' } };
    expect(caption(m, 'attending')).toMatch(/on Thursday 12 November 2026 at Workshop 17, Cape Town\.\n/);
    const cityOnly = { ...meetup, meetup: { date: '2026-11-12', venue: '', city: 'Cape Town' } };
    expect(caption(cityOnly, 'attending')).toMatch(/on Thursday 12 November 2026 in Cape Town\.\n/);
  });

  it('writes the bounty caption with project, brief, GitHub, deadline and link', () => {
    expect(caption(bounty, 'submission', { projectName: 'Card Pulse', githubUsername: '@octocat' })).toBe(lines(
      'I built something for the Investec Developer IoT Code Bounty: “Card Pulse”.',
      'This round’s brief: “Bring programmable banking into the real world”. The code is on GitHub if you want to poke around: https://github.com/octocat',
      'Entries close 31 January 2027 if you want to have a go: https://example.com/bounty',
    ));
  });

  it('writes the bounty caption without a project or GitHub', () => {
    expect(caption(bounty, 'submission')).toBe(lines(
      'I’ve entered the Investec Developer IoT Code Bounty.',
      'This round’s brief: “Bring programmable banking into the real world”.',
      'Entries close 31 January 2027 if you want to have a go: https://example.com/bounty',
    ));
    expect(caption(bounty, 'submission', { projectName: 'Card Pulse' })).not.toContain('GitHub');
  });

  it('omits an empty brief and does not double "bounty" or "the"', () => {
    const text = caption({ title: 'Hack Week', bounty: { challenge: '', deadline: '2027-01-31' } }, 'submission');
    expect(text).toBe(lines(
      'I’ve entered the Hack Week bounty.',
      'Entries close 31 January 2027 if you want to have a go.',
    ));
  });

  it('keeps the voice plain: no emoji, no exclamation marks, no street address, hashtags last', () => {
    const all = [
      caption(meetup, 'attending', { projectName: 'Card Pulse' }),
      caption(meetup, 'volunteering'),
      caption(meetup, 'speaking', { sessionTitle: 'Cards as code' }),
      caption(bounty, 'submission', { projectName: 'Card Pulse', githubUsername: 'octocat' }),
      caption(bounty, 'submission'),
    ];
    for (const text of all) {
      expect(/\p{Extended_Pictographic}/u.test(text), text).toBe(false);
      expect(text).not.toContain('!');
      expect(text).not.toContain(STREET);
      expect(text).not.toMatch(/excited|thrilled|delve|game-changer/i);
      expect(text.endsWith(`\n\n${DEFAULT_HASHTAGS}`)).toBe(true);
    }
  });

  it('accepts custom hashtags', () => {
    const text = buildCaption({ campaign: meetup, role: 'attending', name: 'A', details: {} }, '#Custom');
    expect(text.endsWith('\n\n#Custom')).toBe(true);
    expect(text).not.toContain(DEFAULT_HASHTAGS);
  });
});

it('links to the LinkedIn composer', () => {
  expect(LINKEDIN_SHARE_URL).toBe('https://www.linkedin.com/feed/?shareActive=true');
});

describe('downloaded badge snapshot', () => {
  const campaign: Campaign = {
    ...meetup,
    id: 'meetup',
    programme: 'meetup',
    status: 'active',
    archived: false,
    demo: false,
    theme: 'classic',
    tagline: '',
    roles: ['attending', 'speaking'],
    fields: { sessionTitle: true, projectName: true, githubUsername: true },
  };
  const palette = { background: '#000000', accent: '#ffffff', text: '#ffffff', mutedText: '#ffffff' };
  const theme: Theme = {
    id: 'classic',
    name: 'Classic',
    dark: palette,
    light: palette,
  };
  const photo: ImageBitmap = { width: 300, height: 400, close: () => undefined };
  const input: BadgeInput = {
    campaign,
    theme,
    style: 'dark',
    format: 'square',
    role: 'speaking',
    name: 'Ada',
    photo,
    crop: { x: 0, y: 0, zoom: 1 },
    details: { sessionTitle: 'Cards', projectName: 'Example', githubUsername: 'octocat' },
  };

  it.each([true, false])('renders the LinkedIn tagging steps (current: %s)', (current) => {
    vi.stubGlobal('window', { location: { origin: 'https://example.com', pathname: '/' } });
    try {
      const file = new File(['example PNG'], 'badge.png', { type: 'image/png' });
      const html = renderToStaticMarkup(createElement(SharePanel, { campaign, snapshot: { file, input }, current }));
      expect(html).toContain(
        '<ol class="share-steps"><li>Add the badge image you downloaded.</li>' +
        '<li>Paste the caption.</li><li>Type Investec Developer and pick the page to tag us.</li></ol>',
      );
      expect(html).not.toContain('Type @Investec');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('accepts equivalent input values, including the default square format', () => {
    expect(matchesDownloadedBadge(input, {
      ...input,
      format: undefined,
      crop: { ...input.crop },
      details: { ...input.details },
    })).toBe(true);
  });

  it.each<[string, Partial<BadgeInput>]>([
    ['campaign', { campaign: { ...campaign } }],
    ['theme', { theme: { ...theme } }],
    ['colour', { style: 'light' }],
    ['format', { format: 'portrait' }],
    ['role', { role: 'attending' }],
    ['name', { name: 'Grace' }],
    ['removed photo', { photo: null }],
    ['replacement photo', { photo: { width: 300, height: 400, close: () => undefined } }],
    ['horizontal crop', { crop: { ...input.crop, x: 0.1 } }],
    ['vertical crop', { crop: { ...input.crop, y: -0.1 } }],
    ['zoom', { crop: { ...input.crop, zoom: 1.1 } }],
    ['session', { details: { ...input.details, sessionTitle: 'Other' } }],
    ['project', { details: { ...input.details, projectName: 'Other' } }],
    ['GitHub username', { details: { ...input.details, githubUsername: 'other' } }],
  ])('rejects a changed %s', (_field, change) => {
    expect(matchesDownloadedBadge(input, { ...input, ...change })).toBe(false);
  });
});

describe('native file sharing', () => {
  const file = new File(['example PNG'], 'badge.png', { type: 'image/png' });
  const data = { files: [file], title: 'Meetup', text: 'My edited caption' };

  it('requires both file capability and a share function, and checks the actual file', () => {
    const canShare = vi.fn(() => true);
    const share = vi.fn(async () => undefined);
    expect(canShareFile(file, { canShare, share })).toBe(true);
    expect(canShare).toHaveBeenCalledWith({ files: [file] });
    expect(canShareFile(file, { canShare })).toBe(false);
    expect(canShareFile(file, { share })).toBe(false);
    expect(canShareFile(file, { share, canShare: () => false })).toBe(false);
    expect(canShareFile(file, { share, canShare: () => { throw new Error('Unsupported file'); } })).toBe(false);
  });

  it('starts sharing the exact file and edited text before attempting clipboard access', async () => {
    const calls: string[] = [];
    const platform = {
      share: vi.fn(async (_data: ShareData) => { calls.push('share'); }),
      clipboard: { writeText: vi.fn(async (_text: string) => { calls.push('clipboard'); }) },
    };
    expect(await shareBadge(platform, data)).toEqual({ kind: 'shared', captionCopied: true });
    expect(platform.share).toHaveBeenCalledWith(data);
    expect(platform.share.mock.calls[0][0].files?.[0]).toBe(file);
    expect(platform.clipboard.writeText).toHaveBeenCalledWith('My edited caption');
    expect(calls).toEqual(['share', 'clipboard']);
  });

  it('still shares when the share call consumes activation needed by the clipboard', async () => {
    let active = true;
    const platform = {
      share: async () => { active = false; },
      clipboard: {
        writeText: async () => {
          if (!active) throw new DOMException('Activation required', 'NotAllowedError');
        },
      },
    };
    expect(await shareBadge(platform, data)).toEqual({ kind: 'shared', captionCopied: false });
    expect(await shareBadge({ share: async () => undefined }, data)).toEqual({ kind: 'shared', captionCopied: false });
  });

  it('treats a cancelled share as cancellation, including cross-realm-style errors', async () => {
    expect(await shareBadge({ share: async () => { throw new DOMException('Cancelled', 'AbortError'); } }, data))
      .toEqual({ kind: 'cancelled' });
    expect(await shareBadge({ share: async () => { throw { name: 'AbortError' }; } }, data))
      .toEqual({ kind: 'cancelled' });
  });

  it('reports asynchronous and synchronous share failures without claiming success', async () => {
    expect(await shareBadge({ share: async () => { throw new Error('Share failed'); } }, data))
      .toEqual({ kind: 'failed' });
    const writeText = vi.fn(async () => undefined);
    expect(await shareBadge({
      share: () => { throw new Error('No activation'); },
      clipboard: { writeText },
    }, data)).toEqual({ kind: 'failed' });
    expect(writeText).not.toHaveBeenCalled();
  });
});

describe('badgeFilename', () => {
  it('adds the format suffix only for portrait', async () => {
    const { badgeFilename } = await import('../src/components/badgeFormat');
    expect(badgeFilename('meetup-ada-dark.png', 'square')).toBe('meetup-ada-dark.png');
    expect(badgeFilename('meetup-ada-dark.png', 'portrait')).toBe('meetup-ada-dark-portrait.png');
  });
});
