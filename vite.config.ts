import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'src/assets',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
