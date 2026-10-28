import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** One stamp for this process. A new build or a new dev server is a new copy; the page compares it and does not reload by itself. */
export function tlnotesBuildPlugin() {
  const stamp = Date.now().toString(36);

  const serve = (req, res, next) => {
    const pathOnly = (req.url ?? "").split("?")[0] ?? "";
    if (pathOnly !== "/__tlnotes/build" && !pathOnly.endsWith("/__tlnotes/build")) {
      next();
      return;
    }
    res.statusCode = 200;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.end(stamp);
  };

  return {
    name: "tlnotes-build",
    enforce: "pre",
    transform(code, id) {
      const file = id.split("?")[0] ?? id;
      if (!file.endsWith("/src/lib/tl/pwa.ts") && !file.endsWith("\\src\\lib\\tl\\pwa.ts")) return;
      if (!code.includes('export const BUILD_ID = "0";')) return;
      return code.replace('export const BUILD_ID = "0";', `export const BUILD_ID = ${JSON.stringify(stamp)};`);
    },
    transformIndexHtml(html) {
      const meta = `<meta name="tlnotes-build" content="${stamp}">`;
      if (html.includes('name="tlnotes-build"')) {
        return html.replace(/<meta name="tlnotes-build" content="[^"]*">/, meta);
      }
      return html.replace("</head>", `  ${meta}\n</head>`);
    },
    configureServer(server) {
      server.middlewares.use(serve);
    },
    configurePreviewServer(server) {
      server.middlewares.use(serve);
    },
    generateBundle() {
      const name = this.environment?.name;
      if (name && name !== "client") return;
      this.emitFile({ type: "asset", fileName: "__tlnotes/build", source: stamp });
    },
    writeBundle(options) {
      if (!options.dir) return;
      const target = join(options.dir, "__tlnotes", "build");
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, stamp);
    },
  };
}
