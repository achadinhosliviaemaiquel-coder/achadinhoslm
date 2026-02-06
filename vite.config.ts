import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  server: {
    host: true,
    // Não force port aqui porque o vercel dev injeta $PORT (ex.: 3000)
    // port: 5173,
    // strictPort: true,

    // Windows stability: evita crash do libuv com watchers/HMR
    watch: {
      usePolling: true,
      interval: 300,
    },

    hmr: {
      overlay: false,
    },
  },

  plugins: [react()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
