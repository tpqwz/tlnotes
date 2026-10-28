import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// @ts-expect-error JS plugin alongside the TS vite config
import { tlnotesBuildPlugin } from "./scripts/tlnotes-build-plugin.mjs";

const base = process.env.TLNOTES_BASE?.trim() || "/";

/** Plain files for a static host. The live preview keeps using vite.config.ts. */
export default defineConfig({
  base: base.endsWith("/") ? base : `${base}/`,
  plugins: [
    tlnotesBuildPlugin(),
    tailwindcss(),
    tanstackStart({
      spa: { enabled: true },
    }),
    viteReact(),
  ],
});