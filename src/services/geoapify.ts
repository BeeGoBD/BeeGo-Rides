import { LocationPoint, RouteData, RouteStep } from '../types';

const STORAGE_KEY = 'geoapify_api_key';
export const DEFAULT_GEOAPIFY_KEY = '4f9780f14a5842f2b40b99ab7adf2af5';

export function getGeoapifyApiKey(): string {
  // Check localStorage first
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY)?.trim();
    if (stored) return stored;
  }
  
  // Check env variable
  const envKey = (import.meta.env.VITE_GEOAPIFY_API_KEY as string | undefined)?.trim();
  if (envKey) return envKey;
  
  // Default key provided for the project
  return DEFAULT_GEOAPIFY_KEY;
}

export function saveGeoapifyApiKey(key: string): void {
  if (typeof window !== 'undefined') {
    if (key.trim()) {
      localStorage.setItem(STORAGE_KEY, key.trim());
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
}

/**
 * Real-time address autocomplete using Geoapify Geocoding Autocomplete API
 * Fetches real suggestions live as the user types without mock data.
 */
export async function searchAddress(
  text: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<LocationPoint[]> {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 1) return [];
  
  const keyToUse = apiKey.trim() || DEFAULT_GEOAPIFY_KEY;
  if (!keyToUse) {
    throw new Error('Please enter your Geoapify API key to search addresses.');
  }

  const url = `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(
    trimmed
  )}&format=json&limit=7&apiKey=${encodeURIComponent(keyToUse)}`;

  const response = await fetch(url, { signal });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('Invalid Geoapify API key. Please check your key.');
    }
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Geocoding request failed (${response.status})`);
  }

  const data = await response.json();
  const results = data.results || (data.features ? data.features.map((f: any) => f.properties) : []);

  return results.map((item: any) => {
    const formatted = item.formatted || `${item.name || ''}, ${item.city || ''}, ${item.country || ''}`;
    const addressLine1 = item.address_line1 || item.name || item.street || formatted.split(',')[0];
    const addressLine2 = item.address_line2 || [item.city, item.state, item.country].filter(Boolean).join(', ') || formatted;

    return {
      lat: item.lat,
      lon: item.lon,
      formatted,
      addressLine1,
      addressLine2,
      name: item.name,
      street: item.street,
      city: item.city,
      country: item.country,
      category: item.category,
      resultType: item.result_type,
      placeId: item.place_id || `${item.lat}_${item.lon}`,
    };
  });
}

/**
 * Reverse geocoding for current user coordinates
 */
export async function reverseGeocode(lat: number, lon: number, apiKey: string): Promise<LocationPoint> {
  const keyToUse = apiKey.trim() || DEFAULT_GEOAPIFY_KEY;
  if (!keyToUse) {
    throw new Error('Please enter your Geoapify API key for reverse geocoding.');
  }

  const url = `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lon}&format=json&apiKey=${encodeURIComponent(
    keyToUse
  )}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Reverse geocoding failed (${response.status})`);
  }

  const data = await response.json();
  const item = data.results?.[0] || (data.features?.[0]?.properties ?? null);

  if (!item) {
    return {
      lat,
      lon,
      formatted: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
    };
  }

  const formatted = item.formatted || `${item.street || item.name || 'Location'}, ${item.city || ''}`;
  const addressLine1 = item.address_line1 || item.name || item.street || formatted.split(',')[0];
  const addressLine2 = item.address_line2 || [item.city, item.state, item.country].filter(Boolean).join(', ') || formatted;

  return {
    lat: item.lat ?? lat,
    lon: item.lon ?? lon,
    formatted,
    addressLine1,
    addressLine2,
    name: item.name,
    street: item.street,
    city: item.city,
    country: item.country,
    placeId: item.place_id,
  };
}

/**
 * Real-time routing from pickup to dropoff using Geoapify Routing API
 */
export async function calculateRoute(
  pickup: LocationPoint,
  dropoff: LocationPoint,
  apiKey: string
): Promise<RouteData> {
  const keyToUse = apiKey.trim() || DEFAULT_GEOAPIFY_KEY;
  if (!keyToUse) {
    throw new Error('Please provide your Geoapify API key to calculate navigation route.');
  }

  const url = `https://api.geoapify.com/v1/routing?waypoints=${pickup.lat},${pickup.lon}|${dropoff.lat},${dropoff.lon}&mode=drive&details=instruction_details&apiKey=${encodeURIComponent(
    keyToUse
  )}`;

  const response = await fetch(url);
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('Invalid Geoapify API key. Please check your key.');
    }
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.message || `Routing calculation failed (${response.status})`);
  }

  const data = await response.json();
  const feature = data.features?.[0];
  if (!feature) {
    throw new Error('No driving route could be calculated between these spots.');
  }

  const geometry = feature.geometry;
  const rawCoords = geometry.coordinates;
  const convertedCoords: [number, number][] = [];

  // GeoJSON coordinate order is [longitude, latitude].
  // Leaflet requires [latitude, longitude].
  if (geometry.type === 'LineString') {
    for (const pt of rawCoords) {
      if (Array.isArray(pt) && pt.length >= 2) {
        convertedCoords.push([pt[1], pt[0]]);
      }
    }
  } else if (geometry.type === 'MultiLineString') {
    for (const line of rawCoords) {
      for (const pt of line) {
        if (Array.isArray(pt) && pt.length >= 2) {
          convertedCoords.push([pt[1], pt[0]]);
        }
      }
    }
  }

  const props = feature.properties || {};
  const distanceMeters = props.distance || 0;
  const timeSeconds = props.time || 0;

  // Extract turn-by-turn navigation instructions
  const steps: RouteStep[] = [];
  if (props.legs && Array.isArray(props.legs)) {
    for (const leg of props.legs) {
      if (leg.steps && Array.isArray(leg.steps)) {
        for (const step of leg.steps) {
          if (step.instruction?.text) {
            steps.push({
              instruction: step.instruction.text,
              distance: step.distance || 0,
              time: step.time || 0,
            });
          }
        }
      }
    }
  }

  return {
    distanceMeters,
    timeSeconds,
    coordinates: convertedCoords,
    steps,
  };
}
