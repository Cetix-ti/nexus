/**
 * Auto-mappe les préfixes d'hostname vus dans les alertes orphelines vers
 * les organisations existantes, par similarité de nom.
 *
 * Heuristique : pour chaque préfixe, cherche une org dont le nom contient
 * des tokens qui commencent par les mêmes lettres (ex: DLSN ↔ Delson,
 * MRVL ↔ Marieville). Si confiance élevée, propose/applique.
 *
 * Run dry : npx tsx scripts/auto-map-client-codes.ts --dry
 * Apply  : npx tsx scripts/auto-map-client-codes.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(
  process.env.DATABASE_URL || "postgresql://nexus:nexus@localhost:5432/nexus",
);
const prisma = new PrismaClient({ adapter });
const DRY = process.argv.includes("--dry");

/**
 * Pour un préfixe donné, évalue chaque organisation et donne un score.
 * Règles :
 *  - Match parfait mot-à-mot dans le nom → score élevé
 *  - Match des initiales des mots significatifs du nom → haut
 *  - Présence des lettres du préfixe en séquence dans le nom → moyen
 */
function scoreOrg(
  prefix: string,
  orgName: string,
): { score: number; reason: string } {
  // Normalise les accents (É → E) puis garde a-z et espaces.
  const rawTokens = orgName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const tokens = rawTokens.filter(
    (t) => !["de", "du", "la", "le", "les", "des"].includes(t),
  );

  const p = prefix.toLowerCase();

  // 1) Le préfixe est un mot entier du nom
  for (const t of tokens) {
    if (t === p) return { score: 100, reason: `mot "${t}"` };
  }

  // 2) Initiales des tokens significatifs = préfixe
  const initials = tokens.map((t) => t[0]).join("");
  if (initials === p) {
    return { score: 95, reason: `initiales "${initials.toUpperCase()}"` };
  }

  // 2bis) Initiales avec tous les tokens (stopwords compris) — capture
  //       les "Ville De Sainte Adèle" → "VDSA".
  const rawInitials = rawTokens.map((t) => t[0]).join("");
  if (rawInitials === p) {
    return { score: 93, reason: `initiales incluant stopwords "${rawInitials.toUpperCase()}"` };
  }

  // 2ter) Concaténation première-lettre du premier token + premières lettres
  //       significatives des suivants. Couvre MTLO = M(ontreal) + (Oue)ST →
  //       MTLO = premières lettres de "Montreal" (M,T,L) + première de
  //       "Ouest" (O). On scan toutes les combinaisons à lettres par token.
  //       Si le préfixe = 1-3 lettres de token1 + 1-3 lettres de token2...
  //       match, on dit oui.
  {
    function tryCombine(tokens: string[], target: string): boolean {
      if (target.length === 0) return tokens.length === 0 || tokens.every((t) => t.length >= 0);
      if (tokens.length === 0) return false;
      const [first, ...rest] = tokens;
      // On prend k lettres (dans l'ordre, pas forcément contigües) du token `first`
      // puis on récurse pour le reste du préfixe sur les autres tokens.
      for (let k = 1; k <= Math.min(first.length, target.length); k++) {
        // Choisir k lettres en séquence depuis `first`
        let i = 0;
        for (const ch of first) {
          if (ch === target[i]) i++;
          if (i === k) break;
        }
        if (i === k) {
          if (tryCombine(rest, target.slice(k))) return true;
        }
      }
      return false;
    }
    if (tokens.length >= 2 && tryCombine(tokens, p)) {
      return {
        score: 75,
        reason: `lettres réparties sur les tokens ${tokens.join(" ")}`,
      };
    }
  }

  // 3) Le préfixe correspond aux N premières lettres d'un token
  for (const t of tokens) {
    if (t.startsWith(p) && p.length >= 3) {
      return { score: 80, reason: `début de "${t}"` };
    }
  }

  // 4) Les lettres du préfixe apparaissent dans l'ordre dans un seul token
  for (const t of tokens) {
    let i = 0;
    for (const ch of t) {
      if (ch === p[i]) i++;
      if (i === p.length) break;
    }
    if (i === p.length && t.length >= p.length && t.length <= p.length * 2.5) {
      return { score: 70, reason: `lettres en séquence dans "${t}"` };
    }
  }

  // 5) Alias connus
  if (p === "ctx" && orgName.toLowerCase() === "cetix") {
    return { score: 99, reason: "alias connu CTX=Cetix" };
  }

  return { score: 0, reason: "" };
}

function extractAllPrefixes(subject: string, body: string): string[] {
  const codes: string[] = [];
  const seen = new Set<string>();
  const zabbixHost = body.match(/^\s*Host:\s*([A-Z][A-Z0-9_\-\.]+)\s*$/im);
  if (zabbixHost) {
    const p = zabbixHost[1].match(/^([A-Z]{2,8})[-_]/);
    if (p && !seen.has(p[1])) { seen.add(p[1]); codes.push(p[1]); }
  }
  const text = `${subject}\n${body.slice(0, 2000)}`;
  const re = /\b([A-Z]{2,8})[-_][A-Z0-9]{1,}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (!seen.has(m[1])) { seen.add(m[1]); codes.push(m[1]); }
  }
  return codes;
}

const GENERIC_BLACKLIST = new Set([
  "DC", "FS", "VEEAM", "FINANCE", "SRV", "APP", "DB", "WEB", "MAIL",
  "PRINT", "BACKUP", "VM", "HV", "ESX", "AD", "NAS", "RDS", "TS",
  "SQL", "EXCH", "SER", "HYPERV",
]);

async function main() {
  const orgs = await prisma.organization.findMany({
    select: { id: true, name: true, clientCode: true },
  });
  const existingCodes = new Set(
    orgs.filter((o) => o.clientCode).map((o) => o.clientCode!.toUpperCase()),
  );

  const unmatched = await prisma.monitoringAlert.findMany({
    where: { organizationId: null },
    select: { subject: true, body: true },
  });

  // Compter les préfixes distincts
  const prefixes = new Set<string>();
  for (const a of unmatched) {
    for (const p of extractAllPrefixes(a.subject, a.body ?? "")) {
      if (!GENERIC_BLACKLIST.has(p) && !existingCodes.has(p)) {
        prefixes.add(p);
      }
    }
  }

  console.log(`${prefixes.size} préfixes non mappés détectés.\n`);

  // Pour chaque préfixe, trouver la meilleure org par score
  const suggestions: Array<{
    prefix: string;
    orgId: string;
    orgName: string;
    score: number;
    reason: string;
  }> = [];

  for (const p of prefixes) {
    let best: { org: typeof orgs[number]; score: number; reason: string } | null = null;
    for (const o of orgs) {
      if (o.clientCode) continue; // déjà un code
      const { score, reason } = scoreOrg(p, o.name);
      if (score > 0 && (!best || score > best.score)) {
        best = { org: o, score, reason };
      }
    }
    if (best && best.score >= 70) {
      suggestions.push({
        prefix: p,
        orgId: best.org.id,
        orgName: best.org.name,
        score: best.score,
        reason: best.reason,
      });
    } else {
      console.log(`  ${p.padEnd(8)} → ❌ pas de match confiant (${best ? `meilleur: ${best.org.name} score ${best.score}` : "aucune piste"})`);
    }
  }

  console.log("\nSuggestions (confiance ≥ 70) :\n");
  for (const s of suggestions) {
    console.log(
      `  ${s.prefix.padEnd(8)} → ${s.orgName.padEnd(40)} [score ${s.score}, ${s.reason}]`,
    );
  }

  if (!DRY && suggestions.length > 0) {
    console.log("\nApplication des mappings...");
    for (const s of suggestions) {
      await prisma.organization.update({
        where: { id: s.orgId },
        data: { clientCode: s.prefix },
      });
      console.log(`  ✓ ${s.orgName} ← clientCode "${s.prefix}"`);
    }
  }

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
