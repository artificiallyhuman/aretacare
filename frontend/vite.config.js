import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import compression from 'vite-plugin-compression'
import prerender from '@prerenderer/rollup-plugin'
import { visualizer } from 'rollup-plugin-visualizer'
import { ROUTE_SEO, fullTitleFor, SEO_DEFAULTS } from './src/constants/seoRoutes.js'

// Public routes prerendered at build time so crawlers and social-preview bots
// receive fully-rendered HTML with per-route <title>/<meta>/OG tags injected
// by postProcess (Helmet's deferred DOM mutations don't flush reliably under
// Puppeteer's HTML capture, so we inject the head tags directly here instead).
const PRERENDER_ROUTES = Object.keys(ROUTE_SEO)

const htmlEscape = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const jsonLdScript = (obj) =>
  `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`

// Build the per-route head fragment that replaces the default head in the
// prerendered HTML. Returns string suitable for injecting into <head>.
function buildHeadFor(route) {
  const meta = ROUTE_SEO[route]
  if (!meta) return null

  const title = htmlEscape(fullTitleFor(route))
  const description = htmlEscape(meta.description || SEO_DEFAULTS.DEFAULT_DESCRIPTION)
  const canonical = `${SEO_DEFAULTS.SITE_URL}${route}`
  const ogImage = meta.ogImage || SEO_DEFAULTS.DEFAULT_OG_IMAGE
  const ld = (meta.jsonLd || []).map(jsonLdScript).join('')

  return { title, description, canonical, ogImage, ld }
}

function injectSeoTags(html, route) {
  const seo = buildHeadFor(route)
  if (!seo) return html

  let out = html

  // <title>
  out = out.replace(/<title>[^<]*<\/title>/i, `<title>${seo.title}</title>`)

  // Description (name="description")
  out = out.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${seo.description}">`
  )

  // Canonical
  out = out.replace(
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
    `<link rel="canonical" href="${htmlEscape(seo.canonical)}">`
  )

  // Open Graph
  out = out.replace(
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:title" content="${seo.title}">`
  )
  out = out.replace(
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:description" content="${seo.description}">`
  )
  out = out.replace(
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:url" content="${htmlEscape(seo.canonical)}">`
  )
  out = out.replace(
    /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:image" content="${htmlEscape(seo.ogImage)}">`
  )

  // Twitter
  out = out.replace(
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:title" content="${seo.title}">`
  )
  out = out.replace(
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:description" content="${seo.description}">`
  )
  out = out.replace(
    /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:image" content="${htmlEscape(seo.ogImage)}">`
  )

  // JSON-LD: insert just before </head>
  if (seo.ld) {
    out = out.replace('</head>', `${seo.ld}</head>`)
  }

  return out
}

export default defineConfig(({ mode, command }) => ({
  plugins: [
    react(),
    compression({ algorithm: 'brotliCompress', ext: '.br' }),
    compression({ algorithm: 'gzip', ext: '.gz' }),
    process.env.ANALYZE && visualizer({
      filename: 'dist/bundle-stats.html',
      template: 'treemap',
      gzipSize: true,
      brotliSize: true,
    }),
    command === 'build' && prerender({
      routes: PRERENDER_ROUTES,
      renderer: '@prerenderer/renderer-puppeteer',
      rendererOptions: {
        renderAfterTime: 2000,
        maxConcurrentRoutes: 4,
        headless: true,
      },
      postProcess(renderedRoute) {
        // Inject the per-route SEO head tags. Puppeteer's snapshot still has
        // the default head from index.html at this point because Helmet's
        // rAF-batched DOM mutations don't reliably flush before capture.
        renderedRoute.html = injectSeoTags(renderedRoute.html, renderedRoute.route)
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
