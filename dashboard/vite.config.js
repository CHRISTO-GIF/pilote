import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base relative : l'app fonctionne à la racine d'un domaine comme dans un sous-dossier (GitHub Pages)
export default defineConfig({ plugins: [react()], base: "./" });
