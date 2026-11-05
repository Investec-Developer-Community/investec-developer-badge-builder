import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  DEFAULT_CROP,
  EXPORT_SIZES,
  MAX_ZOOM,
  cancelBadgeRender,
  clampCrop,
  loadedBadgeAssets,
  renderBadge,
  subscribeBadgeAssets,
  validateGithubUsername,
} from '../lib';
import type { BadgeFormat, BadgeInput, BadgeStyle, Campaign, Role, Theme } from '../types';
import { campaignMeta, roleDisplay, visibleTagline } from './campaignMeta';
import { FORMATS } from './badgeFormat';
import { Confetti } from './Confetti';
import { SharePanel } from './SharePanel';
import { useBadgeDownload } from './hooks/useBadgeDownload';
import { useBadgePhoto } from './hooks/useBadgePhoto';
import { useInitialsPhoto } from './hooks/useInitialsPhoto';
import { usePhotoCrop } from './hooks/usePhotoCrop';
import { matchesDownloadedBadge } from './share';

const PREVIEW_PX = 720;

interface Props {
  campaign: Campaign;
  theme: Theme;
  archived: boolean;
}

export function Builder({ campaign, theme, archived }: Props) {
  const [role, setRole] = useState<Role>(campaign.roles[0]);
  const [style, setStyle] = useState<BadgeStyle>('dark');
  const [format, setFormat] = useState<BadgeFormat>('square');
  const [name, setName] = useState('');
  const [sessionTitle, setSessionTitle] = useState('');
  const [projectName, setProjectName] = useState('');
  const [github, setGithub] = useState('');
  const [avatarGithub, setAvatarGithub] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const assets = useSyncExternalStore(subscribeBadgeAssets, loadedBadgeAssets, () => null);
  const { busy, status, setStatus, downloadError, setDownloadError, confettiBurst, share, download: downloadBadge } = useBadgeDownload();
  const { photo, photoError, crop, setCrop, fileRef, bitmap, selectPhoto, selectGithubAvatar, removePhoto } = useBadgePhoto(canvasRef, setStatus, setDownloadError);
  const { nudge, zoomBy, onPointerDown, onPointerMove, endDrag, onKeyDown } = usePhotoCrop(bitmap, crop, setCrop, format);
  const { initialsPhoto, initialsError, retryInitials } = useInitialsPhoto(name, theme[style], !bitmap && photo.kind !== 'loading', share?.input);
  const portrait = bitmap ?? initialsPhoto;

  const showSession = role === 'speaking' && campaign.fields.sessionTitle;
  const ghResult = useMemo(
    () => (campaign.fields.githubUsername ? validateGithubUsername(github) : ({ ok: true, value: '' } as const)),
    [campaign.fields.githubUsername, github],
  );
  const avatarGithubResult = useMemo(() => validateGithubUsername(avatarGithub), [avatarGithub]);

  const input: BadgeInput = useMemo(
    () => ({
      campaign,
      theme,
      style,
      format,
      role,
      name,
      photo: portrait,
      crop,
      details: {
        sessionTitle: showSession ? sessionTitle : undefined,
        projectName: campaign.fields.projectName ? projectName : undefined,
        githubUsername: ghResult.ok ? ghResult.value : undefined,
      },
    }),
    [campaign, theme, style, format, role, name, portrait, crop, showSession, sessionTitle, projectName, ghResult],
  );

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    renderBadge(ctx, input, PREVIEW_PX, assets ?? undefined);
    return () => cancelBadgeRender(ctx);
  }, [input, assets]);

  const nameOk = name.trim().length > 0;
  const canDownload = nameOk && !!portrait && photo.kind !== 'loading' && ghResult.ok && !busy;
  const missingItems = [
    !nameOk && 'your name',
    !ghResult.ok && 'a valid GitHub username',
  ].filter((item): item is string => Boolean(item));
  const missing =
    missingItems.length < 2
      ? missingItems[0]
      : `${missingItems.slice(0, -1).join(', ')} and ${missingItems[missingItems.length - 1]}`;

  const download = () => downloadBadge(input, format, canDownload);

  const meta = campaignMeta(campaign);
  const tagline = visibleTagline(campaign);

  return (
    <section className="builder" aria-labelledby="builder-title">
      <header className="builder-head">
        <div className="builder-title">
          <p className="eyebrow">Your selected campaign</p>
          <h2 id="builder-title">{campaign.title}</h2>
          <div className="chips">
            {campaign.demo && <span className="chip chip-demo">Demo campaign — not a live offer</span>}
            {archived && <span className="chip chip-archived">Archived</span>}
          </div>
          {meta && <p className="muted">{meta}</p>}
          {tagline && <p className="muted">{tagline}</p>}
          {campaign.bounty && <p className="muted">{campaign.bounty.challenge}</p>}
          {campaign.link && (
            <p>
              <a href={campaign.link} target="_blank" rel="noopener noreferrer">More about this campaign ↗</a>
            </p>
          )}
        </div>
      </header>

      <div className="builder-grid">
        <form className="panel form" onSubmit={(e) => { e.preventDefault(); void download(); }} noValidate>
          {campaign.roles.length > 1 ? (
            <fieldset>
              <legend>1 · Your role</legend>
              <div className="segmented" role="radiogroup">
                {campaign.roles.map((r) => (
                  <label key={r} className={role === r ? 'seg on' : 'seg'}>
                    <input type="radio" name="role" checked={role === r} onChange={() => setRole(r)} />
                    <span className="seg-mark" aria-hidden="true" />
                    {roleDisplay(r)}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <p className="role-fixed">
              Badge type: <strong>{roleDisplay(role)}</strong>
            </p>
          )}

          <fieldset>
            <legend>{campaign.roles.length > 1 ? '2' : '1'} · Your photo (optional)</legend>
            <input
              ref={fileRef}
              id="photo-input"
              className="sr-file"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => void selectPhoto(e.target.files?.[0])}
            />
            <div className="row">
              <label htmlFor="photo-input" className="btn btn-primary">
                {bitmap ? 'Replace photo' : 'Choose photo'}
              </label>
              {bitmap && (
                <button type="button" className="btn btn-ghost" onClick={removePhoto}>Remove</button>
              )}
            </div>
            <p className="hint">JPEG, PNG or WebP · up to 10 MB · at least 200×200 px. Processed on your device.</p>
            <p className="hint">Without a photo, your initials appear on the badge.</p>
            <label className="field">
              <span>GitHub username for avatar <em>(optional)</em></span>
              <input
                value={avatarGithub}
                maxLength={41}
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
                placeholder="@octocat"
                disabled={photo.kind === 'loading'}
                aria-invalid={!avatarGithubResult.ok}
                aria-describedby={avatarGithubResult.ok ? 'github-avatar-disclosure' : 'github-avatar-disclosure github-avatar-error'}
                onChange={(e) => setAvatarGithub(e.target.value)}
              />
            </label>
            {!avatarGithubResult.ok && <small id="github-avatar-error" className="error" role="alert">{avatarGithubResult.message}</small>}
            <p id="github-avatar-disclosure" className="hint">Selecting “Use GitHub avatar” sends your username and IP address to GitHub to fetch your avatar.</p>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!avatarGithubResult.ok || !avatarGithubResult.value || photo.kind === 'loading'}
              aria-describedby="github-avatar-disclosure"
              onClick={() => void selectGithubAvatar(avatarGithub)}
            >
              Use GitHub avatar
            </button>
            {photo.kind === 'loading' && <p className="hint">Loading {photo.fileName}…</p>}
            {photoError && <p className="error" role="alert">{photoError}</p>}
            {initialsError && (
              <p className="error" role="alert">
                {initialsError}{' '}
                <button type="button" className="linklike" onClick={retryInitials}>Retry</button>
              </p>
            )}

            {bitmap && (
              <div className="crop">
                <label className="field">
                  <span>Zoom ({crop.zoom.toFixed(1)}×)</span>
                  <input
                    type="range"
                    min={1}
                    max={MAX_ZOOM}
                    step={0.05}
                    value={crop.zoom}
                    onChange={(e) => setCrop((c) => clampCrop({ ...c, zoom: Number(e.target.value) }))}
                  />
                </label>
                <div className="row crop-buttons" role="group" aria-label="Adjust photo position and zoom">
                  <button type="button" className="btn btn-small" aria-label="Move photo left" onClick={() => nudge('left')}>←</button>
                  <button type="button" className="btn btn-small" aria-label="Move photo up" onClick={() => nudge('up')}>↑</button>
                  <button type="button" className="btn btn-small" aria-label="Move photo down" onClick={() => nudge('down')}>↓</button>
                  <button type="button" className="btn btn-small" aria-label="Move photo right" onClick={() => nudge('right')}>→</button>
                  <button type="button" className="btn btn-small" aria-label="Zoom out" onClick={() => zoomBy(-0.1)}>−</button>
                  <button type="button" className="btn btn-small" aria-label="Zoom in" onClick={() => zoomBy(0.1)}>+</button>
                  <button type="button" className="btn btn-small" onClick={() => setCrop(DEFAULT_CROP)}>Reset</button>
                </div>
                <p className="hint">Drag the photo in the preview, or use the arrow and zoom buttons.</p>
              </div>
            )}
          </fieldset>

          <fieldset>
            <legend>{campaign.roles.length > 1 ? '3' : '2'} · Your details</legend>
            <label className="field">
              <span>Name <em>(required)</em></span>
              <input value={name} maxLength={60} autoComplete="name" placeholder="Ada Lovelace" onChange={(e) => setName(e.target.value)} />
            </label>
            {showSession && (
              <label className="field">
                <span>Session title <em>(optional)</em></span>
                <input value={sessionTitle} maxLength={100} onChange={(e) => setSessionTitle(e.target.value)} />
              </label>
            )}
            {campaign.fields.projectName && (
              <label className="field">
                <span>Project name <em>(optional)</em></span>
                <input value={projectName} maxLength={60} onChange={(e) => setProjectName(e.target.value)} />
              </label>
            )}
            {campaign.fields.githubUsername && (
              <label className="field">
                <span>GitHub username <em>(optional)</em></span>
                <input
                  value={github}
                  maxLength={41}
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="@octocat"
                  aria-invalid={!ghResult.ok}
                  aria-describedby={!ghResult.ok ? 'gh-error' : undefined}
                  onChange={(e) => setGithub(e.target.value)}
                />
                {!ghResult.ok && <small id="gh-error" className="error" role="alert">{ghResult.message}</small>}
              </label>
            )}
          </fieldset>

          <fieldset>
            <legend>{campaign.roles.length > 1 ? '4' : '3'} · Badge style</legend>
            <p className="group-label" id="style-colour-label">Colour</p>
            <div className="segmented" role="radiogroup" aria-labelledby="style-colour-label">
              {(['dark', 'light'] as const).map((s) => (
                <label key={s} className={style === s ? 'seg on' : 'seg'}>
                  <input type="radio" name="style" checked={style === s} onChange={() => setStyle(s)} />
                  <span className="seg-mark" aria-hidden="true" />
                  {s === 'dark' ? 'Dark' : 'Light'}
                </label>
              ))}
            </div>
            <p className="group-label" id="style-format-label">Format</p>
            <div className="segmented" role="radiogroup" aria-labelledby="style-format-label" aria-describedby="style-format-hint">
              {FORMATS.map((f) => (
                <label key={f.id} className={format === f.id ? 'seg on' : 'seg'}>
                  <input type="radio" name="format" checked={format === f.id} onChange={() => setFormat(f.id)} />
                  <span className="seg-mark" aria-hidden="true" />
                  {f.label}
                </label>
              ))}
            </div>
            <p className="hint" id="style-format-hint">Portrait takes up more space in the mobile feed.</p>
          </fieldset>
        </form>

        <div className={`panel preview preview-${format}`}>
          <h3>Badge preview</h3>
          <div
            className="canvas-wrap"
            tabIndex={0}
            role="group"
            aria-label={bitmap ? 'Badge preview. Use arrow keys to move the photo and plus or minus to zoom.' : 'Badge preview'}
            onKeyDown={onKeyDown}
          >
            <canvas
              ref={canvasRef}
              width={PREVIEW_PX}
              height={Math.round((PREVIEW_PX * EXPORT_SIZES[format].height) / EXPORT_SIZES[format].width)}
              className={bitmap ? 'draggable' : undefined}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            />
          </div>
          <div className="actions">
            <button type="button" className="btn btn-primary btn-big" disabled={!canDownload} onClick={() => void download()}>
              {busy ? 'Creating your badge…' : 'Download PNG'}
            </button>
            {!canDownload && !busy && (
              missing
                ? <p className="hint">Add {missing} to enable download.</p>
                : !initialsError && <p className="hint">Preparing your badge…</p>
            )}
          </div>
          {downloadError && (
            <p className="error" role="alert">
              {downloadError}{' '}
              <button type="button" className="linklike" onClick={() => void download()}>Retry</button>
            </p>
          )}
        </div>
      </div>
      <p className="status" role="status" aria-live="polite">{status}</p>
      {share && (
        <SharePanel
          campaign={campaign}
          snapshot={share}
          current={photo.kind !== 'loading' && ghResult.ok && matchesDownloadedBadge(share.input, input)}
        />
      )}
      <Confetti burst={confettiBurst} />
    </section>
  );
}
