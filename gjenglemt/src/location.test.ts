import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildNominatimUrl,
  parseNominatimResponse,
  resolveLocation,
  getLiveCoords,
  describeGeolocationFailure,
} from './location';

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

describe('getLiveCoords onError', () => {
  afterEach(() => {
    delete (navigator as unknown as Record<string, unknown>).geolocation;
  });

  it('reports the browser error to onError when geolocation fails', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) =>
          error({ code: 1, message: 'denied' } as GeolocationPositionError),
      },
      configurable: true,
    });

    const onError = vi.fn();
    await getLiveCoords(onError);

    expect(onError).toHaveBeenCalledWith({ code: 1, message: 'denied' });
  });

  it('reports "unsupported" when the browser has no geolocation API', async () => {
    delete (navigator as unknown as Record<string, unknown>).geolocation;

    const onError = vi.fn();
    await getLiveCoords(onError);

    expect(onError).toHaveBeenCalledWith('unsupported');
  });

  it('does not call onError on success', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          success({ coords: { latitude: 1, longitude: 2 } } as GeolocationPosition),
      },
      configurable: true,
    });

    const onError = vi.fn();
    await getLiveCoords(onError);

    expect(onError).not.toHaveBeenCalled();
  });
});

describe('describeGeolocationFailure', () => {
  it('describes an unsupported browser', () => {
    expect(describeGeolocationFailure('unsupported')).toBe('nettleseren støtter ikke posisjon');
  });

  it('describes a denied permission', () => {
    expect(describeGeolocationFailure({ code: 1 } as GeolocationPositionError)).toBe(
      'tillatelse avslått'
    );
  });

  it('describes an unavailable position', () => {
    expect(describeGeolocationFailure({ code: 2 } as GeolocationPositionError)).toBe(
      'ingen posisjon tilgjengelig'
    );
  });

  it('describes a browser-side timeout', () => {
    expect(describeGeolocationFailure({ code: 3 } as GeolocationPositionError)).toBe(
      'tidsavbrudd'
    );
  });

  it('describes never having heard back at all (no browser error fired)', () => {
    expect(describeGeolocationFailure(null)).toBe('fikk aldri svar fra nettleseren');
  });
});
