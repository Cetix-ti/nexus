// ============================================================================
// Modules par organisation (Phase 10F).
//
// Drive l'affichage des sections portail client. Un client sans contrat
// monitoring ne doit pas voir la section "Alertes Veeam" même si ses
// contacts ont par défaut canSeeMonitoring=true.
//
// Source de vérité : Organization.enabledModules. Liste vide ou null
// → tous les modules sont activés (rétrocompat — comportement avant
// Phase 10F). Liste non-vide → seuls ces modules sont actifs.
// ============================================================================

import prisma from "@/lib/prisma";

export type OrgModule =
  | "monitoring"
  | "backups"
  | "security_center"
  | "kb"
  | "assets"
  | "billing_reports"
  | "tickets";

export const ALL_ORG_MODULES: OrgModule[] = [
  "monitoring",
  "backups",
  "security_center",
  "kb",
  "assets",
  "billing_reports",
  "tickets",
];

export const MODULE_LABELS: Record<OrgModule, string> = {
  monitoring: "Monitoring (Veeam, Bitdefender, etc.)",
  backups: "Sauvegardes",
  security_center: "Centre de sécurité",
  kb: "Base de connaissances",
  assets: "Actifs / inventaire",
  billing_reports: "Rapports de facturation",
  tickets: "Tickets",
};

/** Renvoie true si le module est activé pour l'org. Vide/null = tous
 *  activés (rétrocompat). */
export function isModuleEnabled(
  enabledModules: string[] | null | undefined,
  module: OrgModule,
): boolean {
  if (!enabledModules || enabledModules.length === 0) return true;
  return enabledModules.includes(module);
}

/** Lecture par orgId (un seul SELECT). À utiliser dans les routes API
 *  portail pour gater une réponse. */
export async function getEnabledModulesForOrg(
  organizationId: string,
): Promise<OrgModule[]> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { enabledModules: true },
  });
  const list = org?.enabledModules ?? [];
  if (list.length === 0) return ALL_ORG_MODULES;
  return list.filter((m): m is OrgModule => ALL_ORG_MODULES.includes(m as OrgModule));
}
