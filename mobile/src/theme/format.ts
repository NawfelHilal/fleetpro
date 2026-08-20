export function formatEuro(cents: number): string {
  return `${(cents / 100).toFixed(2)} EUR`;
}

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    REQUESTED: 'Recherche chauffeur',
    ACCEPTED: 'Chauffeur en route',
    IN_PROGRESS: 'Course en cours',
    COMPLETED: 'Terminee',
    CANCELED: 'Annulee',
  };
  return labels[status] || status;
}

export function driverPositionFreshnessLabel(recordedAt?: string, nowMs = Date.now()): { label: string; stale: boolean } {
  if (!recordedAt) {
    return { label: 'Position GPS chauffeur en attente.', stale: false };
  }

  const recordedAtMs = Date.parse(recordedAt);
  if (Number.isNaN(recordedAtMs)) {
    return { label: 'Position GPS chauffeur non datée.', stale: true };
  }

  const seconds = Math.max(0, Math.floor((nowMs - recordedAtMs) / 1000));
  if (seconds > 45) {
    return { label: `Derniere position GPS recue il y a ${seconds} s.`, stale: true };
  }

  return { label: `Position GPS actualisee il y a ${seconds} s.`, stale: false };
}
