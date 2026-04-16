// ============================================================================
// Bitdefender GravityZone — enregistrement du webhook Nexus
//
// Exécute l'opération en un coup :
//   1. Lit la config push actuelle (pour préserver subscribeToEventTypes)
//   2. Génère un secret aléatoire (48 car hex) si pas déjà défini dans .env
//   3. Met à jour .env avec BITDEFENDER_WEBHOOK_SECRET et FORWARD_URL
//   4. Appelle setPushEventSettings pour pointer vers Nexus avec le secret
//   5. Vérifie via getPushEventSettings que la config est bonne
//
// Idempotent : si le secret existe déjà dans .env, on réutilise. Si la
// config GZ pointe déjà vers Nexus avec le bon secret, on ne change rien.
//
// Usage:
//   npx tsx scripts/bitdefender-register-webhook.ts [--nexus-url=https://nexus.cetix.ca] [--forward-url=https://n8n.cetix.ca/webhook/bitdefender-incidents]
// ============================================================================

import { randomBytes } from "crypto";
import { promises as fs } from "fs";
import path from "path";

const DEFAULT_NEXUS_URL = "https://nexus.cetix.ca";
const DEFAULT_FORWARD_URL = "https://n8n.cetix.ca/webhook/bitdefender-incidents";
const ENV_PATH = path.resolve("/opt/nexus/.env");

function parseArgs(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([^=]+)=(.+)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function generateSecret(): string {
  return randomBytes(24).toString("hex"); // 48 char hex
}

/**
 * Met à jour .env de façon idempotente : si la variable existe déjà,
 * on remplace sa valeur ; sinon on append en fin de fichier. Préserve
 * le reste du fichier.
 */
async function upsertEnvVar(key: string, value: string): Promise<"added" | "updated" | "unchanged"> {
  const content = await fs.readFile(ENV_PATH, "utf-8");
  const lineRe = new RegExp(`^\\s*${key}\\s*=.*$`, "m");
  const newLine = `${key}="${value}"`;
  if (lineRe.test(content)) {
    const existing = content.match(lineRe)?.[0];
    if (existing && existing.includes(`"${value}"`)) return "unchanged";
    await fs.writeFile(ENV_PATH, content.replace(lineRe, newLine), "utf-8");
    return "updated";
  }
  const suffix = content.endsWith("\n") ? "" : "\n";
  await fs.writeFile(ENV_PATH, content + suffix + newLine + "\n", "utf-8");
  return "added";
}

async function readEnvVar(key: string): Promise<string | null> {
  const content = await fs.readFile(ENV_PATH, "utf-8");
  const m = content.match(new RegExp(`^\\s*${key}\\s*=\\s*"?([^"\\n]*)"?`, "m"));
  return m ? m[1] : null;
}

async function jsonrpc(
  apiUrl: string,
  apiKey: string,
  path: string,
  method: string,
  params: Record<string, unknown>,
): Promise<{ result?: unknown; error?: { code: number; message: string; data?: unknown } }> {
  const res = await fetch(`${apiUrl}/api/v1.0/jsonrpc${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: Date.now(), jsonrpc: "2.0", method, params }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: { code: res.status, message: `HTTP ${res.status}`, data: body } };
  }
  return body;
}

async function main() {
  const args = parseArgs();
  const nexusUrl = (args["nexus-url"] || DEFAULT_NEXUS_URL).replace(/\/+$/, "");
  const forwardUrl = args["forward-url"] || DEFAULT_FORWARD_URL;
  const webhookUrl = `${nexusUrl}/api/v1/integrations/bitdefender/webhook`;

  const apiKey = process.env.BITDEFENDER_API_KEY?.trim();
  const apiUrl = (process.env.BITDEFENDER_API_URL?.trim() ||
    "https://cloud.gravityzone.bitdefender.com").replace(/\/+$/, "");
  if (!apiKey) {
    console.error("✗ BITDEFENDER_API_KEY absent du .env. Impossible de continuer.");
    process.exit(1);
  }

  console.log(`Nexus webhook URL  : ${webhookUrl}`);
  console.log(`Forward downstream : ${forwardUrl}`);
  console.log(`GravityZone URL    : ${apiUrl}`);
  console.log("");

  // 1. Lit la config actuelle pour préserver subscribeToEventTypes.
  console.log("1. Lecture config push actuelle…");
  const current = await jsonrpc(apiUrl, apiKey, "/push", "getPushEventSettings", {});
  if (current.error) {
    console.error("   ✗ Échec lecture :", JSON.stringify(current.error).slice(0, 400));
    process.exit(1);
  }
  const curResult = current.result as {
    serviceSettings?: { url?: string };
    subscribeToEventTypes?: Record<string, boolean>;
    subscribeToCompanies?: unknown;
  } | undefined;
  console.log(`   ✓ URL actuelle : ${curResult?.serviceSettings?.url ?? "(aucune)"}`);
  const subscribeToEventTypes = curResult?.subscribeToEventTypes ?? {
    // Fallback minimal si GZ n'en a pas — on active les événements
    // pertinents pour un SOC.
    "antiphishing": true,
    "avc": true,
    "fw": true,
    "hwid-change": true,
    "aph": true,
    "av": true,
    "uc": true,
    "dp": true,
    "modules": true,
    "sva": true,
    "registration": true,
    "new-incident": true,
    "network-monitor": true,
    "ransomware-mitigation": true,
    "supa": true,
    "troubleshooting-activity": true,
    "uninstall": true,
    "install": true,
  };
  const subscribeToCompanies = curResult?.subscribeToCompanies ?? null;

  // 2. Secret — réutilise si déjà dans .env, sinon génère.
  let secret = (await readEnvVar("BITDEFENDER_WEBHOOK_SECRET")) ?? "";
  if (!secret) {
    secret = generateSecret();
    console.log(`2. Secret webhook généré (48 car).`);
  } else {
    console.log(`2. Secret webhook déjà présent dans .env (réutilisé).`);
  }

  // 3. Patch .env.
  const secretOp = await upsertEnvVar("BITDEFENDER_WEBHOOK_SECRET", secret);
  const forwardOp = await upsertEnvVar("BITDEFENDER_WEBHOOK_FORWARD_URL", forwardUrl);
  console.log(`3. .env : SECRET ${secretOp}, FORWARD_URL ${forwardOp}`);

  // 4. setPushEventSettings.
  console.log("4. Envoi setPushEventSettings à GravityZone…");
  const setResult = await jsonrpc(apiUrl, apiKey, "/push", "setPushEventSettings", {
    status: 1,
    serviceType: "jsonRPC",
    serviceSettings: {
      url: webhookUrl,
      authorization: secret,
      requireValidSslCertificate: true,
    },
    subscribeToEventTypes,
    subscribeToCompanies,
  });
  if (setResult.error) {
    console.error("   ✗ Échec :", JSON.stringify(setResult.error).slice(0, 400));
    process.exit(1);
  }
  console.log(`   ✓ setPushEventSettings OK`);

  // 5. Vérif.
  console.log("5. Vérification getPushEventSettings…");
  const verify = await jsonrpc(apiUrl, apiKey, "/push", "getPushEventSettings", {});
  const vResult = verify.result as {
    serviceSettings?: { url?: string; authorization?: string };
    status?: number;
  } | undefined;
  if (vResult?.serviceSettings?.url === webhookUrl && vResult?.status === 1) {
    console.log(`   ✓ GravityZone pousse maintenant vers ${webhookUrl}`);
  } else {
    console.warn(
      `   ⚠ Résultat inattendu : ${JSON.stringify(vResult ?? {}).slice(0, 300)}`,
    );
  }

  // 6. Test push synthétique.
  console.log("6. Envoi d'un event de test (sendTestPushEvent)…");
  const test = await jsonrpc(apiUrl, apiKey, "/push", "sendTestPushEvent", {});
  if (test.error) {
    console.warn("   ⚠ Test échoué :", JSON.stringify(test.error).slice(0, 300));
  } else {
    console.log(`   ✓ Event test envoyé — vérifie les logs Nexus et la UI Centre de sécurité.`);
  }

  console.log("");
  console.log("✓ Setup complet. Redémarre Nexus pour que .env soit rechargé :");
  console.log("    sudo systemctl restart nexus  (ou kill + npm start manuel)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
