// Diagnostic de l'intégration Bitdefender : config env, dernière sync,
// alertes déjà ingérées, et test de connexion si la clé est présente.

import prisma from "../src/lib/prisma";

async function main() {
  // 1. Env vars
  const apiKey = process.env.BITDEFENDER_API_KEY?.trim();
  const apiUrl = (process.env.BITDEFENDER_API_URL?.trim() ||
    "https://cloudgz.gravityzone.bitdefender.com").replace(/\/$/, "");
  console.log("=== Variables d'environnement ===");
  console.log(`  BITDEFENDER_API_URL = ${apiUrl}`);
  console.log(
    `  BITDEFENDER_API_KEY = ${apiKey ? `${apiKey.slice(0, 6)}…${apiKey.slice(-4)} (${apiKey.length} car.)` : "(non définie)"}`,
  );

  // 2. Cursor sync
  const row = await prisma.tenantSetting.findUnique({
    where: { key: "security.bitdefender" },
  });
  console.log("\n=== Cursor sync (tenant_setting) ===");
  console.log(row?.value ? JSON.stringify(row.value, null, 2) : "(aucun cursor — jamais tourné)");

  // 3. Alertes ingérées
  const totalBdf = await prisma.securityAlert.count({
    where: { source: "bitdefender_api" },
  });
  console.log(`\n=== Alertes Bitdefender ingérées : ${totalBdf} ===`);

  if (totalBdf > 0) {
    const recent = await prisma.securityAlert.findMany({
      where: { source: "bitdefender_api" },
      orderBy: { receivedAt: "desc" },
      take: 3,
      select: { title: true, severity: true, receivedAt: true, endpoint: true },
    });
    for (const r of recent) {
      console.log(
        `  [${r.severity ?? "?"}] ${r.receivedAt.toISOString().slice(0, 19)}Z endpoint=${r.endpoint ?? "?"} · ${r.title.slice(0, 60)}`,
      );
    }
  }

  // 4. Test connexion si clé présente
  if (!apiKey) {
    console.log("\n⚠ Aucune clé API configurée → job de sync retourne immédiatement.");
    console.log("  Ajouter BITDEFENDER_API_KEY=… dans /opt/nexus/.env puis redémarrer.");
    return;
  }

  console.log("\n=== Test de connexion (JSON-RPC auth) ===");
  const authHeader = `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
  try {
    const res = await fetch(`${apiUrl}/api/v1.0/jsonrpc/network`, {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: Date.now(),
        jsonrpc: "2.0",
        method: "getCompaniesList",
        params: { page: 1, perPage: 1 },
      }),
    });
    const body = await res.json().catch(() => ({}));
    console.log(`  HTTP ${res.status}`);
    if (res.ok && !body.error) {
      console.log(`  ✓ Connecté. Réponse reçue : ${JSON.stringify(body.result ?? {}).slice(0, 200)}`);
    } else {
      console.log(`  ✗ Échec : ${JSON.stringify(body.error ?? body).slice(0, 400)}`);
    }
  } catch (e) {
    console.log(`  ✗ Erreur réseau : ${e instanceof Error ? e.message : String(e)}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
