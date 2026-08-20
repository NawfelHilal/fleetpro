import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useStripe } from '@stripe/stripe-react-native';
import Feather from '@expo/vector-icons/Feather';
import * as Location from 'expo-location';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton } from '../components/AppButton';
import { FieldPill } from '../components/FieldPill';
import { MapCanvas } from '../components/MapCanvas';
import { searchDestinationSuggestions, withRouteEstimate } from '../api/geocoding';
import { demoPickup } from '../data/demoRoute';
import { PlaceSuggestion, savedPlaces, rideOptions } from '../data/places';
import { RootStackParamList } from '../navigation/RootNavigator';
import { useRideStore } from '../store/rides';
import { colors } from '../theme/colors';
import { formatEuro } from '../theme/format';

type Props = Readonly<NativeStackScreenProps<RootStackParamList, 'RideComposer'>>;

export function RideComposerScreen({ navigation }: Props) {
  const [destinationQuery, setDestinationQuery] = useState(savedPlaces[0].label);
  const [destinationSuggestions, setDestinationSuggestions] = useState<PlaceSuggestion[]>(savedPlaces);
  const [destinationLoading, setDestinationLoading] = useState(false);
  const [selectedDestination, setSelectedDestination] = useState<PlaceSuggestion>(savedPlaces[0]);
  const [selectedServiceId, setSelectedServiceId] = useState(rideOptions[0].id);
  const [note, setNote] = useState('');
  const [pickup, setPickup] = useState({ latitude: demoPickup.latitude, longitude: demoPickup.longitude });
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { setCurrentPlan, requestRide, createPaymentIntent, simulatePaymentIntent, cancelRide } = useRideStore();

  const selectedPlace = useMemo(() => withRouteEstimate(selectedDestination, pickup), [pickup, selectedDestination]);
  const selectedService = rideOptions.find((option) => option.id === selectedServiceId) || rideOptions[0];
  const baseFare = 350 + Number(selectedPlace.distanceKm) * 145 + selectedPlace.durationMinutes * 35;
  const fare = Math.round(Math.max(baseFare, 850) * selectedService.multiplier);

  useEffect(() => {
    if (process.env.EXPO_PUBLIC_ENABLE_DEMO_SIMULATION === 'true') {
      return;
    }
    Location.requestForegroundPermissionsAsync()
      .then(({ status }) => status === 'granted' ? Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }) : undefined)
      .then((location) => {
        if (location) {
          setPickup({ latitude: location.coords.latitude, longitude: location.coords.longitude });
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let canceled = false;
    setDestinationLoading(true);

    const timer = setTimeout(() => {
      searchDestinationSuggestions(destinationQuery, pickup)
        .then((suggestions) => {
          if (!canceled) {
            setDestinationSuggestions(suggestions);
          }
        })
        .finally(() => {
          if (!canceled) {
            setDestinationLoading(false);
          }
        });
    }, 350);

    return () => {
      canceled = true;
      clearTimeout(timer);
    };
  }, [destinationQuery, pickup.latitude, pickup.longitude]);

  const plan = useMemo(() => ({
    dropoffId: selectedPlace.id,
    serviceId: selectedService.id,
    serviceName: selectedService.name,
    eta: selectedService.eta,
    service_type: selectedService.id as 'STANDARD' | 'FLEETHER' | 'FLEET_PMR' | 'FLEET_LUXE',
    pickup_label: process.env.EXPO_PUBLIC_ENABLE_DEMO_SIMULATION === 'true' ? demoPickup.label : 'Position actuelle',
    pickup_latitude: pickup.latitude,
    pickup_longitude: pickup.longitude,
    dropoff_label: selectedPlace.label,
    dropoff_latitude: selectedPlace.latitude,
    dropoff_longitude: selectedPlace.longitude,
    distance_km: selectedPlace.distanceKm,
    duration_minutes: selectedPlace.durationMinutes,
    estimatedFareCents: fare,
  }), [fare, pickup.latitude, pickup.longitude, selectedPlace, selectedService]);

  async function confirmRide() {
    try {
      setCurrentPlan(plan);
      const ride = await requestRide({
        pickup_label: plan.pickup_label,
        pickup_latitude: plan.pickup_latitude,
        pickup_longitude: plan.pickup_longitude,
        dropoff_label: plan.dropoff_label,
        dropoff_latitude: plan.dropoff_latitude,
        dropoff_longitude: plan.dropoff_longitude,
        distance_km: plan.distance_km,
        duration_minutes: plan.duration_minutes,
        passenger_note: note,
        service_type: plan.service_type,
      });
      const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
      const simulatedPayment = process.env.EXPO_PUBLIC_USE_SIMULATED_PAYMENT === 'true' || !publishableKey.startsWith('pk_');
      if (simulatedPayment) {
        await simulatePaymentIntent(ride.id);
      } else {
        const clientSecret = await createPaymentIntent(ride.id);
        const initialization = await initPaymentSheet({
          merchantDisplayName: 'FleetPro',
          paymentIntentClientSecret: clientSecret,
          returnURL: 'fleetpro://stripe-redirect',
        });
        if (initialization.error) {
          await cancelRide(ride.id);
          throw new Error(initialization.error.message);
        }
        const payment = await presentPaymentSheet();
        if (payment.error) {
          await cancelRide(ride.id);
          throw new Error(payment.error.message);
        }
      }
      navigation.replace('ActiveRide', { rideId: ride.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'La demande de course a échoué.';
      Alert.alert('Course impossible', message);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Retour"
          accessibilityHint="Revient à l'accueil passager"
          style={styles.iconButton}
        >
          <Feather name="arrow-left" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.title}>Votre trajet</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <MapCanvas compact />
        <View style={styles.routeBox}>
          <FieldPill title="Position actuelle" subtitle="GPS du telephone" icon={<Feather name="map-pin" size={18} color={colors.ink} />} />
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Note au chauffeur"
            placeholderTextColor={colors.placeholder}
            style={styles.input}
            accessibilityLabel="Note au chauffeur"
            accessibilityHint="Ajoutez une information utile pour le chauffeur"
          />
        </View>
        <Text style={styles.sectionTitle}>Destination</Text>
        <TextInput
          value={destinationQuery}
          onChangeText={setDestinationQuery}
          placeholder="Rechercher une adresse ou un lieu"
          placeholderTextColor={colors.placeholder}
          style={styles.input}
          accessibilityLabel="Destination"
          accessibilityHint="Saisissez une adresse ou un lieu pour afficher les suggestions"
        />
        {destinationLoading ? <Text style={styles.muted}>Recherche de destinations...</Text> : null}
        {destinationSuggestions.length === 0 && !destinationLoading ? <Text style={styles.muted}>Aucune adresse trouvée. Essayez un lieu plus précis à Nice.</Text> : null}
        {destinationSuggestions.map((place) => (
          <Pressable
            key={place.id}
            onPress={() => {
              setSelectedDestination(place);
              setDestinationQuery(place.label);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Destination ${place.label}`}
            accessibilityHint={`${place.address}, trajet estimé à ${place.durationMinutes} minutes`}
            accessibilityState={{ selected: selectedDestination.id === place.id }}
            style={[styles.optionRow, selectedDestination.id === place.id && styles.optionSelected]}
          >
            <View style={styles.optionText}>
              <Text style={styles.optionTitle}>{place.label}</Text>
              <Text style={styles.optionMeta}>{place.address} - {place.distanceKm} km - {place.durationMinutes} min</Text>
            </View>
            {selectedDestination.id === place.id ? <Feather name="check" size={20} color={colors.ink} /> : null}
          </Pressable>
        ))}
        <Text style={styles.sectionTitle}>Choisir une course</Text>
        {rideOptions.map((option) => {
          const optionFare = Math.round(Math.max(baseFare, 850) * option.multiplier);
          return (
            <Pressable
              key={option.id}
              onPress={() => setSelectedServiceId(option.id)}
              accessibilityRole="button"
              accessibilityLabel={`Course ${option.name}, ${formatEuro(optionFare)}`}
              accessibilityHint={`${option.description}. Arrive dans ${option.eta}`}
              accessibilityState={{ selected: selectedServiceId === option.id }}
              style={[styles.optionRow, selectedServiceId === option.id && styles.optionSelected]}
            >
              <View style={styles.carIcon}><Text style={styles.carEmoji}>car</Text></View>
              <View style={styles.optionText}>
                <Text style={styles.optionTitle}>{option.name}</Text>
                <Text style={styles.optionMeta}>{option.seats} - arrive dans {option.eta}</Text>
                <Text style={styles.optionDescription}>{option.description}</Text>
              </View>
              <Text style={styles.fare}>{formatEuro(optionFare)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.footer}>
        <View>
          <Text style={styles.footerMeta}>{selectedService.name}</Text>
          <Text style={styles.footerPrice}>{formatEuro(fare)}</Text>
        </View>
        <AppButton
          label="Confirmer"
          onPress={confirmRide}
          accessibilityLabel={`Confirmer la course ${selectedService.name}`}
          accessibilityHint={`Demande une course vers ${selectedPlace.label} pour ${formatEuro(fare)}`}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { height: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12, backgroundColor: colors.surface },
  iconButton: { width: 40, height: 40, borderRadius: 8, backgroundColor: colors.softAccent, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.ink, fontSize: 22, fontWeight: '900' },
  content: { padding: 16, gap: 14, paddingBottom: 130 },
  routeBox: { gap: 10 },
  input: { minHeight: 48, borderRadius: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 14, color: colors.ink },
  sectionTitle: { color: colors.ink, fontWeight: '900', fontSize: 19, marginTop: 4 },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 8, padding: 14, borderWidth: 1, borderColor: colors.line },
  optionSelected: { borderColor: colors.ink, backgroundColor: '#fefefe' },
  optionText: { flex: 1 },
  optionTitle: { color: colors.ink, fontWeight: '900', fontSize: 16 },
  optionMeta: { color: colors.muted, marginTop: 3 },
  optionDescription: { color: colors.muted, marginTop: 4, fontSize: 12, lineHeight: 17 },
  muted: { color: colors.muted, fontWeight: '700' },
  carIcon: { width: 46, height: 34, borderRadius: 8, backgroundColor: colors.softAccent, alignItems: 'center', justifyContent: 'center' },
  carEmoji: { color: colors.ink, fontWeight: '900', fontSize: 12 },
  fare: { color: colors.ink, fontWeight: '900' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopWidth: 1, borderColor: colors.line, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  footerMeta: { color: colors.muted, fontWeight: '700' },
  footerPrice: { color: colors.ink, fontSize: 20, fontWeight: '900', marginTop: 2 },
});
