import { runBackgroundSyncAllActiveOutlets } from "./jfs-background-sync.service";

let schedulerTimer: NodeJS.Timeout | null = null;
let isSchedulerRunning = false;

export type SchedulerState = {
  active: boolean;
  intervalMinutes: number;
  lastRunAt: string | null;
  lastRunSummary: Record<string, unknown> | null;
};

let lastSchedulerRunAt: Date | null = null;
let lastSchedulerSummary: Record<string, unknown> | null = null;

export function startAutomaticBackgroundScheduler(intervalMinutes: number = 30): SchedulerState {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
  }

  isSchedulerRunning = true;
  const intervalMs = Math.max(intervalMinutes, 5) * 60 * 1000;

  schedulerTimer = setInterval(async () => {
    try {
      lastSchedulerRunAt = new Date();
      const outcome = await runBackgroundSyncAllActiveOutlets();
      lastSchedulerSummary = outcome;
    } catch (err) {
      lastSchedulerSummary = {
        error: err instanceof Error ? err.message : String(err),
        failedAt: new Date().toISOString(),
      };
    }
  }, intervalMs);

  return getSchedulerState(intervalMinutes);
}

export function stopAutomaticBackgroundScheduler(): SchedulerState {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  isSchedulerRunning = false;
  return getSchedulerState(30);
}

export function getSchedulerState(defaultIntervalMinutes: number = 30): SchedulerState {
  return {
    active: isSchedulerRunning,
    intervalMinutes: defaultIntervalMinutes,
    lastRunAt: lastSchedulerRunAt?.toISOString() ?? null,
    lastRunSummary: lastSchedulerSummary,
  };
}
