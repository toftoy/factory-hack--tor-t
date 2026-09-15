import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import exifr from 'exifr';
import { buildNominatimUrl, parseNominatimResponse, resolveLocation } from './location';

vi.mock('exifr', () => ({ default: { gps: vi.fn() } }));

describe('buildNominatimUrl', () => {
  it('builds a reverse-geocode URL with the coordinates', () => {
    expect(buildNominatimUrl(59.91, 10.75)).toBe(
      'https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=59.91&lon=10.75'
    );
  });
});

describe('parseNominatimResponse', () => {
  it('returns the display name', () => {
    expect(parseNominatimResponse({ display_name: 'Storgata 1, Oslo' })).toBe(
      'Storgata 1, Oslo'
    );
  });

  it('returns null when there is no display name', () => {
    expect(parseNominatimResponse(null)).toBeNull();
    expect(parseNominatimResponse({})).toBeNull();
  });
});

describe('resolveLocation', () => {
  const file = new File([''], 'garment.jpg', { type: 'image/jpeg' });

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ display_name: 'Storgata 1, Oslo' }),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete (navigator as unknown as Record<string, unknown>).geolocation;
  });

  it('uses EXIF GPS coordinates when present', async () => {
    vi.mocked(exifr.gps).mockResolvedValue({ latitude: 59.91, longitude: 10.75 });

    const result = await resolveLocation(file);

    expect(result).toBe('Storgata 1, Oslo');
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('lat=59.91'), expect.anything());
  });

  it('falls back to live geolocation when EXIF has no GPS data', async () => {
    vi.mocked(exifr.gps).mockResolvedValue(undefined as any);
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          success({ coords: { latitude: 63.43, longitude: 10.39 } } as GeolocationPosition),
      },
      configurable: true,
    });

    const result = await resolveLocation(file);

    expect(result).toBe('Storgata 1, Oslo');
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('lat=63.43'), expect.anything());
  });

  it('returns null when neither EXIF nor live location is available', async () => {
    vi.mocked(exifr.gps).mockResolvedValue(undefined as any);
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) =>
          error({ code: 1, message: 'denied' } as GeolocationPositionError),
      },
      configurable: true,
    });

    const result = await resolveLocation(file);

    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
