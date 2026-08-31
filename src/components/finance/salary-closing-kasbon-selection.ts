export type SelectableKasbon = {
  id: string;
  remainingAmount: string;
};

export function toggleKasbonSelection(selectedIds: string[], kasbonId: string) {
  return selectedIds.includes(kasbonId)
    ? selectedIds.filter((id) => id !== kasbonId)
    : [...selectedIds, kasbonId];
}

export function resolveSelectedKasbon(
  selectedIds: string[],
  eligibleKasbon: SelectableKasbon[],
) {
  const uniqueIds = new Set(selectedIds);
  return eligibleKasbon.filter((row) => uniqueIds.has(row.id));
}

export function selectedKasbonTotal(
  selectedIds: string[],
  eligibleKasbon: SelectableKasbon[],
) {
  return resolveSelectedKasbon(selectedIds, eligibleKasbon).reduce(
    (total, row) => total + Number(row.remainingAmount),
    0,
  );
}

export async function applySelectedKasbon(
  selectedIds: string[],
  eligibleKasbon: SelectableKasbon[],
  save: (kasbon: SelectableKasbon) => Promise<void>,
) {
  const selected = resolveSelectedKasbon(selectedIds, eligibleKasbon);
  for (const kasbon of selected) await save(kasbon);
  return selected;
}
