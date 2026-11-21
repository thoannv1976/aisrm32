import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Dùng mã nguồn TypeScript của gói dùng chung (cùng quy tắc quyền/workflow với API)
      '@aisrm/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // Giống rewrite /api/** của Firebase Hosting → Cloud Run
    proxy: { '/api': 'http://127.0.0.1:8080' },
  },
});
