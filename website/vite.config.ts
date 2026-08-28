import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // The shared components in ../src/shared/ui sit outside this project, so
    // they resolve react from the repository root's node_modules while
    // everything under src/ resolves it from website/node_modules. Left alone
    // that bundles two copies of the JSX runtime - and, worse, gives the app a
    // second React instance whose hook dispatcher the shared useTooltip would
    // register against. Pin every specifier to one copy.
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
});
