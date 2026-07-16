import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Proxy /api to the FastAPI backend during development so the frontend can use
// same-origin relative URLs and we avoid CORS headaches in the browser.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:8001",
    },
  },
});
