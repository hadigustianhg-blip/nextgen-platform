export function jakartaOperationalDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function resolveJakartaOperationalDate(
  operationalDate: string,
  now = new Date(),
) {
  return operationalDate || jakartaOperationalDate(now);
}
