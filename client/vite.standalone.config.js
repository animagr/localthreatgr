// FORK(gr): builds localthreat as one self-contained HTML file that runs
// from disk with no server: `npm run build:standalone` writes
// `dist-standalone/localthreat.html`. See FORK.md.
//
// On top of the upstream config (`vite.config.js`) this:
// - uses `src/standalone/main.tsx` (hash routing) instead of `src/script.tsx`,
// - aliases `~/lib/api` to `src/standalone/api.ts` (reports in localStorage),
// - inlines the script, the stylesheet and the SVG icon into the HTML, because
//   browsers refuse to load module scripts from separate `file://` URLs.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "vite";
import upstream from "./vite.config.js";

const root = import.meta.dirname;
const upstreamEntry = "/src/script.tsx";
const standaloneEntry = "/src/standalone/main.tsx";
const standaloneApi = join(root, "src/standalone/api.ts");
const upstreamApi = join(root, "src/lib/api.ts");
const outputName = "localthreat.html";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Stops inlined code from closing its own <script>/<style> element early.
function escapeClosingTag(code, tag) {
  return code.replace(new RegExp(`</(${tag})`, "gi"), "<\\/$1");
}

function standaloneHtml() {
  return {
    name: "localthreatgr-standalone-html",
    enforce: "post",

    transformIndexHtml: {
      order: "pre",
      handler(html) {
        if (!html.includes(`src="${upstreamEntry}"`)) {
          throw new Error(
            `index.html no longer loads ${upstreamEntry}; update upstreamEntry in vite.standalone.config.js`,
          );
        }

        const icon = readFileSync(join(root, "public/icon.svg"));
        const iconUri = `data:image/svg+xml;base64,${icon.toString("base64")}`;

        return html
          .replace(`src="${upstreamEntry}"`, `src="${standaloneEntry}"`)
          .replace(/\s*<link rel="icon" href="\/favicon\.ico"[^>]*>/, "")
          .replace('href="/icon.svg"', `href="${iconUri}"`);
      },
    },

    // Fails the build if the alias stopped applying (e.g. upstream renamed
    // `~/lib/api`); the page would otherwise try to reach a missing server.
    buildEnd(error) {
      if (error) {
        return;
      }

      const ids = new Set(
        Array.from(this.getModuleIds(), (id) => id.replaceAll("\\", "/")),
      );
      const normalize = (path) => path.replaceAll("\\", "/");

      if (!ids.has(normalize(standaloneApi))) {
        throw new Error("src/standalone/api.ts is not in the bundle");
      }
      if (ids.has(normalize(upstreamApi))) {
        throw new Error("src/lib/api.ts (the server client) is in the bundle");
      }
    },

    generateBundle(_, bundle) {
      const files = Object.values(bundle);
      const page = files.find((file) => file.fileName.endsWith(".html"));
      const scripts = files.filter((file) => file.type === "chunk");
      const styles = files.filter((file) => file.fileName.endsWith(".css"));
      const others = files.filter(
        (file) =>
          file !== page && !scripts.includes(file) && !styles.includes(file),
      );

      if (!page || scripts.length !== 1 || others.length > 0) {
        throw new Error(
          `Expected one HTML page, one script and CSS only; got ${files
            .map((file) => file.fileName)
            .join(", ")}`,
        );
      }

      let html = String(page.source);

      for (const file of [...scripts, ...styles]) {
        const name = escapeRegExp(file.fileName);
        const isScript = file.type === "chunk";
        const pattern = isScript
          ? new RegExp(`<script\\b[^>]*\\bsrc="[^"]*${name}"[^>]*></script>`)
          : new RegExp(`<link\\b[^>]*\\bhref="[^"]*${name}"[^>]*>`);

        if (!pattern.test(html)) {
          throw new Error(`No tag references ${file.fileName}`);
        }

        // A replacer function, so `$` sequences in the code stay literal.
        html = html.replace(pattern, () =>
          isScript
            ? `<script type="module">${escapeClosingTag(file.code, "script")}</script>`
            : `<style>${escapeClosingTag(String(file.source), "style")}</style>`,
        );
        delete bundle[file.fileName];
      }

      delete bundle[page.fileName];
      this.emitFile({ type: "asset", fileName: outputName, source: html });
    },
  };
}

export default defineConfig({
  ...upstream,
  mode: "standalone",
  base: "./",
  publicDir: false,
  plugins: [...upstream.plugins, standaloneHtml()],
  resolve: {
    ...upstream.resolve,
    // Array form so the exact `~/lib/api` match wins over the `~` prefix.
    alias: [
      { find: /^~\/lib\/api$/, replacement: standaloneApi },
      ...Object.entries(upstream.resolve.alias).map(([find, replacement]) => ({
        find,
        replacement,
      })),
    ],
  },
  build: {
    outDir: "dist-standalone",
    emptyOutDir: true,
    assetsInlineLimit: () => true,
    cssCodeSplit: false,
    modulePreload: false,
  },
});
