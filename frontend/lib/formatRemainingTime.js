export function formatRemainingTime(date) {
  if (!date) return null;

  const now = Date.now();
  const target = new Date(date).getTime();
  const diffMs = target - now;

  if (diffMs < 0) {
    const past = Math.abs(diffMs);
    const days = Math.floor(past / 86400000);
    if (days > 0) return `${days}d overdue`;
    const hours = Math.floor(past / 3600000);
    if (hours > 0) return `${hours}h overdue`;
    const minutes = Math.floor(past / 60000);
    return `${minutes}m overdue`;
  }

  const days = Math.floor(diffMs / 86400000);
  if (days > 0) return `${days}d left`;
  const hours = Math.floor(diffMs / 3600000);
  if (hours > 0) return `${hours}h left`;
  const minutes = Math.floor(diffMs / 60000);
  return `${minutes}m left`;
}
