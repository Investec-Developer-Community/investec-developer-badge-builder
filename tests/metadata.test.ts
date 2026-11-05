import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'vite';
import { describe, expect, it } from 'vitest';

const html = readFileSync('index.html', 'utf8');
const manifest = JSON.parse(readFileSync('public/site.webmanifest', 'utf8')) as {
  start_url: string;
  scope: string;
  theme_color: string;
  icons: { src: string; sizes: string; type: string }[];
};

function expectPngSize(path: string, width: number, height: number) {
  const png = readFileSync(path);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(png.toString('ascii', 12, 16)).toBe('IHDR');
  expect(png.readUInt32BE(16)).toBe(width);
  expect(png.readUInt32BE(20)).toBe(height);
}

describe('origin-independent metadata and icons', () => {
  it('provides branded default social copy without inventing a canonical URL', () => {
    for (const tag of ['og:type', 'og:site_name', 'og:title', 'og:description']) {
      expect(html).toContain(`property="${tag}"`);
    }
    for (const tag of ['twitter:card', 'twitter:title', 'twitter:description']) {
      expect(html).toContain(`name="${tag}"`);
    }
    expect(html).toContain('<meta name="theme-color" content="#0c2338"');
    expect(html).not.toMatch(/(?:property|name)="(?:og:url|og:image|twitter:image)"/);
    expect(html).not.toMatch(/rel="canonical"/);
  });

  it('declares correctly sized PNG app icons', () => {
    expect(html).toContain('sizes="32x32" href="/icons/favicon-32.png"');
    expect(html).toContain('sizes="180x180" href="/icons/apple-touch-icon.png"');
    expect(html).toContain('rel="manifest" href="/site.webmanifest"');
    expectPngSize('public/icons/favicon-32.png', 32, 32);
    expectPngSize('public/icons/apple-touch-icon.png', 180, 180);
    expect(manifest.start_url).toBe('./');
    expect(manifest.scope).toBe('./');
    expect(manifest.theme_color).toBe('#0c2338');
    expect(manifest.icons.map((icon) => icon.sizes)).toEqual(['192x192', '512x512']);
    for (const icon of manifest.icons) {
      expect(icon.src).toMatch(/^\.\/icons\//);
      expect(icon.type).toBe('image/png');
      const [width, height] = icon.sizes.split('x').map(Number);
      expectPngSize(resolve('public', icon.src), width, height);
    }
  });

  it('rewrites icon and manifest URLs for subpath deployments', async () => {
    const result = await build({
      configFile: resolve('vite.config.ts'),
      envFile: false,
      logLevel: 'silent',
      build: { write: false, emptyOutDir: false, copyPublicDir: false, minify: false },
    });
    const bundles = Array.isArray(result) ? result : [result];
    const output = bundles.flatMap((bundle) => 'output' in bundle ? bundle.output : [])
      .find((item) => item.type === 'asset' && item.fileName === 'index.html');
    expect(output?.type).toBe('asset');
    if (!output || output.type !== 'asset') return;
    const builtHtml = typeof output.source === 'string' ? output.source : new TextDecoder().decode(output.source);
    const base = '/investec-developer-badge-builder/';
    expect(builtHtml).toContain(`href="${base}icons/favicon-32.png"`);
    expect(builtHtml).toContain(`href="${base}icons/apple-touch-icon.png"`);
    expect(builtHtml).toContain(`href="${base}site.webmanifest"`);
    expect(builtHtml).toMatch(/src="\/investec-developer-badge-builder\/assets\/[^"]+\.js"/);
    const chunks = bundles.flatMap((bundle) => 'output' in bundle ? bundle.output : [])
      .filter((item) => item.type === 'chunk')
      .map((item) => item.code).join('\n');
    expect(chunks).toContain(base);
    expect(chunks).toMatch(/\/investec-developer-badge-builder\/assets\/InvestecDeveloper-Logo[^"']+\.png/);
  }, 30000);
});
