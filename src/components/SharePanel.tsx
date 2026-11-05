import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { buildCampaignUrl } from '../lib';
import type { BadgeInput, Campaign } from '../types';
import { LINKEDIN_SHARE_URL, buildCaption, canShareFile, shareBadge } from './share';

export interface ShareSnapshot {
  /** The exact PNG that was downloaded (kept in memory only, for the native share sheet). */
  file: File;
  input: BadgeInput;
}

type CopyKey = 'caption' | 'invite';
type ShareFeedback = { file: File; kind: 'copied' | 'manual' | 'failed' };

/** Post-download helper: caption, LinkedIn hand-off, native share and invite link. */
export function SharePanel({ campaign, snapshot, current }: { campaign: Campaign; snapshot: ShareSnapshot; current: boolean }) {
  const ids = useId();
  const suggestedCaption = buildCaption(snapshot.input);
  const [editedCaption, setEditedCaption] = useState<string | null>(null);
  const caption = editedCaption ?? suggestedCaption;
  const [copied, setCopied] = useState<CopyKey | null>(null);
  const [manual, setManual] = useState<CopyKey | null>(null);
  const [shareFeedback, setShareFeedback] = useState<ShareFeedback | null>(null);
  const [sharingFile, setSharingFile] = useState<File | null>(null);
  const [linkedInCopied, setLinkedInCopied] = useState(false);
  const canShare = useMemo(() => canShareFile(snapshot.file), [snapshot.file]);
  const timer = useRef<number | undefined>(undefined);
  const shareSequence = useRef(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const captionRef = useRef<HTMLTextAreaElement>(null);
  const inviteRef = useRef<HTMLInputElement>(null);
  const inviteUrl = buildCampaignUrl(campaign.id);
  const feedback = current && shareFeedback?.file === snapshot.file ? shareFeedback.kind : null;

  useEffect(() => {
    window.clearTimeout(timer.current);
    setCopied(null);
    setManual(null);
    setLinkedInCopied(false);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    headingRef.current?.scrollIntoView?.({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [snapshot.file]);

  useEffect(() => {
    return () => {
      window.clearTimeout(timer.current);
      shareSequence.current++;
    };
  }, []);

  const copy = async (key: CopyKey, text: string) => {
    window.clearTimeout(timer.current);
    setCopied(null);
    try {
      await navigator.clipboard.writeText(text);
      setManual(null);
      setCopied(key);
      timer.current = window.setTimeout(() => setCopied(null), 2500);
    } catch {
      setManual(key);
      const field = { caption: captionRef, invite: inviteRef }[key];
      timer.current = window.setTimeout(() => {
        field.current?.focus();
        field.current?.select();
      }, 0);
    }
  };

  const shareImage = async () => {
    if (!current || sharingFile === snapshot.file) return;
    const file = snapshot.file;
    const sequence = ++shareSequence.current;
    setSharingFile(file);
    setShareFeedback(null);
    setLinkedInCopied(false);
    const result = await shareBadge(navigator, { files: [file], title: snapshot.input.campaign.shareTitle ?? snapshot.input.campaign.title, text: caption });
    if (sequence !== shareSequence.current) return;
    setSharingFile((previous) => previous === file ? null : previous);
    if (result.kind === 'shared') {
      setShareFeedback({ file, kind: result.captionCopied ? 'copied' : 'manual' });
    } else if (result.kind === 'failed') {
      setShareFeedback({ file, kind: 'failed' });
    }
  };

  // No preventDefault: LinkedIn opens as normal while the caption copy runs alongside.
  const openLinkedIn = () => {
    setShareFeedback(null);
    setLinkedInCopied(false);
    try {
      navigator.clipboard?.writeText(caption).then(() => setLinkedInCopied(true), () => undefined);
    } catch {
      // No clipboard access; the steps still say to paste the caption, and Copy caption has a manual fallback.
    }
  };

  const copyLabel = (key: CopyKey, idle: string, done: string) =>
    copied === key ? (
      <>
        <span aria-hidden="true">✓</span> {done}
      </>
    ) : (
      idle
    );
  const manualHint = (key: CopyKey) =>
    manual === key && <p className="hint" role="alert">Couldn’t copy automatically — the text is selected, so copy it using your keyboard or device controls.</p>;

  return (
    <section className="share" aria-labelledby={`${ids}-title`}>
      <h3 id={`${ids}-title`} ref={headingRef} tabIndex={-1}>Share your badge</h3>
      <p className="muted share-lead">Your badge is saved to your device. Here’s a caption to start from — rewrite it in your own words if you like.</p>
      {!current && (
        <p id={`${ids}-stale`} className="notice notice-info" role="status">
          Your badge has changed since your last download. Download it again to update the PNG before sharing. Your edited caption will be kept.
        </p>
      )}

      <div className="share-block">
        <label className="field">
          <span>Caption <em>Editable</em></span>
          <textarea
            ref={captionRef}
            rows={6}
            value={caption}
            onChange={(e) => setEditedCaption(e.target.value === suggestedCaption ? null : e.target.value)}
          />
        </label>
        <div className="row">
          {canShare && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!current || sharingFile === snapshot.file}
              aria-describedby={current ? undefined : `${ids}-stale`}
              onClick={() => void shareImage()}
            >
              Share image
            </button>
          )}
          {current ? (
            <a className={canShare ? 'btn btn-secondary' : 'btn btn-primary'} href={LINKEDIN_SHARE_URL} target="_blank" rel="noopener noreferrer" onClick={openLinkedIn}>
              Open LinkedIn<span className="sr-only"> (opens in a new tab)</span> <span aria-hidden="true">↗</span>
            </a>
          ) : (
            <button type="button" className={canShare ? 'btn btn-secondary' : 'btn btn-primary'} disabled aria-describedby={`${ids}-stale`}>
              Open LinkedIn <span aria-hidden="true">↗</span>
            </button>
          )}
          <button type="button" className={copied === 'caption' ? 'btn btn-secondary copied' : 'btn btn-secondary'} onClick={() => void copy('caption', caption)}>
            {copyLabel('caption', 'Copy caption', 'Caption copied')}
          </button>
        </div>
        {manualHint('caption')}
        <ol className="share-steps">
          <li>Add the badge image you downloaded.</li>
          <li>Paste the caption.</li>
          <li>Type Investec Developer and pick the page to tag us.</li>
        </ol>
        {linkedInCopied && <p className="hint" role="status">Caption copied — paste it into your post.</p>}
        {feedback === 'copied' && <p className="hint" role="status">Caption copied too — paste it if the app leaves the text out.</p>}
        {feedback === 'manual' && <p className="hint" role="status">If the app leaves the caption out, use “Copy caption” and paste it.</p>}
        {feedback === 'failed' && <p className="error" role="alert">Sharing didn’t work on this device. Use “Open LinkedIn” and upload the downloaded image instead.</p>}
      </div>

      <div className="share-block share-invite">
        <p>
          {campaign.programme === 'bounty'
            ? 'Know someone who should enter? Send them the link.'
            : 'Bringing someone? Send them the link to make their own badge.'}
        </p>
        <div className="row">
          <button type="button" className={copied === 'invite' ? 'btn btn-secondary copied' : 'btn btn-secondary'} onClick={() => void copy('invite', inviteUrl)}>
            {copyLabel('invite', 'Copy invite link', 'Link copied')}
          </button>
        </div>
        {manual === 'invite' && (
          <label className="field">
            <span>Copy this link manually</span>
            <input ref={inviteRef} readOnly value={inviteUrl} onFocus={(e) => e.currentTarget.select()} />
          </label>
        )}
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {copied === 'caption' ? 'Caption copied.' : copied === 'invite' ? 'Link copied.' : ''}
      </p>
    </section>
  );
}
