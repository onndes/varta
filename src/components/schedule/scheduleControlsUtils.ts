const STOP_MIN_MULTI_RESTART_ATTEMPT = 251;

export const canStopSchedulerAtProgress = (
  schedulerProgress: { phase: string; percent: number } | null | undefined
): boolean => {
  if (!schedulerProgress) return false;

  const isMultiRestartPhase = /^(Multi-Restart|LNS)\b/.test(schedulerProgress.phase);
  if (!isMultiRestartPhase) return false;

  const attemptMatch = schedulerProgress.phase.match(/\(спроба\s+(\d+)/i);
  if (!attemptMatch) return false;

  return Number(attemptMatch[1]) >= STOP_MIN_MULTI_RESTART_ATTEMPT;
};

export const getStopSchedulerTitle = (): string =>
  `Зупинити оптимізацію після ${STOP_MIN_MULTI_RESTART_ATTEMPT - 1}+ спроб`;
