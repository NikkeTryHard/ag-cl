/**
 * Format a timestamp as time ago
 * @param timestamp - Unix timestamp in milliseconds
 * @param compact - If true, use compact format (5s, 2m, 1h). If false, use verbose (5 min ago)
 */
export function formatTimeAgo(timestamp: number | null | undefined, compact = false): string {
  if (!timestamp) return "";
  const diffMs = Date.now() - timestamp;
  const seconds = Math.floor(diffMs / 1000);

  if (compact) {
    if (seconds < 60) return `${String(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${String(minutes)}m`;
    const hours = Math.floor(minutes / 60);
    return `${String(hours)}h`;
  }

  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${String(diffMins)} min ago`;

  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  if (mins > 0) return `${String(hours)}h ${String(mins)}m ago`;
  return `${String(hours)}h ago`;
}
