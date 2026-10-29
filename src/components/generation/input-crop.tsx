'use client';

import {useEffect, useRef, useState} from 'react';
import {bindReadyCrop, centerCrop, confirmCrop, sameCropRevision} from './crop-consent.ts';
import type {AspectRatio, CropConsent, CropRevision, CropScope, ReadyCrop} from './crop-consent.ts';

const MAX_BYTES = 20 * 1024 * 1024;
type Preview = Readonly<{url: string; revision: CropRevision; ready: ReadyCrop | null}>;
export type CropChange = Readonly<{revision: number; consent: CropConsent | null}>;
class CropError extends Error {}

async function normalizeImage(file: File, aspectRatio: AspectRatio) {
  if (!['image/jpeg', 'image/png'].includes(file.type) || file.size === 0 || file.size > MAX_BYTES) throw new CropError('Choose a JPEG or PNG image up to 20 MiB.');
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 64_000_000) throw new CropError('Choose an image with at most 64 megapixels.');
    const crop = centerCrop(bitmap.width, bitmap.height, aspectRatio);
    const canvas = document.createElement('canvas');
    canvas.width = crop.outputWidth; canvas.height = crop.outputHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new CropError('Image cropping is unavailable in this browser.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new CropError('The image could not be normalized.')), 'image/jpeg', 0.92));
    if (blob.size > MAX_BYTES) throw new CropError('The normalized crop exceeds 20 MiB.');
    const bytes = await blob.arrayBuffer();
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (value) => value.toString(16).padStart(2, '0')).join('');
    const chunks: string[] = [];
    const array = new Uint8Array(bytes);
    for (let offset = 0; offset < array.length; offset += 32768) chunks.push(String.fromCharCode(...array.subarray(offset, offset + 32768)));
    return {blob, sha256, width: canvas.width, height: canvas.height, contentBase64: btoa(chunks.join(''))};
  } finally {
    bitmap.close();
  }
}

/** Parent keys this component by workspace/model/catalog/aspect, isolating each consent session. */
export function InputCrop({scope, disabled, onChange}: Readonly<{scope: CropScope; disabled: boolean; onChange: (change: CropChange) => void}>) {
  const current = useRef<CropRevision>({...scope, revision: 0});
  const request = useRef<AbortController | null>(null);
  const previewUrl = useRef<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [seen, setSeen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [status, setStatus] = useState('Choose an image you own or have permission to use.');
  const [error, setError] = useState('');
  useEffect(() => () => {
    current.current = {...current.current, revision: current.current.revision + 1};
    request.current?.abort();
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
  }, []);

  async function selectImage(file?: File): Promise<void> {
    const revision = {...scope, revision: current.current.revision + 1};
    current.current = revision;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    setPreview(null); setSeen(false); setConfirmed(false); setError('');
    onChange({revision: revision.revision, consent: null});
    setStatus(file ? 'Normalizing the center crop…' : 'Choose an image you own or have permission to use.');
    if (!file) return;
    const isCurrent = () => !controller.signal.aborted && sameCropRevision(current.current, revision);
    try {
      const normalized = await normalizeImage(file, scope.aspectRatio);
      if (!isCurrent()) return;
      const url = URL.createObjectURL(normalized.blob);
      previewUrl.current = url;
      setPreview({url, revision, ready: null});
      setStatus('Uploading the exact preview to this workspace…');
      const response = await fetch(`/api/workspaces/${encodeURIComponent(scope.workspaceId)}/assets`, {
        method: 'POST', credentials: 'same-origin', signal: controller.signal,
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({mime: 'image/jpeg', contentBase64: normalized.contentBase64}),
      });
      const body = await response.json() as {ok?: boolean; data?: unknown};
      if (!isCurrent()) return;
      if (!response.ok || body.ok !== true) throw new CropError('The crop could not be uploaded. Check workspace access and choose the image again.');
      const ready = bindReadyCrop(current.current, {...revision, sha256: normalized.sha256, width: normalized.width, height: normalized.height}, body.data);
      if (!ready) return;
      setPreview({url, revision, ready});
      setStatus('Owned crop is ready. Review the preview, then confirm it.');
    } catch (cause) {
      if (!isCurrent()) return;
      setStatus('');
      // Do not surface server bodies, storage keys or browser-generated URLs.
      setError(cause instanceof CropError ? cause.message : 'The image could not be processed or its upload digest did not match. Choose a valid JPEG or PNG and try again.');
    }
  }

  function confirm(): void {
    if (disabled || !seen || !preview?.ready) return;
    const consent = confirmCrop(current.current, preview.ready);
    if (!consent) return;
    setConfirmed(true);
    setStatus('Exact crop confirmed for this model, aspect ratio and workspace.');
    onChange({revision: current.current.revision, consent});
  }

  const dimensions = scope.aspectRatio === '16:9' ? '1280 × 720' : '720 × 1280';
  return <fieldset className="input-crop" disabled={disabled} aria-describedby="crop-help">
    <legend>Image-to-video input</legend>
    <label htmlFor="generation-image">Upload an owned image</label>
    <input id="generation-image" type="file" accept="image/jpeg,image/png" onChange={(event) => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = ''; // Allow the same file to be selected after a failed upload.
      void selectImage(file);
    }} />
    <p id="crop-help">JPEG or PNG, up to 20 MiB. Center crop: {scope.aspectRatio}, {dimensions}. Transparent areas become white. Changing image, aspect or model requires a new confirmation.</p>
    {preview ? <figure className="input-crop-preview">
      <img key={preview.url} src={preview.url} alt={`Normalized ${scope.aspectRatio} center crop to confirm`} width={scope.aspectRatio === '16:9' ? 1280 : 720} height={scope.aspectRatio === '16:9' ? 720 : 1280}
        className="input-crop-image" onLoad={() => {if (sameCropRevision(current.current, preview.revision)) setSeen(true);}} onError={() => {
          if (!sameCropRevision(current.current, preview.revision)) return;
          setSeen(false); setConfirmed(false); onChange({revision: current.current.revision, consent: null});
          setError('The crop preview could not be displayed. Choose the image again.');
        }} />
      <figcaption>Exact uploaded JPEG crop · {dimensions}</figcaption>
    </figure> : null}
    <button className="button button-muted" type="button" disabled={disabled || !seen || !preview?.ready || confirmed} onClick={confirm}>{confirmed ? 'Crop confirmed' : 'Confirm this exact crop'}</button>
    {status ? <p role="status">{status}</p> : null}
    {error ? <p role="alert">{error}</p> : null}
  </fieldset>;
}
