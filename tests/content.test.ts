import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import meetupSchema from '../content/schema/meetup.schema.json' with { type: 'json' };
import bountySchema from '../content/schema/bounty.schema.json' with { type: 'json' };
import { formatContentMessages } from '../scripts/content-build';
import { isHttpsUrl, parseCampaign, parseTheme } from '../src/lib/content';
import { isCampaign } from '../src/lib/campaigns';

const themes = new Set(['investec-classic', 'bounty-gold']);
const meetup = { title: 'Meetup', status: 'active', date: '2026-11-12', venue: 'Hall', city: 'Cape Town' };
const bounty = { title: 'Bounty', status: 'active', challenge: 'Build it', deadline: '2026-12-01' };

describe('parseCampaign', () => {
  it('applies defaults for theme, roles, fields and tagline', () => {
    const r = parseCampaign(meetup, 'meetup', 'my-meetup', themes);
    expect(r.ok && r.value.campaign).toMatchObject({
      id: 'my-meetup',
      theme: 'investec-classic',
      roles: ['attending', 'volunteering', 'speaking'],
      fields: { sessionTitle: true },
      tagline: '2026-11-12 · Cape Town',
      archived: false,
      demo: false,
    });
    const b = parseCampaign(bounty, 'bounty', 'my-bounty', themes);
    expect(b.ok && b.value.campaign).toMatchObject({
      theme: 'bounty-gold',
      roles: ['submission'],
      fields: { projectName: true, githubUsername: true, sessionTitle: false },
    });
  });
  it('reports draft status so the generator can skip it, and flags archived', () => {
    const d = parseCampaign({ ...meetup, status: undefined }, 'meetup', 'x', themes);
    expect(d.ok && d.value.status).toBe('draft');
    const a = parseCampaign({ ...meetup, status: 'archived' }, 'meetup', 'x', themes);
    expect(a.ok && a.value.campaign).toMatchObject({ archived: true, status: 'archived' });
  });
  it('labels a campaign as demo only when demo is true', () => {
    const on = parseCampaign({ ...meetup, demo: true }, 'meetup', 'x', themes);
    expect(on.ok && on.value.campaign.demo).toBe(true);
    const off = parseCampaign({ ...bounty, demo: false }, 'bounty', 'x', themes);
    expect(off.ok && off.value.campaign.demo).toBe(false);
    expect(parseCampaign({ ...meetup, demo: 'yes' }, 'meetup', 'x', themes).ok).toBe(false);
  });
  it('allows only https links', () => {
    expect(parseCampaign({ ...meetup, link: 'https://example.com/a' }, 'meetup', 'x', themes).ok).toBe(true);
    expect(parseCampaign({ ...meetup, link: ' HTTPS://example.com/a ' }, 'meetup', 'x', themes).ok).toBe(true);
    for (const link of ['http://example.com', 'javascript:alert(1)', 'data:text/html,hi', 'https://u:p@example.com', 'example.com']) {
      expect(parseCampaign({ ...meetup, link }, 'meetup', 'x', themes).ok, link).toBe(false);
    }
    expect(isHttpsUrl('ftp://x.com')).toBe(false);
  });
  it('fails on an unknown theme, naming the available ones', () => {
    const r = parseCampaign({ ...meetup, theme: 'nope' }, 'meetup', 'x', themes);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors.join()).toContain('investec-classic');
  });
  it.each(['Bad_Name', 'UPPER', 'a--b', '-a', 'has space', 'x'.repeat(61), ''])('fails on file-name id %j', (id) => {
    expect(parseCampaign(meetup, 'meetup', id, themes).ok).toBe(false);
  });
  it('fails on missing required fields, bad dates, unknown keys and unknown roles', () => {
    expect(parseCampaign({ title: 'x' }, 'meetup', 'x', themes).ok).toBe(false);
    expect(parseCampaign({ ...meetup, date: '2026-02-30' }, 'meetup', 'x', themes).ok).toBe(false);
    expect(parseCampaign({ ...meetup, surprise: 1 }, 'meetup', 'x', themes).ok).toBe(false);
    expect(parseCampaign({ ...meetup, roles: ['dj'] }, 'meetup', 'x', themes).ok).toBe(false);
    expect(parseCampaign('nope', 'meetup', 'x', themes).ok).toBe(false);
  });
  it('uses the schema limits, defaults and uniqueness rules for source validation', () => {
    const max = meetupSchema.properties.title.maxLength;
    expect(parseCampaign({ ...meetup, title: 'x'.repeat(max) }, 'meetup', 'x', themes).ok).toBe(true);
    const tooLong = parseCampaign({ ...meetup, title: 'x'.repeat(max + 1) }, 'meetup', 'x', themes);
    expect(tooLong.ok).toBe(false);
    expect(!tooLong.ok && tooLong.errors.join()).toContain(`max ${max}`);
    expect(parseCampaign({ ...meetup, roles: ['attending', 'attending'] }, 'meetup', 'x', themes).ok).toBe(false);
    for (const role of meetupSchema.properties.roles.items.enum) {
      expect(parseCampaign({ ...meetup, roles: [role] }, 'meetup', 'x', themes).ok, role).toBe(true);
    }
    const defaultMeetup = parseCampaign(meetup, 'meetup', 'x', themes);
    const defaultBounty = parseCampaign(bounty, 'bounty', 'x', themes);
    expect(defaultMeetup.ok && defaultMeetup.value.campaign.theme).toBe(meetupSchema.properties.theme.default);
    expect(defaultBounty.ok && defaultBounty.value.campaign.theme).toBe(bountySchema.properties.theme.default);
  });
  it('changes validation when the schema supplied to the production parser changes', async () => {
    const changedSchema = structuredClone(meetupSchema);
    changedSchema.properties.title.maxLength = 4;
    vi.resetModules();
    vi.doMock('../content/schema/meetup.schema.json', () => ({ default: changedSchema }));
    try {
      const { parseCampaign: withChangedSchema } = await import('../src/lib/content');
      const result = withChangedSchema({ ...meetup, title: 'Five!' }, 'meetup', 'x', themes);
      expect(result.ok).toBe(false);
      expect(!result.ok && result.errors.join()).toContain('max 4');
    } finally {
      vi.doUnmock('../content/schema/meetup.schema.json');
      vi.resetModules();
    }
  });
  it('reports source errors with the filename and exact nested field', () => {
    const result = parseCampaign({ ...meetup, fields: { sessionTitle: 'yes' } }, 'meetup', 'x', themes);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(formatContentMessages('content/campaigns/meetups/example.json', result.errors)).toContain(
        'content/campaigns/meetups/example.json: "fields.sessionTitle" must be true or false (without quotes)',
      );
    }
  });
  it('keeps the full venue and an optional short venue for meetups only', () => {
    const r = parseCampaign({ ...meetup, venue: 'Investec Sandton, 100 Greyston Road', venueShort: ' Investec Sandton ' }, 'meetup', 'x', themes);
    expect(r.ok && r.value.campaign.meetup).toEqual({
      date: '2026-11-12', venue: 'Investec Sandton, 100 Greyston Road', venueShort: 'Investec Sandton', city: 'Cape Town',
    });
    const none = parseCampaign(meetup, 'meetup', 'x', themes);
    expect(none.ok && none.value.campaign.meetup && 'venueShort' in none.value.campaign.meetup).toBe(false);
    expect(parseCampaign({ ...meetup, venueShort: 'x'.repeat(41) }, 'meetup', 'x', themes).ok).toBe(false);
    expect(parseCampaign({ ...meetup, venueShort: 7 }, 'meetup', 'x', themes).ok).toBe(false);
    expect(parseCampaign({ ...bounty, venueShort: 'Hall' }, 'bounty', 'x', themes).ok).toBe(false);
  });
  it('accepts an optional, trimmed shareTitle for meetups and bounties', () => {
    for (const [raw, programme] of [[meetup, 'meetup'], [bounty, 'bounty']] as const) {
      const r = parseCampaign({ ...raw, shareTitle: '  Investec Developer Community Meetup ' }, programme, 'x', themes);
      expect(r.ok && r.value.campaign.shareTitle).toBe('Investec Developer Community Meetup');
      const none = parseCampaign(raw, programme, 'x', themes);
      expect(none.ok && 'shareTitle' in none.value.campaign).toBe(false);
    }
  });
  it.each([['empty', ''], ['blank', '   '], ['null', null], ['number', 7], ['too long', 'x'.repeat(61)]])('rejects a %s shareTitle', (_label, shareTitle) => {
    const r = parseCampaign({ ...meetup, shareTitle }, 'meetup', 'x', themes);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors.join()).toMatch(/shareTitle/);
  });
  it('rejects the removed emoji field and never outputs one', () => {
    for (const [raw, programme] of [[meetup, 'meetup'], [bounty, 'bounty']] as const) {
      const bad = parseCampaign({ ...raw, emoji: '🎤' }, programme, 'x', themes);
      expect(bad.ok).toBe(false);
      expect(!bad.ok && bad.errors.join()).toMatch(/emoji/);
      const ok = parseCampaign(raw, programme, 'x', themes);
      expect(ok.ok && 'emoji' in ok.value.campaign).toBe(false);
    }
  });
});

describe('parseTheme', () => {
  const pal = { background: '#000', accent: '#f00', text: '#fff', mutedText: '#ccc' };
  it('outputs only current palette fields and rejects bad colours and unknown fields', () => {
    const ok = parseTheme({ name: 'T', dark: pal, light: pal }, 't');
    expect(ok.ok && ok.value).toEqual({ id: 't', name: 'T', dark: pal, light: pal });
    expect(ok.warnings).toEqual([]);
    expect(parseTheme({ name: 'T', dark: { ...pal, accent: 'red' }, light: pal }, 't').ok).toBe(false);
    expect(parseTheme({ name: 'T', extra: true, dark: pal, light: pal }, 't').ok).toBe(false);
  });
  it('warns for each deprecated field, regardless of its value, and strips it from output', () => {
    const raw = {
      name: 'T', font: 'comic', pattern: null, photoShape: 7, ribbonText: {}, stickers: 'old',
      dark: { ...pal, gradient: 'old' }, light: { ...pal, gradient: ['#000', '#fff'] },
    };
    const result = parseTheme(raw, 't');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ id: 't', name: 'T', dark: pal, light: pal });
    const warnings = formatContentMessages('content/themes/legacy.json', result.warnings);
    expect(warnings).toHaveLength(7);
    for (const field of ['font', 'pattern', 'photoShape', 'ribbonText', 'stickers', 'dark.gradient', 'light.gradient']) {
      expect(warnings).toContain(
        `content/themes/legacy.json: "${field}" is deprecated and ignored; remove it before the next release.`,
      );
    }
  });
  it('still reports real validation errors alongside legacy warnings', () => {
    const result = parseTheme({ name: 'T', font: 'sans', dark: { ...pal, accent: 'red' }, light: pal }, 't');
    expect(result.ok).toBe(false);
    expect(result.warnings.join()).toContain('"font"');
    expect(!result.ok && result.errors.join()).toContain('"dark.accent"');
  });
});

describe('shipped content', () => {
  it('retains the two referenced and default themes only', () => {
    const files = readdirSync('content/themes').filter((name) => name.endsWith('.json')).sort();
    expect(files).toEqual(['bounty-gold.json', 'investec-classic.json']);
    const bundle = JSON.parse(readFileSync('public/generated/themes.json', 'utf8'));
    expect(bundle.themes.map((theme: { id: string }) => theme.id).sort()).toEqual(['bounty-gold', 'investec-classic']);
    for (const theme of bundle.themes) {
      for (const field of ['font', 'pattern', 'photoShape', 'ribbonText', 'stickers']) {
        expect(theme, theme.id).not.toHaveProperty(field);
      }
      expect(theme.dark, theme.id).not.toHaveProperty('gradient');
      expect(theme.light, theme.id).not.toHaveProperty('gradient');
    }
    const available = new Set(files.map((name) => name.slice(0, -5)));
    for (const [dir, fallback] of [
      ['meetups', meetupSchema.properties.theme.default],
      ['bounties', bountySchema.properties.theme.default],
    ] as const) {
      expect(available.has(fallback)).toBe(true);
      for (const file of readdirSync(`content/campaigns/${dir}`).filter((name) => name.endsWith('.json'))) {
        const raw = JSON.parse(readFileSync(`content/campaigns/${dir}/${file}`, 'utf8'));
        expect(available.has(raw.theme || fallback), file).toBe(true);
      }
    }
  });
  it('has no emoji field in schemas, source campaigns or the generated index', () => {
    for (const f of readdirSync('content/schema')) {
      expect(JSON.parse(readFileSync(`content/schema/${f}`, 'utf8')).properties, f).not.toHaveProperty('emoji');
    }
    for (const dir of ['meetups', 'bounties']) {
      for (const f of readdirSync(`content/campaigns/${dir}`).filter((n) => n.endsWith('.json'))) {
        expect(JSON.parse(readFileSync(`content/campaigns/${dir}/${f}`, 'utf8')), f).not.toHaveProperty('emoji');
      }
    }
    const index = JSON.parse(readFileSync('public/generated/index.json', 'utf8'));
    for (const c of index.campaigns) expect(c).not.toHaveProperty('emoji');
  });
  it('gives the shipped campaigns a short venue and a share title', () => {
    for (const f of readdirSync('content/campaigns/meetups').filter((n) => n.startsWith('joburg-'))) {
      const raw = JSON.parse(readFileSync(`content/campaigns/meetups/${f}`, 'utf8'));
      expect(raw.venueShort, f).toBe('Investec Sandton');
      expect(raw.venue, f).toContain('Greyston');
      expect(raw.shareTitle, f).toBe('Investec Developer Community Meetup');
    }
    const q4 = JSON.parse(readFileSync('content/campaigns/bounties/bounty-q4.json', 'utf8'));
    expect(q4.shareTitle).toBe('Investec Developer IoT Code Bounty');
  });
  it('every generated campaign satisfies the runtime guard and no draft leaks', () => {
    const index = JSON.parse(readFileSync('public/generated/index.json', 'utf8'));
    expect(index.campaigns.length).toBeGreaterThan(0);
    for (const c of index.campaigns) {
      expect(['active', 'archived']).toContain(c.status);
      const full = JSON.parse(readFileSync(`public/generated/campaigns/${c.id}.json`, 'utf8'));
      expect(isCampaign(full)).toBe(true);
      expect(c.meetup, c.id).toEqual(full.meetup);
      expect(c.bounty, c.id).toEqual(full.bounty);
      if (full.meetup) {
        expect(c.date, c.id).toBe(full.meetup.date);
        expect(c.venueShort, c.id).toBe(full.meetup.venueShort);
        expect(c.city, c.id).toBe(full.meetup.city);
      }
      if (full.bounty) {
        expect(c.deadline, c.id).toBe(full.bounty.deadline);
        expect(c.prize, c.id).toBe(full.bounty.prize);
      }
      expect(c.status, c.id).toBe(full.status);
      expect(c.archived, c.id).toBe(full.archived);
    }
    const first = index.campaigns.find((c: { programme: string; status: string }) => c.programme === 'meetup' && c.status === 'active')
      ?? index.campaigns.find((c: { programme: string; status: string }) => c.programme === 'bounty' && c.status === 'active');
    if (first) {
      expect(index.sampleCampaign).toEqual(JSON.parse(readFileSync(`public/generated/campaigns/${first.id}.json`, 'utf8')));
    } else {
      expect(index.sampleCampaign).toBeUndefined();
    }
  });
  it('publishes non-drafts with their build-date status and demo flag', () => {
    const index = JSON.parse(readFileSync('public/generated/index.json', 'utf8'));
    expect(index.asOfDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const expected = new Map<string, { programme: string; status: string; demo: boolean }>();
    for (const [programme, dir] of [['meetup', 'meetups'], ['bounty', 'bounties']] as const) {
      for (const f of readdirSync(`content/campaigns/${dir}`).filter((n) => n.endsWith('.json'))) {
        const raw = JSON.parse(readFileSync(`content/campaigns/${dir}/${f}`, 'utf8'));
        if (raw.status !== 'active' && raw.status !== 'archived') continue;
        const date = programme === 'meetup' ? raw.date : raw.deadline;
        const status = raw.status === 'archived' || date < index.asOfDate ? 'archived' : 'active';
        expected.set(f.slice(0, -5), { programme, status, demo: raw.demo === true });
      }
    }
    const published = new Map<string, unknown>(
      index.campaigns.map((c: { id: string; programme: string; status: string; archived: boolean; demo: boolean }) => {
        expect(c.archived).toBe(c.status === 'archived');
        return [c.id, { programme: c.programme, status: c.status, demo: c.demo }];
      }),
    );
    expect(published).toEqual(expected);
  });
});
