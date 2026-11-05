import type { Campaign, Role } from '../types';

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** "2026-11-12" → "12 Nov 2026". Parsed as a local date so no timezone can shift the day. */
export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(date.getTime()) ? iso : DATE_FORMAT.format(date);
}

/** Logistics line shown under a campaign title: date · venue, city (meetup) or deadline · prize (bounty). */
export function campaignMeta(c: Pick<Campaign, 'meetup' | 'bounty'>): string {
  if (c.meetup) {
    const place = [c.meetup.venue, c.meetup.city].filter(Boolean).join(', ');
    return [formatDate(c.meetup.date), place].filter(Boolean).join(' · ');
  }
  if (c.bounty) return [`Deadline ${formatDate(c.bounty.deadline)}`, c.bounty.prize].filter(Boolean).join(' · ');
  return '';
}

/** The tagline unless it was auto-derived from the date/deadline (which the meta line already shows). */
export function visibleTagline(c: Pick<Campaign, 'tagline' | 'meetup' | 'bounty'>): string {
  if (!c.tagline) return '';
  if (c.meetup && c.tagline.includes(c.meetup.date)) return '';
  if (c.bounty && c.tagline.includes(c.bounty.deadline)) return '';
  return c.tagline;
}

/** UI wording for roles (the badge artwork uses its own labels from the renderer). */
const ROLE_DISPLAY: Record<Role, string> = {
  attending: 'Attending',
  volunteering: 'Volunteering',
  speaking: 'Speaking',
  submission: 'Bounty submission',
};
export const roleDisplay = (r: Role) => ROLE_DISPLAY[r];
