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

// data-seo="route" matches the selector in src/components/SEO.jsx so the runtime
// useEffect can replace these on client-side navigation (and so we never end up
// with both the prerendered script and a runtime-added duplicate on the same page).
const jsonLdScript = (obj) =>
  `<script type="application/ld+json" data-seo="route">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`

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
  // Each replacement must actually find its target tag. If a regex stops
  // matching (e.g. someone reformats index.html, reorders attributes, or
  // drops a tag), we'd silently ship the default head on every prerendered
  // page. We test for the match explicitly because for the `/` route the
  // replacement is often byte-identical to the source — checking
  // before !== after would false-positive that as a miss.
  const missed = []
  const applyReplace = (label, pattern, replacement) => {
    if (!pattern.test(out)) {
      missed.push(label)
      return
    }
    out = out.replace(pattern, replacement)
  }

  applyReplace('<title>', /<title>[^<]*<\/title>/i, `<title>${seo.title}</title>`)

  applyReplace(
    'meta[name="description"]',
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${seo.description}">`
  )

  applyReplace(
    'link[rel="canonical"]',
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
    `<link rel="canonical" href="${htmlEscape(seo.canonical)}">`
  )

  applyReplace(
    'meta[property="og:title"]',
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:title" content="${seo.title}">`
  )
  applyReplace(
    'meta[property="og:description"]',
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:description" content="${seo.description}">`
  )
  applyReplace(
    'meta[property="og:url"]',
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:url" content="${htmlEscape(seo.canonical)}">`
  )
  applyReplace(
    'meta[property="og:image"]',
    /<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/i,
    `<meta property="og:image" content="${htmlEscape(seo.ogImage)}">`
  )

  applyReplace(
    'meta[name="twitter:title"]',
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:title" content="${seo.title}">`
  )
  applyReplace(
    'meta[name="twitter:description"]',
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:description" content="${seo.description}">`
  )
  applyReplace(
    'meta[name="twitter:image"]',
    /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/i,
    `<meta name="twitter:image" content="${htmlEscape(seo.ogImage)}">`
  )

  // JSON-LD: insert just before </head>.
  if (seo.ld) {
    applyReplace('</head>', /<\/head>/i, `${seo.ld}</head>`)
  }

  if (missed.length > 0) {
    throw new Error(
      `[prerender] SEO injection failed for route "${route}": no match for ${missed.join(', ')}. ` +
      `Check index.html — a tag was renamed, reformatted, or removed.`
    )
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
