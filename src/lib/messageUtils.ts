export interface MessageSortable {
  id?: string;
  platformMessageId?: string;
  timestamp?: string | number | any;
  createdAt?: string | number | any;
}

/**
 * Safely normalizes any timestamp format to epoch milliseconds.
 * Supports:
 * - ISO 8601 strings (e.g. "2026-09-13T08:12:12.915Z")
 * - Firestore Timestamps (with .toMillis(), .toDate(), or .seconds / ._seconds)
 * - JavaScript Date objects
 * - Unix millisecond or second numbers
 */
export function normalizeTimestampToMillis(ts: any): number {
  if (ts === null || ts === undefined) return 0;
  if (typeof ts === "number") {
    // If it's in seconds (10 digits), convert to ms
    return ts < 10000000000 ? ts * 1000 : ts;
  }
  if (typeof ts === "string") {
    const millis = Date.parse(ts);
    return isNaN(millis) ? 0 : millis;
  }
  if (typeof ts === "object") {
    if (typeof ts.toMillis === "function") return ts.toMillis();
    if (typeof ts.toDate === "function") return ts.toDate().getTime();
    if (ts instanceof Date) return ts.getTime();
    if (typeof ts.seconds === "number") {
      const nanos = typeof ts.nanoseconds === "number" ? ts.nanoseconds : 0;
      return ts.seconds * 1000 + Math.round(nanos / 1000000);
    }
    if (typeof ts._seconds === "number") {
      const nanos = typeof ts._nanoseconds === "number" ? ts._nanoseconds : 0;
      return ts._seconds * 1000 + Math.round(nanos / 1000000);
    }
  }
  return 0;
}

/**
 * Stable chronological comparison for chat messages:
 * Oldest message first (index 0), Newest message last (at bottom of chat).
 * Uses message ID as stable secondary sorting to prevent flickering when timestamps match.
 */
export function compareMessages(a: MessageSortable, b: MessageSortable): number {
  const timeA = normalizeTimestampToMillis(a.timestamp || a.createdAt);
  const timeB = normalizeTimestampToMillis(b.timestamp || b.createdAt);
  if (timeA !== timeB) {
    return timeA - timeB;
  }
  const idA = String(a.id || a.platformMessageId || "");
  const idB = String(b.id || b.platformMessageId || "");
  return idA.localeCompare(idB);
}
