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

export function shiftCalendarDate(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function jakartaDateRange(daysBack = 3, now = new Date()) {
  const endDate = jakartaOperationalDate(now);
  return { startDate: shiftCalendarDate(endDate, -daysBack), endDate };
}

export function jakartaCurrentMonthRange(now = new Date()) {
  const today = jakartaOperationalDate(now);
  const [year, month] = today.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year!, month!, 0)).getUTCDate();
  return {
    startDate: `${today.slice(0, 7)}-01`,
    endDate: `${today.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`,
  };
}
