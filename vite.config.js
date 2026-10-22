import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Content Security Policy of the built app (the dev server needs inline scripts for React
// refresh, so it only goes into builds). A new network service needs its host here, and in
// the privacy policy (LegalPage.jsx).
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "worker-src 'self' blob:",
  // React and MapLibre set inline style attributes.
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: blob: https://*.cartocdn.com",
  // Map tiles and style (CARTO), relief tiles (AWS), routing (BRouter), weather (Open-Meteo); data: for restoring backup photos.
  "connect-src 'self' data: blob: https://*.cartocdn.com https://s3.amazonaws.com https://brouter.de https://api.open-meteo.com https://archive-api.open-meteo.com",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'csp',
      apply: 'build',
      transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' }],
    },
  ],
});
