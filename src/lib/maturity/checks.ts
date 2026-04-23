// ============================================================================
// Baseline de maturité — définit un ensemble de checks par organisation.
//
// Chaque check reçoit un snapshot Prisma pré-calculé et retourne :
//   - passed: true/false
//   - applicable: true/false (dépend de OrgCapabilities pour checks conditionnels)
//   - weight: poids dans le score (défaut 1)
//   - suggestion: CTA textuel + URL si applicable non passé
//
// Score final = (checks passés applicables) / (checks applicables total) × 100
// ============================================================================

import prisma from "@/lib/prisma";

export interface MaturityCheck {
  id: string;
  title: string;
  description: string;
  category: "environnement" | "documentation" | "gouvernance" | "exploitation";
  weight: number;
}

export interface MaturityCheckResult extends MaturityCheck {
  passed: boolean;
  applicable: boolean;
  /** Détail court pour l'UI (ex : "2 sur 3 requis"). */
  detail?: string;
  suggestion?: { label: string; url: string };
}

export interface MaturityReport {
  organizationId: string;
  organizationName: string;
  score: number;           // 0..100 arrondi
  passedCount: number;
  applicableCount: number;
  totalCount: number;
  checks: MaturityCheckResult[];
  generatedAt: string;
}

const CHECKS: MaturityCheck[] = [
  {
    id: "capabilities_filled",
    title: "Environnement technique déclaré",
    description: "Au moins 3 capacités (AD, M365, backups, etc.) déclarées dans l'Aperçu de l'organisation.",
    category: "environnement", weight: 2,
  },
  {
    id: "has_particularities",
    title: "Au moins une particularité documentée",
    description: "Les connaissances opérationnelles spécifiques au client sont capturées.",
    category: "documentation", weight: 1,
  },
  {
    id: "has_software_instances",
    title: "Logiciels déployés documentés",
    description: "Au moins 3 logiciels référencés dans le parc client.",
    category: "documentation", weight: 1,
  },
  {
    id: "has_password_policy",
    title: "Politique de mot de passe documentée",
    description: "Au moins une fiche PWD_AD ou PWD_ENTRA active.",
    category: "gouvernance", weight: 2,
  },
  {
    id: "has_backup_policy",
    title: "Sauvegardes & réplication documentées",
    description: "Au moins une fiche BACKUP_REPLICATION active.",
    category: "gouvernance", weight: 2,
  },
  {
    id: "has_gpo_baseline",
    title: "Baseline GPO appliquée (AD)",
    description: "Au moins 3 GPO déployées chez ce client (conditionnel : hasAD).",
    category: "gouvernance", weight: 2,
  },
  {
    id: "has_m365_roles",
    title: "Rôles M365/Entra documentés",
    description: "Au moins une fiche M365_ROLES (conditionnel : hasM365 ou hasEntra).",
    category: "gouvernance", weight: 1,
  },
  {
    id: "has_recent_change",
    title: "Activité récente journalisée",
    description: "Au moins un changement approuvé ou publié dans les 90 derniers jours.",
    category: "exploitation", weight: 1,
  },
  {
    id: "has_support_coverage",
    title: "Couverture contrat ou support active",
    description: "Contrat actif ou au moins un contrat de support sur un actif.",
    category: "exploitation", weight: 1,
  },
  {
    id: "no_drifted_instances",
    title: "Modèles globaux à jour",
    description: "Aucune instance en dérive (DRIFTED) — les clients suivent les mises à jour de standards MSP.",
    category: "exploitation", weight: 1,
  },
];

export async function computeMaturity(organizationId: string): Promise<MaturityReport | null> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true, capabilities: true },
  });
  if (!org) return null;

  const caps = org.capabilities;
  const hasAD = caps?.hasAD ?? false;
  const hasM365 = caps?.hasM365 ?? false;
  const hasEntra = caps?.hasEntra ?? false;
  const hasAzureAD = caps?.hasAzureAD ?? false;
  const flagsSet = caps ? [
    caps.hasAD, caps.hasAzureAD, caps.hasEntra, caps.hasM365, caps.hasExchangeOnPrem,
    caps.hasVPN, caps.hasRDS, caps.hasHyperV, caps.hasVMware, caps.hasOnPremServers,
    caps.hasBackupsVeeam, caps.hasSOC, caps.hasMDM, caps.hasKeePass,
  ].filter(Boolean).length : 0;

  const [
    particularityCount, softwareCount, pwdDocs, backupDocs,
    gpoActiveCount, m365Docs, recentChanges, activeContracts, activeSupportContracts,
    driftedPart, driftedSoft, driftedPol, driftedScr, driftedGpo,
  ] = await Promise.all([
    prisma.particularity.count({ where: { organizationId, status: "ACTIVE" } }),
    prisma.softwareInstance.count({ where: { organizationId, status: "ACTIVE" } }),
    prisma.policyDocument.count({ where: { organizationId, status: "ACTIVE", subcategory: { in: ["PWD_AD", "PWD_ENTRA"] } } }),
    prisma.policyDocument.count({ where: { organizationId, status: "ACTIVE", subcategory: "BACKUP_REPLICATION" } }),
    prisma.gpoInstance.count({ where: { organizationId, status: { in: ["APPROVED", "DEPLOYED"] } } }),
    prisma.policyDocument.count({ where: { organizationId, status: "ACTIVE", subcategory: "M365_ROLES" } }),
    prisma.change.count({
      where: {
        organizationId, mergedIntoId: null, status: { in: ["APPROVED", "PUBLISHED"] },
        changeDate: { gte: new Date(Date.now() - 90 * 86400_000) },
      },
    }),
    prisma.contract.count({ where: { organizationId, status: "ACTIVE", OR: [{ endDate: null }, { endDate: { gt: new Date() } }] } }),
    prisma.assetSupportContract.count({ where: { organizationId, endDate: { gt: new Date() } } }),
    prisma.particularity.count({ where: { organizationId, syncState: "DRIFTED" } }),
    prisma.softwareInstance.count({ where: { organizationId, syncState: "DRIFTED" } }),
    prisma.policyDocument.count({ where: { organizationId, syncState: "DRIFTED" } }),
    prisma.scriptInstance.count({ where: { organizationId, syncState: "DRIFTED" } }),
    prisma.gpoInstance.count({ where: { organizationId, syncState: "DRIFTED" } }),
  ]);
  const driftedTotal = driftedPart + driftedSoft + driftedPol + driftedScr + driftedGpo;

  const orgSlug = org.name; // fallback; slug lookup ajouté si besoin
  const checks: MaturityCheckResult[] = CHECKS.map((def) => {
    switch (def.id) {
      case "capabilities_filled":
        return {
          ...def, applicable: true, passed: flagsSet >= 3,
          detail: `${flagsSet} capacité(s) déclarée(s)`,
          suggestion: flagsSet < 3 ? { label: "Compléter l'environnement technique", url: `/organisations/${organizationId}` } : undefined,
        };
      case "has_particularities":
        return {
          ...def, applicable: true, passed: particularityCount >= 1,
          detail: `${particularityCount} documentée(s)`,
          suggestion: particularityCount === 0 ? { label: "Créer la première particularité", url: `/particularities/new?orgId=${organizationId}` } : undefined,
        };
      case "has_software_instances":
        return {
          ...def, applicable: true, passed: softwareCount >= 3,
          detail: `${softwareCount} logiciel(s) référencé(s)`,
          suggestion: softwareCount < 3 ? { label: "Ajouter des logiciels", url: `/software/new?orgId=${organizationId}` } : undefined,
        };
      case "has_password_policy":
        return {
          ...def, applicable: true, passed: pwdDocs >= 1,
          detail: `${pwdDocs} fiche(s) PWD`,
          suggestion: pwdDocs === 0 ? { label: "Documenter la politique mot de passe", url: `/policies/new?kind=document&subcategory=PWD_AD&orgId=${organizationId}` } : undefined,
        };
      case "has_backup_policy":
        return {
          ...def, applicable: true, passed: backupDocs >= 1,
          detail: `${backupDocs} fiche(s) sauvegardes`,
          suggestion: backupDocs === 0 ? { label: "Documenter les sauvegardes", url: `/policies/new?kind=document&subcategory=BACKUP_REPLICATION&orgId=${organizationId}` } : undefined,
        };
      case "has_gpo_baseline":
        return {
          ...def, applicable: hasAD, passed: gpoActiveCount >= 3,
          detail: hasAD ? `${gpoActiveCount} GPO actives` : "Non applicable (pas d'AD)",
          suggestion: hasAD && gpoActiveCount < 3 ? { label: "Appliquer des GPO baseline", url: `/policies/new?kind=gpo-instance&orgId=${organizationId}` } : undefined,
        };
      case "has_m365_roles":
        return {
          ...def, applicable: hasM365 || hasEntra || hasAzureAD, passed: m365Docs >= 1,
          detail: m365Docs === 0 ? "Aucune fiche" : `${m365Docs} fiche(s)`,
          suggestion: (hasM365 || hasEntra) && m365Docs === 0 ? { label: "Documenter les rôles M365/Entra", url: `/policies/new?kind=document&subcategory=M365_ROLES&orgId=${organizationId}` } : undefined,
        };
      case "has_recent_change":
        return {
          ...def, applicable: true, passed: recentChanges >= 1,
          detail: `${recentChanges} changement(s) sur 90j`,
          suggestion: recentChanges === 0 ? { label: "Lancer la détection IA", url: `/organisations/${organizationId}` } : undefined,
        };
      case "has_support_coverage":
        return {
          ...def, applicable: true, passed: activeContracts + activeSupportContracts >= 1,
          detail: `${activeContracts} contrat(s), ${activeSupportContracts} support actif(s)`,
          suggestion: (activeContracts + activeSupportContracts) === 0 ? { label: "Ajouter un contrat", url: `/organisations/${organizationId}?tab=contracts` } : undefined,
        };
      case "no_drifted_instances":
        return {
          ...def, applicable: true, passed: driftedTotal === 0,
          detail: driftedTotal === 0 ? "À jour" : `${driftedTotal} instance(s) en dérive`,
          suggestion: driftedTotal > 0 ? { label: "Réviser les instances", url: `/particularities?orgId=${organizationId}` } : undefined,
        };
    }
    return { ...def, applicable: false, passed: false };
  });

  const applicable = checks.filter((c) => c.applicable);
  const passed = applicable.filter((c) => c.passed);
  const weightedTotal = applicable.reduce((s, c) => s + c.weight, 0);
  const weightedPassed = passed.reduce((s, c) => s + c.weight, 0);
  const score = weightedTotal > 0 ? Math.round((weightedPassed / weightedTotal) * 100) : 0;

  return {
    organizationId: org.id,
    organizationName: org.name,
    score,
    passedCount: passed.length,
    applicableCount: applicable.length,
    totalCount: checks.length,
    checks,
    generatedAt: new Date().toISOString(),
  };
}

export async function summarizeAllOrgs(): Promise<Array<{ organizationId: string; organizationName: string; score: number; passedCount: number; applicableCount: number }>> {
  const orgs = await prisma.organization.findMany({
    where: { isActive: true, isInternal: false },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const reports = await Promise.all(orgs.map((o) => computeMaturity(o.id)));
  return reports.filter((r): r is MaturityReport => !!r).map((r) => ({
    organizationId: r.organizationId,
    organizationName: r.organizationName,
    score: r.score,
    passedCount: r.passedCount,
    applicableCount: r.applicableCount,
  }));
}
