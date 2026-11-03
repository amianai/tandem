import { defineConfig } from 'vite';

export default defineConfig({
  // Su GitHub Pages il gioco vive in una sottocartella: la passa la build (BASE=/tandem/).
  base: process.env.BASE ?? '/',
  server: { port: 5180, open: false },
  build: { target: 'es2022', sourcemap: true },
});
