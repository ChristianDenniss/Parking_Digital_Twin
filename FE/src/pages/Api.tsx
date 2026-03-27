import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");
const SPEC_URL = "/api/openapi.yaml";

/** Full URL for the OpenAPI spec so Swagger UI can fetch it (same origin, so proxy works in dev). */
function getSpecUrl(): string {
  if (API_BASE) return `${API_BASE}${SPEC_URL}`;
  if (typeof window === "undefined") return SPEC_URL;
  return `${window.location.origin}${SPEC_URL}`;
}

export function Api() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden [&_.swagger-ui]:font-sans">
        <SwaggerUI url={getSpecUrl()} docExpansion="none" defaultModelsExpandDepth={0} />
      </div>
    </div>
  );
}
