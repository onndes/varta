import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Убрали настройки css, чтобы не вызывать сбоев
});
