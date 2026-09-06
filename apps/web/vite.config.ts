import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@yct/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env.API_ORIGIN ?? 'http://localhost:8787', changeOrigin: true },
    },
  },
  // `vite preview` dùng để kiểm thử bản build: cũng chuyển tiếp /api sang máy chủ thật.
  preview: {
    port: 4173,
    proxy: {
      '/api': { target: process.env.API_ORIGIN ?? 'http://localhost:8787', changeOrigin: true },
    },
  },
  build: {
    target: 'es2020',
    // Không nạp toàn bộ nội dung / audio khi mở trang: các màn hình nặng được tách chunk.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
} as never);
