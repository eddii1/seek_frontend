import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// /api/* goes to the SEEK backend (uv run fleet-viewer ...), so the dashboard and the agent share one origin.
const proxy = {
  '/api/multi': {
    target: process.env.SEEK_MULTIPLAYER_URL || 'http://127.0.0.1:8002',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api\/multi/, ''),
  },
  '/api': {
    target: process.env.SEEK_BACKEND_URL || 'http://127.0.0.1:8001',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api/, ''),
  },
};
export default defineConfig({ plugins: [react(), tailwindcss()], server: { proxy }, preview: { proxy } });
