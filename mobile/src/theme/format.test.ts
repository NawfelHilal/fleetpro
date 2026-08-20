import { driverPositionFreshnessLabel, formatEuro, statusLabel } from './format';

describe('format helpers', () => {
  it('formats euro cents with two decimals', () => {
    expect(formatEuro(2500)).toBe('25.00 EUR');
    expect(formatEuro(375)).toBe('3.75 EUR');
    expect(formatEuro(0)).toBe('0.00 EUR');
  });

  it('maps known ride statuses and keeps unknown status readable', () => {
    expect(statusLabel('REQUESTED')).toBe('Recherche chauffeur');
    expect(statusLabel('ACCEPTED')).toBe('Chauffeur en route');
    expect(statusLabel('IN_PROGRESS')).toBe('Course en cours');
    expect(statusLabel('COMPLETED')).toBe('Terminee');
    expect(statusLabel('CANCELED')).toBe('Annulee');
    expect(statusLabel('CUSTOM')).toBe('CUSTOM');
  });

  it('explains driver GPS freshness to passengers', () => {
    const now = Date.parse('2026-08-20T10:00:50.000Z');

    expect(driverPositionFreshnessLabel(undefined, now)).toEqual({
      label: 'Position GPS chauffeur en attente.',
      stale: false,
    });
    expect(driverPositionFreshnessLabel('2026-08-20T10:00:20.000Z', now)).toEqual({
      label: 'Position GPS actualisee il y a 30 s.',
      stale: false,
    });
    expect(driverPositionFreshnessLabel('2026-08-20T10:00:00.000Z', now)).toEqual({
      label: 'Derniere position GPS recue il y a 50 s.',
      stale: true,
    });
    expect(driverPositionFreshnessLabel('date-invalide', now)).toEqual({
      label: 'Position GPS chauffeur non datée.',
      stale: true,
    });
    expect(driverPositionFreshnessLabel('2026-08-20T10:00:05.000Z', now)).toEqual({
      label: 'Position GPS actualisee il y a 45 s.',
      stale: false,
    });
    expect(driverPositionFreshnessLabel('2026-08-20T10:01:00.000Z', now)).toEqual({
      label: 'Position GPS actualisee il y a 0 s.',
      stale: false,
    });
  });

  it('uses the current clock when no reference date is provided', () => {
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-08-20T10:00:10.000Z'));

    expect(driverPositionFreshnessLabel('2026-08-20T10:00:00.000Z')).toEqual({
      label: 'Position GPS actualisee il y a 10 s.',
      stale: false,
    });
  });
});
