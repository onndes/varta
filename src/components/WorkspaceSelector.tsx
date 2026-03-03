import React, { useState, useRef, useEffect } from 'react';
import {
  getWorkspaces,
  getActiveWorkspaceId,
  setActiveWorkspaceId,
  addWorkspace,
  renameWorkspace,
  deleteWorkspace,
  WORKSPACE_CHANGED_EVENT,
  type Workspace,
} from '../services/workspaceService';
import { switchDatabase } from '../db/db';
import { useDialog } from './useDialog';

interface WorkspaceSelectorProps {
  onSwitch: () => Promise<void>;
}

const WorkspaceSelector: React.FC<WorkspaceSelectorProps> = ({ onSwitch }) => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>(getWorkspaces());
  const [activeId, setActiveId] = useState(getActiveWorkspaceId());
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const { showConfirm } = useDialog();

  const reload = () => {
    setWorkspaces(getWorkspaces());
    setActiveId(getActiveWorkspaceId());
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setEditingId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Keep selector in sync after import/export or changes outside this component.
  useEffect(() => {
    const handleWorkspaceChanged = () => reload();
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'varta_workspaces' || e.key === 'varta_active_workspace') {
        reload();
      }
    };
    window.addEventListener(WORKSPACE_CHANGED_EVENT, handleWorkspaceChanged);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(WORKSPACE_CHANGED_EVENT, handleWorkspaceChanged);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const activeName = workspaces.find((w) => w.id === activeId)?.name || 'База';

  const handleSwitch = async (id: string) => {
    if (id === activeId) {
      setOpen(false);
      return;
    }
    setActiveWorkspaceId(id);
    await switchDatabase(id);
    setActiveId(id);
    setOpen(false);
    await onSwitch();
  };

  const handleAdd = async () => {
    const ws = addWorkspace('Новий підрозділ');
    reload();
    // Immediately switch to the new workspace
    await handleSwitch(ws.id);
    // Start editing the name
    setEditingId(ws.id);
    setEditName(ws.name);
    setOpen(true);
  };

  const handleRename = (ws: Workspace) => {
    setEditingId(ws.id);
    setEditName(ws.name);
  };

  const commitRename = () => {
    if (editingId && editName.trim()) {
      renameWorkspace(editingId, editName.trim());
      reload();
    }
    setEditingId(null);
  };

  const handleDelete = async (ws: Workspace) => {
    if (ws.id === 'default') return;
    if (
      !(await showConfirm(
        `Видалити базу "${ws.name}"?\n\nВсі дані (особи, графіки, логи) цієї бази будуть втрачені назавжди!`
      ))
    )
      return;

    await deleteWorkspace(ws.id);
    reload();
    // If we deleted the active one, reload the app on the default
    if (ws.id === activeId) {
      await switchDatabase('default');
      setActiveId('default');
      await onSwitch();
    }
  };

  return (
    <div ref={ref} className="position-relative d-inline-block">
      <button
        className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1"
        onClick={() => setOpen(!open)}
        title="Перемикання бази даних"
      >
        <i className="fas fa-database" style={{ fontSize: '0.75rem' }} />
        <span
          className="fw-semibold"
          style={{
            maxWidth: '140px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {activeName}
        </span>
        <i className="fas fa-chevron-down" style={{ fontSize: '0.55rem' }} />
      </button>

      {open && (
        <div
          className="position-absolute bg-white border rounded shadow-lg"
          style={{
            top: 'calc(100% + 4px)',
            left: 0,
            minWidth: '260px',
            zIndex: 1050,
          }}
        >
          <div className="p-2 border-bottom small text-muted fw-bold">Бази даних</div>
          {workspaces.map((ws) => (
            <div
              key={ws.id}
              className={`d-flex align-items-center px-2 py-1 ${ws.id === activeId ? 'bg-primary bg-opacity-10' : 'hover-bg-light'}`}
              style={{ cursor: 'pointer' }}
            >
              {editingId === ws.id ? (
                <input
                  autoFocus
                  className="form-control form-control-sm flex-grow-1 me-1"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                />
              ) : (
                <>
                  <span className="flex-grow-1 small py-1" onClick={() => handleSwitch(ws.id)}>
                    {ws.id === activeId && (
                      <i
                        className="fas fa-check text-primary me-1"
                        style={{ fontSize: '0.65rem' }}
                      />
                    )}
                    {ws.name}
                  </span>
                  <button
                    className="btn btn-sm p-0 px-1 text-muted"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRename(ws);
                    }}
                    title="Перейменувати"
                  >
                    <i className="fas fa-pen" style={{ fontSize: '0.6rem' }} />
                  </button>
                  {ws.id !== 'default' && (
                    <button
                      className="btn btn-sm p-0 px-1 text-danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(ws);
                      }}
                      title="Видалити базу"
                    >
                      <i className="fas fa-trash" style={{ fontSize: '0.6rem' }} />
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
          <div className="border-top p-1">
            <button className="btn btn-sm btn-outline-primary w-100" onClick={handleAdd}>
              <i className="fas fa-plus me-1" style={{ fontSize: '0.7rem' }} />
              Додати базу
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkspaceSelector;
