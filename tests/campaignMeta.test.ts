import { describe, expect, it } from 'vitest';
import q4Meetup from '../content/campaigns/meetups/joburg-q4-meetup.json' with { type: 'json' };
import { campaignMeta, formatDate, roleDisplay, visibleTagline } from '../src/components/campaignMeta';
import { formatBadgeDate } from '../src/lib/render';

describe('Q4 meetup source', () => {
  it('has the updated date and unchanged venue details', () => {
    expect(q4Meetup).toMatchObject({
      date: '2026-12-08',
      venue: 'Investec Sandton, 100 Greyston Road',
      venueShort: 'Investec Sandton',
      city: 'Johannesburg',
    });
    expect(formatDate(q4Meetup.date)).toBe('8 Dec 2026');
    expect(formatBadgeDate(q4Meetup.date)).toBe('Tuesday 8 December 2026');
  });
});

describe('formatDate', () => {
  it('formats ISO dates human-readably without shifting the day', () => {
    expect(formatDate('2026-11-12')).toBe('12 Nov 2026');
    expect(formatDate('2027-01-01')).toBe('1 Jan 2027');
    expect(formatDate('2026-12-31')).toBe('31 Dec 2026');
  });
  it('returns unrecognised input unchanged', () => {
    expect(formatDate('soon')).toBe('soon');
  });
});

describe('campaignMeta', () => {
  it('joins meetup date, venue and city', () => {
    expect(campaignMeta({ meetup: { date: '2026-12-03', venue: 'Hall', city: 'Johannesburg' } })).toBe(
      '3 Dec 2026 · Hall, Johannesburg',
    );
  });
  it('shows the bounty deadline and optional prize', () => {
    expect(campaignMeta({ bounty: { challenge: 'x', deadline: '2026-12-15', prize: 'Prize' } })).toBe(
      'Deadline 15 Dec 2026 · Prize',
    );
    expect(campaignMeta({ bounty: { challenge: 'x', deadline: '2027-01-31' } })).toBe('Deadline 31 Jan 2027');
  });
});

describe('visibleTagline', () => {
  const meetup = { date: '2026-11-12', venue: 'V', city: 'Cape Town' };
  it('hides taglines derived from the date', () => {
    expect(visibleTagline({ tagline: '2026-11-12 · Cape Town', meetup })).toBe('');
  });
  it('keeps authored taglines', () => {
    expect(visibleTagline({ tagline: 'Build something', meetup })).toBe('Build something');
  });
});

describe('roleDisplay', () => {
  it('uses sentence-case wording from the docs', () => {
    expect(roleDisplay('volunteering')).toBe('Volunteering');
    expect(roleDisplay('submission')).toBe('Bounty submission');
  });
});
