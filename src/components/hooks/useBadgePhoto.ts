import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { DEFAULT_CROP, cancelBadgeRender, loadPhoto, validateGithubUsername } from '../../lib';
import type { Crop, ValidationResult } from '../../types';

type PhotoState =
  | { kind: 'none' }
  | { kind: 'loading'; fileName: string }
  | { kind: 'ready'; bitmap: ImageBitmap; fileName: string };

export function useBadgePhoto(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  setStatus: Dispatch<SetStateAction<string>>,
  setDownloadError: Dispatch<SetStateAction<string>>,
) {
  const [photo, setPhoto] = useState<PhotoState>({ kind: 'none' });
  const [photoError, setPhotoError] = useState('');
  const [crop, setCrop] = useState<Crop>(DEFAULT_CROP);
  const fileRef = useRef<HTMLInputElement>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const selectionRef = useRef(0);
  const avatarRequestRef = useRef<AbortController | null>(null);

  const releasePhoto = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) cancelBadgeRender(ctx);
    bitmapRef.current?.close();
    bitmapRef.current = null;
  }, [canvasRef]);

  useEffect(
    () => () => {
      selectionRef.current++;
      avatarRequestRef.current?.abort();
      avatarRequestRef.current = null;
      releasePhoto();
    },
    [releasePhoto],
  );

  const beginSelection = (fileName: string) => {
    const token = ++selectionRef.current;
    avatarRequestRef.current?.abort();
    avatarRequestRef.current = null;
    setPhotoError('');
    setStatus('');
    setDownloadError('');
    setPhoto({ kind: 'loading', fileName });
    return token;
  };

  const finishSelection = (
    token: number,
    fileName: string,
    result: ValidationResult<ImageBitmap>,
    loadedMessage: string,
    previousMessage: string,
  ) => {
    if (token !== selectionRef.current) {
      if (result.ok) result.value.close();
      return false;
    }
    if (!result.ok) {
      setPhotoError(result.message);
      setPhoto(bitmapRef.current ? { kind: 'ready', bitmap: bitmapRef.current, fileName: 'current photo' } : { kind: 'none' });
      if (bitmapRef.current) setStatus(previousMessage);
      else setStatus('');
      return false;
    }
    releasePhoto();
    bitmapRef.current = result.value;
    setCrop(DEFAULT_CROP);
    setPhoto({ kind: 'ready', bitmap: result.value, fileName });
    setStatus(loadedMessage);
    return true;
  };

  const selectPhoto = async (file: File | undefined) => {
    if (!file) return;
    const token = beginSelection(file.name);
    let result: ValidationResult<ImageBitmap>;
    try {
      result = await loadPhoto(file);
    } catch {
      result = { ok: false, message: 'We could not read that image. Please try another photo.' };
    }
    finishSelection(
      token,
      file.name,
      result,
      'Photo loaded.',
      'We couldn’t use the new photo, so your previous photo is still selected.',
    );
  };

  const selectGithubAvatar = async (username: string) => {
    const validated = validateGithubUsername(username);
    if (!validated.ok || !validated.value) {
      setPhotoError(validated.ok ? 'Enter a GitHub username to load your avatar.' : validated.message);
      return;
    }
    const fileName = 'GitHub avatar';
    const token = beginSelection(fileName);
    const controller = new AbortController();
    avatarRequestRef.current = controller;
    setStatus('Loading GitHub avatar…');
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 15000);
    let result: ValidationResult<ImageBitmap>;
    try {
      const response = await fetch(`https://avatars.githubusercontent.com/${encodeURIComponent(validated.value)}?size=512`, {
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) {
        result = { ok: false, message: 'GitHub could not provide that avatar. Check the username and try again.' };
      } else {
        const blob = await response.blob();
        if (token !== selectionRef.current) return;
        result = await loadPhoto(new File([blob], fileName, { type: blob.type }));
      }
    } catch {
      result = {
        ok: false,
        message: timedOut
          ? 'GitHub took too long to respond. Please try again.'
          : 'We couldn’t load that GitHub avatar. Check the username and try again.',
      };
    } finally {
      window.clearTimeout(timeout);
      if (avatarRequestRef.current === controller) avatarRequestRef.current = null;
    }
    if (finishSelection(
      token,
      fileName,
      result,
      'GitHub avatar loaded.',
      'We couldn’t use the GitHub avatar, so your previous photo is still selected.',
    ) && fileRef.current) {
      fileRef.current.value = '';
    }
  };

  const removePhoto = () => {
    selectionRef.current++;
    avatarRequestRef.current?.abort();
    avatarRequestRef.current = null;
    releasePhoto();
    setPhoto({ kind: 'none' });
    setPhotoError('');
    setCrop(DEFAULT_CROP);
    setStatus('Photo removed.');
    if (fileRef.current) fileRef.current.value = '';
  };

  const bitmap = photo.kind === 'ready' ? photo.bitmap : null;
  return { photo, photoError, crop, setCrop, fileRef, bitmap, selectPhoto, selectGithubAvatar, removePhoto };
}
