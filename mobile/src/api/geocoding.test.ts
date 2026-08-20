import { searchDestinationSuggestions, searchLocalDestinations, withRouteEstimate } from './geocoding';
import { savedPlaces } from '../data/places';
import { demoPickup } from '../data/demoRoute';

const pickup = { latitude: demoPickup.latitude, longitude: demoPickup.longitude };

describe('destination geocoding', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    delete process.env.EXPO_PUBLIC_GEOCODING_URL;
  });

  it('returns saved destinations when the query is too short', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');

    await expect(searchDestinationSuggestions('Ni', pickup)).resolves.toEqual(savedPlaces);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('searches local destinations without accents', () => {
    const suggestions = searchLocalDestinations('gare nice', pickup);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].label).toBe('Gare Nice-Ville');
    expect(Number(suggestions[0].distanceKm)).toBeGreaterThan(0);
    expect(suggestions[0].durationMinutes).toBeGreaterThan(0);
  });

  it('maps remote geocoding results to ride suggestions', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [
        {
          place_id: 123,
          display_name: 'Promenade du Paillon, Nice, Alpes-Maritimes, France',
          lat: '43.700800',
          lon: '7.275500',
          name: 'Promenade du Paillon',
        },
      ],
    } as Response);

    const suggestions = await searchDestinationSuggestions('promenade du paillon', pickup);

    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('promenade'), expect.any(Object));
    expect(suggestions).toEqual([
      expect.objectContaining({
        id: 'geo-123',
        label: 'Promenade du Paillon',
        address: 'Nice, Alpes-Maritimes, France',
      }),
    ]);
    expect(Number(suggestions[0].distanceKm)).toBeGreaterThan(0);
    expect(suggestions[0].durationMinutes).toBeGreaterThan(0);
  });

  it('uses configured geocoding URL and ignores invalid remote payloads', async () => {
    process.env.EXPO_PUBLIC_GEOCODING_URL = 'https://geo.example.test/search';
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ error: 'unexpected payload' }),
    } as Response);

    await expect(searchDestinationSuggestions('palais des expositions', pickup)).resolves.toEqual([]);
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('https://geo.example.test/search'), expect.any(Object));
  });

  it('returns no remote suggestion when the geocoder response is not successful', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => [],
    } as Response);

    await expect(searchDestinationSuggestions('musee matisse', pickup)).resolves.toEqual([]);
  });

  it('filters invalid remote results and keeps fallback labels readable', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [
        { display_name: '', lat: '43.70', lon: '7.27' },
        { display_name: ' , ', lat: '43.71', lon: '7.28' },
      ],
    } as Response);

    const suggestions = await searchDestinationSuggestions('lieu inconnu', pickup);

    expect(suggestions).toEqual([
      expect.objectContaining({
        id: 'geo-43.71-7.28',
        label: 'Destination',
        address: ' , ',
      }),
    ]);
  });

  it('deduplicates local and remote suggestions by label and coordinates', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [
        {
          place_id: 456,
          display_name: `${savedPlaces[0].label}, ${savedPlaces[0].address}`,
          lat: String(savedPlaces[0].latitude),
          lon: String(savedPlaces[0].longitude),
          name: savedPlaces[0].label,
        },
      ],
    } as Response);

    const suggestions = await searchDestinationSuggestions('aeroport', pickup);

    expect(suggestions.filter((suggestion) => suggestion.label === savedPlaces[0].label)).toHaveLength(1);
  });

  it('falls back to local suggestions when remote geocoding fails', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network'));

    const suggestions = await searchDestinationSuggestions('aeroport', pickup);

    expect(suggestions[0].label).toBe(savedPlaces[0].label);
  });

  it('recomputes route estimates from the current pickup', () => {
    const estimated = withRouteEstimate(savedPlaces[0], pickup);

    expect(Number(estimated.distanceKm)).toBeGreaterThan(0);
    expect(estimated.durationMinutes).toBeGreaterThan(0);
  });
});
