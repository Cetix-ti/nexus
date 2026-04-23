// Seed unifié — exécute les 3 seeds de catégories (Particularités, Logiciels,
// Politiques) en une commande. Idempotent via upsert.

import { spawnSync } from "node:child_process";

const scripts = [
  "seed-particularity-categories.ts",
  "seed-software-categories.ts",
  "seed-policy-categories.ts",
];

for (const s of scripts) {
  console.log(`\n▶ Running ${s}`);
  const r = spawnSync("npx", ["tsx", `scripts/${s}`], { stdio: "inherit" });
  if (r.status !== 0) { console.error(`✗ ${s} failed`); process.exit(r.status ?? 1); }
}
console.log("\n✓ All category seeds complete");
