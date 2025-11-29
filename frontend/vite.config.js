import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: true,
      }
    }
  },
  build: {
    // Optimize chunk splitting for better caching and initial load times
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React libraries - cached separately, rarely changes
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // Markdown rendering - large library, loaded when needed
          'vendor-markdown': ['react-markdown'],
        }
      }
    },
    // Generate source maps for production debugging (optional, can disable if not needed)
    sourcemap: false,
    // Target modern browsers for smaller bundle size
    target: 'ES2020',
  }
})
