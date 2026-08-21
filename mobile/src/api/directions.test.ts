import { getDrivingRoute } from './directions';

const from = { latitude: 43.694318, longitude: 7.258155 };
const to = { latitude: 43.665287, longitude: 7.215005 };

describe('OSRM directions', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    delete process.env.EXPO_PUBLIC_OSRM_URL;
  });

  it('returns the same coordinate when route start and end are identical', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');

    await expect(getDrivingRoute(from, from)).resolves.toEqual([from]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('maps OSRM GeoJSON coordinates to map coordinates', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        routes: [
          {
            geometry: {
              coordinates: [
                [7.258155, 43.694318],
                [7.250000, 43.690000],
                [7.215005, 43.665287],
              ],
            },
          },
        ],
      }),
    } as Response);

    await expect(getDrivingRoute(from, to)).resolves.toEqual([
      { latitude: 43.694318, longitude: 7.258155 },
      { latitude: 43.69, longitude: 7.25 },
      { latitude: 43.665287, longitude: 7.215005 },
    ]);
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('7.258155,43.694318;7.215005,43.665287'), expect.any(Object));
  });

  it('uses configured OSRM URL', async () => {
    process.env.EXPO_PUBLIC_OSRM_URL = 'https://osrm.example.test/route/v1/driving';
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as Response);

    await getDrivingRoute(from, to);

    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('https://osrm.example.test/route/v1/driving'), expect.any(Object));
  });

  it('falls back to a direct route when OSRM fails', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network'));

    await expect(getDrivingRoute(from, to)).resolves.toEqual([from, to]);
  });

  it('filters invalid OSRM coordinates and falls back when needed', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        routes: [{ geometry: { coordinates: [['bad', 43.69]] } }],
      }),
    } as Response);

    await expect(getDrivingRoute(from, to)).resolves.toEqual([from, to]);
  });
});
