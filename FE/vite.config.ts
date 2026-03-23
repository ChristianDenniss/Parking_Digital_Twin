import type { ServerResponse } from "http";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
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
