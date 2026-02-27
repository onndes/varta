import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'node:fs';

const isTauri = !!process.env.TAURI_ENV_PLATFORM;
const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version?: string;
};
const appVersion = packageJson.version || '0.0.0';

export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
  },
  plugins: [
    react(),
    // Single-file mode only for web builds; Tauri uses normal dist/ with separate assets
    ...(!isTauri ? [viteSingleFile()] : []),
  ],
  // Prevent Vite from clearing the terminal so Tauri logs stay visible
  clearScreen: false,
  server: {
    // Tauri expects a fixed port; fail if it's already in use
    strictPort: true,
  },
  // Env prefixes: expose VITE_ and TAURI_ variables to the frontend
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    target: 'esnext',
    // Single-file inlining only for web builds
    ...(!isTauri
      ? {
          assetsInlineLimit: 100000000,
          chunkSizeWarningLimit: 100000000,
          cssCodeSplit: false,
          rollupOptions: {
            output: {
              inlineDynamicImports: true,
            },
          },
        }
      : {}),
  },
});
