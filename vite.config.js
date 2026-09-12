import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// On GitHub Pages the site lives at https://<user>.github.io/<repo>/
// so assets must be served from /<repo>/. Set VITE_BASE in .env or CI.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || "/",
});
