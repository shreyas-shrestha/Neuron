/** Exponential backoff delay with ±20% jitter to reduce synchronized polling. */
export function backoffInterval(attempt, baseMs = 1200, maxMs = 8000) {
  const exp = Math.min(maxMs, baseMs * Math.pow(1.4, attempt));
  return exp * (0.8 + Math.random() * 0.4);
}

/** Stop polling after this wall-clock duration (stuck workers / silent failures). */
export const ANALYSIS_POLL_MAX_WAIT_MS = 45 * 60 * 1000;

export function pollTimedOut(startedAtMs, maxWaitMs = ANALYSIS_POLL_MAX_WAIT_MS) {
  return Date.now() - startedAtMs >= maxWaitMs;
}
