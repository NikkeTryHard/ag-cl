/**
 * Format a timestamp as "X min ago" or "X hr Y min ago"
 */
export function formatTimeAgo(timestamp: number | null | undefined): string {
  if (!timestamp) return "";
  const diffMs = Date.now() - timestamp;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${String(diffMins)} min ago`;

  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  if (mins > 0) return `${String(hours)}h ${String(mins)}m ago`;
  return `${String(hours)}h ago`;
}
