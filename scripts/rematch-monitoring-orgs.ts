/**
 * Rematche les MonitoringAlert orphelines (organizationId=null) avec la
 * nouvelle logique d'extraction de code client (hostname "CODE-XXX" dans
 * le sujet et le body).
 *
 * Run dry : npx tsx scripts/rematch-monitoring-orgs.ts --dry
 * Run apply : npx tsx scripts/rematch-monitoring-orgs.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString =
  process.env.DATABASE_URL || "postgresql://nexus:nexus@localhost:5432/nexus";
const adapter = new PrismaPg(connectionString);
const prisma = new PrismaClient({ adapter });

const DRY = process.argv.includes("--dry");

function extractAllClientCodePrefixes(subject: string, body: string): string[] {
  const text = `${subject}\n${body.slice(0, 2000)}`;
  const re = /\b([A-Z]{2,8})[-_][A-Z0-9]{1,}/g;
  const codes = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) codes.add(m[1]);
  return Array.from(codes);
}

function extractOrgNameFromSubject(subject: string): string | null {
  const match = subject.match(/\(\s*([^>()]+?)\s*>\s*[^()]+\)/);
  return match && match[1] ? match[1].trim() : null;
}

async function main() {
  const orgs = await prisma.organization.findMany({
    select: { id: true, name: true, clientCode: true, domain: true, domains: true },
  });
  const clientCodeMap = new Map<string, { id: string; name: string }>();
  const nameMap = new Map<string, { id: string; name: string }>();
  const domainMap = new Map<string, { id: string; name: string }>();
  for (const o of orgs) {
    if (o.clientCode) clientCodeMap.set(o.clientCode.toUpperCase(), { id: o.id, name: o.name });
    nameMap.set(o.name.toLowerCase().trim(), { id: o.id, name: o.name });
    if (o.domain) domainMap.set(o.domain.toLowerCase(), { id: o.id, name: o.name });
    for (const d of o.domains ?? []) if (d) domainMap.set(d.toLowerCase(), { id: o.id, name: o.name });
  }

  const unmatched = await prisma.monitoringAlert.findMany({
    where: { organizationId: null },
    select: { id: true, subject: true, body: true, senderDomain: true },
  });
  console.log(`${unmatched.length} alertes sans organisation\n`);

  const matches: Array<{ id: string; orgId: string; orgName: string; reason: string }> = [];
  const stillUnmatched: string[] = [];

  for (const a of unmatched) {
    // 1) domaine expéditeur
    let org = domainMap.get((a.senderDomain || "").toLowerCase());
    let reason = "domain";
    // 2) nom d'org dans "(Org > HOST)"
    if (!org) {
      const n = extractOrgNameFromSubject(a.subject);
      if (n) {
        const found = nameMap.get(n.toLowerCase().trim());
        if (found) { org = found; reason = "atera-parens"; }
      }
    }
    // 3) hostnames CODE-xxx dans sujet + body
    if (!org) {
      const prefixes = extractAllClientCodePrefixes(a.subject, a.body ?? "");
      for (const p of prefixes) {
        const found = clientCodeMap.get(p);
        if (found) { org = found; reason = `prefix:${p}`; break; }
      }
    }

    if (org) {
      matches.push({ id: a.id, orgId: org.id, orgName: org.name, reason });
    } else {
      stillUnmatched.push(a.subject);
    }
  }

  console.log(`${matches.length} matches trouvés (${DRY ? "DRY" : "APPLY"}):\n`);
  const byOrg = new Map<string, number>();
  for (const m of matches) byOrg.set(m.orgName, (byOrg.get(m.orgName) || 0) + 1);
  for (const [name, cnt] of Array.from(byOrg.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cnt.toString().padStart(4)} → ${name}`);
  }

  console.log(`\n${stillUnmatched.length} alertes toujours sans match — exemples :`);
  for (const s of stillUnmatched.slice(0, 15)) {
    console.log(`  ${s.slice(0, 100)}`);
  }

  if (!DRY && matches.length > 0) {
    // Prisma ne supporte pas un updateMany avec des valeurs différentes par ligne;
    // on boucle.
    for (const m of matches) {
      await prisma.monitoringAlert.update({
        where: { id: m.id },
        data: { organizationId: m.orgId, organizationName: m.orgName },
      });
    }
    console.log(`\nRematché ${matches.length} alertes.`);
  }

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
