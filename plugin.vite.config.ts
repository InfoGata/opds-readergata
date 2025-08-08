// plugin.vite.config.ts
import { defineConfig } from 'vite';
import path from 'path';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [
    viteSingleFile()
  ],
  resolve: {
    alias: {
      "react": "preact/compat",
      "react-dom/test-utils": "preact/test-utils",
      "react-dom": "preact/compat",
      "react/jsx-runtime": "preact/jsx-runtime",
      "@r2-opds-js/opds/opds1/opds": path.resolve(__dirname, 'node_modules/r2-opds-js/dist/es6-es2015/src/opds/opds1/opds.js'),
      "@r2-opds-js/opds/opds1/opds-entry": path.resolve(__dirname, 'node_modules/r2-opds-js/dist/es6-es2015/src/opds/opds1/opds-entry.js'),
      "@r2-utils-js/_utils/xml-js-mapper": path.resolve(__dirname, 'node_modules/r2-utils-js/dist/es6-es2015/src/_utils/xml-js-mapper/xml.js'),
      "@r2-opds-js/opds/opds1/opds-link": path.resolve(__dirname, 'node_modules/r2-opds-js/dist/es6-es2015/src/opds/opds1/opds-link.js'),
      "@r2-opds-js/opds/init-globals": path.resolve(__dirname, 'node_modules/r2-opds-js/dist/es6-es2015/src/opds/init-globals.js')
    }
  },
  define: {
    global: 'globalThis'
  },
  build: {
    minify: true,
    target: 'esnext',
    emptyOutDir: false,
    rollupOptions: {
      input: path.resolve(__dirname, 'src/index.ts'),
      output: {
        entryFileNames: 'index.js',
        format: 'iife'
      }
    }
  }
})