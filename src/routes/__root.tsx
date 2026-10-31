import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { TYPE_BOOT } from "@/lib/tl/storage";
import { BUILD_ID } from "@/lib/tl/pwa";
import { previewPathPrefix, deployedBase } from "@/lib/preview-path-prefix";
import appCss from "../styles.css?url";

const APP_NAME = "TLNotes";

function publicShareHost() {
  const host = String(import.meta.env.VITE_PUBLIC_HOSTNAME ?? "")
    .split(",")[0]
    .trim()
    .split(":")[0]
    .toLowerCase();
  if (!host || !/^[a-z0-9.-]+$/.test(host) || !host.includes(".")) return "";
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return "";
  if (
    host === "vercel.app" ||
    host.endsWith(".vercel.app") ||
    host === "vercel.com" ||
    host.endsWith(".vercel.com")
  ) {
    return "";
  }
  return host;
}

export const Route = createRootRoute({
  head: () => {
    const host = publicShareHost();
    const prefix =
      typeof window === "undefined" ? "" : (previewPathPrefix(window.location.hostname, window.location.pathname) ?? "");
    const root = `${prefix}${deployedBase()}`;
    const pub = (path: string) => `${root}${path}`;
    const xBanner = host ? `https://${host}/x-banner.jpg` : "";
    return {
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" },
      { title: APP_NAME },
      { name: "application-name", content: APP_NAME },
      { name: "apple-mobile-web-app-title", content: APP_NAME },
      {
        name: "description",
        content: "A private timeline for notes, events, and the periods they belong to.",
      },
      { name: "theme-color", content: "#f3efe6" },
      { name: "tlnotes-build", content: BUILD_ID },
      ...(xBanner ? [{ property: "x:game:image", content: xBanner }] : []),
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: pub("/favicon.svg") },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: `${root}/manifest.webmanifest` },
      { rel: "apple-touch-icon", href: pub("/icons/apple-touch-icon.png") },
    ],
    };
  },
  component: () => (
    <html lang="en" className="antialiased" data-theme="plaque" data-scheme="parchment" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: TYPE_BOOT }} />
      </head>
      <body>
        <PreviewHostBridge />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
