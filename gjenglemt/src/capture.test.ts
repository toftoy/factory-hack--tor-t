import { describe, it, expect } from 'vitest';
import { nextCaptureRole, canProceed } from './capture';
import type { CapturedPhoto } from './types';

function photo(role: CapturedPhoto['role']): CapturedPhoto {
  return { role, file: new File([''], `${role}.jpg`, { type: 'image/jpeg' }) };
}

describe('nextCaptureRole', () => {
  it('asks for the note first when nothing captured', () => {
    expect(nextCaptureRole([])).toBe('note');
  });

  it('asks for the garment after the note', () => {
    expect(nextCaptureRole([photo('note')])).toBe('garment');
  });

  it('returns null once note and garment exist', () => {
    expect(nextCaptureRole([photo('note'), photo('garment')])).toBeNull();
  });
});

describe('canProceed', () => {
  it('is false until both note and garment are captured', () => {
    expect(canProceed([])).toBe(false);
    expect(canProceed([photo('note')])).toBe(false);
  });

  it('is true once note and garment are captured', () => {
    expect(canProceed([photo('note'), photo('garment')])).toBe(true);
  });
});
