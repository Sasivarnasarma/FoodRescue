import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  envDir: fileURLToPath(new URL('../', import.meta.url)),
  envPrefix: 'EXPO_PUBLIC_FIREBASE_',
});
