import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildNominatimUrl, parseNominatimResponse, resolveLocation } from './location';

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

  it('resolves via live geolocation when no coords promise is supplied', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          success({ coords: { latitude: 63.43, longitude: 10.39 } } as GeolocationPosition),
      },
      configurable: true,
    });

    const result = await resolveLocation();

    expect(result).toBe('Storgata 1, Oslo');
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('lat=63.43'), expect.anything());
  });

  it('uses a supplied live-coords promise instead of requesting a fresh one', async () => {
    // Simulates the app-level cache: a live GPS fix requested once at app
    // startup and reused for every item, rather than re-requested (and
    // re-consented to) per photo.
    const sessionCoords = Promise.resolve({ lat: 1.23, lng: 4.56 });

    const result = await resolveLocation(sessionCoords);

    expect(result).toBe('Storgata 1, Oslo');
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('lat=1.23'), expect.anything());
  });

  it('returns null when live location is unavailable', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) =>
          error({ code: 1, message: 'denied' } as GeolocationPositionError),
      },
      configurable: true,
    });

    const result = await resolveLocation();

    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
