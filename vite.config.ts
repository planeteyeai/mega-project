import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const villageDataApi =
      env.VITE_VILLAGE_DATA_API_URL || 'https://jam-hose-bride-plain.trycloudflare.com';
    const apiProxyTarget =
      env.VITE_API_PROXY_TARGET || 'https://web-production-72a7.up.railway.app';
    return {
      server: {
        port: 3000,
        host: '0.0.0.0', // Bind to all network interfaces (accessible from localhost and network)
        proxy: {
          '/railway': {
            target: apiProxyTarget,
            changeOrigin: true,
            secure: apiProxyTarget.startsWith('https'),
            rewrite: (path) => path.replace(/^\/railway/, ''),
          },
          '/api': {
            target: 'http://192.168.41.80:8000',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api/, ''),
          },
          '/api8040': {
            target: 'http://192.168.42.56:8040',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api8040/, ''),
            secure: false,
            ws: true,
          },
          // OpenStreetMap Nominatim (avoids CORS in dev) — for district/city map focus when get-geojson has no data
          '/nominatim': {
            target: 'https://nominatim.openstreetmap.org',
            changeOrigin: true,
            secure: true,
            rewrite: (path) => path.replace(/^\/nominatim/, ''),
          },
          '/village-data-api': {
            target: villageDataApi,
            changeOrigin: true,
            secure: true,
            rewrite: (path) => path.replace(/^\/village-data-api/, ''),
          },
        },
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
          recharts: path.resolve(__dirname, 'node_modules/recharts'),
        }
      },
      optimizeDeps: {
        include: ['recharts'],
      },
    };
});
