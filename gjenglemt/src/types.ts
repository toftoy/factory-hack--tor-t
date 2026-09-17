export type PhotoRole = 'note' | 'garment';

export interface CapturedPhoto {
  role: PhotoRole;
  file: File;
}
