/** Exponential backoff delay with ±20% jitter to reduce synchronized polling. */
export function backoffInterval(attempt, baseMs = 1200, maxMs = 8000) {
  const exp = Math.min(maxMs, baseMs * Math.pow(1.4, attempt));
  return exp * (0.8 + Math.random() * 0.4);
}
