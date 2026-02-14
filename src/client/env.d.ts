/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_WORKFLOW_DEBUG?: string;
  readonly VITE_HOST?: string;
  readonly VITE_PORT?: string;
  readonly VITE_STRICT_PORT?: string;
  readonly VITE_HTTPS?: string;
  readonly VITE_FORCE_OPTIMIZE?: string;
  readonly VITE_API_PROXY_TARGET?: string;
  readonly MODE: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly TEST?: boolean;
  readonly VITEST?: boolean;
  readonly SSR?: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.csv?raw' {
  const content: string;
  export default content;
}
