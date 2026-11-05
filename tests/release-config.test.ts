import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { devNull } from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

function expectIgnored(paths: string[], expected: boolean): void {
  // This read-only Git metadata fixture avoids initializing a repository or using its index.
  const gitDir = fileURLToPath(new URL('./fixtures/git-ignore/', import.meta.url));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.toUpperCase().startsWith('GIT_')),
  );
  Object.assign(env, {
    GIT_DIR: gitDir,
    GIT_WORK_TREE: fileURLToPath(root),
    GIT_OBJECT_DIRECTORY: gitDir,
    GIT_CONFIG_GLOBAL: devNull,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_OPTIONAL_LOCKS: '0',
  });

  const result = spawnSync(
    'git',
    ['-c', `core.excludesFile=${devNull}`, 'check-ignore', '--no-index', '--verbose', '--non-matching', '-z', '--stdin'],
    { cwd: fileURLToPath(root), env, input: `${paths.join('\0')}\0`, encoding: 'utf8' },
  );
  expect(result.error, 'Git must be available to check ignore rules').toBeUndefined();
  expect([0, 1], result.stderr).toContain(result.status);

  const fields = result.stdout.split('\0');
  expect(fields.pop()).toBe('');
  expect(fields).toHaveLength(paths.length * 4);
  paths.forEach((path, index) => {
    const [source, line, pattern, reportedPath] = fields.slice(index * 4, index * 4 + 4);
    const ignored = pattern !== '' && !pattern.startsWith('!');
    expect(reportedPath).toBe(path);
    expect(ignored, `${path}: ${source}:${line}:${pattern}`).toBe(expected);
    if (expected) expect(source, `Ignore source for ${path}`).toBe('.gitignore');
  });
}

describe('public release configuration', () => {
  it('runs the test gate before building and uploading Pages', () => {
    const workflow = read('.github/workflows/deploy-pages.yml');
    const start = workflow.indexOf('\n  build:\n');
    const end = workflow.indexOf('\n  deploy:\n');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const build = workflow.slice(start, end);
    expect(build).toContain('- run: npm ci');
    expect(build).toContain('- run: npm run typecheck');
    const test = build.search(/^[ \t]+- run: npm test[ \t]*$/m);
    const compile = build.search(/^[ \t]+- run: npm run build[ \t]*$/m);
    const upload = build.indexOf('uses: actions/upload-pages-artifact@');

    expect(test).toBeGreaterThan(-1);
    expect(compile).toBeGreaterThan(test);
    expect(upload).toBeGreaterThan(compile);
    const deploy = workflow.slice(end);
    expect(deploy).toMatch(/^[ \t]+needs: build[ \t]*$/m);
    expect(deploy).toMatch(/^[ \t]+if: github\.event_name != 'pull_request'[ \t]*$/m);
    expect(workflow).toMatch(/^permissions:\n  contents: read$/m);
    expect(deploy).toMatch(/permissions:\n      pages: write\n      id-token: write/);
    expect(deploy.indexOf('uses: actions/configure-pages@')).toBeGreaterThan(-1);
    expect(deploy.indexOf('uses: actions/deploy-pages@')).toBeGreaterThan(
      deploy.indexOf('uses: actions/configure-pages@'),
    );
  });

  it('aligns the package, lockfile and Pages Node requirements', () => {
    const manifest = JSON.parse(read('package.json')) as { engines: { node: string } };
    const lock = JSON.parse(read('package-lock.json')) as {
      packages: Record<string, { engines?: { node?: string } }>;
    };
    const workflow = read('.github/workflows/deploy-pages.yml');

    expect(manifest.engines.node).toBe('^20.19.0 || ^22.12.0 || >=24.0.0');
    expect(lock.packages[''].engines?.node).toBe(manifest.engines.node);
    expect(workflow).toMatch(/^[ \t]+node-version: 24\.13\.1[ \t]*$/m);
  });

  it('keeps local agent and team configuration out of releases at multiple depths', () => {
    expectIgnored([
      '.agent/instructions.md',
      '.agents/skills/unslop/SKILL.md',
      'packages/demo/.agent/rules.md',
      'packages/demo/.agents/skills/example/SKILL.md',
      '.github/skills/secret-handling/SKILL.md',
      'packages/demo/.github/skills/example/SKILL.md',
      '.github/agents/squad.agent.md',
      'packages/demo/.github/agents/example.md',
      '.github/prompts/example.prompt.md',
      '.github/instructions/example.instructions.md',
      '.github/hooks/pre-commit.json',
      '.github/copilot-instructions.md',
      '.github/workflows/squad-heartbeat.yml',
      '.github/workflows/squad-issue-assign.yml',
      '.github/workflows/squad-triage.yml',
      '.github/workflows/sync-squad-labels.yml',
      '.github/workflows/squad.yml',
      'packages/demo/.github/workflows/squad-triage.yaml',
      '.squad/team.md',
      '.squad/casting/registry.json',
      'packages/demo/.squad/team.md',
      '.squad-workstream',
      '.copilot/mcp-config.json',
      '.gemini/settings.json',
      '.continue/config.yaml',
      '.aider.conf.yml',
      '.mcp.json',
      '.mcp.local.json',
      'packages/demo/.mcp.json',
      '.vscode/settings.json',
      '.gitattributes',
      'AGENTS.md',
      'packages/demo/CLAUDE.md',
      'skills/example/SKILL.md',
    ], true);
  });

  it('keeps documentation, internal plans and private notes out of releases', () => {
    expectIgnored([
      'docs/ADDING_A_CAMPAIGN.md',
      'docs/CAMPAIGN_SCHEMA.md',
      'docs/DESIGN_GUIDELINES.md',
      'docs/EDITING.md',
      'docs/IPHONE_ACCEPTANCE.md',
      'docs/PRD.md',
      'docs/STYLE_REPRODUCTION_GUIDE.md',
      'docs/VISUAL_TESTS.md',
      'docs/WEBKIT_RUNTIME.md',
      'docs/release-notes.md',
      'docs/release_notes.md',
      'docs/future-guide.md',
      'docs/nested/guide.md',
      'packages/demo/docs/PRD.md',
      'packages/demo/Prd.md',
      'PRD_v2.md',
      'docs/launch-plan.md',
      'packages/demo/launch-Plan.md',
      'Plan.md',
      'docs/meeting-notes.md',
      'docs/PRIVATE_NOTES.md',
      'docs/checklist.private.md',
      'meeting-Notes.md',
      'PROJECT_NOTES.txt',
      'TODO.md',
      'packages/demo/Todo.md',
      'ROADMAP.md',
      'docs/plans/launch.md',
      'packages/demo/docs/internal/decision.md',
      'packages/demo/docs/notes/discussion.md',
      'notes/project.md',
      'planning/checklist.md',
      'private/brief.md',
      '.notes/scratch.md',
      'docs/notes/release-notes.md',
    ], true);
  });

  it('does not direct users to private documentation', () => {
    expect(read('README.md')).not.toContain('docs/');
    expect(read('scripts/generate-content.ts')).not.toContain('docs/');
  });

  it('ignores credential files, including deceptive template names', () => {
    expectIgnored([
      '.env',
      '.env.local',
      'packages/demo/.env.production',
      'settings/prod.env',
      'settings/service.env.local',
      '.env.example.local',
      '.env.production.example',
      '.env.template.old',
      '.env.example/credentials.json',
      '.env.sample/notes.txt',
      '.env.template/id_rsa',
      'packages/demo/.env.example/secret.json',
      '.envrc',
      'settings/.envrc.local',
      '.npmrc',
      '.npmrc.backup',
      'settings/.netrc',
      '.aws/credentials',
      '.azure/project/.env',
      '.ssh/id_ed25519',
      'settings/id_rsa.backup',
      'settings/id_ed25519_sk',
      'settings/private.KEY',
      'settings/private.PEM',
      'settings/certificate.p12',
      'settings/certificate.Pfx',
      'settings/credentials.json',
      'settings/credentials.yaml',
      'settings/secrets.json',
      'settings/secrets.dev.yml',
      'settings/service-account-key.json',
      'settings/passwords.KDBX',
      '.terraform/providers/example',
      'infra/production.tfstate',
      'infra/production.tfstate.backup',
    ], true);
  });

  it('ignores generated and machine-local files', () => {
    expectIgnored([
      '.DS_Store',
      'node_modules/react/index.js',
      'packages/demo/node_modules/example/index.js',
      'dist/index.html',
      'public/generated/index.json',
    ], true);
  });

  it('retains public templates, application files and the Pages workflow', () => {
    expectIgnored([
      '.env.example',
      '.env.sample',
      '.env.template',
      'packages/demo/.env.example',
      '.gitignore',
      '.github/workflows/deploy-pages.yml',
      '.github/workflows/ci.yml',
      'packages/demo/.github/workflows/deploy-pages.yml',
      '.github/ISSUE_TEMPLATE/bug.md',
      'README.md',
      'release-notes.md',
      'release_notes.md',
      'Release-Notes.md',
      'Release_Notes.txt',
      'index.html',
      'package.json',
      'package-lock.json',
      'scripts/generate-content.ts',
      'src/main.tsx',
      'src/lib/content.ts',
      'src/lib/render.ts',
      'src/internal/feature.ts',
      'src/notes/component.ts',
      'src/skills/component.ts',
      'content/schema/meetup.schema.json',
      'content/campaigns/meetups/joburg-q4-meetup.json',
      'content/themes/investec-classic.json',
      'content/Assets/InvestecDeveloper-Logo.png',
      'tests/release-config.test.ts',
      'tests/fixtures/git-ignore/HEAD',
      'tests/fixtures/git-ignore/refs/.gitkeep',
    ], false);
  });

  it('describes local photo processing accurately in page metadata', () => {
    const html = read('index.html');
    expect(html).toContain('Your photo is processed in your browser.');
    expect(html).not.toContain('Your photo never leaves your browser.');
  });
});
