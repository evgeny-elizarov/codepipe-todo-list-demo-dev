/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base URL of the optional todo backend. Defaults to "/api", which the dev
   * server proxies to http://localhost:8000 (see vite.config.ts).
   */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
