import type { LucideIcon } from "lucide-react";

export interface DashboardMetric {
  label: string;
  value: string;
  detail: string;
  trend?: string;
  tone: "navy" | "blue" | "green" | "amber" | "violet";
  icon: LucideIcon;
}

export interface SlaPoint {
  label: string;
  value: number;
}

export interface DashboardSnapshot {
  generatedAt: string;
  metrics: DashboardMetric[];
  sla: {
    current: number;
    target: number;
    points: SlaPoint[];
  };
  codCash: string;
  scheduledWaybills: string;
}
