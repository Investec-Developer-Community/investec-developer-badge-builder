import { resolve } from 'node:path';
import { build } from 'vite';
import { describe, expect, it } from 'vitest';

describe('content validation bundle boundary', () => {
  it('keeps source schemas and their validator out of the browser bundle', async () => {
    const result = await build({
      configFile: false,
      envFile: false,
      publicDir: false,
      logLevel: 'silent',
      build: {
        write: false,
        emptyOutDir: false,
        minify: false,
        rollupOptions: {
          input: resolve('src/lib/campaigns.ts'),
          preserveEntrySignatures: 'strict',
        },
      },
    });
    const bundles = Array.isArray(result) ? result : [result];
    const code = bundles.flatMap((bundle) => 'output' in bundle ? bundle.output : [])
      .map((item) => item.type === 'chunk' ? item.code : '')
      .join('\n');
    expect(code).toContain('Content index is malformed');
    expect(code).not.toContain('Badge theme (colour palettes)');
    expect(code).not.toContain('Unsupported content schema keyword');
    expect(code).not.toContain('Content schema accepted');
  });
});
