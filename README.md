# Investec Developer Badge Builder

A static web app where community members create personalised, branded badges for meetups and bounty projects. Visitors pick a campaign, add their name and optional details, preview the badge, and download it as a PNG: square 1080×1080 (default) or portrait 1080×1350 (4:5). A photo is optional: without one, the badge uses generated initials.

After a download, a share panel offers an editable first-person caption, **Open LinkedIn**, **Copy caption**, a **Share image** button when the browser can share PNG files, and **Copy invite link** (copies the campaign link). Captions use `shareTitle` or the campaign title; meetup captions include the date and `venueShort`, falling back to the full venue when the short venue is missing or empty. **Open LinkedIn** tries to copy the caption, but cannot attach a local image: upload the downloaded PNG yourself, paste the caption and type @Investec to tag us. Native sharing also tries to copy the caption because destinations may omit shared text. Clipboard access is best effort: look for the copied confirmation, or use **Copy caption** and its manual-copy fallback. If you change the badge, download it again before sharing; your edited caption is kept for the current campaign.

Uploaded photos, generated initials and entered badge details are processed locally in your browser; the app does not upload them during creation. Every campaign also offers an optional **Use GitHub avatar** control: selecting it sends the entered avatar username and your IP address to GitHub to fetch the image. Typing a username alone does not fetch it. The avatar username is separate from the optional GitHub username printed on the badge and does not fill that field. Reloading clears the form. Downloading saves a badge on the device; sharing sends it to the destination the visitor chooses.

The app is a Vite + React + TypeScript build with no backend. Campaigns and visual themes are plain JSON files, validated at build time, and built as static files for GitHub Pages.

## Prerequisites

- **Node.js** `^20.19.0 || ^22.12.0 || >=24.0.0` (Node 24.13.1 is used by the Pages workflow). Node 21 and 23 are not in the supported tooling range.
- npm (ships with Node)
- Git (required by the release-configuration tests)

## Quick start

```bash
npm ci
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173/investec-developer-badge-builder/`).

`npm run dev` first validates and regenerates the content in `public/generated/`, then starts the dev server. If a campaign file is invalid, the command exits with an error that names the file and the problem. Content JSON is not continuously regenerated: after editing it, run `npm run content` in a second terminal and reload the page, or restart `npm run dev`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Regenerates content, then starts the Vite dev server with hot reload. |
| `npm run build` | Type-checks, then builds the production site into `dist/`. Regenerates content first. |
| `npm run preview` | Serves the last production build from `dist/` for a local check. Run `npm run build` first. |
| `npm run typecheck` | Regenerates content, then runs `tsc --noEmit`. |
| `npm test` | Regenerates content, then runs the Vitest suite once. |
| `npm run content` | Validates the JSON in `content/` and writes `public/generated/`. Run it alone to check content changes. |

## Running the tests

```bash
npm test
```

The suite uses Vitest and lives in `tests/`:

- `tests/content.test.ts` covers campaign and theme parsing (defaults, drafts, archived flag, https-only links, unknown themes) and checks that the shipped content is valid.
- `tests/logic.test.ts` covers photo and username validation, file name sanitising, crop clamping, and deep-link resolution.
- `tests/render.test.ts` exercises badge layout and export logic with mocked canvas objects.
- `tests/campaignMeta.test.ts` covers campaign display metadata.
- `tests/campaign-runtime.test.ts` covers runtime campaign validation and mocked loading.
- `tests/asset-loading.test.ts` covers logo loading failures and timeouts with mocked images.
- `tests/release-config.test.ts` checks the Pages test gate, Node versions and Git's private-file ignore behavior.
- `tests/share.test.ts` covers captions, downloaded-image freshness, native-share capability and outcomes, and the portrait file name.
- `tests/content-build.test.ts`, `tests/browser-bundle.test.ts` and `tests/metadata.test.ts` cover date-based archiving, generated index metadata, browser-bundle boundaries, and site metadata/icons.

The suite is primarily unit tests with mocked canvas objects; some checks also build bundles in memory, and the release-configuration checks exercise Git against a read-only metadata fixture. It does not prove browser rendering or native downloads. There is no committed automated browser test suite. To run one file or test name, including content generation:

```bash
npm test -- tests/logic.test.ts
npm test -- -t "clampCrop"
```

### Manual browser check

After `npm run dev`, check the main flow by hand using a test name and non-personal images:

1. Pick a meetup or bounty campaign and confirm the builder opens.
2. Enter a name, leave the photo empty, and download a badge with initials. Optionally enter a GitHub username in the badge details if that field is enabled (the `@` prefix is optional).
3. Upload a JPEG, PNG, or WebP up to 10 MB (10 × 1024 × 1024 bytes), at least 200×200 pixels. Check that an oversized or too-small image is rejected. Drag with a mouse to crop, or use the arrow buttons and zoom slider. Tab to focus the badge preview before using arrow keys to move the photo and `+`/`-` to zoom.
4. On either campaign type, try the separate avatar control with a permitted test account. Typing alone should not load an image; selecting **Use GitHub avatar** makes the disclosed GitHub request. Check that it does not fill the badge’s GitHub detail field. Remove the image to return to initials.
5. Confirm square downloads are 1080×1080; switch **Format** to Portrait 4:5 and confirm 1080×1350. Filenames combine sanitised, truncated lowercase ASCII slugs for campaign, name and style; the name is omitted if it has no usable characters. Portrait adds `-portrait` before `.png`.
6. After downloading, check the caption, **Open LinkedIn**, **Copy caption** and **Copy invite link**. Only expect a copied confirmation when clipboard access succeeds; use the manual-copy fallback if needed. LinkedIn requires manual PNG upload. Where available, try **Share image** and cancel without posting.
7. Edit the caption and change the badge. Confirm **Share image** (if present) and **Open LinkedIn** are unavailable until another download, then check the preserved caption.
8. At ≤900px wide, confirm the compact preview stays pinned at the top while you edit. On a touch device, check horizontal photo dragging and vertical page scrolling; use arrow buttons for vertical photo adjustment. Pinch gestures zoom the page, not the photo; use the photo zoom controls.
9. Open a deep link such as `http://localhost:5173/investec-developer-badge-builder/?campaign=joburg-q4-meetup` and confirm that campaign is selected.

## Content

Campaigns and themes are data, not code. The JSON Schemas in `content/schema/` describe the available fields:

- `content/campaigns/meetups/<id>.json` and `content/campaigns/bounties/<id>.json` hold one campaign each. The filename is the stable ID used in deep links.
- `content/themes/*.json` holds the visual themes.
- `content/schema/*.schema.json` holds the authoritative build-validation schemas, also used by editors.
- Draft campaigns are omitted from generated site content. Their source files remain visible in a public repository: **draft does not mean confidential**. Archived campaigns remain available by direct link. Active meetups and bounties are automatically archived on the next build after their date or deadline, using the `Africa/Johannesburg` calendar.

For meetup captions, use a compact `venueShort` without a street address. Missing or empty short venues fall back to the full venue, so addresses can appear in captions.

Run `npm run content` after editing, then reload the page if the dev server is running. It reports every error and exits non-zero if anything is wrong, so bad content never reaches a build. Deprecated theme fields are ignored with file-specific warnings for one release and should be removed.

## Deep links

- `?campaign=<id>` opens a specific campaign directly.
- Unknown and draft IDs both show an "unavailable" state.
- Archived campaigns open with an Archived chip.

## Project layout

```
content/          Campaign, theme and schema JSON (source of truth)
scripts/          generate-content.ts validates content into public/generated/
public/generated/ Build output consumed by the app (generated, do not edit)
src/              React app: App.tsx, components/, styles.css
src/lib/          Pure logic shared by the app and tests (validators, rendering, content loading)
tests/            Vitest suites
```

## Deployment

Source repository: https://github.com/Investec-Developer-Community/investec-developer-badge-builder

Expected site: https://investec-developer-community.github.io/investec-developer-badge-builder/

Vite's `base` is `/investec-developer-badge-builder/`. Runtime content, bundled logos, metadata icons and the web manifest resolve under that project path. Preview the production build locally with `npm run build && npm run preview`, then open the project path printed by Vite. Deep links use `?campaign=<id>`, so no SPA fallback or custom 404 page is needed.

Publishing requirements:

1. Review the files intended for publication and confirm asset and dependency rights. For a public source release, ensure the repository visibility is **Public**; otherwise Pages requires an eligible GitHub plan and organisation policy. No license has been selected: choosing an appropriate source license is an optional owner decision, separate from permission to redistribute brand assets. The ignore policy excludes local agent/tool configuration, private planning, notes and credentials; the local Git attributes file is also excluded because it only configures internal team state. Internal design/style documentation is intentionally private: preserve its ignore rules and do not publish it. Only put placeholders in permitted environment templates. `.gitignore` is not a substitute for review: it does not remove tracked files or protect history, manual uploads or force-added files.
2. Enable Actions and select **GitHub Actions** as the source in **Settings → Pages**. Ensure repository and `github-pages` environment policies allow the workflow to deploy.
3. The [Deploy to GitHub Pages workflow](.github/workflows/deploy-pages.yml) runs `npm ci`, content validation, type checking, tests and the build. Pull requests build without publishing; pushes to `main` deploy after a successful build. A manual workflow dispatch can deploy its selected branch, subject to environment policies.
4. Check the Actions run and the resulting Pages URL, including a `?campaign=<id>` link under the deployed path. A failed validation, test or build does not replace the last successful deployment.

No deployment secrets, environment variables, backend or custom domain are required. If the first deployment fails because Pages is not enabled, complete step 2 and rerun the failed workflow from the Actions tab. A successful build alone does not mean the site is live.
