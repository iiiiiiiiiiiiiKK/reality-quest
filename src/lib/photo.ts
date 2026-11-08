/**
 * Client-side photo pipeline: downscale + re-encode before it ever touches
 * IndexedDB, so a 12 MP phone photo becomes a ~200 KB record.
 */

export interface CompressedPhoto {
  blob: Blob;
  width: number;
  height: number;
  bytes: number;
}

export const MAX_SOURCE_BYTES = 40 * 1024 * 1024;
const MAX_EDGE = 1600;
const TARGET_QUALITY = 0.82;
const HARD_LIMIT_BYTES = 2.5 * 1024 * 1024;

export class PhotoError extends Error {
  constructor(message: string, readonly kind: 'too-large' | 'decode' | 'unsupported') {
    super(message);
    this.name = 'PhotoError';
  }
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new PhotoError('could not decode image', 'decode'));
    };
    img.src = url;
  });
}

export async function compressPhoto(file: File | Blob): Promise<CompressedPhoto> {
  if (file.size > MAX_SOURCE_BYTES) throw new PhotoError('image too large', 'too-large');
  const img = await loadImage(file);

  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const width = Math.max(1, Math.round((img.naturalWidth || MAX_EDGE) * scale));
  const height = Math.max(1, Math.round((img.naturalHeight || MAX_EDGE) * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new PhotoError('canvas unavailable', 'unsupported');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  let quality = TARGET_QUALITY;
  let blob = await canvasToBlob(canvas, quality);
  // Second pass only if the first encode is still heavier than we want.
  while (blob.size > HARD_LIMIT_BYTES && quality > 0.45) {
    quality -= 0.12;
    blob = await canvasToBlob(canvas, quality);
  }
  return { blob, width, height, bytes: blob.size };
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new PhotoError('encode failed', 'decode'));
      },
      'image/jpeg',
      quality,
    );
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
