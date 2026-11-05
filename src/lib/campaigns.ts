import { SLUG_RE, MAX_ID_LENGTH, checkId, isHttpsUrl, isMeetupRole, isRecord, isValidDate } from './content';
import type {
  Campaign,
  CampaignResolution,
  CampaignSummary,
  ContentIndex,
  Programme,
  Theme,
  ThemesBundle,
} from '../types';

const base = () => (import.meta.env?.BASE_URL as string | undefined) ?? './';

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${base()}generated/${path}`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Loads index + themes. Rejects on failure so the UI can show an error/retry state. */
export async function loadContent(): Promise<{ index: ContentIndex; themes: Theme[] }> {
  const [index, themes] = await Promise.all([
    getJson<ContentIndex>('index.json'),
    getJson<ThemesBundle>('themes.json'),
  ]);
  if (!Array.isArray(index?.campaigns) || !Array.isArray(themes?.themes)) throw new Error('Content index is malformed');
  if (index.sampleCampaign !== undefined) {
    const sample = index.sampleCampaign;
    if (
      !isCampaign(sample) || sample.status !== 'active' ||
      !index.campaigns.some((entry) =>
        isRecord(entry) && entry.id === sample.id && entry.programme === sample.programme && entry.status === 'active')
    ) throw new Error('Sample campaign is malformed');
  }
  return { index, themes: themes.themes };
}

const hasText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;

const optionalText = (value: unknown, max: number): boolean => value === undefined || hasText(value, max);

/** Runtime guard for generated campaign documents before they reach the UI. */
export function isCampaign(c: unknown): c is Campaign {
  if (!isRecord(c)) return false;
  if (
    typeof c.id !== 'string' || checkId(c.id) !== null ||
    (c.programme !== 'meetup' && c.programme !== 'bounty') ||
    !hasText(c.title, 60) ||
    !optionalText(c.shareTitle, 60) ||
    (c.status !== 'active' && c.status !== 'archived') ||
    typeof c.archived !== 'boolean' || c.archived !== (c.status === 'archived') ||
    typeof c.demo !== 'boolean' ||
    typeof c.theme !== 'string' || c.theme.length > 40 || checkId(c.theme) !== null ||
    typeof c.tagline !== 'string' || c.tagline.trim().length > 80 ||
    !Array.isArray(c.roles) || c.roles.length === 0 || new Set(c.roles).size !== c.roles.length ||
    !isRecord(c.fields) ||
    typeof c.fields.sessionTitle !== 'boolean' ||
    typeof c.fields.projectName !== 'boolean' ||
    typeof c.fields.githubUsername !== 'boolean' ||
    (c.link !== undefined && (!hasText(c.link, 300) || !isHttpsUrl(c.link)))
  ) return false;

  if (c.programme === 'meetup') {
    return (
      c.roles.every(isMeetupRole) &&
      c.bounty === undefined &&
      isRecord(c.meetup) &&
      typeof c.meetup.date === 'string' && isValidDate(c.meetup.date) &&
      hasText(c.meetup.venue, 80) &&
      optionalText(c.meetup.venueShort, 40) &&
      hasText(c.meetup.city, 60)
    );
  }
  return (
    c.roles.length === 1 && c.roles[0] === 'submission' &&
    c.meetup === undefined &&
    isRecord(c.bounty) &&
    hasText(c.bounty.challenge, 200) &&
    typeof c.bounty.deadline === 'string' && isValidDate(c.bounty.deadline) &&
    optionalText(c.bounty.prize, 60)
  );
}

/** Fetches the full campaign document. Throws if missing or malformed. */
export async function loadCampaign(id: string): Promise<Campaign> {
  const c = await getJson<unknown>(`campaigns/${encodeURIComponent(id)}.json`);
  if (!isCampaign(c) || c.id !== id) throw new Error(`Campaign "${id}" is malformed`);
  return c;
}

export function listActiveCampaigns(index: ContentIndex, programme: Programme): CampaignSummary[] {
  return index.campaigns.filter((c) => c.programme === programme && c.status === 'active');
}

/** C1: active campaign counts per programme. */
export function activeCounts(index: ContentIndex): Record<Programme, number> {
  return { meetup: listActiveCampaigns(index, 'meetup').length, bounty: listActiveCampaigns(index, 'bounty').length };
}

export type DeepLinkCheck =
  | { kind: 'none' }
  | { kind: 'ok'; summary: CampaignSummary; archived: boolean }
  | { kind: 'error'; error: { kind: 'malformed' | 'unavailable'; message: string } };

/** C3-C5, pure: inspects `?campaign=` against the index. Drafts are never published, so they read as unavailable. */
export function checkDeepLink(search: string, index: ContentIndex): DeepLinkCheck {
  const params = new URLSearchParams(search);
  if (!params.has('campaign')) return { kind: 'none' };
  const id = params.get('campaign') ?? '';
  if (!id || id.length > MAX_ID_LENGTH || !SLUG_RE.test(id)) {
    return { kind: 'error', error: { kind: 'malformed', message: 'That campaign link is not valid.' } };
  }
  const summary = index.campaigns.find((c) => c.id === id);
  if (!summary) {
    return { kind: 'error', error: { kind: 'unavailable', message: 'That campaign is not available.' } };
  }
  return { kind: 'ok', summary, archived: summary.archived };
}

/** Resolves a deep link to a full campaign, or null when there is no `?campaign=` parameter. */
export async function resolveDeepLink(search: string, index: ContentIndex): Promise<CampaignResolution | null> {
  const check = checkDeepLink(search, index);
  if (check.kind === 'none') return null;
  if (check.kind === 'error') return { ok: false, error: check.error };
  try {
    return { ok: true, campaign: await loadCampaign(check.summary.id), archived: check.archived };
  } catch {
    return { ok: false, error: { kind: 'load-failed', message: 'We could not load that campaign. Please try again.' } };
  }
}

/** Loads the index and themes; a separate promise resolves a requested deep link. */
export async function loadInitialContent(search: string): Promise<{
  index: ContentIndex;
  themes: Theme[];
  resolution: Promise<CampaignResolution | null>;
}> {
  const loaded = await loadContent();
  return { ...loaded, resolution: resolveDeepLink(search, loaded.index) };
}

/** C7: shareable URL honouring the deployment subpath; carries only the campaign id. */
export function buildCampaignUrl(id: string, location: Pick<Location, 'origin' | 'pathname'> = window.location): string {
  return `${location.origin}${location.pathname}?campaign=${encodeURIComponent(id)}`;
}

export function findTheme(themes: Theme[], id: string): Theme | undefined {
  return themes.find((t) => t.id === id);
}
