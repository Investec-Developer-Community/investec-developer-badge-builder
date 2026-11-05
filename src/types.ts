export type Programme = 'meetup' | 'bounty';
export type CampaignStatus = 'draft' | 'active' | 'archived';
export type PublicStatus = 'active' | 'archived';
export type Role = 'attending' | 'volunteering' | 'speaking' | 'submission';
export type MeetupRole = Exclude<Role, 'submission'>;
export type BadgeStyle = 'dark' | 'light';
/** Export shape: 'square' 1080×1080 (default) or 'portrait' 4:5 1080×1350. */
export type BadgeFormat = 'square' | 'portrait';

export interface Palette {
  /** Flat badge background. */
  background: string;
  accent: string;
  text: string;
  mutedText: string;
}

/**
 * A badge colour design, generated from content/themes/*.json. Only the palettes are drawn: the
 * badge layout, typography and circular portrait are fixed by the Investec Developer style guide.
 */
export interface Theme {
  id: string;
  name: string;
  dark: Palette;
  light: Palette;
}

export interface ThemesBundle {
  themes: Theme[];
}

/** Fully-resolved campaign (generated; defaults already applied). */
export interface Campaign {
  /** Stable id = filename slug. */
  id: string;
  programme: Programme;
  title: string;
  /** Optional plain event name for share captions; captions fall back to `title`. */
  shareTitle?: string;
  status: PublicStatus;
  archived: boolean;
  demo: boolean;
  theme: string;
  tagline: string;
  roles: Role[];
  /** Which optional detail fields the visitor may fill in. */
  fields: { sessionTitle: boolean; projectName: boolean; githubUsername: boolean };
  /** Only HTTPS links; omitted for demo campaigns' real-offer safety is up to the UI. */
  link?: string;
  /** `venue` is the full address; `venueShort` is the compact form used on the badge footer and in captions. */
  meetup?: { date: string; venue: string; venueShort?: string; city: string };
  bounty?: { challenge: string; deadline: string; prize?: string };
}

/** Lightweight entry in public/generated/index.json. */
export interface CampaignSummary {
  id: string;
  programme: Programme;
  title: string;
  status: PublicStatus;
  archived: boolean;
  demo: boolean;
  theme: string;
  tagline: string;
  roles: Role[];
  date?: string;
  venueShort?: string;
  city?: string;
  deadline?: string;
  prize?: string;
  meetup?: Campaign['meetup'];
  bounty?: Campaign['bounty'];
}

export interface ContentIndex {
  campaigns: CampaignSummary[];
  /** Johannesburg calendar date used when the index was built. */
  asOfDate?: string;
  /** First active campaign for the landing-page example, without an extra fetch. */
  sampleCampaign?: Campaign;
}

export interface BadgeDetails {
  sessionTitle?: string;
  projectName?: string;
  githubUsername?: string;
}

/** Photo crop: x,y = centre offset in [-1,1] of free travel; zoom >= 1 (1 = cover). */
export interface Crop {
  x: number;
  y: number;
  zoom: number;
}

export type PhotoSource = ImageBitmap | HTMLImageElement | null;

export interface BadgeInput {
  campaign: Campaign;
  theme: Theme;
  style: BadgeStyle;
  role: Role;
  name: string;
  photo: PhotoSource;
  crop: Crop;
  details: BadgeDetails;
  /** Export shape; defaults to 'square'. */
  format?: BadgeFormat;
}

export type CampaignLoadError =
  | { kind: 'malformed'; message: string }
  | { kind: 'unavailable'; message: string }
  | { kind: 'load-failed'; message: string };

export type CampaignResolution =
  | { ok: true; campaign: Campaign; archived: boolean }
  | { ok: false; error: CampaignLoadError };

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; message: string };
