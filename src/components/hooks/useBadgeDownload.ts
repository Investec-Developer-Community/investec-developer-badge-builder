import { useEffect, useRef, useState } from 'react';
import { EXPORT_SIZES, renderBadgeToBlob, sanitiseFilename } from '../../lib';
import type { BadgeFormat, BadgeInput } from '../../types';
import { badgeFilename } from '../badgeFormat';
import type { ShareSnapshot } from '../SharePanel';

export function useBadgeDownload() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [confettiBurst, setConfettiBurst] = useState(0);
  const [share, setShare] = useState<ShareSnapshot | null>(null);
  const downloadRef = useRef(0);

  useEffect(
    () => () => {
      downloadRef.current++;
    },
    [],
  );

  const download = async (input: BadgeInput, format: BadgeFormat, canDownload: boolean) => {
    if (!canDownload) return;
    const token = ++downloadRef.current;
    setBusy(true);
    setDownloadError('');
    setStatus('Creating your badge…');
    try {
      const blob = await renderBadgeToBlob(input);
      if (token !== downloadRef.current) return;
      if (blob.type !== 'image/png') throw new Error('The browser did not create a PNG image.');
      const filename = badgeFilename(sanitiseFilename({ campaignId: input.campaign.id, name: input.name, style: input.style }), format);
      const file = new File([blob], filename, { type: 'image/png' });
      const a = document.createElement('a');
      const url = URL.createObjectURL(file);
      let started = false;
      try {
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        started = true;
      } finally {
        a.remove();
        if (started) window.setTimeout(() => URL.revokeObjectURL(url), 10000);
        else URL.revokeObjectURL(url);
      }
      const { width, height } = EXPORT_SIZES[format];
      setStatus(`Download started: ${filename} (${width}×${height} PNG). Share it with the community.`);
      setConfettiBurst((burst) => burst + 1);
      setShare({ file, input });
    } catch (e) {
      if (token !== downloadRef.current) return;
      setStatus('');
      const message = e instanceof Error && e.message ? e.message : 'Unknown error';
      const punctuation = /[.!?]$/.test(message) ? '' : '.';
      setDownloadError(`Download failed: ${message}${punctuation} Please try again.`);
    } finally {
      if (token === downloadRef.current) setBusy(false);
    }
  };

  return { busy, status, setStatus, downloadError, setDownloadError, confettiBurst, share, download };
}
