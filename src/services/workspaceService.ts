/**
 * Workspace (multi-database) management.
 *
 * Each workspace is a separate IndexedDB database.
 * Metadata (id, name) is stored in localStorage.
 */

const STORAGE_KEY = 'varta_workspaces';
const ACTIVE_KEY = 'varta_active_workspace';

export interface Workspace {
  id: string;
  name: string;
}

/** DB name prefix — each workspace gets its own Dexie database */
const DB_PREFIX = 'DutySchedulerDB_v4';

export const getDbName = (workspaceId: string): string => {
  // Default workspace uses the original name for backward compatibility
  if (workspaceId === 'default') return DB_PREFIX;
  return `${DB_PREFIX}_ws_${workspaceId}`;
};

export const getWorkspaces = (): Workspace[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [{ id: 'default', name: 'Основна база' }];
    const parsed = JSON.parse(raw) as Workspace[];
    if (parsed.length === 0) return [{ id: 'default', name: 'Основна база' }];
    return parsed;
  } catch {
    return [{ id: 'default', name: 'Основна база' }];
  }
};

export const getActiveWorkspaceId = (): string => {
  return localStorage.getItem(ACTIVE_KEY) || 'default';
};

export const setActiveWorkspaceId = (id: string): void => {
  localStorage.setItem(ACTIVE_KEY, id);
};

export const saveWorkspaces = (workspaces: Workspace[]): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workspaces));
};

export const addWorkspace = (name: string): Workspace => {
  const workspaces = getWorkspaces();
  const id = `ws_${Date.now()}`;
  const ws: Workspace = { id, name };
  workspaces.push(ws);
  saveWorkspaces(workspaces);
  return ws;
};

export const renameWorkspace = (id: string, newName: string): void => {
  const workspaces = getWorkspaces();
  const ws = workspaces.find((w) => w.id === id);
  if (ws) {
    ws.name = newName;
    saveWorkspaces(workspaces);
  }
};

export const deleteWorkspace = async (id: string): Promise<void> => {
  if (id === 'default') return; // Cannot delete default
  const workspaces = getWorkspaces().filter((w) => w.id !== id);
  saveWorkspaces(workspaces);

  // Delete the IndexedDB database
  const dbName = getDbName(id);
  const req = indexedDB.deleteDatabase(dbName);
  await new Promise<void>((resolve, reject) => {
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve(); // Best-effort
  });

  // Switch to default if the deleted one was active
  if (getActiveWorkspaceId() === id) {
    setActiveWorkspaceId('default');
  }
};
