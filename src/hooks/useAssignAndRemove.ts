// src/hooks/useAssignAndRemove.ts

import { useCallback } from 'react';
import type { User, ScheduleEntry } from '../types';
import { removeAssignment as removeAssignmentEntry, bulkDeleteSchedule } from '../services/scheduleService';
import * as auditService from '../services/auditService';
import { toAssignedUserIds, getAvailabilityOverrideUserIds } from '../utils/assignment';

interface UseAssignAndRemoveProps {
  users: User[];
  schedule: Record<string, ScheduleEntry>;
}

interface AssignOptions {
  maxPerDay?: number;
  replaceUserId?: number;
  historyMode?: boolean;
  isForced?: boolean; // Force-assign: bypass availability, saved as type 'force'
}

/**
 * Provides core schedule mutation callbacks:
 * assignUser, removeAssignment, bulkDelete.
 */
export const useAssignAndRemove = ({ users, schedule }: UseAssignAndRemoveProps) => {
  const assignUser = useCallback(
    async (
      date: string,
      userId: number,
      isManual = true,
      options?: AssignOptions
    ): Promise<void> => {
      const existing = schedule[date];
      const existingIds = toAssignedUserIds(existing?.userId);
      if (existingIds.includes(userId)) return;

      let nextIds = [...existingIds];
      const replaceUserId = options?.replaceUserId;
      if (typeof replaceUserId === 'number' && nextIds.includes(replaceUserId)) {
        nextIds = nextIds.filter((id) => id !== replaceUserId);
        const prevUser = users.find((u) => u.id === replaceUserId);
        if (prevUser) {
          await auditService.logAction('REMOVE', `${prevUser.name} замінено на ${date}`);
        }
      }

      if (options?.maxPerDay && !options?.historyMode && nextIds.length >= options.maxPerDay) {
        throw new Error('Досягнуто ліміт чергувань на день');
      }

      nextIds.push(userId);

      const isReplace = typeof replaceUserId === 'number';
      const assignedUser = users.find((u) => u.id === userId);
      const preservedOverrideIds = getAvailabilityOverrideUserIds(existing).filter((id) =>
        nextIds.includes(id)
      );
      const entryType = options?.historyMode
        ? 'history'
        : options?.isForced
          ? 'force'
          : isManual
            ? isReplace
              ? 'replace'
              : 'manual'
            : 'auto';

      const { saveScheduleEntry } = await import('../services/scheduleService');
      const entry: ScheduleEntry = {
        date,
        userId: nextIds.length === 1 ? nextIds[0] : nextIds,
        type: entryType,
        isLocked: false,
        availabilityOverrideUserIds:
          preservedOverrideIds.length > 0 ? preservedOverrideIds : undefined,
      };
      await saveScheduleEntry(entry);

      if (assignedUser) {
        await auditService.logAction('ASSIGN', `${assignedUser.name} на ${date}`);
      }
    },
    [users, schedule]
  );

  const removeAssignment = useCallback(
    async (date: string, targetUserId?: number): Promise<void> => {
      const entry = schedule[date];
      if (!entry || !entry.userId) return;
      await removeAssignmentEntry(date, targetUserId);
    },
    [schedule]
  );

  const bulkDelete = useCallback(async (dates: string[]): Promise<void> => {
    await bulkDeleteSchedule(dates);
    await auditService.logAction('BULK_DELETE', `Видалено ${dates.length} записів`);
  }, []);

  return { assignUser, removeAssignment, bulkDelete };
};
