// ============================================================================
// ContentRelation — types source/target + relationType reconnus.
// Chaque module documenté s'inscrit ici. Toute valeur inconnue est refusée
// côté API pour éviter la prolifération de strings libres.
// ============================================================================

export const CONTENT_TYPES = [
  "particularity",
  "policy",
  "gpo",
  "script",
  "policy_document",
  "software",
  "software_instance",
  "change",
  "asset",
  "contract",
  "warranty",
  "subscription",
  "ticket",
  "project",
  "contact",
  "procedure",
  "article",
] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

export const RELATION_TYPES = [
  "related",       // lien générique
  "affects",       // source modifie / concerne target
  "applies_to",    // policy/GPO applicable à
  "installed_on",  // software installé sur asset
  "requires",      // dépendance
  "modifies",      // change modifie target
  "triggered_by",  // change provoqué par ticket/alert
  "governs",       // contract couvre
  "documented_by", // a pour documentation
  "supersedes",    // remplace
] as const;

export type RelationType = (typeof RELATION_TYPES)[number];

export function isContentType(v: string): v is ContentType {
  return (CONTENT_TYPES as readonly string[]).includes(v);
}
export function isRelationType(v: string): v is RelationType {
  return (RELATION_TYPES as readonly string[]).includes(v);
}
