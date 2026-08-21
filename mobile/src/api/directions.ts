import type { MapCoordinate } from '../components/MapCanvas';

type OsrmRouteResponse = {
  routes?: Array<{
    geometry?: {
      coordinates?: number[][];
    };
  }>;
};

const defaultOsrmUrl = 'https://router.project-osrm.org/route/v1/driving';

export async function getDrivingRoute(from: MapCoordinate, to: MapCoordinate): Promise<MapCoordinate[]> {
  if (sameCoordinate(from, to)) {
    return [from];
  }

  const osrmUrl = process.env.EXPO_PUBLIC_OSRM_URL || defaultOsrmUrl;
  const url = `${osrmUrl}/${formatCoordinate(from)};${formatCoordinate(to)}?${new URLSearchParams({
    overview: 'full',
    geometries: 'geojson',
  }).toString()}`;

  return fetch(url, { headers: { Accept: 'application/json' } })
    .then((response) => response.ok ? response.json() : undefined)
    .then((payload: OsrmRouteResponse | undefined) => {
      const coordinates = payload?.routes?.[0]?.geometry?.coordinates;
      if (!coordinates?.length) {
        return fallbackRoute(from, to);
      }
      return coordinates
        .map(toMapCoordinate)
        .filter((coordinate): coordinate is MapCoordinate => Boolean(coordinate));
    })
    .then((coordinates) => coordinates.length ? coordinates : fallbackRoute(from, to))
    .catch(() => fallbackRoute(from, to));
}

function toMapCoordinate(coordinate: number[]): MapCoordinate | undefined {
  const [longitude, latitude] = coordinate;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return undefined;
  }
  return { latitude, longitude };
}

function fallbackRoute(from: MapCoordinate, to: MapCoordinate): MapCoordinate[] {
  return sameCoordinate(from, to) ? [from] : [from, to];
}

function formatCoordinate(coordinate: MapCoordinate): string {
  return `${coordinate.longitude},${coordinate.latitude}`;
}

function sameCoordinate(from: MapCoordinate, to: MapCoordinate): boolean {
  return from.latitude === to.latitude && from.longitude === to.longitude;
}
