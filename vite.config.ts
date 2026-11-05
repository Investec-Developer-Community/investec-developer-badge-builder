import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/investec-developer-badge-builder/',
  plugins: [react()],
});
