// src/hooks/useUsers.ts

import { useState, useEffect, useCallback } from 'react';
import type { User } from '../types';
import * as userService from '../services/userService';
import * as auditService from '../services/auditService';
import { RANK_WEIGHTS } from '../utils/constants';

/**
 * Custom hook for managing users
 */
export const useUsers = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load and sort users
  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const allUsers = await userService.getAllUsers();

      // Sort users by active status, rank, and name
      allUsers.sort((a, b) => {
        if (a.isActive !== b.isActive) {
          return (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0);
        }
        const rankDiff = (RANK_WEIGHTS[b.rank] || 0) - (RANK_WEIGHTS[a.rank] || 0);
        if (rankDiff !== 0) return rankDiff;
        return a.name.localeCompare(b.name);
      });

      setUsers(allUsers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
      console.error('Error loading users:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Create new user
  const createUser = useCallback(
    async (user: Omit<User, 'id'>) => {
      try {
        const userId = await userService.createUser(user);
        await auditService.logAction('ADD', `Додано: ${user.name}`);
        await loadUsers();
        return userId;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create user');
        throw err;
      }
    },
    [loadUsers]
  );

  // Update user
  const updateUser = useCallback(
    async (id: number, updates: Partial<User>) => {
      try {
        await userService.updateUser(id, updates);
        const user = users.find((u) => u.id === id);
        if (user) {
          await auditService.logAction('EDIT', `Редаговано: ${user.name}`);
        }
        await loadUsers();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update user');
        throw err;
      }
    },
    [users, loadUsers]
  );

  // Delete user
  const deleteUser = useCallback(
    async (id: number) => {
      try {
        const user = users.find((u) => u.id === id);
        await userService.deleteUser(id);
        if (user) {
          await auditService.logAction('DELETE', `Видалено: ${user.name}`);
        }
        await loadUsers();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete user');
        throw err;
      }
    },
    [users, loadUsers]
  );

  // Reset user debt
  const resetUserDebt = useCallback(
    async (id: number) => {
      try {
        await userService.resetUserDebt(id);
        await loadUsers();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to reset debt');
        throw err;
      }
    },
    [loadUsers]
  );

  // Bulk create users
  const bulkCreateUsers = useCallback(
    async (newUsers: Omit<User, 'id'>[]) => {
      try {
        await userService.bulkCreateUsers(newUsers);
        await auditService.logAction('BULK_ADD', `Додано ${newUsers.length} користувачів`);
        await loadUsers();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to bulk create users');
        throw err;
      }
    },
    [loadUsers]
  );

  // Get user by ID
  const getUserById = useCallback(
    (id: number) => {
      return users.find((u) => u.id === id);
    },
    [users]
  );

  // Get active users
  const getActiveUsers = useCallback(() => {
    return users.filter((u) => u.isActive);
  }, [users]);

  // Get available users for a date
  const getAvailableUsers = useCallback(
    (dateStr: string) => {
      return users.filter((u) => userService.isUserAvailable(u, dateStr));
    },
    [users]
  );

  // Initial load
  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  return {
    users,
    loading,
    error,
    loadUsers,
    createUser,
    updateUser,
    deleteUser,
    resetUserDebt,
    bulkCreateUsers,
    getUserById,
    getActiveUsers,
    getAvailableUsers,
  };
};
