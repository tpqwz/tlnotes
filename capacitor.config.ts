import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.tlnotes.journal",
  appName: "TLNotes",
  webDir: "dist/client",
  android: {
    adjustMarginsForEdgeToEdge: "auto",
  },
  plugins: {
    SystemBars: {
      insetsHandling: "css",
      initialViewportFitValueHint: "cover",
    },
  },
};

export default config;
