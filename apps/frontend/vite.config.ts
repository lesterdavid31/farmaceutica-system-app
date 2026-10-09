import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // En producción frontend y backend comparten dominio (Vercel Services);
    // en desarrollo se replica con un proxy hacia la API local.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
