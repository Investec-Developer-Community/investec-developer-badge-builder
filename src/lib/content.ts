import meetupSchema from '../../content/schema/meetup.schema.json' with { type: 'json' };
import bountySchema from '../../content/schema/bounty.schema.json' with { type: 'json' };
import themeSchema from '../../content/schema/theme.schema.json' with { type: 'json' };
import type {
  Campaign,
  CampaignStatus,
  MeetupRole,
  Palette,
  Programme,
  Theme,
} from '../types';

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_ID_LENGTH = 60;
const MEETUP_ROLES: MeetupRole[] = ['attending', 'volunteering', 'speaking'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Obj = Record<string, unknown>;

export const isRecord = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

export function isMeetupRole(v: unknown): v is MeetupRole {
  return typeof v === 'string' && MEETUP_ROLES.some((role) => role === v);
}

export function isValidDate(v: string): boolean {
  return DATE_RE.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().startsWith(v);
}

export function isHttpsUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && !!u.hostname && !u.username && !u.password;
  } catch {
    return false;
  }
}

export function checkId(id: string): string | null {
  if (!SLUG_RE.test(id) || id.length > MAX_ID_LENGTH) {
    return `file name "${id}" is not a valid campaign id: use lowercase letters, numbers and single hyphens only, max ${MAX_ID_LENGTH} characters (e.g. "cape-town-meetup-2026")`;
  }
  return null;
}

export type Result<T> =
  | { ok: true; value: T; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

interface ContentSchema {
  $ref?: string;
  type?: string | string[];
  properties?: Record<string, ContentSchema>;
  definitions?: Record<string, ContentSchema>;
  required?: string[];
  additionalProperties?: boolean;
  enum?: unknown[];
  default?: unknown;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  items?: ContentSchema;
  deprecated?: boolean;
  'x-trim'?: boolean;
}

class Problems {
  errors: string[] = [];
  warnings: string[] = [];

  add(field: string, message: string) {
    this.errors.push(`"${field}" ${message}`);
  }

  deprecated(field: string) {
    this.warnings.push(`"${field}" is deprecated and ignored; remove it before the next release.`);
  }
}

// The JSON Schemas are the build-time source of truth. x-trim preserves the existing
// text normalization; https-url adds the URL safety check not expressible as a format.
// Browser callers use only the small runtime guards above; schema parsing is tree-shaken.
function assertSupportedSchema(schema: ContentSchema): void {
  const supported = [
    '$schema', '$ref', 'title', 'description', 'type', 'properties', 'definitions', 'required',
    'additionalProperties', 'enum', 'default', 'minLength', 'maxLength', 'pattern', 'format',
    'minItems', 'maxItems', 'uniqueItems', 'items', 'deprecated', 'x-trim',
  ];
  for (const key of Object.keys(schema)) {
    if (!supported.includes(key)) throw new Error(`Unsupported content schema keyword "${key}"`);
  }
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  for (const type of types) {
    if (!['object', 'array', 'string', 'boolean', 'null'].includes(type)) {
      throw new Error(`Unsupported content schema type "${type}"`);
    }
  }
  if (schema.format && !['date', 'https-url'].includes(schema.format)) {
    throw new Error(`Unsupported content schema format "${schema.format}"`);
  }
  for (const child of Object.values(schema.properties ?? {})) assertSupportedSchema(child);
  for (const child of Object.values(schema.definitions ?? {})) assertSupportedSchema(child);
  if (schema.items) assertSupportedSchema(schema.items);
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case 'object': return isRecord(value);
    case 'array': return Array.isArray(value);
    case 'string': return typeof value === 'string';
    case 'boolean': return typeof value === 'boolean';
    case 'null': return value === null;
    default: throw new Error(`Unsupported content schema type "${type}"`);
  }
}

function typeMessage(type: string): string {
  switch (type) {
    case 'object': return 'must be an object { ... }';
    case 'array': return 'must be a list [ ... ]';
    case 'string': return 'must be text';
    case 'boolean': return 'must be true or false (without quotes)';
    case 'null': return 'must be null';
    default: throw new Error(`Unsupported content schema type "${type}"`);
  }
}

function validateValue(value: unknown, schema: ContentSchema, root: ContentSchema, path: string, p: Problems): void {
  if (schema.$ref) {
    const prefix = '#/definitions/';
    const target = schema.$ref.startsWith(prefix) ? root.definitions?.[schema.$ref.slice(prefix.length)] : undefined;
    if (!target) throw new Error(`Unsupported content schema reference "${schema.$ref}"`);
    validateValue(value, target, root, path, p);
    return;
  }
  if (schema.deprecated) {
    p.deprecated(path);
    return;
  }

  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (types.length && !types.some((type) => matchesType(value, type))) {
    p.add(path, typeMessage(types.find((type) => type !== 'null') ?? 'null'));
    return;
  }
  if (schema.enum && !schema.enum.some((option) => option === value)) {
    p.add(path, `must be one of: ${schema.enum.map((option) => JSON.stringify(option)).join(', ')} (got ${JSON.stringify(value)})`);
  }

  if (typeof value === 'string') {
    const text = schema['x-trim'] ? value.trim() : value;
    if (schema.minLength !== undefined && text.length < schema.minLength) {
      p.add(path, text.length === 0 ? 'must not be blank' : `must be at least ${schema.minLength} characters`);
    }
    if (schema.maxLength !== undefined && text.length > schema.maxLength) {
      p.add(path, `is too long (${text.length} characters, max ${schema.maxLength})`);
    }
    let badFormat = false;
    if (schema.format === 'date' && !isValidDate(text)) {
      p.add(path, `must be a real date written YYYY-MM-DD (got "${text}")`);
      badFormat = true;
    } else if (schema.format === 'https-url' && text && !isHttpsUrl(text)) {
      p.add(path, `must be a full https:// address without credentials (got "${text}")`);
      badFormat = true;
    }
    if (!badFormat && schema.pattern && !new RegExp(schema.pattern).test(text)) {
      if (schema.pattern === '\\S') {
        if (text.length > 0) p.add(path, 'must not be blank');
      } else {
        p.add(path, `must match ${schema.pattern} (got ${JSON.stringify(text)})`);
      }
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      p.add(path, `must contain at least ${schema.minItems} item(s)`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      p.add(path, `must contain at most ${schema.maxItems} item(s)`);
    }
    if (schema.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) {
      p.add(path, 'must not contain duplicate items');
    }
    if (schema.items) {
      for (const [index, item] of value.entries()) validateValue(item, schema.items, root, `${path}[${index}]`, p);
    }
  }

  if (isRecord(value)) {
    const properties = schema.properties ?? {};
    for (const key of schema.required ?? []) {
      if (value[key] === undefined) p.add(path ? `${path}.${key}` : key, 'is required');
    }
    for (const [key, child] of Object.entries(value)) {
      if (child === undefined) continue;
      const field = path ? `${path}.${key}` : key;
      if (!Object.hasOwn(properties, key)) {
        if (schema.additionalProperties === false) {
          const hint = key === 'emoji' ? ' — emoji were removed from campaigns; delete this line.' : '';
          p.add(field, `is not a known field (allowed: ${Object.keys(properties).join(', ')})${hint}`);
        }
        continue;
      }
      validateValue(child, properties[key], root, field, p);
    }
  }
}

function validateSource(raw: Obj, schema: ContentSchema, p: Problems): void {
  assertSupportedSchema(schema);
  validateValue(raw, schema, schema, '', p);
}

function property(schema: ContentSchema, key: string): ContentSchema {
  const result = schema.properties?.[key];
  if (!result) throw new Error(`Content schema is missing the "${key}" property`);
  return result;
}

function defaultString(schema: ContentSchema, key: string): string {
  const value = property(schema, key).default;
  if (typeof value !== 'string') throw new Error(`Content schema needs a text default for "${key}"`);
  return value;
}

function optionalText(raw: Obj, key: string): string | undefined {
  const value = raw[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new Error(`Content schema accepted non-text "${key}"`);
  return value.trim() || undefined;
}

function requiredText(raw: Obj, key: string): string {
  const value = optionalText(raw, key);
  if (!value) throw new Error(`Content schema accepted missing or blank "${key}"`);
  return value;
}

function fieldFlag(raw: Obj, schema: ContentSchema, key: string): boolean {
  const value = raw[key] ?? property(schema, key).default;
  if (typeof value !== 'boolean') throw new Error(`Content schema accepted a non-boolean "${key}"`);
  return value;
}

/** Validates one campaign source file and applies defaults. `id` comes from the file name. */
export function parseCampaign(
  raw: unknown,
  programme: Programme,
  id: string,
  knownThemes: Set<string>,
): Result<{ campaign: Campaign; status: CampaignStatus }> {
  const p = new Problems();
  const idErr = checkId(id);
  if (idErr) p.errors.push(idErr);
  if (!isRecord(raw)) return { ok: false, errors: [...p.errors, 'file must contain a JSON object { ... }'], warnings: p.warnings };

  const schema: ContentSchema = programme === 'meetup' ? meetupSchema : bountySchema;
  validateSource(raw, schema, p);
  if (raw.theme === undefined || raw.theme === null || typeof raw.theme === 'string') {
    const theme = optionalText(raw, 'theme') ?? defaultString(schema, 'theme');
    if (!knownThemes.has(theme)) {
      p.add('theme', `"${theme}" is not a known design. Available: ${[...knownThemes].sort().join(', ')}`);
    }
  }
  if (p.errors.length) return { ok: false, errors: p.errors, warnings: p.warnings };

  const status = raw.status ?? property(schema, 'status').default;
  if (status !== 'draft' && status !== 'active' && status !== 'archived') {
    throw new Error('Content schema accepted an invalid campaign status');
  }
  const demo = raw.demo ?? property(schema, 'demo').default;
  if (typeof demo !== 'boolean') throw new Error('Content schema accepted a non-boolean demo');
  const theme = optionalText(raw, 'theme') ?? defaultString(schema, 'theme');
  const title = requiredText(raw, 'title');
  const shareTitle = optionalText(raw, 'shareTitle');
  const link = optionalText(raw, 'link');
  let tagline = optionalText(raw, 'tagline');
  const fieldsRaw = isRecord(raw.fields) ? raw.fields : {};
  const fieldsSchema = property(schema, 'fields');
  const fields = {
    sessionTitle: programme === 'meetup' ? fieldFlag(fieldsRaw, fieldsSchema, 'sessionTitle') : false,
    projectName: programme === 'bounty' ? fieldFlag(fieldsRaw, fieldsSchema, 'projectName') : false,
    githubUsername: programme === 'bounty' ? fieldFlag(fieldsRaw, fieldsSchema, 'githubUsername') : false,
  };

  let roles: Campaign['roles'] = ['submission'];
  let meetup: Campaign['meetup'];
  let bounty: Campaign['bounty'];
  if (programme === 'meetup') {
    const values = raw.roles ?? property(schema, 'roles').default;
    if (!Array.isArray(values) || !values.every(isMeetupRole)) {
      throw new Error('Content schema accepted an invalid meetup role');
    }
    roles = MEETUP_ROLES.filter((role) => values.includes(role));
    const date = requiredText(raw, 'date');
    const venue = requiredText(raw, 'venue');
    const venueShort = optionalText(raw, 'venueShort');
    const city = requiredText(raw, 'city');
    meetup = { date, venue, ...(venueShort ? { venueShort } : {}), city };
    tagline ??= `${date} · ${city}`;
  } else {
    const challenge = requiredText(raw, 'challenge');
    const deadline = requiredText(raw, 'deadline');
    const prize = optionalText(raw, 'prize');
    bounty = { challenge, deadline, ...(prize ? { prize } : {}) };
    tagline ??= `Deadline ${deadline}`;
  }

  const campaign: Campaign = {
    id,
    programme,
    title,
    ...(shareTitle ? { shareTitle } : {}),
    status: status === 'archived' ? 'archived' : 'active',
    archived: status === 'archived',
    demo,
    theme,
    tagline: tagline ?? '',
    roles,
    fields,
    ...(link ? { link } : {}),
    ...(meetup ? { meetup } : {}),
    ...(bounty ? { bounty } : {}),
  };
  return { ok: true, value: { campaign, status }, warnings: p.warnings };
}

function parsePalette(raw: unknown): Palette {
  if (!isRecord(raw)) throw new Error('Content schema accepted a non-object palette');
  return {
    background: requiredText(raw, 'background'),
    accent: requiredText(raw, 'accent'),
    text: requiredText(raw, 'text'),
    mutedText: requiredText(raw, 'mutedText'),
  };
}

export function parseTheme(raw: unknown, id: string): Result<Theme> {
  const p = new Problems();
  const idErr = checkId(id);
  if (idErr) p.errors.push(idErr);
  if (!isRecord(raw)) return { ok: false, errors: [...p.errors, 'file must contain a JSON object { ... }'], warnings: p.warnings };
  validateSource(raw, themeSchema, p);
  if (p.errors.length) return { ok: false, errors: p.errors, warnings: p.warnings };
  return {
    ok: true,
    value: { id, name: requiredText(raw, 'name'), dark: parsePalette(raw.dark), light: parsePalette(raw.light) },
    warnings: p.warnings,
  };
}
