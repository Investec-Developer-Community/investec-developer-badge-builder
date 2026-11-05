import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatContentMessages, preparePublishedContent } from './content-build';
import { parseCampaign, parseTheme } from '../src/lib/content';
import type { Campaign, Programme, Theme, ThemesBundle } from '../src/types';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'generated');
const errors: string[] = [];
const warnings: string[] = [];

function files(dir: string): string[] {
  try {
    return readdirSync(dir).filter((f) => !f.startsWith('.')).sort();
  } catch {
    errors.push(`${rel(dir)}: folder is missing`);
    return [];
  }
}
const rel = (p: string) => p.replace(root + '/', '');

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    errors.push(`${rel(path)}: not valid JSON (${(e as Error).message}). Check commas, quotes and brackets.`);
    return undefined;
  }
}

function report(path: string, list: string[], destination: string[]) {
  destination.push(...formatContentMessages(rel(path), list));
}

const themes: Theme[] = [];
const themesDir = join(root, 'content', 'themes');
for (const f of files(themesDir)) {
  const path = join(themesDir, f);
  if (!f.endsWith('.json')) {
    errors.push(`${rel(path)}: only .json files are allowed here`);
    continue;
  }
  const raw = readJson(path);
  if (raw === undefined) continue;
  const r = parseTheme(raw, f.slice(0, -5));
  report(path, r.warnings, warnings);
  if (r.ok) themes.push(r.value);
  else report(path, r.errors, errors);
}
const themeIds = new Set(themes.map((t) => t.id));

const campaigns: Campaign[] = [];
const seen = new Map<string, string>();
for (const programme of ['meetup', 'bounty'] as Programme[]) {
  const dir = join(root, 'content', 'campaigns', programme === 'meetup' ? 'meetups' : 'bounties');
  for (const f of files(dir)) {
    const path = join(dir, f);
    if (!f.endsWith('.json')) {
      errors.push(`${rel(path)}: only .json files are allowed here`);
      continue;
    }
    const id = f.slice(0, -5);
    const raw = readJson(path);
    if (raw === undefined) continue;
    const r = parseCampaign(raw, programme, id, themeIds);
    report(path, r.warnings, warnings);
    if (!r.ok) {
      report(path, r.errors, errors);
      continue;
    }
    if (seen.has(id)) {
      errors.push(`${rel(path)}: id "${id}" is already used by ${seen.get(id)}; campaign file names must be unique`);
      continue;
    }
    seen.set(id, rel(path));
    if (r.value.status !== 'draft') campaigns.push(r.value.campaign);
  }
}

if (warnings.length) {
  console.warn(`\n⚠ Content warnings (${warnings.length}):\n`);
  for (const warning of warnings) console.warn(`  • ${warning}`);
}

if (errors.length) {
  console.error(`\n✖ Content validation failed (${errors.length} problem${errors.length > 1 ? 's' : ''}):\n`);
  for (const e of errors) console.error(`  • ${e}`);
  console.error('\nFix the file(s) above and run "npm run content" again. See content/schema/ for field definitions.\n');
  process.exit(1);
}

const published = preparePublishedContent(campaigns);
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'campaigns'), { recursive: true });
const write = (name: string, data: unknown) => writeFileSync(join(out, name), JSON.stringify(data, null, 2) + '\n');

write('index.json', published.index);
write('themes.json', { themes } satisfies ThemesBundle);
for (const c of published.campaigns) write(`campaigns/${c.id}.json`, c);

console.log(`✔ Content OK: ${published.campaigns.length} campaign(s) published, ${themes.length} theme(s).`);
