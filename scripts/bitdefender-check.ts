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
  // getPushEventSettings est parameter-less → test d'auth pur. Une
  // réponse JSON-RPC (ok ou erreur métier) prouve que la clé est valide.
  // Un HTTP 401/403 signifie au contraire que la clé est rejetée.
  try {
    const res = await fetch(`${apiUrl}/api/v1.0/jsonrpc/push`, {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: Date.now(),
        jsonrpc: "2.0",
        method: "getPushEventSettings",
        params: {},
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) {
      console.log(`  ✗ Clé rejetée (HTTP ${res.status}). Vérifie que la clé a le scope "Event Push Service" dans GravityZone.`);
    } else if (res.ok && !body.error) {
      console.log(`  ✓ Connecté. Push actuellement configuré :`);
      console.log(`    ${JSON.stringify(body.result ?? {}).slice(0, 300)}`);
    } else {
      // JSON-RPC error = auth OK mais la méthode/scope a un souci.
      console.log(`  ✓ Auth OK (HTTP ${res.status}). Réponse JSON-RPC :`);
      console.log(`    ${JSON.stringify(body.error ?? body).slice(0, 400)}`);
    }

    // Teste aussi getApiKeyDetails pour voir les scopes exacts de la clé.
    console.log("\n=== Scopes de la clé API ===");
    const scopeRes = await fetch(`${apiUrl}/api/v1.0/jsonrpc/accounts`, {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: Date.now(),
        jsonrpc: "2.0",
        method: "getApiKeyDetails",
        params: {},
      }),
    });
    const scopeBody = await scopeRes.json().catch(() => ({}));
    if (scopeRes.ok && !scopeBody.error) {
      console.log(`  ${JSON.stringify(scopeBody.result ?? {}, null, 2)}`);
    } else {
      console.log(`  (non disponible : ${JSON.stringify(scopeBody.error ?? scopeBody).slice(0, 200)})`);
    }
  } catch (e) {
    console.log(`  ✗ Erreur réseau : ${e instanceof Error ? e.message : String(e)}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
