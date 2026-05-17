import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import compression from 'vite-plugin-compression'
import prerender from '@prerenderer/rollup-plugin'
import { visualizer } from 'rollup-plugin-visualizer'

// Public routes prerendered at build time so crawlers and social-preview bots
// receive fully-rendered HTML with per-route <title>/<meta>/OG tags from
// react-helmet-async. Auth-gated routes are intentionally excluded.
const PRERENDER_ROUTES = [
  '/',
  '/about',
  '/waitlist',
  '/login',
  '/register',
  '/tools/jargon',
  '/tools/coach',
  '/contact',
  '/terms',
  '/privacy',
]

export default defineConfig(({ mode, command }) => ({
  plugins: [
    react(),
    // Brotli + gzip for static assets (Render serves them when present)
    compression({ algorithm: 'brotliCompress', ext: '.br' }),
    compression({ algorithm: 'gzip', ext: '.gz' }),
    // Build a bundle treemap when ANALYZE=1 is set
    process.env.ANALYZE && visualizer({
      filename: 'dist/bundle-stats.html',
      template: 'treemap',
      gzipSize: true,
      brotliSize: true,
    }),
    // Prerender only on production build, never on `vite dev`
    command === 'build' && prerender({
      routes: PRERENDER_ROUTES,
      renderer: '@prerenderer/renderer-puppeteer',
      rendererOptions: {
        // Wait until react-helmet-async has applied the per-route head tags
        // and the SessionContext has resolved to "no user" (no refresh-token
        // cookie in the headless browser so initAuth() returns false fast).
        renderAfterDocumentEvent: 'render-event',
        renderAfterTime: 2000,
        maxConcurrentRoutes: 4,
        headless: 'new',
      },
      postProcess(renderedRoute) {
        // Strip any stray <script> that tried to talk to the API during render
        // so the static HTML doesn't ship a stale auth-check payload.
        renderedRoute.html = renderedRoute.html.replace(
          /<script[^>]*>[\s\S]*?__PRERENDER_INJECTED[\s\S]*?<\/script>/g,
          ''
        )
        return renderedRoute
      },
    }),
  ].filter(Boolean),
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
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-markdown': ['react-markdown'],
        }
      }
    },
    sourcemap: false,
    target: 'ES2020',
  },
  esbuild: {
    drop: mode === 'production' ? ['console', 'debugger'] : [],
  },
}))
