export interface Coords {
  lat: number;
  lng: number;
}

export interface NominatimResponse {
  display_name?: string;
}

export function buildNominatimUrl(lat: number, lng: number): string {
  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: lat.toString(),
    lon: lng.toString(),
  });
  return `https://nominatim.openstreetmap.org/reverse?${params.toString()}`;
}

export function parseNominatimResponse(response: NominatimResponse | null): string | null {
  return response?.display_name?.trim() || null;
}

export function getLiveCoords(): Promise<Coords | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => resolve(null),
      { timeout: 10_000 }
    );
  });
}

/** Caps a reverse-geocode request that would otherwise hang indefinitely on a slow network. */
const REVERSE_GEOCODE_TIMEOUT_MS = 8_000;

export async function reverseGeocode(coords: Coords): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REVERSE_GEOCODE_TIMEOUT_MS);
  const response = await fetch(buildNominatimUrl(coords.lat, coords.lng), {
    headers: { Accept: 'application/json' },
    signal: controller.signal,
  })
    .catch(() => null)
    .finally(() => clearTimeout(timer));
  if (!response || !response.ok) return null;
  const json = (await response.json().catch(() => null)) as NominatimResponse | null;
  return parseNominatimResponse(json);
}

/**
 * `liveCoords` defaults to a fresh request, but the caller normally passes in
 * a live GPS fix requested once at app startup and shared across every item —
 * a permission prompt and GPS fix per item is not something the OS lets a web
 * app skip, so the app avoids repeating it by reusing one fix for the whole
 * session instead.
 *
 * EXIF was dropped as a source: it only resolves after the photo is taken
 * (adding latency the pre-fetched live fix doesn't have) and iOS Safari is
 * known to strip GPS metadata from photos taken via `<input capture>` anyway,
 * so it bought little over just using the live fix directly.
 */
export async function resolveLocation(
  liveCoords: Promise<Coords | null> = getLiveCoords()
): Promise<string | null> {
  const coords = await liveCoords;
  if (!coords) return null;
  return reverseGeocode(coords);
}
