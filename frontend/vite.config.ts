import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@shared': resolve(__dirname, '../shared'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            if ((err as NodeJS.ErrnoException).code === 'ECONNREFUSED') {
              if ('writeHead' in res) {
                (res as import('http').ServerResponse).writeHead(503, { 'Content-Type': 'application/json' });
                (res as import('http').ServerResponse).end(JSON.stringify({ ok: false, db: 'down' }));
              }
            }
          });
        },
      },
    },
  },
  build: {
    /* Split vendor chunks so the heavy dependencies don't block the
     * first paint of every route. Recharts is the largest single
     * import (~250kb gzipped) so it gets its own chunk and is also
     * lazy-loaded on the Reports routes (see App.tsx). */
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query', 'axios'],
          motion: ['framer-motion'],
          forms: ['react-hook-form', '@hookform/resolvers', 'zod'],
          radix: [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-label',
            '@radix-ui/react-slot',
          ],
          icons: ['lucide-react'],
          /* recharts intentionally NOT listed — it's pulled in only
           * via dynamic import from the lazy-loaded Reports routes,
           * so Rollup gives it its own chunk automatically. */
        },
      },
    },
    /* Default 500kb soft limit triggers warnings on the icons chunk;
     * 800kb keeps the warning useful without firing on benign bundles. */
    chunkSizeWarningLimit: 800,
  },
});
