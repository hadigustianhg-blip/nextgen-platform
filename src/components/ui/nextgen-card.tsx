import type { HTMLAttributes, ReactNode } from "react";

const cx = (...values: Array<string | undefined | false>) =>
  values.filter(Boolean).join(" ");

export const nextgenControlClass =
  "h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500";
export const nextgenButtonClass =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold shadow-sm transition hover:-translate-y-px disabled:pointer-events-none disabled:opacity-50";
export const nextgenNeutralButtonClass = `${nextgenButtonClass} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`;

export function AppCard({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cx(
        "rounded-2xl border border-slate-200 bg-white shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-blue-600">{eyebrow}</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-950">{title}</h1>
        <p className="mt-2 text-slate-600">{description}</p>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </header>
  );
}

export function MetricCard({
  label,
  value,
  note,
  noteTone = "muted",
}: {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  noteTone?: "muted" | "warning";
}) {
  return (
    <AppCard className="flex min-h-32 h-full flex-col p-5">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
        {value}
      </p>
      {note && (
        <p
          className={cx(
            "mt-auto pt-2 text-xs",
            noteTone === "warning" ? "text-amber-700" : "text-slate-500",
          )}
        >
          {note}
        </p>
      )}
    </AppCard>
  );
}

export function FilterCard({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <AppCard className={cx("p-4", className)}>{children}</AppCard>;
}

export function TableCard({
  children,
  footer,
  className,
}: {
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <AppCard className={cx("overflow-hidden", className)}>
      {children}
      {footer && (
        <div className="border-t border-slate-200 p-4 text-sm">{footer}</div>
      )}
    </AppCard>
  );
}

export function SectionCard({
  id,
  title,
  description,
  badge,
  children,
  className,
}: {
  id?: string;
  title?: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <AppCard id={id} className={cx("p-5", className)}>
      {(title || description || badge) && (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            {title && (
              <h2 className="text-xl font-bold text-slate-950">{title}</h2>
            )}
            {description && (
              <div className="mt-1 text-sm text-slate-500">{description}</div>
            )}
          </div>
          {badge}
        </div>
      )}
      {children}
    </AppCard>
  );
}

export function ModalCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "max-h-[92vh] w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl",
        className,
      )}
    >
      {children}
    </div>
  );
}
