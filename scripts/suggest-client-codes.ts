/**
 * Scanne les MonitoringAlert orphelines pour extraire les préfixes
 * d'hostname qu'on voit passer, et suggère des codes clients à ajouter
 * (ou à mapper à une org existante via son nom).
 *
 * Run: npx tsx scripts/suggest-client-codes.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(
  process.env.DATABASE_URL || "postgresql://nexus:nexus@localhost:5432/nexus",
);
const prisma = new PrismaClient({ adapter });

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

  // Compteurs : préfixe → nombre d'alertes, + échantillon de hostnames
  const prefixCounts = new Map<string, { count: number; samples: Set<string> }>();
  for (const a of unmatched) {
    const prefixes = extractAllPrefixes(a.subject, a.body ?? "");
    for (const p of prefixes) {
      const entry = prefixCounts.get(p) ?? { count: 0, samples: new Set() };
      entry.count++;
      // Capture un hostname complet pour référence
      const full = (a.subject + "\n" + (a.body ?? "")).match(
        new RegExp(`\\b(${p}[-_][A-Z0-9][A-Z0-9_\\-\\.]*)`, "i"),
      );
      if (full) entry.samples.add(full[1]);
      prefixCounts.set(p, entry);
    }
  }

  // Blacklist des préfixes génériques (rôles infra, pas codes clients)
  const genericBlacklist = new Set([
    "DC", "FS", "VEEAM", "FINANCE", "SRV", "APP", "DB", "WEB", "MAIL",
    "PRINT", "BACKUP", "VM", "HV", "ESX", "AD", "NAS", "RDS", "TS",
    "SQL", "EXCH", "SER", "HYPERV",
  ]);

  const sorted = Array.from(prefixCounts.entries())
    .filter(([p]) => !genericBlacklist.has(p))
    .sort((a, b) => b[1].count - a[1].count);

  console.log("Préfixes vus dans les alertes non-matchées :\n");
  console.log(
    "Préfixe  | Alertes | Déjà mappé ? | Hostnames (échantillon)",
  );
  console.log("---------|---------|--------------|-------------------------");
  for (const [prefix, { count, samples }] of sorted) {
    const already = existingCodes.has(prefix);
    const sampleStr = Array.from(samples).slice(0, 3).join(", ");
    console.log(
      `${prefix.padEnd(8)} | ${count.toString().padStart(7)} | ${(already ? "OUI" : "NON").padEnd(12)} | ${sampleStr}`,
    );
  }

  console.log("\nOrganisations en DB (pour info) :");
  for (const o of orgs) {
    console.log(`  ${(o.clientCode ?? "—").padEnd(8)} → ${o.name}`);
  }

  console.log(
    "\n→ Pour chaque préfixe non-mappé ci-dessus, ajoute un clientCode à l'organisation correspondante",
  );
  console.log(
    "  (Settings → Organisations → [éditer] → champ 'Code client').",
  );
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
