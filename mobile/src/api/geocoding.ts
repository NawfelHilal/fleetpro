import { PlaceSuggestion, savedPlaces } from '../data/places';

type Coordinate = {
  latitude: number;
  longitude: number;
};

type NominatimResult = {
  place_id?: number;
  osm_id?: number;
  display_name: string;
  lat: string;
  lon: string;
  name?: string;
};

const defaultGeocodingUrl = 'https://nominatim.openstreetmap.org/search';
const niceViewbox = '7.15,43.80,7.35,43.60';

export async function searchDestinationSuggestions(query: string, pickup: Coordinate): Promise<PlaceSuggestion[]> {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 3) {
    return savedPlaces;
  }

  const localMatches = searchLocalDestinations(normalizedQuery, pickup);
  const remoteSuggestions = await searchRemoteDestinations(normalizedQuery, pickup);
  return mergeSuggestions([...localMatches, ...remoteSuggestions]).slice(0, 6);
}

export function searchLocalDestinations(query: string, pickup: Coordinate): PlaceSuggestion[] {
  const normalizedQuery = normalize(query);
  return savedPlaces
    .filter((place) => normalize(`${place.label} ${place.address}`).includes(normalizedQuery))
    .map((place) => withRouteEstimate(place, pickup));
}

export function withRouteEstimate(place: PlaceSuggestion, pickup: Coordinate): PlaceSuggestion {
  const distanceKm = haversineDistanceKm(pickup, place);
  return {
    ...place,
    distanceKm: distanceKm.toFixed(2),
    durationMinutes: estimateDurationMinutes(distanceKm),
  };
}

function searchRemoteDestinations(query: string, pickup: Coordinate): Promise<PlaceSuggestion[]> {
  const geocodingUrl = process.env.EXPO_PUBLIC_GEOCODING_URL || defaultGeocodingUrl;
  const url = `${geocodingUrl}?${new URLSearchParams({
    q: `${query}, Nice, France`,
    format: 'json',
    addressdetails: '1',
    limit: '5',
    bounded: '1',
    viewbox: niceViewbox,
  }).toString()}`;

  return fetch(url, { headers: { Accept: 'application/json' } })
    .then((response) => response.ok ? response.json() : [])
    .then((payload) => Array.isArray(payload) ? payload : [])
    .then((results: NominatimResult[]) => results
      .map((result) => toPlaceSuggestion(result, pickup))
      .filter((place): place is PlaceSuggestion => Boolean(place)))
    .catch(() => []);
}

function toPlaceSuggestion(result: NominatimResult, pickup: Coordinate): PlaceSuggestion | undefined {
  const latitude = Number(result.lat);
  const longitude = Number(result.lon);
  if (!result.display_name || Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return undefined;
  }

  const distanceKm = haversineDistanceKm(pickup, { latitude, longitude });
  const [label, ...addressParts] = result.display_name.split(',').map((part) => part.trim()).filter(Boolean);
  return {
    id: `geo-${result.place_id || result.osm_id || `${latitude}-${longitude}`}`,
    label: result.name || label || 'Destination',
    address: addressParts.slice(0, 3).join(', ') || result.display_name,
    latitude,
    longitude,
    distanceKm: distanceKm.toFixed(2),
    durationMinutes: estimateDurationMinutes(distanceKm),
  };
}

function mergeSuggestions(suggestions: PlaceSuggestion[]): PlaceSuggestion[] {
  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    const key = `${suggestion.label.toLowerCase()}-${suggestion.latitude.toFixed(5)}-${suggestion.longitude.toFixed(5)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function estimateDurationMinutes(distanceKm: number): number {
  return Math.max(4, Math.round((distanceKm / 22) * 60));
}

function haversineDistanceKm(from: Coordinate, to: Coordinate): number {
  const earthRadiusKm = 6371;
  const deltaLatitude = toRadians(to.latitude - from.latitude);
  const deltaLongitude = toRadians(to.longitude - from.longitude);
  const latitudeFrom = toRadians(from.latitude);
  const latitudeTo = toRadians(to.latitude);
  const haversine = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(latitudeFrom) * Math.cos(latitudeTo) * Math.sin(deltaLongitude / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
