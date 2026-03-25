import type { IncomingMessage, ServerResponse } from "http";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET ?? "http://localhost:3000";

/** React Router serves the Swagger page at /api; do not proxy that path to the backend (refresh would 404). */
function isSpaApiDocsPath(req: IncomingMessage): boolean {
  const pathOnly = (req.url ?? "").split("?")[0] ?? "";
  return pathOnly === "/api" || pathOnly === "/api/";
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
        bypass: (req) => (isSpaApiDocsPath(req) ? "/index.html" : undefined),
        configure: (proxy) => {
          proxy.on("error", (err, _req, res) => {
            const r = res as ServerResponse | undefined;
            if (r && typeof r.writeHead === "function" && !r.headersSent) {
              r.writeHead(502, { "Content-Type": "application/json" });
              r.end(
                JSON.stringify({
                  error:
                    "Parking twin API is not reachable. Start the backend so it listens on the proxy target (default port 3000), e.g. `cd BE && npm run dev`.",
                  proxyTarget: apiProxyTarget,
                  detail: err.message,
                })
              );
            }
          });
        },
      },
    },
  },
});
