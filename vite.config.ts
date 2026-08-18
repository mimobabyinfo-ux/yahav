import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['mimo_logo.png', 'icons/*.png'],
      manifest: {
        name: 'Mimo · אמהות בביטחון',
        short_name: 'Mimo',
        description: 'מעקב, סדנאות וקהילה לאמהות טריות',
        theme_color: '#C49438',
        background_color: '#FAF8F4',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        lang: 'he',
        dir: 'rtl',
        icons: [
          // 'any' and 'maskable' are deliberately separate files. A single
          // file marked 'any maskable' gets its edges cropped by Android's
          // circle mask, which is what clipped the ducks' feet.
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Push + notificationclick handlers live in public/push-sw.js.
        // importScripts is how you add behaviour to a Workbox-GENERATED
        // service worker; writing them into the generated file would be
        // overwritten on every build, and switching the whole PWA to
        // injectManifest just for this is a much bigger change.
        importScripts: ['/push-sw.js'],
        // Product and brand images are database-driven and can be large;
        // precaching them made a first visit on cellular download 2.1 MB
        // before the app was usable. The app's own JS/CSS/icons still are.
        globPatterns: ['**/*.{js,css,html,ico,svg,woff2}'],
        globIgnores: ['**/products/**', '**/brand/**'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-cache', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
          // Supabase responses are deliberately NOT cached by the service
          // worker. They were, NetworkFirst for five minutes, and the cache
          // survived sign-out: on a shared phone — which this app invites,
          // it has family share links — a second person could be served the
          // first person's rows. NetworkFirst goes to the network first
          // anyway, so the only thing the cache bought was offline reads,
          // which are not worth that.
        ],
      },
    }),
  ],
  server: {
    port: 5173,
  },
})
