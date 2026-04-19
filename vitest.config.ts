// ============================================================================
// Vitest configuration — unit tests sur les fonctions PURES du pipeline IA.
//
// Scope : validators, parsers, sanitizers, résolveurs hiérarchiques. Tout ce
// qui ne nécessite ni réseau, ni DB, ni LLM. Les tests qui ont besoin de ces
// dépendances seront ajoutés plus tard en "integration" avec un dossier séparé
// et un setup dédié.
//
// Exclu explicitement : tout ce qui importe `@/lib/prisma` ou fait un `fetch`.
// Pour tester ces chemins, il faut mocker Prisma + les providers IA — effort
// supérieur, prévu dans un sprint ultérieur.
// ============================================================================

import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules", ".next", "dist"],
    // Tests unitaires purs — pas de setup DB, pas de mocks globaux.
    // Chaque fichier .test.ts est autonome.
  },
});
