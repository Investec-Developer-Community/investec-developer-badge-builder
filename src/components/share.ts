import { badgeVenueLine, formatBadgeDate, stripEmoji } from '../lib/render';
import type { BadgeDetails, BadgeInput, Campaign, Role } from '../types';

/** Default hashtags appended to every generated caption. */
export const DEFAULT_HASHTAGS = '#InvestecDeveloper #ProgrammableBanking';

/** Pre-filled LinkedIn composer; the visitor uploads the PNG themselves (nothing leaves the device). */
export const LINKEDIN_SHARE_URL = 'https://www.linkedin.com/feed/?shareActive=true';

export interface ShareInput {
  campaign: Pick<Campaign, 'title' | 'shareTitle' | 'link' | 'meetup' | 'bounty'>;
  role: Role;
  name: string;
  details: BadgeDetails;
}

const clean = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
const cleanCampaign = (s: string | undefined) => clean(stripEmoji(s ?? ''));
/** `{lead} “{text}”.`, without a doubled stop when the quoted text already ends a sentence. */
const quoted = (lead: string, text: string) => `${lead} “${text}”${/[.!?…]$/.test(text) ? '' : '.'}`;

/** "the X" unless the title already starts with "the". */
function withArticle(title: string): string {
  return /^the\s/i.test(title) ? title : `the ${title}`;
}

function bountyName(title: string): string {
  return withArticle(/\bbounty\b/i.test(title) ? title : `${title} bounty`);
}

function githubUrl(user: string | undefined): string {
  const u = clean(user).replace(/^@/, '');
  return u ? `https://github.com/${u}` : '';
}

/** The event name people would say out loud: `shareTitle` when set, else the campaign title. */
function eventName(c: ShareInput['campaign']): string {
  return cleanCampaign(c.shareTitle) || cleanCampaign(c.title);
}

/**
 * Short location phrase for captions, never the street address when a short venue exists:
 * "at {venueShort} in {city}", "in {city}" when they match, else the badge footer line.
 */
function where(m: NonNullable<ShareInput['campaign']['meetup']>): string {
  const city = cleanCampaign(m.city);
  const short = cleanCampaign(m.venueShort);
  if (short) {
    if (!city) return `at ${short}`;
    return short.toLowerCase() === city.toLowerCase() ? `in ${city}` : `at ${short} in ${city}`;
  }
  const line = clean(badgeVenueLine(m));
  if (!line) return '';
  return line.toLowerCase() === city.toLowerCase() ? `in ${city}` : `at ${line}`;
}

/** Ends with ": {link}" when there is a link, otherwise with a full stop. */
const close = (sentence: string, link: string) => (link ? `${sentence}: ${link}` : `${sentence}.`);

/** Ready-to-post first-person caption built only from campaign data and the visitor's own details. */
export function buildCaption({ campaign, role, details }: ShareInput, hashtags: string = DEFAULT_HASHTAGS): string {
  const event = eventName(campaign);
  const link = clean(campaign.link);
  const project = clean(details.projectName);
  const gh = githubUrl(details.githubUsername);
  const paragraphs: string[] = [];

  if (campaign.bounty) {
    const name = bountyName(event);
    paragraphs.push(project ? quoted(`I built something for ${name}:`, project) : `I’ve entered ${name}.`);
    const challenge = cleanCampaign(campaign.bounty.challenge);
    const middle = [challenge && quoted('This round’s brief:', challenge), gh && `The code is on GitHub if you want to poke around: ${gh}`];
    if (middle.some(Boolean)) paragraphs.push(middle.filter(Boolean).join(' '));
    paragraphs.push(close(`Entries close ${formatBadgeDate(campaign.bounty.deadline, false)} if you want to have a go`, link));
  } else {
    const r = role === 'submission' ? 'attending' : role;
    const opening = { attending: 'I’ll be at', volunteering: 'I’m helping out at', speaking: 'I’m speaking at' }[r];
    let sentence = `${opening} ${withArticle(event)}`;
    if (campaign.meetup) {
      sentence += ` on ${formatBadgeDate(campaign.meetup.date)}`;
      const place = where(campaign.meetup);
      if (place) sentence += ` ${place}`;
    }
    const first = [`${sentence}.`];
    if (project) first.push(quoted('Currently building:', project));
    if (gh) first.push(`My code is on GitHub: ${gh}`);
    paragraphs.push(first.join(' '));

    const session = clean(details.sessionTitle);
    if (r === 'attending') {
      paragraphs.push(close('If you’re building with programmable banking, or just curious about it, come along', link));
    } else if (r === 'volunteering') {
      paragraphs.push(link ? `If you’re coming, come say hi. Not signed up yet? ${link}` : 'If you’re coming, come say hi.');
    } else {
      const talk = session ? `${quoted('My talk:', session)} ` : '';
      paragraphs.push(talk + close('Come along and bring your questions', link));
    }
  }

  if (clean(hashtags)) paragraphs.push(clean(hashtags));
  return paragraphs.join('\n\n');
}

/** True when the downloaded PNG still matches the builder's current input (same objects and values). */
export function matchesDownloadedBadge(downloaded: BadgeInput, current: BadgeInput): boolean {
  const a = downloaded.details;
  const b = current.details;
  return (
    downloaded.campaign === current.campaign &&
    downloaded.theme === current.theme &&
    downloaded.style === current.style &&
    (downloaded.format ?? 'square') === (current.format ?? 'square') &&
    downloaded.role === current.role &&
    downloaded.name === current.name &&
    downloaded.photo === current.photo &&
    downloaded.crop.x === current.crop.x &&
    downloaded.crop.y === current.crop.y &&
    downloaded.crop.zoom === current.crop.zoom &&
    (a.sessionTitle ?? '') === (b.sessionTitle ?? '') &&
    (a.projectName ?? '') === (b.projectName ?? '') &&
    (a.githubUsername ?? '') === (b.githubUsername ?? '')
  );
}

type SharePlatform = {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void> | void;
  clipboard?: { writeText: (text: string) => Promise<void> };
};

/** Native file sharing needs both `share` and `canShare`, and must accept this exact file. */
export function canShareFile(file: File, platform: SharePlatform | undefined = typeof navigator === 'undefined' ? undefined : navigator): boolean {
  try {
    return typeof platform?.share === 'function' && typeof platform.canShare === 'function' && platform.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export type ShareOutcome = { kind: 'shared'; captionCopied: boolean } | { kind: 'cancelled' } | { kind: 'failed' };

const isAbort = (e: unknown) => typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'AbortError';

/**
 * Opens the share sheet first (inside the user's tap), then also tries to put the caption on the
 * clipboard because some apps drop shared text. Cancelling is not an error.
 */
export async function shareBadge(platform: SharePlatform, data: ShareData): Promise<ShareOutcome> {
  let pending: Promise<void>;
  try {
    if (typeof platform.share !== 'function') return { kind: 'failed' };
    pending = Promise.resolve(platform.share(data));
  } catch (e) {
    return isAbort(e) ? { kind: 'cancelled' } : { kind: 'failed' };
  }
  let clip: Promise<boolean> = Promise.resolve(false);
  try {
    if (data.text && platform.clipboard) clip = platform.clipboard.writeText(data.text).then(() => true, () => false);
  } catch {
    // Clipboard unavailable; the caption can still be copied by hand.
  }
  try {
    await pending;
  } catch (e) {
    return isAbort(e) ? { kind: 'cancelled' } : { kind: 'failed' };
  }
  return { kind: 'shared', captionCopied: await clip };
}
