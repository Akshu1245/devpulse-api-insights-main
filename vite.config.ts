import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    // Faster HMR with pre-bundling
    warmup: {
      clientFiles: [
        "./src/App.tsx",
        "./src/main.tsx",
        "./src/pages/Index.tsx",
        "./src/pages/AgentGuardDashboard.tsx",
        "./src/components/HealthDashboard.tsx",
      ],
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-router-dom",
      "@tanstack/react-query",
      "framer-motion",
      "lucide-react",
      "clsx",
      "tailwind-merge",
      "class-variance-authority",
      // Pre-bundle Supabase so it doesn't get processed lazily on first import
      "@supabase/supabase-js",
      // Pre-bundle heavy Radix UI primitives used on every page
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-tooltip",
      "@radix-ui/react-tabs",
    ],
    // false = use cached pre-bundle (faster dev restarts); set true only when deps change
    force: false,
  },
  build: {
    target: "esnext",
    minify: "esbuild",
    // Enable CSS code splitting
    cssCodeSplit: true,
    // Inline small assets directly
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        // Fine-grained manual chunks for optimal caching
        manualChunks(id) {
          // Core React runtime - always cached
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/")) {
            return "react-core";
          }
          // Router
          if (id.includes("node_modules/react-router-dom") || id.includes("node_modules/react-router/")) {
            return "router";
          }
          // React Query
          if (id.includes("node_modules/@tanstack/react-query")) {
            return "query";
          }
          // Supabase
          if (id.includes("node_modules/@supabase/")) {
            return "supabase";
          }
          // Radix UI components
          if (id.includes("node_modules/@radix-ui/")) {
            return "radix-ui";
          }
          // Charts
          if (id.includes("node_modules/recharts") || id.includes("node_modules/d3-")) {
            return "charts";
          }
          // Framer Motion
          if (id.includes("node_modules/framer-motion")) {
            return "animations";
          }
          // Forms
          if (
            id.includes("node_modules/react-hook-form") ||
            id.includes("node_modules/@hookform/") ||
            id.includes("node_modules/zod")
          ) {
            return "forms";
          }
          // Utility libs
          if (
            id.includes("node_modules/class-variance-authority") ||
            id.includes("node_modules/clsx") ||
            id.includes("node_modules/tailwind-merge") ||
            id.includes("node_modules/date-fns")
          ) {
            return "utils";
          }
          // Lucide icons - split into own chunk
          if (id.includes("node_modules/lucide-react")) {
            return "icons";
          }
        },
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
      // Tree-shake aggressively
      treeshake: {
        moduleSideEffects: false,
        propertyReadSideEffects: false,
        tryCatchDeoptimization: false,
      },
    },
    chunkSizeWarningLimit: 1000,
    reportCompressedSize: false,
    // Faster builds
    sourcemap: false,
  },
  esbuild: {
    drop: process.env.NODE_ENV === "production" ? ["console", "debugger"] : [],
    legalComments: "none",
    // Faster transforms
    target: "esnext",
    // Minify identifiers in production
    minifyIdentifiers: process.env.NODE_ENV === "production",
    minifySyntax: process.env.NODE_ENV === "production",
    minifyWhitespace: process.env.NODE_ENV === "production",
  },
});
    minifyIdentifiers: process.env.NODE_ENV === "production",
    minifySyntax: process.env.NODE_ENV === "production",
    minifyWhitespace: process.env.NODE_ENV === "production",
  },
});

