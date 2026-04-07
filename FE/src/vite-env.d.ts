/// <reference types="vite/client" />

declare module "swagger-ui-react" {
  import type { ComponentType } from "react";

  export interface SwaggerUIProps {
    url?: string;
    spec?: object;
    docExpansion?: "list" | "full" | "none";
    defaultModelsExpandDepth?: number;
    [key: string]: unknown;
  }

  const SwaggerUI: ComponentType<SwaggerUIProps>;
  export default SwaggerUI;
}

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  /** When "true" in dev, use VITE_API_URL instead of same-origin proxy. */
  readonly VITE_DEV_REMOTE_API?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
