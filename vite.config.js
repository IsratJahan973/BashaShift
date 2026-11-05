import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { readSupabaseConfig } from './src/lib/auth.js';

export default defineConfig(({ mode, command }) => {
  // Never emit a client bundle containing server credentials or unusable live configuration.
  readSupabaseConfig(loadEnv(mode, process.cwd(), 'VITE_'), {
    requireHosted: command === 'build' && mode === 'production',
  });
  const serverPort = Number(loadEnv(mode, process.cwd(), 'PORT').PORT || 8787);
  if (!Number.isInteger(serverPort) || serverPort < 1 || serverPort > 65535) throw new Error('Use a valid server PORT.');
  return {
    plugins: [react()],
    ...(command === 'serve' ? { server: {
      port: 5173,
      proxy: { '/api': `http://127.0.0.1:${serverPort}` },
    } } : {}),
    build: { rollupOptions: { output: { manualChunks(id) {
      if (id.includes('/node_modules/@supabase/') || id.includes('/node_modules/iceberg-js/')) return 'supabase';
    } } } },
  };
});
