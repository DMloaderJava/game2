import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'src/assets',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
