const attempts = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;

export function checkProblemWaybillSensitiveRateLimit(
  key: string,
  now = Date.now(),
) {
  const recent = (attempts.get(key) ?? []).filter(
    (timestamp) => now - timestamp < WINDOW_MS,
  );
  if (recent.length >= MAX_REQUESTS) {
    attempts.set(key, recent);
    return false;
  }
  recent.push(now);
  attempts.set(key, recent);
  return true;
}

export function resetProblemWaybillSensitiveRateLimit() {
  attempts.clear();
}
