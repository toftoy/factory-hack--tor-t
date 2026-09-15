import type { CapturedPhoto, PhotoRole } from './types';

export function nextCaptureRole(
  photos: CapturedPhoto[],
  extraRequested: boolean
): PhotoRole | null {
  const hasNote = photos.some((p) => p.role === 'note');
  const hasGarment = photos.some((p) => p.role === 'garment');
  if (!hasNote) return 'note';
  if (!hasGarment) return 'garment';
  const hasExtra = photos.some((p) => p.role === 'extra');
  if (extraRequested && !hasExtra) return 'extra';
  return null;
}

export function canProceed(photos: CapturedPhoto[]): boolean {
  return photos.some((p) => p.role === 'note') && photos.some((p) => p.role === 'garment');
}
