import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Feather from '@expo/vector-icons/Feather';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ride } from '../api/client';
import { DriverPosition, getGpsSocket } from '../api/gps';
import { AppButton } from '../components/AppButton';
import { MapCanvas, MapCoordinate } from '../components/MapCanvas';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useAuthStore } from '../store/auth';
import { useRideStore } from '../store/rides';
import { colors } from '../theme/colors';
import { driverPositionFreshnessLabel, formatEuro, statusLabel } from '../theme/format';

type Props = Readonly<NativeStackScreenProps<RootStackParamList, 'ActiveRide'>>;

export function ActiveRideScreen({ navigation, route }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [driverCoordinate, setDriverCoordinate] = useState<MapCoordinate>();
  const [gpsConnected, setGpsConnected] = useState(false);
  const [lastDriverPositionAt, setLastDriverPositionAt] = useState<string>();
  const [positionClock, setPositionClock] = useState(Date.now());
  const ride = useRideStore((state) => state.rides.find((item) => item.id === route.params.rideId));
  const plan = useRideStore((state) => state.currentPlan);
  const role = useAuthStore((state) => state.role);
  const { acceptRide, startRide, completeRide, cancelRide, refreshRide, simulateRide } = useRideStore();
  const payment = paymentStatusDetail(ride?.payment_status, ride?.status);
  const gpsFreshness = driverPositionFreshnessLabel(lastDriverPositionAt, positionClock);

  useEffect(() => {
    refreshRide(route.params.rideId).catch(() => undefined);
    const timer = setInterval(() => {
      refreshRide(route.params.rideId).catch(() => undefined);
    }, 3000);
    return () => clearInterval(timer);
  }, [refreshRide, route.params.rideId]);

  useEffect(() => {
    const socket = getGpsSocket();
    if (!socket) {
      setGpsConnected(false);
      return undefined;
    }
    const joinRide = () => socket.emit('ride:join', { rideId: route.params.rideId });
    const markConnected = () => {
      setGpsConnected(true);
      joinRide();
    };
    const markDisconnected = () => setGpsConnected(false);
    const updatePosition = (position: DriverPosition) => {
      if (position.rideId === route.params.rideId) {
        setDriverCoordinate({ latitude: position.latitude, longitude: position.longitude });
        setLastDriverPositionAt(position.recordedAt || new Date().toISOString());
        setPositionClock(Date.now());
      }
    };
    setGpsConnected(socket.connected);
    if (socket.connected) {
      joinRide();
    }
    socket.on('connect', markConnected);
    socket.on('disconnect', markDisconnected);
    socket.on('driver:position:updated', updatePosition);
    return () => {
      socket.off('connect', markConnected);
      socket.off('disconnect', markDisconnected);
      socket.off('driver:position:updated', updatePosition);
    };
  }, [route.params.rideId]);

  useEffect(() => {
    if (!lastDriverPositionAt) {
      return undefined;
    }

    const timer = setInterval(() => setPositionClock(Date.now()), 10000);
    return () => clearInterval(timer);
  }, [lastDriverPositionAt]);

  if (!ride) {
    return (
      <SafeAreaView style={styles.container}>
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Retour" accessibilityHint="Revient à l'écran précédent" style={styles.backButton}><Feather name="arrow-left" size={22} color={colors.ink} /></Pressable>
        <Text style={styles.title}>Course introuvable</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Retour" accessibilityHint="Revient à l'écran précédent" style={styles.backButton}><Feather name="arrow-left" size={22} color={colors.ink} /></Pressable>
        <Text style={styles.headerTitle}>{statusLabel(ride.status)}</Text>
      </View>
      <MapCanvas ride={ride} driverCoordinate={driverCoordinate} />
      <View style={styles.sheet}>
        <View style={styles.driverRow}>
          <View style={styles.carBadge}><Feather name="navigation" size={24} color={colors.surface} /></View>
          <View style={styles.driverText}>
            <Text style={styles.title}>{driverCardTitle(ride.status, plan?.serviceName)}</Text>
            <Text style={styles.muted}>{rideStatusDetail(ride.status, role)} - {driverCardSubtitle(ride.status)}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Appeler le chauffeur" accessibilityHint="Bouton de contact téléphonique du chauffeur" style={styles.phoneButton}><Feather name="phone" size={20} color={colors.ink} /></Pressable>
        </View>

        {ride.status === 'ACCEPTED' || ride.status === 'IN_PROGRESS' ? (
          <GpsFreshnessNotice connected={gpsConnected} freshness={gpsFreshness} />
        ) : null}

        {ride.status === 'REQUESTED' ? <DriverSearchSimulation /> : null}

        <View style={styles.timeline}>
          <View style={styles.timelineRow}>
            <View style={styles.timelineDot} />
            <View style={styles.timelineText}>
              <Text style={styles.timelineTitle}>{ride.pickup_label}</Text>
              <Text style={styles.muted}>Point de prise en charge</Text>
            </View>
          </View>
          <View style={styles.timelineLine} />
          <View style={styles.timelineRow}>
            <Feather name="map-pin" size={18} color={colors.success} />
            <View style={styles.timelineText}>
              <Text style={styles.timelineTitle}>{ride.dropoff_label}</Text>
              <Text style={styles.muted}>{ride.duration_minutes || plan?.duration_minutes || 18} min de trajet</Text>
            </View>
          </View>
        </View>

        <View style={styles.summary}>
          <View style={styles.summaryRow}>
            <Feather name="credit-card" size={18} color={colors.ink} />
            <View style={styles.summaryBody}>
              <Text style={styles.summaryText}>Carte test Stripe</Text>
              <Text style={styles.summaryMeta}>{payment}</Text>
            </View>
            <Text style={styles.summaryPrice}>{formatEuro(ride.final_fare_cents || ride.estimated_fare_cents)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Feather name="shield" size={18} color={colors.ink} />
            <View style={styles.summaryBody}>
              <Text style={styles.summaryText}>Commission FleetPro</Text>
              <Text style={styles.summaryMeta}>15% preleves sur la course</Text>
            </View>
            <Text style={styles.summaryPrice}>{formatEuro(ride.commission_cents)}</Text>
          </View>
        </View>

        {ride.status === 'COMPLETED' ? <RideReceipt ride={ride} /> : null}

        {role === 'DRIVER' ? (
          <DriverSimulationControls
            status={ride.status}
            submitting={submitting}
            onAccept={() => runAction(() => acceptRide(ride.id), setSubmitting)}
            onStart={() => runAction(() => startRide(ride.id), setSubmitting)}
            onComplete={() => runAction(() => completeRide(ride.id), setSubmitting)}
          />
        ) : (
          <PassengerSimulationHint
            status={ride.status}
            submitting={submitting}
            onSimulate={() => runAction(() => simulateRide(ride.id), setSubmitting)}
            onCancel={() => runAction(() => cancelRide(ride.id, 'Annulée depuis l’application'), setSubmitting)}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

function GpsFreshnessNotice({
  connected,
  freshness,
}: {
  connected: boolean;
  freshness: { label: string; stale: boolean };
}) {
  const warning = !connected || freshness.stale;
  const label = connected ? freshness.label : 'Connexion GPS temps reel interrompue.';

  return (
    <View style={[styles.gpsNotice, warning && styles.gpsNoticeWarning]}>
      <Feather name={warning ? 'alert-triangle' : 'radio'} size={17} color={colors.ink} />
      <Text style={styles.gpsNoticeText}>{label}</Text>
    </View>
  );
}

function DriverSearchSimulation() {
  return (
    <View style={styles.searchBox}>
      <View style={styles.searchHeader}>
        <Feather name="loader" size={18} color={colors.ink} />
        <Text style={styles.searchTitle}>Recherche chauffeur</Text>
      </View>
      <View style={styles.searchSteps}>
        <SearchStep label="Course publiee aux chauffeurs proches" done />
        <SearchStep label="Verification disponibilite GPS" done />
        <SearchStep label="En attente d acceptation" />
      </View>
    </View>
  );
}

function SearchStep({ label, done }: { label: string; done?: boolean }) {
  return (
    <View style={styles.searchStep}>
      <View style={[styles.searchDot, done && styles.searchDotDone]} />
      <Text style={styles.searchLabel}>{label}</Text>
    </View>
  );
}

function RideReceipt({ ride }: { ride: Ride }) {
  return (
    <View style={styles.receipt}>
      <View style={styles.receiptHeader}>
        <Feather name="check-circle" size={20} color={colors.success} />
        <Text style={styles.receiptTitle}>Course terminee</Text>
      </View>
      <View style={styles.receiptRow}>
        <Text style={styles.receiptLabel}>Total paye</Text>
        <Text style={styles.receiptValue}>{formatEuro(ride.final_fare_cents || ride.estimated_fare_cents)}</Text>
      </View>
      <View style={styles.receiptRow}>
        <Text style={styles.receiptLabel}>Gain chauffeur</Text>
        <Text style={styles.receiptValue}>{formatEuro(ride.driver_earnings_cents)}</Text>
      </View>
      <Text style={styles.receiptMeta}>Paiement simule capture avec succes.</Text>
    </View>
  );
}

function DriverSimulationControls({
  status,
  submitting,
  onAccept,
  onStart,
  onComplete,
}: {
  status: string;
  submitting: boolean;
  onAccept: () => void;
  onStart: () => void;
  onComplete: () => void;
}) {
  if (status === 'REQUESTED') {
    return <AppButton label={submitting ? 'Acceptation...' : 'Accepter la course'} onPress={onAccept} disabled={submitting} accessibilityHint="Affecte la course au chauffeur connecté" />;
  }
  if (status === 'ACCEPTED') {
    return <AppButton label={submitting ? 'Mise a jour...' : 'Passager recupere'} onPress={onStart} disabled={submitting} accessibilityHint="Passe la course en statut trajet en cours" />;
  }
  if (status === 'IN_PROGRESS') {
    return <AppButton label={submitting ? 'Cloture...' : 'Deposer le passager'} onPress={onComplete} disabled={submitting} accessibilityHint="Termine la course et confirme l'arrivée" />;
  }
  if (status === 'COMPLETED') {
    return <AppButton label="Course terminee" onPress={() => undefined} variant="secondary" disabled />;
  }
  return <AppButton label="Partager le statut" onPress={() => undefined} variant="secondary" />;
}

function PassengerSimulationHint({
  status,
  submitting,
  onSimulate,
  onCancel,
}: {
  status: string;
  submitting: boolean;
  onSimulate: () => void;
  onCancel: () => void;
}) {
  const text = {
    REQUESTED: 'En attente d un chauffeur.',
    ACCEPTED: 'Le chauffeur arrive au point de prise en charge.',
    IN_PROGRESS: 'Vous etes en route vers la destination.',
    COMPLETED: 'Vous etes arrive a destination.',
    CANCELED: 'Cette course a ete annulee.',
  }[status] || 'Suivi de course actif.';

  return (
    <View style={styles.passengerActions}>
      <View style={styles.hintBox}>
        <Feather name="info" size={18} color={colors.ink} />
        <Text style={styles.hintText}>{text}</Text>
      </View>
      {status !== 'COMPLETED' && status !== 'CANCELED' ? (
        <>
          {process.env.EXPO_PUBLIC_ENABLE_DEMO_SIMULATION === 'true' ? <AppButton label={submitting ? 'Simulation...' : simulationButtonLabel(status)} onPress={onSimulate} disabled={submitting} accessibilityHint="Fait avancer la course démo à l'étape suivante" /> : null}
          <AppButton label="Annuler la course" onPress={onCancel} disabled={submitting} variant="secondary" accessibilityHint="Annule la demande ou la course active" />
        </>
      ) : null}
    </View>
  );
}

function simulationButtonLabel(status: string): string {
  const labels: Record<string, string> = {
    REQUESTED: 'Simuler chauffeur trouve',
    ACCEPTED: 'Simuler passager recupere',
    IN_PROGRESS: 'Simuler depot passager',
  };
  return labels[status] || 'Simuler etape suivante';
}

async function runAction(action: () => Promise<unknown>, setSubmitting: (value: boolean) => void) {
  setSubmitting(true);
  try {
    await action();
  } catch {
    Alert.alert('Simulation impossible', 'Verifie que le backend est redemarre et que la course est encore active.');
  } finally {
    setSubmitting(false);
  }
}

function rideStatusDetail(status: string, role?: string): string {
  if (role === 'DRIVER') {
    const labels: Record<string, string> = {
      REQUESTED: 'Demande disponible',
      ACCEPTED: 'Allez chercher le passager',
      IN_PROGRESS: 'Conduisez vers la destination',
      COMPLETED: 'Passager depose',
    };
    return labels[status] || statusLabel(status);
  }

  const labels: Record<string, string> = {
    REQUESTED: 'Recherche chauffeur',
    ACCEPTED: 'Arrivee estimee 3 min',
    IN_PROGRESS: 'Trajet en cours',
    COMPLETED: 'Destination atteinte',
  };
  return labels[status] || statusLabel(status);
}

function driverCardTitle(status: string, serviceName?: string): string {
  if (status === 'REQUESTED') {
    return 'Recherche en cours';
  }
  if (status === 'COMPLETED') {
    return 'Trajet finalise';
  }
  return serviceName || 'Fleet Eco';
}

function driverCardSubtitle(status: string): string {
  if (status === 'REQUESTED') {
    return 'matching chauffeur simule';
  }
  if (status === 'COMPLETED') {
    return 'paiement test encaisse';
  }
  return 'Peugeot e-208 noire';
}

function paymentStatusDetail(status?: string | null, rideStatus?: string): string {
  if (status === 'SUCCEEDED' || rideStatus === 'COMPLETED') {
    return 'Paiement simule encaisse';
  }
  if (status === 'REQUIRES_CONFIRMATION') {
    return 'Autorisation simulee';
  }
  if (status === 'FAILED') {
    return 'Paiement refuse';
  }
  return 'Paiement test en preparation';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { position: 'absolute', zIndex: 2, top: 46, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backButton: { width: 42, height: 42, borderRadius: 8, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: colors.ink, fontWeight: '900', fontSize: 18, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, overflow: 'hidden' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopLeftRadius: 8, borderTopRightRadius: 8, padding: 18, gap: 16 },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  carBadge: { width: 48, height: 48, borderRadius: 8, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  driverText: { flex: 1 },
  title: { color: colors.ink, fontSize: 20, fontWeight: '900' },
  muted: { color: colors.muted, marginTop: 3 },
  phoneButton: { width: 44, height: 44, borderRadius: 8, backgroundColor: colors.softAccent, alignItems: 'center', justifyContent: 'center' },
  gpsNotice: { backgroundColor: colors.softAccent, borderRadius: 8, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  gpsNoticeWarning: { borderWidth: 1, borderColor: colors.warning },
  gpsNoticeText: { color: colors.ink, fontWeight: '800', flex: 1 },
  timeline: { backgroundColor: colors.background, borderRadius: 8, padding: 14 },
  timelineRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  timelineDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.ink, marginHorizontal: 3 },
  timelineLine: { width: 2, height: 26, backgroundColor: colors.line, marginLeft: 8 },
  timelineText: { flex: 1 },
  timelineTitle: { color: colors.ink, fontWeight: '900' },
  summary: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, paddingVertical: 8, gap: 8 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  summaryBody: { flex: 1 },
  summaryText: { color: colors.ink, fontWeight: '700' },
  summaryMeta: { color: colors.muted, marginTop: 2, fontSize: 12 },
  summaryPrice: { color: colors.ink, fontWeight: '900' },
  searchBox: { backgroundColor: colors.softAccent, borderRadius: 8, padding: 14, gap: 12 },
  searchHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchTitle: { color: colors.ink, fontWeight: '900' },
  searchSteps: { gap: 8 },
  searchStep: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  searchDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: colors.ink },
  searchDotDone: { backgroundColor: colors.ink },
  searchLabel: { color: colors.ink, fontWeight: '700', flex: 1 },
  receipt: { backgroundColor: colors.background, borderRadius: 8, padding: 14, gap: 9 },
  receiptHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  receiptTitle: { color: colors.ink, fontWeight: '900' },
  receiptRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  receiptLabel: { color: colors.muted, fontWeight: '700' },
  receiptValue: { color: colors.ink, fontWeight: '900' },
  receiptMeta: { color: colors.success, fontWeight: '800', marginTop: 2 },
  hintBox: { backgroundColor: colors.softAccent, borderRadius: 8, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  hintText: { color: colors.ink, fontWeight: '700', flex: 1 },
  passengerActions: { gap: 10 },
});
