import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // ../shared holds code used by both this app and mobile/.
  server: { fs: { allow: ['.', '../shared'] } },
  // ../shared has no node_modules; resolve its packages from here.
  resolve: { dedupe: ['chessops'] },
});
