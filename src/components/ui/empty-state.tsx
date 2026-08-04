import Image from "next/image";

export const emptyStateAssets = {
  data: "/illustrations/empty-data.svg",
  search: "/illustrations/empty-search.svg",
  monitoring: "/illustrations/empty-monitoring.svg",
  payment: "/illustrations/empty-payment.svg",
  sync: "/illustrations/empty-sync.svg",
  integration: "/illustrations/integration-empty.svg",
  maintenance: "/illustrations/maintenance.svg",
} as const;

export type EmptyStateKind = keyof typeof emptyStateAssets;

export function EmptyState({
  kind = "data",
  label,
  className = "",
}: {
  kind?: EmptyStateKind;
  label: string;
  className?: string;
}) {
  return (
    <div className={`grid place-items-center ${className}`} role="status" aria-label={label}>
      <Image
        src={emptyStateAssets[kind]}
        width={640}
        height={420}
        alt=""
        className="h-auto max-h-48 w-full max-w-sm"
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}
