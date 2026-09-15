export type PhotoRole = 'note' | 'garment' | 'extra';

export interface CapturedPhoto {
  role: PhotoRole;
  file: File;
}
