import Feather from '@expo/vector-icons/Feather';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { Ride } from '../api/client';
import { getDrivingRoute } from '../api/directions';
import { demoDriverStart, demoDropoff, demoPickup } from '../data/demoRoute';
import { colors } from '../theme/colors';

export type MapCoordinate = {
  latitude: number;
  longitude: number;
};

type Props = {
  compact?: boolean;
  ride?: Ride;
  simulationPhase?: Ride['status'];
  driverCoordinate?: MapCoordinate;
};

const defaultPickup = { latitude: demoPickup.latitude, longitude: demoPickup.longitude };
const defaultDropoff = { latitude: demoDropoff.latitude, longitude: demoDropoff.longitude };
const driverStart = demoDriverStart;

export function MapCanvas({ compact, ride, simulationPhase, driverCoordinate }: Props) {
  const pickup = parseCoordinate(ride?.pickup_latitude, ride?.pickup_longitude) || defaultPickup;
  const dropoff = parseCoordinate(ride?.dropoff_latitude, ride?.dropoff_longitude) || defaultDropoff;
  const phase = simulationPhase || ride?.status || 'REQUESTED';
  const animation = useMemo(() => getAnimationPath(phase, pickup, dropoff), [phase, pickup.latitude, pickup.longitude, dropoff.latitude, dropoff.longitude]);
  const [routePath, setRoutePath] = useState<MapCoordinate[]>([pickup, dropoff]);
  const [animationRoutePath, setAnimationRoutePath] = useState<MapCoordinate[]>([animation.from, animation.to]);
  const [driverPosition, setDriverPosition] = useState(animation.from);
  const [progressPath, setProgressPath] = useState<MapCoordinate[]>([animation.from]);

  useEffect(() => {
    let canceled = false;

    getDrivingRoute(pickup, dropoff).then((route) => {
      if (!canceled) {
        setRoutePath(route);
      }
    });

    return () => {
      canceled = true;
    };
  }, [pickup.latitude, pickup.longitude, dropoff.latitude, dropoff.longitude]);

  useEffect(() => {
    let canceled = false;

    getDrivingRoute(animation.from, animation.to).then((route) => {
      if (!canceled) {
        setAnimationRoutePath(route);
      }
    });

    return () => {
      canceled = true;
    };
  }, [animation.from.latitude, animation.from.longitude, animation.to.latitude, animation.to.longitude]);

  useEffect(() => {
    if (driverCoordinate) {
      setDriverPosition(driverCoordinate);
      setProgressPath((path) => [...path.slice(-24), driverCoordinate]);
      return undefined;
    }
    setDriverPosition(animation.from);
    setProgressPath([animation.from]);

    if (phase === 'REQUESTED') {
      return undefined;
    }

    let frame = 0;
    const totalFrames = compact ? 18 : 36;
    const timer = setInterval(() => {
      frame += 1;
      const progress = Math.min(frame / totalFrames, 1);
      const nextPosition = coordinateAtProgress(animationRoutePath, easeInOut(progress));
      setDriverPosition(nextPosition);
      setProgressPath((path) => [...path.slice(-24), nextPosition]);

      if (progress >= 1) {
        clearInterval(timer);
      }
    }, 90);

    return () => clearInterval(timer);
  }, [animation.from.latitude, animation.from.longitude, animation.to.latitude, animation.to.longitude, animationRoutePath, compact, driverCoordinate?.latitude, driverCoordinate?.longitude, phase]);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Carte du trajet entre le point de départ et la destination. Statut ${phase}.`}
      style={[styles.wrap, compact && styles.compact]}
    >
      <MapView
        style={styles.map}
        customMapStyle={darkMapStyle}
        initialRegion={{
          latitude: (pickup.latitude + dropoff.latitude) / 2,
          longitude: (pickup.longitude + dropoff.longitude) / 2,
          latitudeDelta: 0.055,
          longitudeDelta: 0.055,
        }}
        showsUserLocation
        showsMyLocationButton={false}
      >
        <Marker coordinate={pickup} anchor={{ x: 0.5, y: 0.5 }}>
          <View style={styles.pickupMarker}><View style={styles.pickupDot} /></View>
        </Marker>
        <Marker coordinate={dropoff} anchor={{ x: 0.5, y: 1 }}>
          <View style={styles.dropoffMarker}><Feather name="map-pin" size={20} color={colors.surface} /></View>
        </Marker>
        <Marker coordinate={driverPosition} anchor={{ x: 0.5, y: 0.5 }}>
          <View style={styles.driverMarker}><Text style={styles.driverMarkerText}>car</Text></View>
        </Marker>
        <Polyline coordinates={routePath} strokeColor={colors.surface} strokeWidth={5} />
        {!driverCoordinate ? <Polyline coordinates={animationRoutePath} strokeColor={colors.success} strokeWidth={3} lineDashPattern={[6, 6]} /> : null}
        {progressPath.length > 1 ? (
          <Polyline coordinates={progressPath} strokeColor={colors.warning} strokeWidth={5} />
        ) : null}
      </MapView>
    </View>
  );
}

function parseCoordinate(latitude?: string, longitude?: string): MapCoordinate | undefined {
  if (!latitude || !longitude) {
    return undefined;
  }
  return {
    latitude: Number(latitude),
    longitude: Number(longitude),
  };
}

function getAnimationPath(phase: Ride['status'], pickup: MapCoordinate, dropoff: MapCoordinate): { from: MapCoordinate; to: MapCoordinate } {
  if (phase === 'ACCEPTED') {
    return { from: driverStart, to: pickup };
  }
  if (phase === 'IN_PROGRESS') {
    return { from: pickup, to: dropoff };
  }
  if (phase === 'COMPLETED') {
    return { from: dropoff, to: dropoff };
  }
  return { from: driverStart, to: driverStart };
}

function coordinateAtProgress(route: MapCoordinate[], progress: number): MapCoordinate {
  if (route.length <= 1) {
    return route[0];
  }

  const targetIndex = Math.min(Math.round((route.length - 1) * progress), route.length - 1);
  return route[targetIndex];
}

function easeInOut(progress: number): number {
  return progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
}

const styles = StyleSheet.create({
  wrap: {
    height: '58%',
    minHeight: 350,
    backgroundColor: colors.ink,
  },
  compact: {
    height: 220,
    minHeight: 220,
    borderRadius: 8,
    overflow: 'hidden',
  },
  map: { flex: 1 },
  pickupMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.ink,
  },
  pickupDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.ink },
  dropoffMarker: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverMarker: {
    minWidth: 42,
    height: 30,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  driverMarkerText: { color: colors.surface, fontWeight: '900', fontSize: 11 },
});

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#1f2937' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#d1d5db' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#111827' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#374151' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#111827' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#4b5563' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#263241' }] },
];
