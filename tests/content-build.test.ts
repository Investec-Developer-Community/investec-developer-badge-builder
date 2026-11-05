import { describe, expect, it } from 'vitest';
import { johannesburgDate, preparePublishedContent } from '../scripts/content-build';
import { campaignMeta, visibleTagline } from '../src/components/campaignMeta';
import { activeCounts, checkDeepLink } from '../src/lib/campaigns';
import type { Campaign } from '../src/types';

const meetup: Campaign = {
  id: 'meetup',
  programme: 'meetup',
  title: 'Meetup',
  status: 'active',
  archived: false,
  demo: false,
  theme: 'investec-classic',
  tagline: '2026-11-26 · Johannesburg',
  roles: ['attending'],
  fields: { sessionTitle: true, projectName: false, githubUsername: false },
  meetup: { date: '2026-11-26', venue: 'Full venue', venueShort: 'Short venue', city: 'Johannesburg' },
};

const bounty: Campaign = {
  id: 'bounty',
  programme: 'bounty',
  title: 'Bounty',
  status: 'active',
  archived: false,
  demo: false,
  theme: 'bounty-gold',
  tagline: 'Deadline 2026-11-26',
  roles: ['submission'],
  fields: { sessionTitle: false, projectName: true, githubUsername: true },
  bounty: { challenge: 'Build something', deadline: '2026-11-26', prize: 'A prize' },
};

describe('Johannesburg build-date archiving', () => {
  it.each([
    ['before the local event date', '2026-11-25T21:59:59.999Z', '2026-11-25', 'active'],
    ['at the start of the local event date', '2026-11-25T22:00:00.000Z', '2026-11-26', 'active'],
    ['at the end of the local event date', '2026-11-26T21:59:59.999Z', '2026-11-26', 'active'],
    ['at the start of the following local date', '2026-11-26T22:00:00.000Z', '2026-11-27', 'archived'],
  ])('%s for meetups and bounties', (_label, instant, localDate, status) => {
    const now = new Date(instant);
    expect(johannesburgDate(now)).toBe(localDate);
    const published = preparePublishedContent([meetup, bounty], now);
    expect(published.index.asOfDate).toBe(localDate);
    for (const campaign of published.campaigns) {
      expect(campaign.status, campaign.id).toBe(status);
      expect(campaign.archived, campaign.id).toBe(status === 'archived');
      expect(checkDeepLink(`?campaign=${campaign.id}`, published.index)).toMatchObject({
        kind: 'ok',
        archived: status === 'archived',
      });
    }
    for (const summary of published.index.campaigns) {
      expect(summary.status, summary.id).toBe(status);
      expect(summary.archived, summary.id).toBe(status === 'archived');
    }
    const count = status === 'active' ? 1 : 0;
    expect(activeCounts(published.index)).toEqual({ meetup: count, bounty: count });
    expect(meetup.status).toBe('active');
    expect(bounty.status).toBe('active');
  });

  it('handles the local year and leap-day boundaries without using the host timezone', () => {
    expect(johannesburgDate(new Date('2026-12-31T21:59:59.999Z'))).toBe('2026-12-31');
    expect(johannesburgDate(new Date('2026-12-31T22:00:00.000Z'))).toBe('2027-01-01');
    expect(johannesburgDate(new Date('2028-02-29T22:00:00.000Z'))).toBe('2028-03-01');
  });

  it('keeps explicitly archived campaigns archived even when their date is in the future', () => {
    const archived: Campaign = {
      ...meetup,
      id: 'old-link',
      status: 'archived',
      archived: true,
      meetup: { date: '2099-12-31', venue: 'Venue', city: 'City' },
    };
    const { campaigns, index } = preparePublishedContent([archived], new Date('2026-11-01T10:00:00Z'));
    expect(campaigns[0]).toEqual(archived);
    expect(index.sampleCampaign).toBeUndefined();
    expect(checkDeepLink('?campaign=old-link', index)).toMatchObject({ kind: 'ok', archived: true });
  });
});

describe('generated index content', () => {
  it('keeps the card metadata and the full sample without startup campaign fetches', () => {
    const { index } = preparePublishedContent([bounty, meetup], new Date('2026-11-26T10:00:00Z'));
    const [bountySummary, meetupSummary] = index.campaigns;
    expect(meetupSummary).toMatchObject({ date: '2026-11-26', venueShort: 'Short venue', city: 'Johannesburg' });
    expect(bountySummary).toMatchObject({ deadline: '2026-11-26', prize: 'A prize' });
    expect(meetupSummary.meetup).toEqual(meetup.meetup);
    expect(bountySummary.bounty).toEqual(bounty.bounty);
    expect(campaignMeta(meetupSummary)).toBe(campaignMeta(meetup));
    expect(campaignMeta(bountySummary)).toBe(campaignMeta(bounty));
    expect(visibleTagline(meetupSummary)).toBe(visibleTagline(meetup));
    expect(visibleTagline(bountySummary)).toBe(visibleTagline(bounty));
    expect(index.sampleCampaign).toEqual(meetup);
  });

  it('uses an active bounty for the sample when no meetup is active', () => {
    const oldMeetup: Campaign = {
      ...meetup,
      meetup: { date: '2026-11-01', venue: 'Venue', city: 'City' },
    };
    const { index } = preparePublishedContent([oldMeetup, bounty], new Date('2026-11-26T10:00:00Z'));
    expect(index.sampleCampaign).toEqual(bounty);
    expect(index.campaigns[0]).toMatchObject({ status: 'archived', archived: true });
  });
});
