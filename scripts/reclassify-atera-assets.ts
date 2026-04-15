/**
 * Retroactively reclassify Atera assets whose type no longer matches the
 * improved mapAteraAgentToOrgAsset heuristic (in particular, virtual Windows
 * servers that Atera reports as "Work Station" but whose machine name is
 * clearly a server).
 *
 * Run with:
 *   npx tsx scripts/reclassify-atera-assets.ts           (dry run)
 *   npx tsx scripts/reclassify-atera-assets.ts --apply   (apply changes)
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString =
  process.env.DATABASE_URL || "postgresql://nexus:nexus@localhost:5432/nexus";
const adapter = new PrismaPg(connectionString);
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--apply");

// Same heuristic as src/lib/integrations/atera-client.ts
const serverNamePatterns = [
  /^srv[-_0-9]/i,
  /[-_]srv[-_0-9]?/i,
  /^ser[-_0-9]/i,
  /^serveur/i,
  /^dc[-_0-9]/i,
  /dc[0-9]+$/i,
  /^sql[-_0-9]/i,
  /^web[-_0-9]/i,
  /^fs[-_0-9]/i,
  /^app[-_0-9]/i,
  /^db[-_0-9]/i,
  /^mail[-_0-9]/i,
  /^exch[-_0-9]?/i,
  /^print[-_0-9]?/i,
  /^backup[-_0-9]?/i,
  /^vm[-_0-9]/i,
  /^hv[-_0-9]/i,
  /^hyperv/i,
  /^esxi?[-_0-9]?/i,
  /^ad[-_0-9]/i,
  /^nas[-_0-9]?/i,
  /^rds[-_0-9]?/i,
  /^ts[-_0-9]/i,
  /server/i,
];

function classify(name: string, osRaw: string, modelRaw: string): string {
  const os = (osRaw || "").toLowerCase();
  const model = (modelRaw || "").toLowerCase();
  const machineName = (name || "").toLowerCase();

  const looksLikeServer = serverNamePatterns.some((re) => re.test(machineName));
  const osLooksLikeServer =
    os.includes("server") ||
    os.includes("domain controller") ||
    os.includes("domain_controller") ||
    os === "dc";

  if (os.includes("vmware") || os.includes("esxi") || os.includes("hyper-v")) {
    return "hypervisor";
  }
  if (
    os.includes("linux") ||
    os.includes("ubuntu") ||
    os.includes("debian") ||
    os.includes("centos") ||
    os.includes("redhat") ||
    os.includes("rhel") ||
    os.includes("suse") ||
    os.includes("fedora")
  ) {
    return "linux_server";
  }
  if (osLooksLikeServer || looksLikeServer) {
    return "windows_server";
  }
  if (
    model.includes("laptop") ||
    model.includes("notebook") ||
    model.includes("thinkpad") ||
    model.includes("elitebook") ||
    model.includes("probook") ||
    model.includes("latitude") ||
    (model.includes("xps") && !model.includes("desktop")) ||
    /[-_]lap[-_0-9]/i.test(machineName) ||
    /^lap[-_]/i.test(machineName) ||
    /^laptop/i.test(machineName) ||
    /[-_]l$/i.test(machineName)
  ) {
    return "laptop";
  }
  return "workstation";
}

// Map UI type → Prisma AssetType enum
const UI_TO_DB_TYPE: Record<string, string> = {
  workstation: "WORKSTATION",
  laptop: "LAPTOP",
  windows_server: "SERVER",
  linux_server: "SERVER",
  hypervisor: "SERVER",
};

async function main() {
  const assets = await prisma.asset.findMany({
    where: { externalSource: "atera" },
    select: { id: true, name: true, metadata: true, type: true, model: true },
  });

  console.log(`Loaded ${assets.length} Atera assets`);
  console.log(APPLY ? "Mode: APPLY (writes)" : "Mode: DRY RUN (no writes)");
  console.log();

  const changes: Array<{
    id: string;
    name: string;
    from: string;
    to: string;
    uiType: string;
    os: string;
  }> = [];

  for (const a of assets) {
    const meta = (a.metadata as any) || {};
    const os = meta.os || "";
    const uiType = classify(a.name, os, a.model || "");
    const dbType = UI_TO_DB_TYPE[uiType] || "OTHER";
    if (dbType !== a.type) {
      changes.push({
        id: a.id,
        name: a.name,
        from: a.type,
        to: dbType,
        uiType,
        os,
      });
    }
  }

  console.log(`${changes.length} asset(s) need reclassification:`);
  console.log();
  for (const c of changes.slice(0, 80)) {
    console.log(
      `  ${c.name.padEnd(30)} ${c.from.padEnd(12)} -> ${c.to.padEnd(12)} (${c.uiType}) [os="${c.os}"]`
    );
  }
  if (changes.length > 80) {
    console.log(`  ... and ${changes.length - 80} more`);
  }

  if (!APPLY) {
    console.log("\nDry run — pass --apply to write changes.");
    await prisma.$disconnect();
    return;
  }

  let done = 0;
  for (const c of changes) {
    const existing = await prisma.asset.findUnique({
      where: { id: c.id },
      select: { metadata: true },
    });
    const meta = (existing?.metadata as any) || {};
    await prisma.asset.update({
      where: { id: c.id },
      data: {
        type: c.to as any,
        metadata: { ...meta, type: c.uiType },
      },
    });
    done++;
    if (done % 50 === 0) console.log(`  ${done}/${changes.length}...`);
  }
  console.log(`\nReclassified ${done} assets.`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
