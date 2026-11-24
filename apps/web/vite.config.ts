/// <reference types="vitest/config" />
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { svelteTesting } from "@testing-library/svelte/vite";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { parseOrigin } from "./src/lib/settings";
import { SHARE_ROUTE } from "./src/lib/share";

/** The page may connect to itself and, when one is configured, to the resolver. Nothing else. */
export function contentSecurityPolicyFor(resolver: string | null): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    resolver ? `connect-src 'self' ${resolver}` : "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

/** Reads the resolver address from the build settings and fails the build on a bad one. */
export function resolverOrigin(value: string | undefined): string | null {
  if (value === undefined || value.trim() === "") return null;
  const origin = parseOrigin(value);
  if (origin === null) {
    throw new Error(
      "VITE_RESOLVER_URL must be an https address, or http on localhost, with no credentials.",
    );
  }
  return origin;
}

/** Adds the policy to the production page only; the development server needs inline scripts. */
function contentSecurityPolicy(resolver: string | null): Plugin {
  return {
    name: "ojolink-content-security-policy",
    apply: "build",
    transformIndexHtml: () => [
      {
        tag: "meta",
        attrs: {
          "http-equiv": "Content-Security-Policy",
          content: contentSecurityPolicyFor(resolver),
        },
        injectTo: "head-prepend",
      },
    ],
  };
}

/** Emits a copy of the page at the share route, for hosts that answer it before the app is cached. */
function shareRoutePage(): Plugin {
  return {
    name: "ojolink-share-route",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      const page = bundle["index.html"];
      if (page?.type !== "asset") return;
      this.emitFile({ type: "asset", fileName: `${SHARE_ROUTE}.html`, source: page.source });
    },
  };
}

export default defineConfig(({ mode }) => {
  const resolver = resolverOrigin(loadEnv(mode, process.cwd(), "VITE_").VITE_RESOLVER_URL);
  return {
    base: "./",
    plugins: [
      svelte(),
      svelteTesting(),
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: false,
        includeAssets: ["favicon.svg", "apple-touch-icon-180x180.png"],
        manifest: {
          name: "OjoLink",
          short_name: "OjoLink",
          description: "Revisa un enlace antes de abrirlo. Todo se analiza en tu dispositivo.",
          lang: "es",
          display: "standalone",
          start_url: "./",
          scope: "./",
          share_target: {
            action: SHARE_ROUTE,
            method: "GET",
            params: { title: "title", text: "text", url: "url" },
          },
          theme_color: "#111418",
          background_color: "#111418",
          icons: [
            { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
            { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
            {
              src: "maskable-icon-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
          cleanupOutdatedCaches: true,
          navigateFallback: "index.html",
        },
      }),
      contentSecurityPolicy(resolver),
      shareRoutePage(),
    ],
    test: {
      environment: "jsdom",
      include: ["test/**/*.test.ts"],
    },
  };
});
