import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5175,
    proxy: {
      '/matchmake': { target: 'http://localhost:2570', changeOrigin: true },
      '/health': { target: 'http://localhost:2570', changeOrigin: true }
    }
  },
  build: { target: 'es2022', sourcemap: true }
});
