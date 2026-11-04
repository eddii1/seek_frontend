import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
const proxy = {'/api': {target: process.env.SEEK_BACKEND_URL || 'http://127.0.0.1:8000', changeOrigin: true, ws: true,
  rewrite: (path: string) => path.replace(/^\/api/, '')}};
export default defineConfig({ plugins: [react(), tailwindcss()], server: {proxy}, preview: {proxy} });
