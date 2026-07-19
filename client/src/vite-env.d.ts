/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_JAROKU_WS?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
