import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [
    react(),
    viteSingleFile(), // Вбудовує весь код в один HTML файл
  ],
  build: {
    target: 'esnext',
    assetsInlineLimit: 100000000, // Вбудовує всі файли
    chunkSizeWarningLimit: 100000000,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true, // Всі імпорти в один файл
      },
    },
  },
});
