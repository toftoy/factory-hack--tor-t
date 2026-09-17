import exifr from 'exifr';

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

export async function getExifCoords(file: File): Promise<Coords | null> {
  const gps = await exifr.gps(file).catch(() => null);
  if (!gps || typeof gps.latitude !== 'number' || typeof gps.longitude !== 'number') {
    return null;
  }
  return { lat: gps.latitude, lng: gps.longitude };
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

export async function resolveLocation(garmentPhoto: File): Promise<string | null> {
  const coords = (await getExifCoords(garmentPhoto)) ?? (await getLiveCoords());
  if (!coords) return null;
  return reverseGeocode(coords);
}
