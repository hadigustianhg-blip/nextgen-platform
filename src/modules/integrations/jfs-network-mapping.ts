const networkCodePattern = /^[A-Z0-9_-]+$/;

function canonicalCode(value: string) {
  return value.normalize("NFKC").trim().toUpperCase();
}

export function parseJfsDevelopmentNetworkMapping(rawMapping?: string) {
  const mapping = new Map<string, string>();
  const raw = rawMapping?.trim();
  if (!raw) return mapping;

  for (const entry of raw.split(",")) {
    const parts = entry.split(":");
    if (parts.length !== 2) return new Map<string, string>();
    const outletCode = canonicalCode(parts[0] ?? "");
    const networkCode = canonicalCode(parts[1] ?? "");
    if (
      !outletCode || !networkCode ||
      !networkCodePattern.test(outletCode) ||
      !networkCodePattern.test(networkCode) ||
      outletCode.includes("*") || networkCode.includes("*") ||
      mapping.has(outletCode)
    ) return new Map<string, string>();
    mapping.set(outletCode, networkCode);
  }
  return mapping;
}

export function isJfsNetworkAllowed(input: {
  nextgenOutletCode: string;
  actualJfsNetwork: string;
  environment?: string;
  developmentMapping?: string;
}) {
  const outletCode = canonicalCode(input.nextgenOutletCode);
  const actualNetwork = canonicalCode(input.actualJfsNetwork);
  if (!outletCode || !actualNetwork) return false;
  if (outletCode === actualNetwork) return true;
  if (canonicalCode(input.environment ?? "") !== "DEVELOPMENT") return false;
  return parseJfsDevelopmentNetworkMapping(input.developmentMapping).get(outletCode) === actualNetwork;
}
