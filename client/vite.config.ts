import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The client talks to the Week-1 Node relay (default :4317) over WebSocket only, so no
// dev proxy is needed. Override the WS URL with VITE_JAROKU_WS if the relay moves.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
