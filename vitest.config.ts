import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: [
      { find: "react", replacement: "preact/compat" },
      { find: "react-dom/test-utils", replacement: "preact/test-utils" },
      { find: "react-dom", replacement: "preact/compat" },
      { find: "react/jsx-runtime", replacement: "preact/jsx-runtime" },
      {
        find: "@r2-opds-js/opds/opds1/opds",
        replacement: path.resolve(
          __dirname,
          "node_modules/r2-opds-js/dist/es6-es2015/src/opds/opds1/opds.js"
        ),
      },
      {
        find: "@r2-opds-js/opds/opds1/opds-entry",
        replacement: path.resolve(
          __dirname,
          "node_modules/r2-opds-js/dist/es6-es2015/src/opds/opds1/opds-entry.js"
        ),
      },
      {
        find: "@r2-utils-js/_utils/xml-js-mapper",
        replacement: path.resolve(
          __dirname,
          "node_modules/r2-utils-js/dist/es6-es2015/src/_utils/xml-js-mapper/xml.js"
        ),
      },
      {
        find: "@r2-opds-js/opds/opds1/opds-link",
        replacement: path.resolve(
          __dirname,
          "node_modules/r2-opds-js/dist/es6-es2015/src/opds/opds1/opds-link.js"
        ),
      },
      {
        find: "@r2-opds-js/opds/init-globals",
        replacement: path.resolve(
          __dirname,
          "node_modules/r2-opds-js/dist/es6-es2015/src/opds/init-globals.js"
        ),
      },
      {
        find: /^~\/(.+)/,
        replacement: path.resolve(__dirname, "src/$1"),
      },
    ],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
  },
});
