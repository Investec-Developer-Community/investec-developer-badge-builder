import { useCallback, useEffect, useRef, useState } from 'react';
import { activeCounts, findTheme, listActiveCampaigns, loadCampaign, loadInitialContent } from './lib';
import type { Campaign, CampaignSummary, ContentIndex, Programme, Theme } from './types';
import { Builder } from './components/Builder';
import { SampleBadge } from './components/SampleBadge';
import { campaignMeta, visibleTagline } from './components/campaignMeta';
import logo from '../content/Assets/InvestecDeveloper-Logo.png';

type Notice = { kind: 'malformed' | 'unavailable' | 'load-failed'; message: string; retryId?: string };
type Selection = { campaign: Campaign; archived: boolean };

const PROGRAMMES: { id: Programme; label: string }[] = [
  { id: 'meetup', label: 'Meetups' },
  { id: 'bounty', label: 'Bounties' },
];

function setUrlCampaign(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('campaign', id);
  else url.searchParams.delete('campaign');
  window.history.replaceState(null, '', url);
}

export function App() {
  const [content, setContent] = useState<{ index: ContentIndex; themes: Theme[] } | null>(null);
  const [loadError, setLoadError] = useState('');
  const [programme, setProgramme] = useState<Programme>('meetup');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const builderRef = useRef<HTMLDivElement>(null);
  const pickToken = useRef(0);

  const openCampaign = useCallback(async (id: string, opts?: { archived?: boolean }) => {
    const token = ++pickToken.current;
    setLoadingId(id);
    setNotice(null);
    try {
      const campaign = await loadCampaign(id);
      if (token !== pickToken.current) return;
      setSelection({ campaign, archived: opts?.archived ?? campaign.archived });
      setProgramme(campaign.programme);
      setUrlCampaign(id);
    } catch {
      if (token !== pickToken.current) return;
      setNotice({ kind: 'load-failed', message: 'We could not load that campaign. Please try again.', retryId: id });
    } finally {
      if (token === pickToken.current) setLoadingId(null);
    }
  }, []);

  const init = useCallback(async () => {
    setLoadError('');
    setContent(null);
    try {
      const { index, themes, resolution } = await loadInitialContent(window.location.search);
      setContent({ index, themes });
      const res = await resolution;
      if (!res) return;
      if (res.ok) {
        setSelection({ campaign: res.campaign, archived: res.archived });
        setProgramme(res.campaign.programme);
      } else {
        const id = new URLSearchParams(window.location.search).get('campaign') ?? undefined;
        setNotice({ ...res.error, retryId: res.error.kind === 'load-failed' ? id : undefined });
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Unknown error');
    }
  }, []);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (selection) builderRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }, [selection?.campaign.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchProgramme = (p: Programme) => {
    setProgramme(p);
    if (selection && selection.campaign.programme !== p) {
      pickToken.current++;
      setSelection(null);
      setUrlCampaign(null);
    }
  };

  const retryNotice = (n: Notice) => {
    if (!n.retryId) return;
    if (content) void openCampaign(n.retryId);
    else void init();
  };

  const theme = selection && content ? findTheme(content.themes, selection.campaign.theme) : undefined;
  const counts = content ? activeCounts(content.index) : null;
  const cards = content ? listActiveCampaigns(content.index, programme) : [];
  const sampleCampaign = content?.index.sampleCampaign;
  const sampleTheme = sampleCampaign && content ? findTheme(content.themes, sampleCampaign.theme) : undefined;

  return (
    <div className="app">
      <header className="masthead">
        <img className="brand-logo" src={logo} alt="Investec Developer" />
        <p>Made for the developer community</p>
      </header>
      <main>
        <div className="landing">
          <div className="hero">
            <h1>Create an <span>Investec Developer badge</span></h1>
            <p className="lead">Choose a meetup or bounty, add your details and photo, then download your badge to share with the community</p>
          </div>

          {sampleCampaign && sampleTheme && (
            <aside className="landing-sample" aria-label="Example badge">
              <SampleBadge campaign={sampleCampaign} theme={sampleTheme} />
            </aside>
          )}

          <div className="landing-picker">
            {loadError && (
              <div className="notice notice-error" role="alert">
                <p><strong>We couldn’t load the campaigns.</strong> {loadError}</p>
                <button type="button" className="btn btn-primary" onClick={() => void init()}>Retry</button>
              </div>
            )}
            {!content && !loadError && <p className="loading" role="status">Loading campaigns…</p>}

            {notice && (
              <div className={`notice ${notice.kind === 'load-failed' ? 'notice-error' : 'notice-info'}`} role="alert">
                <p>
                  <strong>{notice.kind === 'load-failed' ? 'Something went wrong.' : 'Campaign not found.'}</strong>{' '}
                  {notice.message}
                  {notice.kind !== 'load-failed' && ' Choose one of the campaigns below instead.'}
                </p>
                {notice.kind === 'load-failed' && (
                  <button type="button" className="btn btn-primary" onClick={() => retryNotice(notice)}>Retry</button>
                )}
              </div>
            )}

            {content && counts && (
              <>
                <div className="campaign-heading">
                  <p className="eyebrow">Get started</p>
                  <h2>Choose a campaign</h2>
                  <p>Choose a programme, then select a meetup or bounty.</p>
                </div>
                <div className="tabs" role="tablist" aria-label="Programme">
                  {PROGRAMMES.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      role="tab"
                      id={`tab-${p.id}`}
                      aria-selected={programme === p.id}
                      aria-controls="campaign-panel"
                      tabIndex={programme === p.id ? 0 : -1}
                      className={programme === p.id ? 'tab on' : 'tab'}
                      onClick={() => switchProgramme(p.id)}
                      onKeyDown={(event) => {
                        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                        event.preventDefault();
                        const next = PROGRAMMES.find((item) => item.id !== p.id);
                        if (next) {
                          switchProgramme(next.id);
                          document.getElementById(`tab-${next.id}`)?.focus();
                        }
                      }}
                    >
                      {p.label}
                      <span className="count" aria-label={`${counts[p.id]} active`}>{counts[p.id]}</span>
                    </button>
                  ))}
                </div>

                <div id="campaign-panel" role="tabpanel" aria-labelledby={`tab-${programme}`}>
                  {cards.length === 0 ? (
                    <p className="empty">No active {programme === 'meetup' ? 'meetups' : 'bounties'} right now — check back soon.</p>
                  ) : (
                    <ul className="cards">
                      {cards.map((c) => (
                        <li key={c.id}>
                          <Card
                            summary={c}
                            selected={selection?.campaign.id === c.id}
                            loading={loadingId === c.id}
                            onPick={() => void openCampaign(c.id)}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {content && (
          <div ref={builderRef} className="builder-anchor">
            {selection && theme && selection.campaign.programme === programme && (
              <Builder key={selection.campaign.id} campaign={selection.campaign} theme={theme} archived={selection.archived} />
            )}
            {selection && !theme && (
              <div className="notice notice-error" role="alert">This campaign’s design is missing, so a badge can’t be built.</div>
            )}
          </div>
        )}
      </main>

      <footer>
        <p>Your photo and details stay in this browser while you create your badge. Reloading clears the form; downloading or sharing saves or sends the badge as you choose.</p>
      </footer>
    </div>
  );
}

function Card({ summary, selected, loading, onPick }: {
  summary: CampaignSummary;
  selected: boolean;
  loading: boolean;
  onPick: () => void;
}) {
  const meta = campaignMeta(summary);
  const tagline = visibleTagline(summary);
  return (
    <button
      type="button"
      className={selected ? 'card on' : 'card'}
      aria-pressed={selected}
      onClick={onPick}
    >
      <span className="card-indicator" aria-hidden="true" />
      <span className="card-content">
        <span className="card-title">{summary.title}</span>
        {meta && <span className="card-meta">{meta}</span>}
        {tagline && <span className="card-tag">{tagline}</span>}
        {(loading || selected) && <span className="card-cta">{loading ? 'Loading…' : 'Selected'}</span>}
      </span>
      {summary.demo && <span className="chip chip-demo">Demo</span>}
    </button>
  );
}
