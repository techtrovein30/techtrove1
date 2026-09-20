import { execSync } from "node:child_process";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/** Short git commit hash stamped into the admin panel so admins can tell
 *  whether the deployed bundle is current vs. a stale browser cache. */
function gitShortHash(): string {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "dev";
  }
}

// R5 (M13): Content Security Policy meta tag, injected ONLY into the
// production build (apply: 'build') so the Vite dev server's inline
// fast-refresh preamble keeps working. Hardening target: the exported dist/.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https: wss:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
  "form-action 'self'",
].join("; ");

function injectCsp(): Plugin {
  return {
    name: "inject-csp",
    apply: "build",
    transformIndexHtml() {
      return [
        {
          tag: "meta",
          attrs: { "http-equiv": "Content-Security-Policy", content: CSP },
          injectTo: "head-prepend",
        },
      ];
    },
  };
}

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(gitShortHash()) },
  plugins: [react(), tailwindcss(), injectCsp()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("supabase")) return "vendor-supabase";
          if (
            id.includes("/react/") ||
            id.includes("react-dom") ||
            id.includes("react-router") ||
            id.includes("/scheduler/")
          ) {
            return "vendor-react";
          }
          return "vendor";
        },
      },
    },
  },
});
