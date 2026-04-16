// ============================================================================
// PERSISTENCE WHITELIST RESOLVER — cascade host → client → default.
//
// Remplace les 3 lookups Data Table n8n. Une règle plus spécifique gagne
// toujours : un host whitelist override un client whitelist, qui override
// un default whitelist. Retourne la première règle matchante.
//
// Matching insensible à la casse sur softwareName normalisé (via
// `normalizeSoftwareName`). Le hostname passé peut être le nom complet
// (ex: "MRVL_MV-LAP-33") — on compare aussi contre la partie après
// underscore si présente (les règles admin sont souvent entrées sans
// préfixe).
// ============================================================================

import prisma from "@/lib/prisma";

export type WhitelistLevel = "host" | "client" | "default" | "none";

export interface WhitelistMatch {
  level: WhitelistLevel;
  allowed: boolean;
  notes: string | null;
  ruleId: string | null;
}

export async function lookupPersistenceWhitelist(opts: {
  organizationId: string | null;
  hostname: string | null;
  softwareName: string; // déjà normalisé
}): Promise<WhitelistMatch> {
  const software = opts.softwareName.trim();
  if (!software) return { level: "none", allowed: false, notes: null, ruleId: null };

  const hostnameVariants: string[] = [];
  if (opts.hostname) {
    hostnameVariants.push(opts.hostname);
    // Si le hostname contient un underscore ("CODE_HOST"), ajoute aussi
    // la partie droite sans préfixe pour matcher une règle entrée sans
    // le code client.
    const afterUnderscore = opts.hostname.includes("_")
      ? opts.hostname.split("_").slice(1).join("_")
      : null;
    if (afterUnderscore) hostnameVariants.push(afterUnderscore);
  }

  // 1. HOST-level (le plus fort)
  if (hostnameVariants.length > 0 && opts.organizationId) {
    const hostRule = await prisma.securityPersistenceWhitelist.findFirst({
      where: {
        scope: "host",
        organizationId: opts.organizationId,
        softwareName: { equals: software, mode: "insensitive" },
        hostname: { in: hostnameVariants, mode: "insensitive" },
      },
    });
    if (hostRule) {
      return {
        level: "host",
        allowed: hostRule.allowed,
        notes: hostRule.notes,
        ruleId: hostRule.id,
      };
    }
  }

  // 2. CLIENT-level
  if (opts.organizationId) {
    const clientRule = await prisma.securityPersistenceWhitelist.findFirst({
      where: {
        scope: "client",
        organizationId: opts.organizationId,
        softwareName: { equals: software, mode: "insensitive" },
      },
    });
    if (clientRule) {
      return {
        level: "client",
        allowed: clientRule.allowed,
        notes: clientRule.notes,
        ruleId: clientRule.id,
      };
    }
  }

  // 3. DEFAULT-level (global MSP)
  const defaultRule = await prisma.securityPersistenceWhitelist.findFirst({
    where: {
      scope: "default",
      softwareName: { equals: software, mode: "insensitive" },
    },
  });
  if (defaultRule) {
    return {
      level: "default",
      allowed: defaultRule.allowed,
      notes: defaultRule.notes,
      ruleId: defaultRule.id,
    };
  }

  return { level: "none", allowed: false, notes: null, ruleId: null };
}
