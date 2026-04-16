// Re-tente setPushEventSettings avec des options variées pour diagnostiquer
// exactement pourquoi GravityZone refuse notre URL. On essaie :
//   A) Avec requireValidSslCertificate=false (test "permissif")
//   B) Avec requireValidSslCertificate=true (état actuel)
// Si A passe mais B échoue → problème de chaîne de certificats.
// Si A échoue aussi → problème de connectivité TCP/TLS bas niveau.

import { promises as fs } from "fs";
import path from "path";

const ENV_PATH = path.resolve("/opt/nexus/.env");

async function readEnvVar(key: string): Promise<string | null> {
  const content = await fs.readFile(ENV_PATH, "utf-8");
  const m = content.match(new RegExp(`^\\s*${key}\\s*=\\s*"?([^"\\n]*)"?`, "m"));
  return m ? m[1] : null;
}

async function jsonrpc(apiUrl: string, apiKey: string, rpath: string, method: string, params: Record<string, unknown>) {
  const res = await fetch(`${apiUrl}/api/v1.0/jsonrpc${rpath}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: Date.now(), jsonrpc: "2.0", method, params }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  const apiKey = process.env.BITDEFENDER_API_KEY!;
  const apiUrl = (process.env.BITDEFENDER_API_URL || "https://cloud.gravityzone.bitdefender.com").replace(/\/+$/, "");
  const secret = (await readEnvVar("BITDEFENDER_WEBHOOK_SECRET")) ?? "";
  const url = "https://nexus.cetix.ca/api/v1/integrations/bitdefender/webhook";
  const forwardUrl = "https://n8n.cetix.ca/webhook/bitdefender-incidents";

  if (!apiKey || !secret) {
    console.error("Manque API_KEY ou WEBHOOK_SECRET.");
    process.exit(1);
  }

  // 1. Lit la config actuelle pour préserver subscribeToEventTypes.
  const current = await jsonrpc(apiUrl, apiKey, "/push", "getPushEventSettings", {});
  const cur = current.body.result as {
    subscribeToEventTypes?: Record<string, boolean>;
    subscribeToCompanies?: unknown;
  } | undefined;
  const subscribeToEventTypes = cur?.subscribeToEventTypes ?? {};
  const subscribeToCompanies = cur?.subscribeToCompanies ?? null;

  // Test A : permissif (pas de validation cert)
  console.log("=== Test A : requireValidSslCertificate=false ===");
  const resA = await jsonrpc(apiUrl, apiKey, "/push", "setPushEventSettings", {
    status: 1,
    serviceType: "jsonRPC",
    serviceSettings: { url, authorization: secret, requireValidSslCertificate: false },
    subscribeToEventTypes,
    subscribeToCompanies,
  });
  console.log(`HTTP ${resA.status}`);
  console.log(JSON.stringify(resA.body).slice(0, 500));

  if (resA.body.result && !resA.body.error) {
    console.log("\n✓ Test A accepté. GZ pousse maintenant vers Nexus (cert non vérifié).");
    console.log("  Le pb d'origine vient bien de la validation de chaîne de cert.");
    console.log("  Envoi d'un testPushEvent pour valider la fin du pipeline…");
    const test = await jsonrpc(apiUrl, apiKey, "/push", "sendTestPushEvent", {});
    console.log(`  Test event → HTTP ${test.status}, result=${JSON.stringify(test.body).slice(0, 300)}`);
  } else {
    // Test B : strict (config d'origine) — pour documenter le comportement
    console.log("\n=== Test B : requireValidSslCertificate=true ===");
    const resB = await jsonrpc(apiUrl, apiKey, "/push", "setPushEventSettings", {
      status: 1,
      serviceType: "jsonRPC",
      serviceSettings: { url, authorization: secret, requireValidSslCertificate: true },
      subscribeToEventTypes,
      subscribeToCompanies,
    });
    console.log(`HTTP ${resB.status}`);
    console.log(JSON.stringify(resB.body).slice(0, 500));

    console.log("\n✗ Les deux tests ont échoué → pb de connectivité TCP/TLS bas niveau.");
    console.log("  GZ n'arrive tout simplement pas à joindre nexus.cetix.ca:443");
    console.log("  depuis ses serveurs (probablement US-East AWS). Vérifications :");
    console.log("   - Le port 443 est-il accessible depuis ailleurs qu'un VPN/mobile CA ?");
    console.log("     Test US : https://www.whatsmydns.net/#AAAA/nexus.cetix.ca");
    console.log("     Test port : https://canyouseeme.org/ avec port 443 depuis nexus.cetix.ca");
    console.log("   - Ton firewall (pfSense/OPNsense/Cloudflare WAF) bloque-t-il des régions ?");
    console.log("     Bitdefender pousse typiquement depuis des IPs AWS US.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
