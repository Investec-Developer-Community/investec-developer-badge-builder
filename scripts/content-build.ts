import type { Campaign, CampaignSummary, ContentIndex } from '../src/types';

export function johannesburgDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) throw new Error('Could not determine the Johannesburg calendar date');
  return `${year}-${month}-${day}`;
}

export function preparePublishedContent(
  campaigns: readonly Campaign[],
  now: Date = new Date(),
): { campaigns: Campaign[]; index: ContentIndex } {
  const asOfDate = johannesburgDate(now);
  const published = campaigns.map((campaign): Campaign => {
    const endDate = campaign.programme === 'meetup' ? campaign.meetup?.date : campaign.bounty?.deadline;
    if (!endDate) throw new Error(`Campaign "${campaign.id}" is missing its date or deadline`);
    if (campaign.status === 'active' && endDate < asOfDate) {
      return { ...campaign, status: 'archived', archived: true };
    }
    return campaign;
  });
  const summaries: CampaignSummary[] = published.map((campaign) => ({
    id: campaign.id,
    programme: campaign.programme,
    title: campaign.title,
    status: campaign.status,
    archived: campaign.archived,
    demo: campaign.demo,
    theme: campaign.theme,
    tagline: campaign.tagline,
    roles: campaign.roles,
    ...(campaign.meetup ? {
      date: campaign.meetup.date,
      city: campaign.meetup.city,
      ...(campaign.meetup.venueShort ? { venueShort: campaign.meetup.venueShort } : {}),
      meetup: campaign.meetup,
    } : {}),
    ...(campaign.bounty ? {
      deadline: campaign.bounty.deadline,
      ...(campaign.bounty.prize ? { prize: campaign.bounty.prize } : {}),
      bounty: campaign.bounty,
    } : {}),
  }));
  const sampleCampaign = published.find((campaign) => campaign.programme === 'meetup' && campaign.status === 'active')
    ?? published.find((campaign) => campaign.programme === 'bounty' && campaign.status === 'active');
  return {
    campaigns: published,
    index: { campaigns: summaries, asOfDate, ...(sampleCampaign ? { sampleCampaign } : {}) },
  };
}

export function formatContentMessages(path: string, messages: readonly string[]): string[] {
  return messages.map((message) => `${path}: ${message}`);
}
