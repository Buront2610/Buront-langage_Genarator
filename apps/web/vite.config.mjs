import { defineConfig } from 'vite';
export default defineConfig({ root: new URL('.', import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, '$1'), build: { outDir: 'dist', emptyOutDir: true }, server: { host: '127.0.0.1' } });
