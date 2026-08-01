export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { resolveDeliveryMiddlewareBaseUrl } = await import(
    "@/modules/delivery-settlement/delivery-settlement.client"
  );
  // Fail fast at server startup without printing the configured URL.
  resolveDeliveryMiddlewareBaseUrl();
}
