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
 * Save text content to a file.
 * - In Tauri: opens a native "Save As" dialog → writes to chosen path.
 * - In browser/file://: falls back to Blob + <a> download trick.
 */
export const saveTextFile = async (content: string, defaultFilename: string): Promise<void> => {
  if (isTauri()) {
    try {
      // Dynamic imports so these modules are tree-shaken in non-Tauri builds
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');

      const filePath = await save({
        defaultPath: defaultFilename,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });

      if (filePath) {
        await writeTextFile(filePath, content);
      }
      return;
    } catch (err) {
      console.warn('Tauri save dialog failed, falling back to browser download:', err);
      // Fall through to browser download
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
