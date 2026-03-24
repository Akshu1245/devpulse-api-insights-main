export function getSafeNext(next: string | null, fallback: string): string {
  if (!next) return fallback;
  return next.startsWith("/") ? next : fallback;
}
