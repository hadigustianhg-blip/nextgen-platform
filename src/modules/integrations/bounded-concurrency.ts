export async function mapConcurrent<T, R>(
  items: T[],
  concurrencyLimit: number,
  fn: (item: T) => Promise<R>
): Promise<Array<{ status: "fulfilled"; value: R } | { status: "rejected"; reason: unknown }>> {
  if (items.length === 0) return [];
  const results: Array<{ status: "fulfilled"; value: R } | { status: "rejected"; reason: unknown }> = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index++;
      const item = items[currentIndex];
      try {
        const val = await fn(item);
        results[currentIndex] = { status: "fulfilled", value: val };
      } catch (err) {
        results[currentIndex] = { status: "rejected", reason: err };
      }
    }
  }

  const workerCount = Math.max(1, Math.min(concurrencyLimit, items.length));
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);
  return results;
}
