import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'src/assets',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    cors: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'X-Requested-With, content-type, Authorization',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
