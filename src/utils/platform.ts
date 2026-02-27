// src/utils/platform.ts
// Platform detection for multi-runtime support:
//   1) Dev server (localhost)
//   2) Built index.html opened via file://
//   3) Tauri desktop app

/**
 * Check if running inside a Tauri webview.
 * Tauri 2.x injects `window.__TAURI_INTERNALS__` at startup.
 */
export const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * Check if the app is served from the file:// protocol
 * (built single-file index.html opened directly).
 */
export const isFileProtocol = (): boolean =>
  typeof window !== 'undefined' && window.location.protocol === 'file:';

/**
 * Check if the app is running in development mode (Vite dev server).
 */
export const isDev = (): boolean =>
  typeof import.meta !== 'undefined' && import.meta.env?.DEV === true;

/**
 * Get app version for UI:
 * - Tauri: native app version from bundle metadata.
 * - Browser/file://: Vite-injected package version.
 */
export const getAppVersion = async (): Promise<string> => {
  const fallback = import.meta.env?.VITE_APP_VERSION || '0.0.0';
  if (isTauri()) {
    try {
      const { getVersion } = await import('@tauri-apps/api/app');
      return await getVersion();
    } catch {
      return fallback;
    }
  }
  return fallback;
};

/**
 * Save text content to a file.
 * - In Tauri: opens a native "Save As" dialog → writes to chosen path.
 * - In browser/file://: falls back to Blob + <a> download trick.
 */
export const saveTextFile = async (content: string, defaultFilename: string): Promise<void> => {
  const LAST_SAVE_DIR_KEY = 'varta:last-save-dir';
  const extractDirFromPath = (filePath: string): string | null => {
    const normalized = filePath.replace(/\\/g, '/');
    const idx = normalized.lastIndexOf('/');
    if (idx <= 0) return null;
    return normalized.slice(0, idx);
  };
  const joinPath = (dir: string, filename: string): string => {
    const usesBackslash = dir.includes('\\') && !dir.includes('/');
    const sep = usesBackslash ? '\\' : '/';
    return `${dir.replace(/[\\/]+$/, '')}${sep}${filename}`;
  };

  if (isTauri()) {
    try {
      // Dynamic imports so these modules are tree-shaken in non-Tauri builds
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');
      const lastDir = localStorage.getItem(LAST_SAVE_DIR_KEY);
      const initialPath = lastDir ? joinPath(lastDir, defaultFilename) : defaultFilename;

      const filePath = await save({
        defaultPath: initialPath,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });

      if (filePath) {
        await writeTextFile(filePath, content);
        const dir = extractDirFromPath(filePath);
        if (dir) localStorage.setItem(LAST_SAVE_DIR_KEY, dir);
      }
      return;
    } catch (err) {
      throw new Error(
        `Не вдалося зберегти файл через системний діалог Tauri: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Browser / file:// fallback
  const blob = new Blob([content], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = defaultFilename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
};

/**
 * Trigger print.
 * Works in all modes:
 * - Browser: window.print() with native dialog.
 * - Tauri macOS (WKWebView): window.print() works natively.
 * - Tauri Windows (WebView2): window.print() works since WebView2 v1.0.
 *   If it fails, we show an alert fallback.
 */
export const triggerPrint = (onBeforePrint?: () => void, onAfterPrint?: () => void): void => {
  if (onAfterPrint) {
    window.addEventListener('afterprint', onAfterPrint, { once: true });
  }
  onBeforePrint?.();

  // Small delay to let React re-render print layout
  setTimeout(() => {
    try {
      window.print();
    } catch (err) {
      console.error('Print failed:', err);
      // Cleanup the afterprint listener if print itself failed
      if (onAfterPrint) {
        onAfterPrint();
      }
    }
  }, 150);
};
