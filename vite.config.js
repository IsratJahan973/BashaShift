import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { readSupabaseConfig } from './src/lib/auth.js';

export default defineConfig(({ mode }) => {
  // Fail before emitting assets if a server secret is accidentally configured as public.
  readSupabaseConfig(loadEnv(mode, process.cwd(), 'VITE_'));
  return {
  plugins: [react()],
  server: {
  port: 5190,
  strictPort: true,
  proxy: { '/api': 'http://localhost:8790' }
},
  build: { rollupOptions: { output: { manualChunks(id) {
    if (id.includes('/node_modules/@supabase/') || id.includes('/node_modules/iceberg-js/')) return 'supabase';
  } } } },
  };
});
