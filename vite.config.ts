import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // getUserMedia requires a secure context. localhost counts as secure, so plain
    // HTTP is fine here; use `--host` + a tunnel (or vite --https) to test on a phone.
    host: true,
    headers: {
      // Minimal hardening even for dev; production headers should be set by hosting.
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    },
  },
  preview: {
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
  },
  build: {
    target: 'es2020',
    sourcemap: true,
    cssCodeSplit: true,
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        manualChunks: {
          // MediaPipe is large and entirely optional — keep it out of the main bundle
          // so the booth boots fast and only pays for tracking when it is switched on.
          vision: ['@mediapipe/tasks-vision'],
          react: ['react', 'react-dom', 'zustand'],
          three: ['three'],
        },
      },
    },
  },
  esbuild: {
    legalComments: 'none',
  },
  worker: { format: 'es' },
});
