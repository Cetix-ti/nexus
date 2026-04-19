// ============================================================================
// Remap des organisations sur les incidents de sécurité + alertes monitoring.
//
// Contexte : les incidents historiques ont été décodés AVANT que certains
// clientCodes ne soient configurés dans les organisations, ou par une version
// antérieure du résolveur qui avait des regex plus strictes. Le résultat :
// des incidents sur `LV_DG-10`, `DLSN54-2204D`, `HLX_STATION-LAV-091`, etc.
// se retrouvent attribués à Cetix (fallback par domaine expéditeur).
//
// Ce script re-résout chaque incident avec la logique actuelle et corrige
// les attributions erronées. Il ne DÉPLACE JAMAIS un incident vers `null`
// (un match actuel null = on garde l'attribution existante), pour éviter de
// casser des cas particuliers résolus manuellement par un admin.
//
// Usage :
//   DATABASE_URL=... npx tsx scripts/remap-security-orgs.ts
//   DATABASE_URL=... npx tsx scripts/remap-security-orgs.ts --dry-run
//
// En dry-run, on affiche les changements sans les appliquer.
// ============================================================================

import prisma from "@/lib/prisma";
import {
  resolveOrgByEndpoint,
  resolveOrgByText,
  resolveOrgByHostOrIp,
  invalidateOrgResolverCache,
} from "@/lib/security-center/org-resolver";

const DRY_RUN = process.argv.includes("--dry-run");

interface RemapStats {
  scanned: number;
  unchanged: number;
  remapped: number;
  skippedNoEndpoint: number;
  skippedCurrentMatches: number;
  /** Incidents où un admin a probablement triagé manuellement — on les
   *  laisse intacts pour ne pas écraser son travail. */
  skippedManualOverride: number;
}

/**
 * Retourne la liste des IDs d'organisations considérées comme "par défaut"
 * (fallback) — on ne remplace que ces attributions. Les orgs marquées
 * `isInternal=true` + celles avec clientCode vide sont considérées par
 * défaut. Tout autre mapping (admin → client) n'est PAS écrasé.
 */
async function getDefaultOrgIds(): Promise<Set<string>> {
  const orgs = await prisma.organization.findMany({
    where: {
      OR: [{ isInternal: true }, { clientCode: null }],
    },
    select: { id: true },
  });
  return new Set(orgs.map((o) => o.id));
}

async function remapSecurityIncidents(): Promise<RemapStats> {
  const stats: RemapStats = {
    scanned: 0,
    unchanged: 0,
    remapped: 0,
    skippedNoEndpoint: 0,
    skippedCurrentMatches: 0,
    skippedManualOverride: 0,
  };
  const defaultOrgIds = await getDefaultOrgIds();

  // On prend les incidents qui ont un endpoint extractible (hostname ou IP).
  // Sans endpoint, la re-résolution ne peut rien améliorer.
  const incidents = await prisma.securityIncident.findMany({
    where: {
      OR: [{ endpoint: { not: null } }, { endpoint: { not: "" } }],
    },
    select: {
      id: true,
      endpoint: true,
      organizationId: true,
      source: true,
      title: true,
      summary: true,
    },
  });

  console.log(`\n== Security incidents : ${incidents.length} à scanner ==`);

  for (const inc of incidents) {
    stats.scanned++;
    if (!inc.endpoint || inc.endpoint.trim() === "") {
      stats.skippedNoEndpoint++;
      continue;
    }
    // Ignore les endpoints "null"/"none" — déjà corrigés dans le décodeur
    // mais présents dans l'historique.
    if (/^(null|none|undefined|n\/a|-)$/i.test(inc.endpoint.trim())) {
      stats.skippedNoEndpoint++;
      continue;
    }

    // Cascade identique au décodeur :
    //   1. resolveOrgByEndpoint (préfixe CODE-)
    //   2. resolveOrgByText (scan body si disponible)
    //   3. resolveOrgByHostOrIp (RMM Asset table)
    let resolved = await resolveOrgByEndpoint(inc.endpoint);
    if (!resolved && inc.summary) {
      resolved = await resolveOrgByText(inc.title, inc.summary);
    }
    if (!resolved) {
      resolved = await resolveOrgByHostOrIp(inc.endpoint, null);
    }

    if (!resolved) {
      // Aucun match — on garde l'attribution existante pour ne pas perdre
      // des triages manuels.
      stats.unchanged++;
      continue;
    }

    if (resolved === inc.organizationId) {
      stats.skippedCurrentMatches++;
      continue;
    }

    // Garde-fou : on ne remplace que si l'attribution actuelle est un
    // fallback (Cetix interne ou org sans clientCode). Sinon c'est
    // probablement un admin qui a triagé manuellement et on respecte.
    if (inc.organizationId && !defaultOrgIds.has(inc.organizationId)) {
      stats.skippedManualOverride++;
      continue;
    }

    // Match différent de l'org actuelle → remap.
    if (!DRY_RUN) {
      await prisma.securityIncident.update({
        where: { id: inc.id },
        data: { organizationId: resolved },
      });
      // Met aussi à jour les alertes liées (elles dupliquent organizationId).
      await prisma.securityAlert.updateMany({
        where: { incidentId: inc.id },
        data: { organizationId: resolved },
      });
    }
    stats.remapped++;
    const newOrg = await prisma.organization.findUnique({
      where: { id: resolved },
      select: { name: true, clientCode: true },
    });
    const oldOrg = inc.organizationId
      ? await prisma.organization.findUnique({
          where: { id: inc.organizationId },
          select: { name: true, clientCode: true },
        })
      : null;
    console.log(
      `  [${DRY_RUN ? "DRY" : "FIX"}] ${inc.endpoint.padEnd(30)} ${oldOrg?.clientCode ?? "—"} (${oldOrg?.name ?? "none"}) → ${newOrg?.clientCode} (${newOrg?.name})`,
    );
  }

  return stats;
}

async function remapMonitoringAlerts(): Promise<RemapStats> {
  const stats: RemapStats = {
    scanned: 0,
    unchanged: 0,
    remapped: 0,
    skippedNoEndpoint: 0,
    skippedCurrentMatches: 0,
    skippedManualOverride: 0,
  };
  const defaultOrgIds = await getDefaultOrgIds();

  const alerts = await prisma.monitoringAlert.findMany({
    select: {
      id: true,
      organizationId: true,
      subject: true,
      body: true,
      alertGroupKey: true,
    },
  });

  console.log(`\n== Monitoring alerts : ${alerts.length} à scanner ==`);

  for (const a of alerts) {
    stats.scanned++;

    // Extraction hostname : 1) subject avec parens Zabbix "(HOST)", 2)
    // "Host: X" dans le body, 3) alertGroupKey sous la forme "src:host:desc".
    let endpoint: string | null = null;
    const parens = a.subject.match(/\(([A-Z0-9][A-Z0-9_\-\.]{3,})\)/);
    if (parens) endpoint = parens[1];
    if (!endpoint) {
      const hostLine = a.body.match(
        /^\s*Host:\s*([A-Z][A-Z0-9_\-\.]+)\s*$/im,
      );
      if (hostLine) endpoint = hostLine[1];
    }
    if (!endpoint && a.alertGroupKey) {
      // Clé format "zabbix:host:desc" — host est le 2e segment.
      const parts = a.alertGroupKey.split(":");
      if (parts.length >= 2 && parts[1] && parts[1] !== "unknown") {
        endpoint = parts[1];
      }
    }
    if (!endpoint) {
      stats.skippedNoEndpoint++;
      continue;
    }

    let resolved = await resolveOrgByEndpoint(endpoint);
    if (!resolved) {
      resolved = await resolveOrgByText(a.subject, a.body.slice(0, 4000));
    }
    if (!resolved) {
      resolved = await resolveOrgByHostOrIp(endpoint, null);
    }

    if (!resolved) {
      stats.unchanged++;
      continue;
    }
    if (resolved === a.organizationId) {
      stats.skippedCurrentMatches++;
      continue;
    }
    // Même garde-fou que les security incidents.
    if (a.organizationId && !defaultOrgIds.has(a.organizationId)) {
      stats.skippedManualOverride++;
      continue;
    }
    if (!DRY_RUN) {
      await prisma.monitoringAlert.update({
        where: { id: a.id },
        data: { organizationId: resolved },
      });
    }
    stats.remapped++;
    const newOrg = await prisma.organization.findUnique({
      where: { id: resolved },
      select: { name: true, clientCode: true },
    });
    console.log(
      `  [${DRY_RUN ? "DRY" : "FIX"}] ${endpoint.padEnd(30)} → ${newOrg?.clientCode} (${newOrg?.name})`,
    );
  }

  return stats;
}

async function main() {
  if (DRY_RUN) {
    console.log("*** DRY RUN — aucune modification ne sera écrite ***\n");
  }

  // Invalide le cache du résolveur — assure qu'on lit les clientCodes
  // à jour si un admin vient d'en ajouter.
  invalidateOrgResolverCache();

  const secStats = await remapSecurityIncidents();
  console.log(
    `\nSecurity : ${secStats.remapped} remap, ${secStats.skippedCurrentMatches} déjà OK, ${secStats.skippedManualOverride} override manuel (non touché), ${secStats.unchanged} unchanged (pas de match), ${secStats.skippedNoEndpoint} sans endpoint exploitable`,
  );

  const monStats = await remapMonitoringAlerts();
  console.log(
    `Monitoring : ${monStats.remapped} remap, ${monStats.skippedCurrentMatches} déjà OK, ${monStats.skippedManualOverride} override manuel (non touché), ${monStats.unchanged} unchanged, ${monStats.skippedNoEndpoint} sans endpoint`,
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
